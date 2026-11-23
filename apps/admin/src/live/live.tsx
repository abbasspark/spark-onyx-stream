// SPDX-License-Identifier: AGPL-3.0-only
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { API_ORIGIN } from '@/api/client';
import type { Job, JobStatus, JobType, Page } from '@/api/types';
import { tokenStore } from '@/auth/token-store';
import { createSseParser } from './sse';

/** What the server tells an open panel. Events are hints: the details are read through the API. */
type LiveEvent =
  | {
      type: 'job';
      jobId: string;
      assetId: string | null;
      jobType: JobType;
      status: JobStatus;
      progress: number;
    }
  | { type: 'job-progress'; jobId: string; progress: number }
  | { type: 'asset'; assetId: string; change: 'created' | 'updated' | 'uploaded' | 'deleted' }
  | { type: 'recording'; recordingId: string }
  | { type: 'edge'; edgeId: string }
  | { type: 'backup'; backupId: string }
  | { type: 'watch'; locationId: string | null }
  | { type: 'channel'; channelId: string; change: 'created' | 'updated' | 'deleted' | 'status' };

export type LiveState = 'connecting' | 'live' | 'offline';

/** Changes that arrive close together are read from the API once, after this pause. */
const REFRESH_DELAY_MS = 300;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 15_000;
/** Without any sign of life for this long, the connection is taken as dead. The server sends one every 20 seconds. */
const SILENCE_LIMIT_MS = 45_000;

/** How often lists ask again while the live connection is down. */
export const FALLBACK_POLL_MS = 2500;
/** A slow safety net while it is up, in case an event was lost. */
export const SAFETY_POLL_MS = 30_000;

const LiveContext = createContext<LiveState>('connecting');

/** Updates the progress and status of a job in every cached job list. Reports whether it was found. */
function patchJob(queryClient: QueryClient, jobId: string, change: Partial<Job>): boolean {
  let found = false;
  queryClient.setQueriesData<Page<Job>>({ queryKey: ['jobs'] }, (page) => {
    if (!page?.items.some((job) => job.id === jobId)) {
      return page;
    }
    found = true;
    return {
      ...page,
      items: page.items.map((job) => (job.id === jobId ? { ...job, ...change } : job)),
    };
  });
  return found;
}

/**
 * Keeps one connection to the server's event stream while an admin is signed
 * in, and turns events into fresh data on screen. When the connection is
 * down, pages fall back to asking the server every few seconds.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<LiveState>('connecting');

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    let retryTimer: number | undefined;
    let silenceTimer: number | undefined;
    let refreshTimer: number | undefined;
    let retryDelay = RETRY_MIN_MS;
    const pending = new Map<string, readonly unknown[]>();

    /** Marks cached data as outdated. Several marks within a short time lead to one request. */
    const refresh = (...keys: (readonly unknown[])[]) => {
      for (const key of keys) {
        pending.set(JSON.stringify(key), key);
      }
      refreshTimer ??= window.setTimeout(() => {
        refreshTimer = undefined;
        for (const key of pending.values()) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
        pending.clear();
      }, REFRESH_DELAY_MS);
    };

    const handle = (event: LiveEvent) => {
      if (event.type === 'job-progress') {
        patchJob(queryClient, event.jobId, { progress: event.progress });
        return;
      }
      if (event.type === 'job') {
        // A known job is updated in place at once. The list is read again for the rest.
        patchJob(queryClient, event.jobId, { status: event.status, progress: event.progress });
        refresh(['jobs'], ['stats']);
        if (event.assetId) {
          // A job that starts or ends usually changes its asset as well.
          refresh(['assets'], ['asset', event.assetId], ['asset-media', event.assetId]);
        }
        return;
      }
      if (event.type === 'recording') {
        refresh(['recordings']);
        return;
      }
      if (event.type === 'edge') {
        refresh(['edges']);
        return;
      }
      if (event.type === 'backup') {
        refresh(['backups']);
        return;
      }
      if (event.type === 'watch') {
        refresh(['watch']);
        return;
      }
      if (event.type === 'channel') {
        refresh(['channels'], ['channel', event.channelId]);
        return;
      }
      refresh(
        ['assets'],
        ['stats'],
        ['asset', event.assetId],
        ['asset-media', event.assetId],
        ['audit'],
      );
    };

    const watchSilence = () => {
      window.clearTimeout(silenceTimer);
      silenceTimer = window.setTimeout(() => controller?.abort(), SILENCE_LIMIT_MS);
    };

    const connect = async () => {
      const token = tokenStore.read();
      if (!token) {
        return;
      }
      controller = new AbortController();
      try {
        const response = await fetch(`${API_ORIGIN}/v1/events`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok || !response.body) {
          // A refused session is noticed by the next ordinary request, which signs the admin out.
          throw new Error(`The event stream answered with status ${response.status}`);
        }

        const feed = createSseParser(
          (event) => {
            watchSilence();
            try {
              handle(JSON.parse(event.data) as LiveEvent);
            } catch {
              // An event this version does not understand is skipped.
            }
          },
          () => watchSilence(),
        );

        setState('live');
        retryDelay = RETRY_MIN_MS;
        watchSilence();
        // What changed while disconnected is unknown, so everything on screen is read again.
        void queryClient.invalidateQueries();

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          feed(value);
        }
      } catch {
        // Falls through to connecting again.
      } finally {
        window.clearTimeout(silenceTimer);
      }

      if (stopped) {
        return;
      }
      setState('offline');
      retryTimer = window.setTimeout(() => void connect(), retryDelay);
      retryDelay = Math.min(RETRY_MAX_MS, retryDelay * 2);
    };

    // A hidden tab or a network change can leave a dead connection behind. Coming back reconnects at once.
    const wake = () => {
      if (document.visibilityState === 'visible' && retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
        retryDelay = RETRY_MIN_MS;
        void connect();
      }
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);

    void connect();

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.clearTimeout(retryTimer);
      window.clearTimeout(refreshTimer);
      window.clearTimeout(silenceTimer);
      controller?.abort();
    };
  }, [queryClient]);

  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

/** The state of the live connection. */
export function useLiveState(): LiveState {
  return useContext(LiveContext);
}

/**
 * How often a list should ask the server again. With a live connection the
 * events do the work and asking is only a slow safety net.
 *
 * @param active Whether something on screen is still changing.
 */
export function usePollInterval(): (active: boolean) => number | false {
  const live = useLiveState() === 'live';
  return (active) => (active ? (live ? SAFETY_POLL_MS : FALLBACK_POLL_MS) : false);
}
