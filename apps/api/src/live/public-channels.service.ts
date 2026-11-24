// SPDX-License-Identifier: AGPL-3.0-only
import { suitsAudience } from '../audience/audience.js';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaClient, type TitleAccess } from '@onyx/database';
import { opensTitle } from '../billing/entitlement.js';
import { SubscriptionsService } from '../billing/subscriptions.service.js';
import type { Watcher } from '../catalog/public-catalog.service.js';
import { AppConfig } from '../config/app-config.js';
import { StreamsService, type StreamTicket } from '../streams/streams.service.js';
import { QualityRecorder } from '../quality/quality-recorder.service.js';
import { type LivePlaybackInfo, LivePlaybackService } from './live-playback.service.js';

/** The address for watching a channel, and the place the device holds while it does. */
export type LiveAnswer = LivePlaybackInfo & {
  /** For `POST /viewer/streams/{id}/beat`. Null for a visitor. */
  stream: StreamTicket | null;
  /**
   * Where the player says how playback went, for
   * `POST /playback/sessions/{qualityId}/report`. Null when the installation
   * takes no such reports.
   */
  qualityId: string | null;
};

/** A channel as viewers see it. Nothing about where its video comes from. */
export interface PublicChannel {
  slug: string;
  name: string;
  number: number | null;
  description: string | null;
  access: TitleAccess;
  /** The age from which the channel suits. Null: not said. */
  minAge: number | null;
  /** The packages the channel is in, for the site to say whether a plan opens it. */
  packageIds: string[];
  /** Whether the channel is sending right now. */
  onAir: boolean;
  /** Minutes viewers can go back in time. 0 means only the present. */
  dvrMinutes: number;
  /** What the guide says is on now, and what comes after it. Null when it does not say. */
  now: PublicProgramme | null;
  next: PublicProgramme | null;
}

/** A programme as viewers see it. */
export interface PublicProgramme {
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  startsAt: string;
  endsAt: string;
}

/** The programmes of one channel in a stretch of time. */
export interface PublicGuideRow {
  slug: string;
  programmes: PublicProgramme[];
}

/** How far ahead "next" is looked for. */
const NEXT_WITHIN_MS = 12 * 60 * 60 * 1000;
const PROGRAMME_SELECT = {
  channelId: true,
  title: true,
  subtitle: true,
  description: true,
  category: true,
  startsAt: true,
  endsAt: true,
} as const;

interface ProgrammeRow {
  channelId: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  startsAt: Date;
  endsAt: Date;
}

const PUBLIC_SELECT = {
  id: true,
  slug: true,
  name: true,
  number: true,
  description: true,
  access: true,
  minAge: true,
  enabled: true,
  status: true,
  dvrMinutes: true,
  packages: { select: { packageId: true } },
} as const;

interface PublicRecord {
  id: string;
  slug: string;
  name: string;
  number: number | null;
  description: string | null;
  access: TitleAccess;
  minAge: number | null;
  enabled: boolean;
  status: string;
  dvrMinutes: number;
  packages: { packageId: string }[];
}

