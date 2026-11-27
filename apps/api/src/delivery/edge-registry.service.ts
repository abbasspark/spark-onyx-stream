// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import type { Redis } from 'ioredis';
import { EventPublisher } from '../events/event-publisher.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { isEdgeSecret, parseEdgeToken } from './edge-credentials.js';
import {
  COMMAND_TTL_SECONDS,
  deltaOf,
  type EdgeCommand,
  edgeCommandsKey,
  hourOf,
  isFull,
  type EdgeReport,
  type EdgeSample,
  type EdgeState,
  edgeSamplesKey,
  edgeStateKey,
  ONLINE_WITHIN_MS,
  SAMPLE_COUNT,
} from './edge-state.js';

/** What is known of an edge when its agent signs in. */
export interface KnownEdge {
  id: string;
  name: string;
  secretHash: string;
  enabled: boolean;
  lastSeenAt: Date | null;
}

/** An edge that can take viewers now. */
export interface RoutableEdge {
  id: string;
  weight: number;
  publicUrl: string;
  secretHash: string;
  serveVideo: boolean;
  serveLive: boolean;
  /** At its bandwidth limit: it takes no new viewers until it is below it. */
  full: boolean;
}

/** How long a signed-in edge is remembered, to spare a query for every file it fetches. */
const KNOWN_FOR_MS = 15_000;
/** How long the list of edges that take viewers is remembered. */
const ROUTABLE_FOR_MS = 3000;
/** How long the hourly traffic of an edge is kept. */
export const TRAFFIC_KEPT_DAYS = 90;
/** The state of an edge is dropped from Redis when it has been silent this long. */
const STATE_TTL_SECONDS = 600;

/**
 * Knows the edges: who may sign in, what they last reported and which of
 * them can take viewers at this moment.
 */
