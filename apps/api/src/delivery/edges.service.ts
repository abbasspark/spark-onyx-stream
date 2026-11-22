// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type EdgeServer, PrismaClient } from '@onyx/database';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { EventPublisher } from '../events/event-publisher.js';
import { formatEdgeToken, hashEdgeSecret, newEdgeSecret } from './edge-credentials.js';
import { EdgeRegistry } from './edge-registry.service.js';
import {
  type EdgeSample,
  type EdgeState,
  type EdgeStatus,
  hourOf,
  type PurgeScope,
  statusOf,
} from './edge-state.js';
import {
  type CreateEdgeInput,
  TRAFFIC_RANGES,
  type TrafficRange,
  type UpdateEdgeInput,
} from './edges.schemas.js';

export interface EdgeView {
  id: string;
  name: string;
  publicUrl: string;
  location: string | null;
  enabled: boolean;
  weight: number;
  serveVideo: boolean;
  serveLive: boolean;
  status: EdgeStatus;
  lastSeenAt: Date | null;
  version: string | null;
  hostname: string | null;
  remoteIp: string | null;
  /** Everything delivered since the edge was added. Numbers too large for JSON, as text. */
  bytesServed: string;
  requestsServed: string;
  /** What the agent reports now. Null while it is not connected. */
  now: {
    bitsPerSecond: number;
    requestsPerSecond: number;
    activeRequests: number;
    hitRatio: number | null;
    startedAt: string;
    cache: { bytes: number; files: number; limitBytes: number };
    system: {
      cpus: number;
      load1: number | null;
      diskFreeBytes: number | null;
      diskTotalBytes: number | null;
    };
    refused: number;
    originErrors: number;
  } | null;
  /** Traffic of the last hour, oldest first: [seconds, bits per second, requests per second]. */
  samples: EdgeSample[];
  /** What its copies are being emptied of, until the agent says it is done. */
  purging: PurgeScope[];
  createdAt: Date;
}

/**
 * One hour of an edge: [start in seconds, bytes delivered, requests, from
 * copies, fetched first, bytes fetched from the main server].
 */
export type TrafficPoint = [number, number, number, number, number, number];

export interface TrafficView {
  range: TrafficRange;
  /** The start of the first hour. */
  from: Date;
  /** How many hours the range has, the running one included. */
  hours: number;
  edges: { id: string; name: string; points: TrafficPoint[] }[];
}

/** An edge with the token of its agent, which is shown this once. */
export interface EdgeWithToken {
  edge: EdgeView;
  token: string;
}

