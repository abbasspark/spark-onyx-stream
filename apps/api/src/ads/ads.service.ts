// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma, PrismaClient } from '@onyx/database';
import { PlaybackService } from '../playback/playback.service.js';
import {
  AD_EVENT_COLUMN,
  AD_SETTINGS_KEY,
  type AdEventName,
  type AdSettings,
  pickByWeight,
  planBreaks,
  readAdSettings,
} from './ad-rules.js';
import type {
  CreateAdSourceInput,
  SaveAdSettingsInput,
  UpdateAdSourceInput,
} from './ads.schemas.js';
import {
  type AdBreakPlan,
  type AdFigures,
  type AdPlan,
  type AdReport,
  type AdSettingsView,
  adSourceView,
  type AdSourceView,
} from './ads.views.js';
import type { ResolvedAd } from './vast.js';
import { type AdClient, VastResolverService } from './vast-resolver.service.js';

const WITH_ASSET = { asset: { select: { id: true, title: true } } } as const;
const NO_FIGURES: AdFigures = {
  impressions: 0,
  firstQuartile: 0,
  midpoint: 0,
  thirdQuartile: 0,
  completes: 0,
  skips: 0,
  clicks: 0,
  errors: 0,
};

/** The day of a moment, as the database keeps it: a date without a time, in UTC. */
function dayOf(moment: Date): Date {
  return new Date(Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate()));
}