/** Live channels for the viewer website and the apps. Only published ones exist here. */
@Injectable()
export class PublicChannelsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
    @Inject(LivePlaybackService) private readonly playback: LivePlaybackService,
    @Inject(StreamsService) private readonly streams: StreamsService,
    @Inject(QualityRecorder) private readonly quality: QualityRecorder,
  ) {}

  async list(): Promise<PublicChannel[]> {
    const channels = await this.prisma.channel.findMany({
      where: { published: true, ...suitsAudience() },
      orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: PUBLIC_SELECT,
    });
    const now = new Date();
    const upcoming = await this.programmes(
      channels.map((channel) => channel.id),
      now,
      new Date(now.getTime() + NEXT_WITHIN_MS),
    );
    return channels.map((channel) => toPublic(channel, upcoming.get(channel.id) ?? [], now));
  }

  /**
   * The guide: what every published channel shows in a stretch of time.
   * Channels are in the order of the lineup, also those without programmes.
   */
  async guide(from: Date, to: Date): Promise<PublicGuideRow[]> {
    const channels = await this.prisma.channel.findMany({
      where: { published: true, ...suitsAudience() },
      orderBy: [{ number: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, slug: true },
    });
    const programmes = await this.programmes(
      channels.map((channel) => channel.id),
      from,
      to,
    );
    return channels.map((channel) => ({
      slug: channel.slug,
      programmes: (programmes.get(channel.id) ?? []).map(toProgramme),
    }));
  }

  /** Programmes of channels that run at some point between two moments, by channel and in order. */
  private async programmes(
    channelIds: string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, ProgrammeRow[]>> {
    const byChannel = new Map<string, ProgrammeRow[]>();
    if (channelIds.length === 0) {
      return byChannel;
    }
    const rows = await this.prisma.programme.findMany({
      where: { channelId: { in: channelIds }, startsAt: { lt: to }, endsAt: { gt: from } },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      select: PROGRAMME_SELECT,
      take: 20_000,
    });
    for (const row of rows) {
      const list = byChannel.get(row.channelId);
      if (list) {
        // Two sources can describe the same slot. The first one stands.
        if ((list.at(-1) as ProgrammeRow).endsAt <= row.startsAt) {
          list.push(row);
        }
      } else {
        byChannel.set(row.channelId, [row]);
      }
    }
    return byChannel;
  }

  async get(slug: string): Promise<PublicChannel> {
    const channel = await this.find(slug);
    const now = new Date();
    const upcoming = await this.programmes(
      [channel.id],
      now,
      new Date(now.getTime() + NEXT_WITHIN_MS),
    );
    return toPublic(channel, upcoming.get(channel.id) ?? [], now);
  }

  /**
   * A signed address for watching a channel.
   *
   * The rules are those of titles: a free channel is as open as the
   * installation, a paid one needs a signed-in viewer whose plan opens it.
   *
   * @throws ConflictException with code "off_air" when the channel is not sending.
   */
  async play(slug: string, watcher: Watcher, userAgent: string | null = null): Promise<LiveAnswer> {
    const channel = await this.find(slug);
    await this.assertMayWatch(watcher, channel);
    if (!isOnAir(channel)) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: 'This channel is not on air right now',
        // Lets a player wait for the channel instead of showing an error.
        code: 'off_air',
      });
    }
    // Watching a channel takes a place among the streams of the account, like a video.
    const stream = watcher
      ? await this.streams.open(watcher, { kind: 'LIVE', subject: channel.name, userAgent })
      : null;
    const info = await this.playback.createPlayback(channel.id, 'viewer');
    const qualityId = await this.quality.start({
      kind: 'LIVE',
      channelId: channel.id,
      userAgent,
      playbackUrl: info.url,
    });
    return { ...info, stream, qualityId };
  }

  private async find(slug: string): Promise<PublicRecord> {
    const channel = await this.prisma.channel.findFirst({
      where: { slug, published: true, ...suitsAudience() },
      select: PUBLIC_SELECT,
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }

  private async assertMayWatch(watcher: Watcher, channel: PublicRecord): Promise<void> {
    if (this.config.catalogPlayback === 'off') {
      throw new ForbiddenException('Playback is not open on this installation');
    }
    const paid = channel.access === 'PAID';
    if (!paid && this.config.catalogPlayback !== 'viewers') {
      return;
    }
    if (!watcher) {
      throw new UnauthorizedException('Sign in to watch');
    }
    if (this.config.viewerVerificationRequired && !watcher.emailVerified) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Confirm your email address to watch',
        code: 'email_unverified',
      });
    }
    if (!paid) {
      return;
    }

    const access = await this.subscriptions.accessOf(watcher.viewerId);
    const packageIds = channel.packages.map((link) => link.packageId);
    if (opensTitle(access, packageIds)) {
      return;
    }
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        ...(access
          ? { message: 'Your plan does not include this channel', code: 'plan_required' }
          : { message: 'Subscribe to watch', code: 'subscription_required' }),
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

function isOnAir(channel: { enabled: boolean; status: string }): boolean {
  return channel.enabled && channel.status === 'RUNNING';
}

function toProgramme(row: ProgrammeRow): PublicProgramme {
  return {
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    category: row.category,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  };
}

function toPublic(channel: PublicRecord, upcoming: ProgrammeRow[], at: Date): PublicChannel {
  const current = upcoming.find((row) => row.startsAt <= at && row.endsAt > at) ?? null;
  const following = upcoming.find((row) => row.startsAt > at) ?? null;
  return {
    slug: channel.slug,
    name: channel.name,
    number: channel.number,
    description: channel.description,
    access: channel.access,
    minAge: channel.minAge,
    packageIds: channel.packages.map((link) => link.packageId).sort(),
    onAir: isOnAir(channel),
    dvrMinutes: channel.dvrMinutes,
    now: current ? toProgramme(current) : null,
    next: following ? toProgramme(following) : null,
  };
}
