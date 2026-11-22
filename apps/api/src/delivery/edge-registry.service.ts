// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import type { Redis } from 'ioredis';
import { EventPublisher } from '../events/event-publisher.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { isEdgeSecret, parseEdgeToken } from './edge-credentials.js';
import {
  deltaOf,
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
}

/** How long a signed-in edge is remembered, to spare a query for every file it fetches. */
const KNOWN_FOR_MS = 15_000;
/** How long the list of edges that take viewers is remembered. */
const ROUTABLE_FOR_MS = 3000;
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

    await this.prisma.edgeServer.updateMany({
      where: { id: edge.id },
      data: {
        lastSeenAt: new Date(now),
        version: report.version,
        hostname: report.hostname,
        remoteIp,
        // The first report of an agent that was already running would count
        // everything since it started a second time.
        ...(previous || !edge.lastSeenAt
          ? {
              bytesServed: { increment: BigInt(delta.bytes) },
              requestsServed: { increment: BigInt(delta.requests) },
            }
          : {}),
      },
    });

    const wasOnline =
      edge.lastSeenAt !== null && now - edge.lastSeenAt.getTime() <= ONLINE_WITHIN_MS;
    edge.lastSeenAt = new Date(now);
    if (!wasOnline) {
      this.routable = null;
      this.events.publish({ type: 'edge', edgeId: edge.id });
    }
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
    await this.redis.del(edgeStateKey(edgeId), edgeSamplesKey(edgeId));
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
      },
      orderBy: { id: 'asc' },
    });
    this.routable = { edges, until: now + ROUTABLE_FOR_MS };
    return edges;
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