/** Ads for videos: where they come from, when they play, and how they did. */
@Injectable()
export class AdsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(PlaybackService) private readonly playback: PlaybackService,
    @Inject(VastResolverService) private readonly resolver: VastResolverService,
  ) {}

  async settings(): Promise<AdSettingsView> {
    const [settings, active] = await Promise.all([
      this.readSettings(),
      this.prisma.adSource.count({ where: { isActive: true } }),
    ]);
    return { ...settings, hasActiveSource: active > 0 };
  }

  async saveSettings(input: SaveAdSettingsInput): Promise<AdSettingsView> {
    const value: Prisma.InputJsonValue = { ...input };
    await this.prisma.setting.upsert({
      where: { key: AD_SETTINGS_KEY },
      create: { key: AD_SETTINGS_KEY, value },
      update: { value },
    });
    return this.settings();
  }

  async listSources(): Promise<AdSourceView[]> {
    const rows = await this.prisma.adSource.findMany({
      include: WITH_ASSET,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(adSourceView);
  }

  async createSource(input: CreateAdSourceInput): Promise<AdSourceView> {
    if (input.kind === 'HOUSE') {
      await this.assertPlayable(input.assetId);
    }
    const row = await this.prisma.adSource.create({
      data:
        input.kind === 'VAST_TAG'
          ? {
              name: input.name,
              kind: 'VAST_TAG',
              vastUrl: input.vastUrl,
              weight: input.weight,
              isActive: input.isActive,
            }
          : {
              name: input.name,
              kind: 'HOUSE',
              assetId: input.assetId,
              clickUrl: input.clickUrl,
              skipAfterSeconds: input.skipAfterSeconds,
              weight: input.weight,
              isActive: input.isActive,
            },
      include: WITH_ASSET,
    });
    return adSourceView(row);
  }

  async updateSource(id: string, input: UpdateAdSourceInput): Promise<AdSourceView> {
    const current = await this.find(id);
    if (current.kind === 'VAST_TAG' && (input.assetId || input.clickUrl !== undefined)) {
      throw new BadRequestException('A VAST tag has no video and no link of its own');
    }
    if (current.kind === 'HOUSE' && input.vastUrl) {
      throw new BadRequestException('A house ad has no VAST tag');
    }
    if (input.assetId) {
      await this.assertPlayable(input.assetId);
    }
    const row = await this.prisma.adSource.update({
      where: { id },
      data: {
        name: input.name,
        weight: input.weight,
        isActive: input.isActive,
        vastUrl: input.vastUrl,
        assetId: input.assetId,
        clickUrl: input.clickUrl,
        skipAfterSeconds: input.skipAfterSeconds,
      },
      include: WITH_ASSET,
    });
    return adSourceView(row);
  }

  async removeSource(id: string): Promise<AdSourceView> {
    const current = await this.find(id);
    await this.prisma.adSource.delete({ where: { id } });
    return adSourceView(current);
  }

  /**
   * What a player does about ads while it plays a video. Null when nothing is
   * played: ads are off, the viewer pays to be free of them, or there is no
   * source to play.
   */
  async planFor(assetId: string): Promise<AdPlan | null> {
    const settings = await this.readSettings();
    if (!settings.enabled) {
      return null;
    }
    const [asset, credits, sources] = await Promise.all([
      this.prisma.asset.findUnique({ where: { id: assetId }, select: { durationMs: true } }),
      this.prisma.assetMarker.findFirst({
        where: { assetId, kind: 'CREDITS' },
        orderBy: { startMs: 'asc' },
        select: { startMs: true },
      }),
      this.prisma.adSource.findMany({
        where: { isActive: true },
        include: WITH_ASSET,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    if (sources.length === 0) {
      return null;
    }
    const planned = planBreaks(settings, {
      durationMs: asset?.durationMs ?? null,
      creditsStartMs: credits?.startMs ?? null,
    });
    const breaks: AdBreakPlan[] = planned.flatMap((item) => {
      const source = pickByWeight(sources, Math.random());
      return source
        ? [
            {
              id: `${item.position.toLowerCase()}-${item.atMs ?? 0}`,
              position: item.position,
              atMs: item.atMs,
              sourceId: source.id,
            },
          ]
        : [];
    });
    return breaks.length > 0 ? { breaks } : null;
  }

  /**
   * The ad a break plays right now, or null when the source has none: the ad
   * server has nothing for this viewer, or does not answer. The viewer then
   * watches on, and the player counts an error.
   */
  async resolve(sourceId: string, client: AdClient): Promise<ResolvedAd | null> {
    const source = await this.prisma.adSource.findFirst({
      where: { id: sourceId, isActive: true },
      include: { asset: { select: { id: true, title: true, durationMs: true } } },
    });
    if (!source) {
      return null;
    }
    if (source.kind === 'VAST_TAG') {
      return source.vastUrl ? this.resolver.resolve(source.vastUrl, client) : null;
    }
    if (!source.assetId) {
      return null;
    }
    try {
      const info = await this.playback.createPlayback(source.assetId, 'viewer');
      return {
        mediaUrl: info.manifestUrl,
        mimeType: 'application/x-mpegURL',
        durationMs: source.asset?.durationMs ?? null,
        skipOffsetMs: source.skipAfterSeconds === null ? null : source.skipAfterSeconds * 1000,
        clickThrough: source.clickUrl,
        clickTracking: [],
        impressions: [],
        errors: [],
        tracking: {
          start: [],
          firstQuartile: [],
          midpoint: [],
          thirdQuartile: [],
          complete: [],
          skip: [],
        },
      };
    } catch {
      // A house ad whose video is gone is left out, and the viewer still watches.
      return null;
    }
  }

  /** Counts something a player reports. A source that is gone is ignored. */
  async record(sourceId: string, event: AdEventName): Promise<void> {
    const column = AD_EVENT_COLUMN[event];
    const day = dayOf(new Date());
    const exists = await this.prisma.adSource.count({ where: { id: sourceId } });
    if (exists === 0) {
      return;
    }
    await this.prisma.adStat.upsert({
      where: { sourceId_day: { sourceId, day } },
      create: { sourceId, day, [column]: 1 },
      update: { [column]: { increment: 1 } },
    });
  }

  async report(days: number): Promise<AdReport> {
    const today = dayOf(new Date());
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    const rows = await this.prisma.adStat.findMany({
      where: { day: { gte: from } },
      include: { source: { select: { name: true } } },
    });
    const perDay = new Map<string, AdFigures>();
    for (let step = 0; step < days; step += 1) {
      const day = new Date(from);
      day.setUTCDate(day.getUTCDate() + step);
      perDay.set(day.toISOString().slice(0, 10), { ...NO_FIGURES });
    }
    const perSource = new Map<string, { name: string } & AdFigures>();
    const totals: AdFigures = { ...NO_FIGURES };
    for (const row of rows) {
      const key = row.day.toISOString().slice(0, 10);
      const bucket = perDay.get(key);
      const source = perSource.get(row.sourceId) ?? { name: row.source.name, ...NO_FIGURES };
      for (const column of Object.values(AD_EVENT_COLUMN)) {
        if (bucket) {
          bucket[column] += row[column];
        }
        source[column] += row[column];
        totals[column] += row[column];
      }
      perSource.set(row.sourceId, source);
    }
    return {
      days,
      totals,
      perDay: [...perDay].map(([day, figures]) => ({ day, ...figures })),
      perSource: [...perSource]
        .map(([sourceId, figures]) => ({ sourceId, ...figures }))
        .toSorted((a, b) => b.impressions - a.impressions),
    };
  }

  private async readSettings(): Promise<AdSettings> {
    const stored = await this.prisma.setting.findUnique({ where: { key: AD_SETTINGS_KEY } });
    return readAdSettings(stored?.value);
  }

  private async find(id: string) {
    const row = await this.prisma.adSource.findUnique({ where: { id }, include: WITH_ASSET });
    if (!row) {
      throw new NotFoundException('Ad source not found');
    }
    return row;
  }

  private async assertPlayable(assetId: string): Promise<void> {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { status: true, manifestPath: true },
    });
    if (!asset) {
      throw new BadRequestException('That video does not exist');
    }
    if (asset.status !== 'READY' || !asset.manifestPath) {
      throw new ConflictException('That video is not ready to play yet');
    }
  }
}
