// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import type { RunnerHealth } from './channel-runner.js';

/** Sent on Redis when an admin changed a channel, so live processes look at once. */
export const LIVE_NUDGE_CHANNEL = 'onyx:live:nudge';

/** How often a live process compares what runs with what should run. */
export const RECONCILE_MS = 2000;
/** A lock or a health report that is not renewed for this long is gone. */
export const LEASE_MS = 10_000;

/** Names the live process that runs a channel, so two never run the same one. */
export function lockKey(channelId: string): string {
  return `onyx:live:lock:${channelId}`;
}

export function healthKey(channelId: string): string {
  return `onyx:live:health:${channelId}`;
}

/** What a live process reports about a channel it runs. Kept in Redis for a few seconds. */
export interface ChannelHealth extends RunnerHealth {
  /** Bits per second the channel sends out, over the segments in its playlist. */
  bitrate: number | null;
  /** The live process that runs the channel. */
  node: string;
  /** When this report was written, as Unix milliseconds. */
  at: number;
}

export function parseHealth(value: string | null): ChannelHealth | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as ChannelHealth;
    return typeof parsed === 'object' && parsed !== null && typeof parsed.node === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Directory of a channel's playlist and segments. */
export function channelDirectory(livePath: string, channelId: string): string {
  return path.join(livePath, channelId);
}