/** Edge servers as admins manage them. */
@Injectable()
export class EdgesService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(EdgeRegistry) private readonly registry: EdgeRegistry,
    @Inject(EventPublisher) private readonly events: EventPublisher,
  ) {}

  async list(): Promise<EdgeView[]> {
    const edges = await this.prisma.edgeServer.findMany({ orderBy: { name: 'asc' } });
    return Promise.all(edges.map((edge) => this.view(edge)));
  }

  async get(id: string): Promise<EdgeView> {
    return this.view(await this.find(id));
  }

  async create(input: CreateEdgeInput): Promise<EdgeWithToken> {
    const secret = newEdgeSecret();
    try {
      const edge = await this.prisma.edgeServer.create({
        data: { ...input, secretHash: hashEdgeSecret(secret) },
      });
      this.events.publish({ type: 'edge', edgeId: edge.id });
      return { edge: await this.view(edge), token: formatEdgeToken(edge.id, secret) };
    } catch (error) {
      throw this.asConflict(error);
    }
  }

  async update(id: string, input: UpdateEdgeInput): Promise<EdgeView> {
    await this.find(id);
    try {
      const edge = await this.prisma.edgeServer.update({ where: { id }, data: input });
      this.registry.forget(id);
      this.events.publish({ type: 'edge', edgeId: id });
      return await this.view(edge);
    } catch (error) {
      throw this.asConflict(error);
    }
  }

  /**
   * Replaces the secret of an edge. The agent with the old token is locked
   * out, and addresses already given to viewers of this edge stop working.
   */
  async replaceToken(id: string): Promise<EdgeWithToken> {
    await this.find(id);
    const secret = newEdgeSecret();
    const edge = await this.prisma.edgeServer.update({
      where: { id },
      // No agent has connected with the new token yet, and the one that runs
      // cannot check addresses signed from now on: the edge gets no viewers
      // until its agent is back.
      data: { secretHash: hashEdgeSecret(secret), lastSeenAt: null },
    });
    await this.registry.clear(id);
    this.events.publish({ type: 'edge', edgeId: id });
    return { edge: await this.view(edge), token: formatEdgeToken(id, secret) };
  }

  async remove(id: string): Promise<EdgeView> {
    const edge = await this.find(id);
    const view = await this.view(edge);
    await this.prisma.edgeServer.delete({ where: { id } });
    await this.registry.clear(id);
    this.events.publish({ type: 'edge', edgeId: id });
    return view;
  }

  /**
   * Asks the agent of an edge to drop its copies. It does so with its next
   * heartbeat, and fetches again what viewers ask for after that.
   */
  async purge(id: string, scope: PurgeScope): Promise<EdgeView> {
    const edge = await this.find(id);
    const status = statusOf(edge, Date.now());
    if (status !== 'ONLINE' && status !== 'DISABLED') {
      throw new ConflictException(
        'The agent of this edge is not connected, so there is nobody to empty its copies',
      );
    }
    await this.registry.command(id, { type: 'purge', scope });
    this.events.publish({ type: 'edge', edgeId: id });
    return this.view(edge);
  }

  /**
   * What the edges delivered, hour by hour, for the last day, week or month.
   * Hours in which an edge delivered nothing are left out.
   */
  async traffic(range: TrafficRange): Promise<TrafficView> {
    const hours = TRAFFIC_RANGES[range];
    const from = new Date(hourOf(Date.now()).getTime() - (hours - 1) * 3_600_000);
    const [edges, rows] = await Promise.all([
      this.prisma.edgeServer.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.edgeTrafficHour.findMany({
        where: { hour: { gte: from } },
        orderBy: { hour: 'asc' },
      }),
    ]);
    return {
      range,
      from,
      hours,
      edges: edges.map((edge) => ({
        id: edge.id,
        name: edge.name,
        points: rows
          .filter((row) => row.edgeId === edge.id)
          .map((row) => [
            Math.round(row.hour.getTime() / 1000),
            Number(row.bytes),
            Number(row.requests),
            Number(row.hits),
            Number(row.misses),
            Number(row.fetchedBytes),
          ]),
      })),
    };
  }

  /**
   * Addresses of all edges, for the website's content policy. Paused edges
   * are among them: a page that is open must still be allowed to play from an
   * edge that is switched on a moment later.
   */
  async origins(): Promise<string[]> {
    const edges = await this.prisma.edgeServer.findMany({
      select: { publicUrl: true },
      orderBy: { publicUrl: 'asc' },
    });
    return edges.map((edge) => edge.publicUrl);
  }

  private async find(id: string): Promise<EdgeServer> {
    const edge = await this.prisma.edgeServer.findUnique({ where: { id } });
    if (!edge) {
      throw new NotFoundException('Edge server not found');
    }
    return edge;
  }

  private async view(edge: EdgeServer): Promise<EdgeView> {
    const status = statusOf(edge, Date.now());
    const connected = status === 'ONLINE' || status === 'DISABLED';
    const [state, samples, commands] = await Promise.all([
      connected ? this.registry.state(edge.id) : null,
      this.registry.samples(edge.id),
      this.registry.commands(edge.id),
    ]);
    return {
      id: edge.id,
      name: edge.name,
      publicUrl: edge.publicUrl,
      location: edge.location,
      enabled: edge.enabled,
      weight: edge.weight,
      serveVideo: edge.serveVideo,
      serveLive: edge.serveLive,
      status,
      lastSeenAt: edge.lastSeenAt,
      version: edge.version,
      hostname: edge.hostname,
      remoteIp: edge.remoteIp,
      bytesServed: edge.bytesServed.toString(),
      requestsServed: edge.requestsServed.toString(),
      now: state ? nowOf(state) : null,
      samples,
      purging: commands
        .filter((command) => command.type === 'purge')
        .map((command) => command.scope),
      createdAt: edge.createdAt,
    };
  }

  private asConflict(error: unknown): unknown {
    return isUniqueViolation(error)
      ? new ConflictException('Another edge server has this name or this address')
      : error;
  }
}

function nowOf(state: EdgeState): NonNullable<EdgeView['now']> {
  const { report } = state;
  return {
    bitsPerSecond: state.bitsPerSecond,
    requestsPerSecond: state.requestsPerSecond,
    activeRequests: report.activeRequests,
    hitRatio: state.hitRatio,
    startedAt: report.startedAt,
    cache: report.cache,
    system: report.system,
    refused: report.counters.refused,
    originErrors: report.counters.originErrors,
  };
}
