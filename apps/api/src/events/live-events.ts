// SPDX-License-Identifier: AGPL-3.0-only
import type { JobStatus, JobType } from '@onyx/database';
import type { Permission } from '../auth/permissions.js';

/** Redis channel that carries live events from every process to the API processes. */
export const LIVE_EVENTS_CHANNEL = 'onyx:events';

/**
 * Something changed that an open admin panel wants to show at once.
 *
 * Events are hints, not data: they say what changed and the panel reads the
 * details through the normal API, where permissions are checked as usual.
 */
export type LiveEvent =
  | {
      type: 'job';
      jobId: string;
      assetId: string | null;
      jobType: JobType;
      status: JobStatus;
      /** 0 to 100. */
      progress: number;
    }
  | {
      /** Sent often while a job runs. Carries only what changes. */
      type: 'job-progress';
      jobId: string;
      progress: number;
    }
  | {
      type: 'asset';
      assetId: string;
      change: 'created' | 'updated' | 'uploaded' | 'deleted';
    }
  | {
      /** A recording was planned, started, finished or removed. */
      type: 'recording';
      recordingId: string;
    }
  | {
      /** An edge server was added, changed or removed, or its agent connected. */
      type: 'edge';
      edgeId: string;
    }
  | {
      /** A backup was asked for, started, finished or removed. */
      type: 'backup';
      backupId: string;
    }
  | {
      type: 'channel';
      channelId: string;
      /** "status" is sent by the live process when a channel starts, stops or reconnects. */
      change: 'created' | 'updated' | 'deleted' | 'status';
    };

/** The permission a receiver needs for each kind of event. */
export const EVENT_PERMISSIONS: Record<LiveEvent['type'], Permission> = {
  job: 'jobs:read',
  'job-progress': 'jobs:read',
  asset: 'assets:read',
  channel: 'live:read',
  recording: 'live:read',
  edge: 'delivery:read',
  backup: 'settings:read',
};

/** Reads an event from its channel message. Null when the message is not a valid event. */
export function parseLiveEvent(message: string): LiveEvent | null {
  try {
    const value = JSON.parse(message) as { type?: unknown };
    return typeof value === 'object' &&
      value !== null &&
      typeof value.type === 'string' &&
      value.type in EVENT_PERMISSIONS
      ? (value as LiveEvent)
      : null;
  } catch {
    return null;
  }
}
