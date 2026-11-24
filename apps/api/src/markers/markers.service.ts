// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AssetMarker, type Job, PrismaClient } from '@onyx/database';
import { EventPublisher } from '../events/event-publisher.js';
import { JobsService } from '../jobs/jobs.service.js';
import { type MarkerInput, markersProblem, normalizeMarkers } from './marker.rules.js';

/** A stretch of a video a player offers to skip, as the API answers it. */
export interface MarkerView {
  /** RECAP: what happened before. INTRO: the opening titles. CREDITS: the closing credits. */
  kind: AssetMarker['kind'];
  /** Milliseconds from the start of the video. */
  startMs: number;
  /** Null for credits that run to the end of the video. */
  endMs: number | null;
}

/** The same for the panel, which also says where a marker comes from. */
export interface AdminMarkerView extends MarkerView {
  /** MANUAL: set by an admin. DETECTED: found by comparing episodes, and not checked by anyone yet. */
  source: AssetMarker['source'];
}

export const toMarkerView = (marker: AssetMarker): MarkerView => ({
  kind: marker.kind,
  startMs: marker.startMs,
  endMs: marker.endMs,
});

const sameMarker = (a: MarkerInput, b: MarkerInput): boolean =>
  a.kind === b.kind && a.startMs === b.startMs && a.endMs === b.endMs;

/**
 * The stretches of a video a player offers to skip. They belong to the
 * video, not to the title or episode that shows it: they are moments on its
 * timeline, and stay true wherever it is used.
 */
@Injectable()
export class MarkersService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(EventPublisher) private readonly events: EventPublisher,
  ) {}

  /** The markers of a video, in the order they come. */
  async list(assetId: string): Promise<AssetMarker[]> {
    await this.assetOrThrow(assetId);
    return this.prisma.assetMarker.findMany({
      where: { assetId },
      orderBy: [{ startMs: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Makes the given markers the markers of a video. One that was found by
   * comparing episodes and comes back unchanged stays "detected"; everything
   * else is now what an admin said.
   *
   * @throws BadRequestException when the markers do not fit the video or each other.
   */
  async replace(assetId: string, markers: readonly MarkerInput[]): Promise<AssetMarker[]> {
    const asset = await this.assetOrThrow(assetId);
    const problem = markersProblem(markers, asset.durationMs);
    if (problem) {
      throw new BadRequestException(problem);
    }
    const wanted = normalizeMarkers(markers, asset.durationMs);
    const before = await this.prisma.assetMarker.findMany({ where: { assetId } });
    await this.prisma.$transaction([
      this.prisma.assetMarker.deleteMany({ where: { assetId } }),
      this.prisma.assetMarker.createMany({
        data: wanted.map((marker) => ({
          assetId,
          ...marker,
          source: before.some((old) => old.source === 'DETECTED' && sameMarker(old, marker))
            ? ('DETECTED' as const)
            : ('MANUAL' as const),
        })),
      }),
    ]);
    this.events.publish({ type: 'asset', assetId, change: 'updated' });
    return this.list(assetId);
  }

  /**
   * Queues the search for intros and credits in a season: its episodes are
   * compared by their sound, and what they share is marked.
   *
   * @param overwrite Whether markers an admin set are replaced too.
   * @throws ConflictException when the season has fewer than two episodes
   *   with a video, or is being searched already.
   */
  async detectInSeason(seasonId: string, overwrite: boolean): Promise<Job> {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        episodes: { where: { asset: { status: 'READY', sourcePath: { not: null } } } },
      },
    });
    if (!season) {
      throw new NotFoundException('Season not found');
    }
    if (season.episodes.length < 2) {
      throw new ConflictException(
        'Intros are found by comparing episodes. The season needs two episodes with a video that is ready',
      );
    }
    const running = await this.prisma.job.findMany({
      where: { type: 'MARKERS', status: { in: ['QUEUED', 'RUNNING'] } },
      select: { input: true },
    });
    if (running.some((job) => (job.input as { seasonId?: string } | null)?.seasonId === seasonId)) {
      throw new ConflictException('This season is being searched already');
    }
    return this.jobs.enqueue({ type: 'MARKERS', input: { seasonId, overwrite } });
  }

  /** The newest search of a season, running or done, for the panel to show how it went. */
  async lastDetection(seasonId: string): Promise<Job | null> {
    const jobs = await this.prisma.job.findMany({
      where: { type: 'MARKERS' },
      orderBy: { queuedAt: 'desc' },
      take: 50,
    });
    return (
      jobs.find((job) => (job.input as { seasonId?: string } | null)?.seasonId === seasonId) ?? null
    );
  }

  private async assetOrThrow(assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status === 'DELETED') {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }
}