@Injectable()
export class EdgeRegistry {
  private readonly known = new Map<string, { edge: KnownEdge | null; until: number }>();
  private routable: { edges: RoutableEdge[]; until: number } | null = null;
  private prunedAt = 0;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(EventPublisher) private readonly events: EventPublisher,
  ) {}

  /** The edge a token belongs to. Null when the token opens nothing. */
  async authenticate(token: string): Promise<KnownEdge | null> {
    const parts = parseEdgeToken(token);
    if (!parts) {
      return null;
    }
    const edge = await this.find(parts.edgeId);
    return edge && isEdgeSecret(parts.secret, edge.secretHash) ? edge : null;
  }

  private async find(edgeId: string): Promise<KnownEdge | null> {
    const now = Date.now();
    const cached = this.known.get(edgeId);
    if (cached && cached.until > now) {
      return cached.edge;
    }
    const edge = await this.prisma.edgeServer.findUnique({
      where: { id: edgeId },
      select: { id: true, name: true, secretHash: true, enabled: true, lastSeenAt: true },
    });
    if (this.known.size > 1000) {
      this.known.clear();
    }
    this.known.set(edgeId, { edge, until: now + KNOWN_FOR_MS });
    return edge;
  }

  /** Forgets what is remembered, after an edge was changed in this process. */
  forget(edgeId: string): void {
    this.known.delete(edgeId);
    this.routable = null;
  }

  /** Takes a heartbeat: keeps the report, the traffic since the last one and the totals. */
  async report(edge: KnownEdge, report: EdgeReport, remoteIp: string | null): Promise<void> {
    const now = Date.now();
    const previous = await this.state(edge.id);
    const delta = deltaOf(previous?.report ?? null, report);
    const seconds = previous ? Math.max(1, (now - previous.at) / 1000) : null;
    const answered = report.counters.hits + report.counters.misses;

    const state: EdgeState = {
      at: now,
      report,
      // The first report after a silence has no span of time to spread over.
      bitsPerSecond: seconds ? Math.round((delta.bytes * 8) / seconds) : 0,
      requestsPerSecond: seconds ? Math.round((delta.requests / seconds) * 10) / 10 : 0,
      hitRatio: answered > 0 ? report.counters.hits / answered : null,
    };
    const sample: EdgeSample = [
      Math.round(now / 1000),
      state.bitsPerSecond,
      state.requestsPerSecond,
    ];

    await this.redis
      .multi()
      .set(edgeStateKey(edge.id), JSON.stringify(state), 'EX', STATE_TTL_SECONDS)
      .lpush(edgeSamplesKey(edge.id), JSON.stringify(sample))
      .ltrim(edgeSamplesKey(edge.id), 0, SAMPLE_COUNT - 1)
      .expire(edgeSamplesKey(edge.id), 2 * 3600)
      .exec();

    // The first report of an agent that was already running would count
    // everything since it started a second time.
    const counts = previous !== null || !edge.lastSeenAt;
    await this.prisma.edgeServer.updateMany({
      where: { id: edge.id },
      data: {
        lastSeenAt: new Date(now),
        version: report.version,
        hostname: report.hostname,
        remoteIp,
        ...(counts
          ? {
              bytesServed: { increment: BigInt(delta.bytes) },
              requestsServed: { increment: BigInt(delta.requests) },
            }
          : {}),
      },
    });

    if (counts && (delta.bytes > 0 || delta.requests > 0)) {
      const amounts = {
        bytes: BigInt(delta.bytes),
        requests: BigInt(delta.requests),
        hits: BigInt(delta.hits),
        misses: BigInt(delta.misses),
        fetchedBytes: BigInt(delta.fetched),
      };
      await this.prisma.edgeTrafficHour.upsert({
        where: { edgeId_hour: { edgeId: edge.id, hour: hourOf(now) } },
        create: { edgeId: edge.id, hour: hourOf(now), ...amounts },
        update: {
          bytes: { increment: amounts.bytes },
          requests: { increment: amounts.requests },
          hits: { increment: amounts.hits },
          misses: { increment: amounts.misses },
          fetchedBytes: { increment: amounts.fetchedBytes },
        },
      });
    }
    await this.prune(now);

    const wasOnline =
      edge.lastSeenAt !== null && now - edge.lastSeenAt.getTime() <= ONLINE_WITHIN_MS;
    edge.lastSeenAt = new Date(now);
    if (!wasOnline) {
      this.routable = null;
      this.events.publish({ type: 'edge', edgeId: edge.id });
    }
  }

  /** Drops the hours that are older than what is kept, now and then. */
  private async prune(now: number): Promise<void> {
    if (now - this.prunedAt < 3_600_000) {
      return;
    }
    this.prunedAt = now;
    await this.prisma.edgeTrafficHour.deleteMany({
      where: { hour: { lt: new Date(now - TRAFFIC_KEPT_DAYS * 86_400_000) } },
    });
  }

  /** Asks an agent to do something with its next heartbeat. */
  async command(edgeId: string, command: Omit<EdgeCommand, 'id'>): Promise<EdgeCommand> {
    const full: EdgeCommand = { id: randomUUID(), ...command };
    const pending = (await this.commands(edgeId)).filter(
      // Asking twice for the same thing is asking once.
      (other) => !(other.type === full.type && other.scope === full.scope),
    );
    await this.storeCommands(edgeId, [...pending, full]);
    return full;
  }

  /** What an agent has yet to do. */
  async commands(edgeId: string): Promise<EdgeCommand[]> {
    return parse<EdgeCommand[]>(await this.redis.get(edgeCommandsKey(edgeId))) ?? [];
  }

  /** Takes what an agent says it has done off its list, and returns what is left. */
  async acknowledge(edgeId: string, done: readonly string[]): Promise<EdgeCommand[]> {
    const pending = await this.commands(edgeId);
    if (pending.length === 0 || done.length === 0) {
      return pending;
    }
    const left = pending.filter((command) => !done.includes(command.id));
    if (left.length !== pending.length) {
      await this.storeCommands(edgeId, left);
      this.events.publish({ type: 'edge', edgeId });
    }
    return left;
  }

  private async storeCommands(edgeId: string, commands: EdgeCommand[]): Promise<void> {
    if (commands.length === 0) {
      await this.redis.del(edgeCommandsKey(edgeId));
      return;
    }
    await this.redis.set(
      edgeCommandsKey(edgeId),
      JSON.stringify(commands),
      'EX',
      COMMAND_TTL_SECONDS,
    );
  }

  async state(edgeId: string): Promise<EdgeState | null> {
    return parse<EdgeState>(await this.redis.get(edgeStateKey(edgeId)));
  }

  /** The traffic history of an edge, oldest first. */
  async samples(edgeId: string): Promise<EdgeSample[]> {
    const entries = await this.redis.lrange(edgeSamplesKey(edgeId), 0, SAMPLE_COUNT - 1);
    return entries
      .map((entry) => parse<EdgeSample>(entry))
      .filter((sample): sample is EdgeSample => sample !== null)
      .reverse();
  }

  async clear(edgeId: string): Promise<void> {
    await this.redis.del(edgeStateKey(edgeId), edgeSamplesKey(edgeId), edgeCommandsKey(edgeId));
    this.forget(edgeId);
  }

  /** Edges that are switched on and reported a moment ago. */
  async online(): Promise<RoutableEdge[]> {
    const now = Date.now();
    if (this.routable && this.routable.until > now) {
      return this.routable.edges;
    }
    const edges = await this.prisma.edgeServer.findMany({
      where: { enabled: true, lastSeenAt: { gt: new Date(now - ONLINE_WITHIN_MS) } },
      select: {
        id: true,
        weight: true,
        publicUrl: true,
        secretHash: true,
        serveVideo: true,
        serveLive: true,
        maxMbps: true,
      },
      orderBy: { id: 'asc' },
    });
    // Only an edge with a limit needs its last report looked at.
    const limited = edges.filter((edge) => edge.maxMbps !== null);
    const states = new Map(
      await Promise.all(limited.map(async (edge) => [edge.id, await this.state(edge.id)] as const)),
    );
    const routable = edges.map(({ maxMbps, ...edge }) => ({
      ...edge,
      full: isFull(states.get(edge.id)?.bitsPerSecond ?? null, maxMbps),
    }));
    this.routable = { edges: routable, until: now + ROUTABLE_FOR_MS };
    return routable;
  }
}

function parse<Value>(text: string | null): Value | null {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as Value;
  } catch {
    return null;
  }
}
