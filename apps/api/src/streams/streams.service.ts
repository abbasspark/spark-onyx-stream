// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient, type StreamKind, type ViewerStream } from '@onyx/database';
import { deviceOf, type PlayDevice } from '../analytics/play-rules.js';
import { runningAt } from '../billing/entitlement.js';
import { AppConfig } from '../config/app-config.js';
import {
  BEAT_SECONDS,
  devicesPhrase,
  limitOf,
  staleBefore,
  STREAM_KEEP_SECONDS,
  type StreamLimit,
} from './stream-rules.js';

/** Who is about to play, and on which device. */
export interface StreamOwner {
  viewerId: string;
  /** The sign-in of the device. One device plays one video at a time. */
  sessionId: string;
  profileId: string | null;
}

/** What a player is told about its place among the streams of the account. */
export interface StreamTicket {
  id: string;
  /** How often to report, in seconds. */
  beatSeconds: number;
}

/** A stream as the viewer and the panel see it. */
export interface StreamView {
  id: string;
  kind: StreamKind;
  /** What is playing: "Night Train", "Deep Ocean S1 E2", "News 24". */
  subject: string;
  device: PlayDevice;
  /** What the device said it is when it signed in, for naming it. */
  userAgent: string | null;
  profile: { id: string; name: string } | null;
  startedAt: Date;
  lastSeenAt: Date;
}

/** The streams of an account, with how many it may have. */
export interface StreamsView extends StreamLimit {
  streams: StreamView[];
}

const WITH_DEVICE = {
  session: { select: { userAgent: true } },
  profile: { select: { id: true, name: true } },
} satisfies Prisma.ViewerStreamInclude;
type StreamRecord = Prisma.ViewerStreamGetPayload<{ include: typeof WITH_DEVICE }>;

const toView = (stream: StreamRecord): StreamView => ({
  id: stream.id,
  kind: stream.kind,
  subject: stream.subject,
  device: stream.device,
  userAgent: stream.session.userAgent,
  profile: stream.profile,
  startedAt: stream.startedAt,
  lastSeenAt: stream.lastSeenAt,
});

/**
 * What the devices of each viewer are playing right now, and the limit on
 * how many of them may play at once.
 *
 * A stream starts when the addresses for playing are handed out and lasts
 * while its player reports. The limit is applied at that start: a device over
 * the limit gets no addresses. A stream that is stopped from elsewhere is
 * told so at its next report and stops by itself.
 */
@Injectable()
export class StreamsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  /**
   * Takes a place for a device that is about to play. What the same device
   * was playing before ends: a device plays one video at a time.
   *
   * @throws ConflictException with the code "stream_limit" and the streams
   *   that hold the places, when the account plays on as many devices as it may.
   */
  async open(
    owner: StreamOwner,
    what: { kind: StreamKind; subject: string; userAgent: string | null },
    now = new Date(),
  ): Promise<StreamTicket> {
    const { limit } = await this.limitFor(owner.viewerId, now);
    const stream = await this.prisma.$transaction(async (tx) => {
      // One at a time per account, so that two devices cannot both take the last place.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${owner.viewerId}))`;
      await tx.viewerStream.deleteMany({
        where: {
          viewerId: owner.viewerId,
          OR: [{ sessionId: owner.sessionId }, { lastSeenAt: { lt: staleBefore(now) } }],
        },
      });
      if (limit !== null) {
        const playing = await tx.viewerStream.findMany({
          where: { viewerId: owner.viewerId },
          orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
          include: WITH_DEVICE,
        });
        if (playing.length >= limit) {
          return { refused: playing.map(toView) };
        }
      }
      return tx.viewerStream.create({
        data: {
          // Named one by one: the caller may hand over more than a stream holds.
          viewerId: owner.viewerId,
          sessionId: owner.sessionId,
          profileId: owner.profileId,
          kind: what.kind,
          subject: what.subject.slice(0, 200),
          device: deviceOf(what.userAgent),
          startedAt: now,
          lastSeenAt: now,
        },
      });
    });
    if ('refused' in stream) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'stream_limit',
        message: `Your account is playing ${devicesPhrase(limit ?? 0)} already, which is as many as it can at the same time. Stop one of them to watch here.`,
        limit,
        streams: stream.refused,
      });
    }
    return { id: stream.id, beatSeconds: BEAT_SECONDS };
  }

  /**
   * A player says that it is still playing.
   *
   * @throws GoneException when the stream was stopped: the player has to stop too.
   */
  async beat(viewerId: string, id: string, now = new Date()): Promise<void> {
    const { count } = await this.prisma.viewerStream.updateMany({
      where: { id, viewerId },
      data: { lastSeenAt: now },
    });
    if (count === 0) {
      throw new GoneException({
        statusCode: 410,
        error: 'Gone',
        code: 'stream_stopped',
        message: 'Playback was stopped here because the account started playing somewhere else.',
      });
    }
  }

  /**
   * Ends a stream of the viewer: their own when they leave a video, or that
   * of another device to make room. Nothing happens when it is over already.
   */
  async end(viewerId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.viewerStream.deleteMany({ where: { id, viewerId } });
    return count > 0;
  }

  /** What the account is playing right now, the longest running first, and its limit. */
  async forViewer(viewerId: string, now = new Date()): Promise<StreamsView> {
    const [limit, streams] = await Promise.all([
      this.limitFor(viewerId, now),
      this.prisma.viewerStream.findMany({
        where: { viewerId, lastSeenAt: { gte: staleBefore(now) } },
        orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
        include: WITH_DEVICE,
      }),
    ]);
    return { ...limit, streams: streams.map(toView) };
  }

  /** The ids of the streams one device of the account holds. */
  async sessionOf(viewerId: string, sessionId: string): Promise<Set<string>> {
    const rows = await this.prisma.viewerStream.findMany({
      where: { viewerId, sessionId },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  /**
   * Stops a stream, for an admin.
   *
   * @throws NotFoundException when the viewer has no such stream.
   */
  async stop(viewerId: string, id: string): Promise<ViewerStream> {
    const stream = await this.prisma.viewerStream.findFirst({ where: { id, viewerId } });
    if (!stream) {
      throw new NotFoundException('This device is not playing any more');
    }
    await this.prisma.viewerStream.deleteMany({ where: { id } });
    return stream;
  }

  /** On how many devices a viewer may play at once, and why. */
  async limitFor(viewerId: string, now = new Date()): Promise<StreamLimit> {
    const [viewer, running] = await Promise.all([
      this.prisma.viewer.findUnique({ where: { id: viewerId }, select: { maxStreams: true } }),
      this.prisma.subscription.findMany({
        where: { viewerId, ...runningAt(now) },
        select: { plan: { select: { maxStreams: true } } },
      }),
    ]);
    return limitOf(
      viewer?.maxStreams ?? null,
      running.map((subscription) => subscription.plan.maxStreams),
      this.config.streamLimit,
    );
  }

  /** Clears away streams nobody has reported on for a long time. @returns how many. */
  async purge(now = new Date()): Promise<number> {
    const { count } = await this.prisma.viewerStream.deleteMany({
      where: { lastSeenAt: { lt: new Date(now.getTime() - STREAM_KEEP_SECONDS * 1000) } },
    });
    return count;
  }
}
