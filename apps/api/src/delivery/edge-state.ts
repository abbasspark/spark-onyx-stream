// SPDX-License-Identifier: AGPL-3.0-only

/** How often an agent reports, as it is told in every answer. */
export const HEARTBEAT_SECONDS = 10;
/** An edge that has not reported for this long gets no new viewers. */
export const ONLINE_WITHIN_MS = 35_000;
/** Points of the traffic history that are kept: one hour of heartbeats. */
export const SAMPLE_COUNT = 360;

export const edgeStateKey = (edgeId: string) => `onyx:edge:${edgeId}:state`;
export const edgeSamplesKey = (edgeId: string) => `onyx:edge:${edgeId}:samples`;

/** Counters of an agent since it started. They only grow until it restarts. */
export interface EdgeCounters {
  requests: number;
  bytesSent: number;
  /** Requests answered from the copies on the edge. */
  hits: number;
  /** Requests the edge had to fetch from the main server first. */
  misses: number;
  /** Requests with a token that was wrong or run out. */
  refused: number;
  /** Fetches from the main server that failed. */
  originErrors: number;
}

/** What an agent says about itself in a heartbeat. */
export interface EdgeReport {
  protocol: number;
  version: string;
  hostname: string;
  /** When the agent started, which tells a restart from a counter that fell. */
  startedAt: string;
  counters: EdgeCounters;
  /** Requests being answered at this moment. */
  activeRequests: number;
  cache: { bytes: number; files: number; limitBytes: number };
  system: {
    cpus: number;
    /** Load of the last minute. Null where the system does not tell. */
    load1: number | null;
    /** Free space on the disk of the copies. */
    diskFreeBytes: number | null;
    diskTotalBytes: number | null;
  };
}

/** The last report of an edge with what was worked out from it. Kept in Redis. */
export interface EdgeState {
  /** When the report came, in milliseconds. */
  at: number;
  report: EdgeReport;
  /** Averages since the report before. */
  bitsPerSecond: number;
  requestsPerSecond: number;
  /** Share of requests answered from copies since the agent started, 0 to 1. Null before the first request. */
  hitRatio: number | null;
}

/** One point of the traffic history: [time in seconds, bits per second, requests per second]. */
export type EdgeSample = [number, number, number];

export type EdgeStatus = 'ONLINE' | 'OFFLINE' | 'DISABLED' | 'NEVER_CONNECTED';

export function statusOf(
  edge: { enabled: boolean; lastSeenAt: Date | null },
  now: number,
): EdgeStatus {
  if (!edge.lastSeenAt) {
    return 'NEVER_CONNECTED';
  }
  if (now - edge.lastSeenAt.getTime() > ONLINE_WITHIN_MS) {
    return 'OFFLINE';
  }
  return edge.enabled ? 'ONLINE' : 'DISABLED';
}

/** What an edge did between two reports. */
export interface EdgeDelta {
  bytes: number;
  requests: number;
  hits: number;
  misses: number;
}

/**
 * What was delivered between two reports. A counter that fell means the agent
 * restarted, and then everything it counts is new.
 */
export function deltaOf(previous: EdgeReport | null, current: EdgeReport): EdgeDelta {
  const now = current.counters;
  const before = previous?.counters;
  const restarted =
    !before ||
    previous.startedAt !== current.startedAt ||
    now.bytesSent < before.bytesSent ||
    now.requests < before.requests;
  return restarted
    ? { bytes: now.bytesSent, requests: now.requests, hits: now.hits, misses: now.misses }
    : {
        bytes: now.bytesSent - before.bytesSent,
        requests: now.requests - before.requests,
        hits: Math.max(0, now.hits - before.hits),
        misses: Math.max(0, now.misses - before.misses),
      };
}

/** The start of the hour a moment lies in, in UTC. */
export function hourOf(at: number): Date {
  return new Date(Math.floor(at / 3_600_000) * 3_600_000);
}

export const edgeCommandsKey = (edgeId: string) => `onyx:edge:${edgeId}:commands`;
/** A command nobody fetched or confirmed is dropped after this long. */
export const COMMAND_TTL_SECONDS = 15 * 60;

/** What the copies of an edge are emptied of. */
export const PURGE_SCOPES = ['all', 'video', 'live'] as const;
export type PurgeScope = (typeof PURGE_SCOPES)[number];

/**
 * Something the main server asks of an agent. It travels in the answer to a
 * heartbeat, and the agent names it in a later report once it is done.
 */
export interface EdgeCommand {
  id: string;
  type: 'purge';
  scope: PurgeScope;
}
