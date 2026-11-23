// SPDX-License-Identifier: AGPL-3.0-only
//
// Stream limits: an account plays on so many devices at the same time. A
// player holds a place while it plays, by reporting every half minute, and
// gives it back when it leaves.
import type { StreamTicket } from './types';
import { describeDevice } from './viewer-api';

export type { StreamTicket };

/** What another device of the account is playing. */
export interface PlayingStream {
  id: string;
  kind: 'VIDEO' | 'LIVE';
  subject: string;
  device: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'TV' | 'OTHER';
  userAgent: string | null;
  profile: { id: string; name: string } | null;
  startedAt: string;
}

/** Why playback was refused: every place of the account is taken. */
export interface StreamLimitRefusal {
  limit: number;
  streams: PlayingStream[];
}

const DEVICE_WORDS: Record<PlayingStream['device'], string> = {
  DESKTOP: 'Computer',
  MOBILE: 'Phone',
  TABLET: 'Tablet',
  TV: 'TV',
  OTHER: 'Device',
};

/** "Phone, Safari on iPhone": the kind of device, and what it said it is. */
export function describeStreamDevice(stream: Pick<PlayingStream, 'device' | 'userAgent'>): string {
  const kind = DEVICE_WORDS[stream.device] ?? DEVICE_WORDS.OTHER;
  return stream.userAgent ? `${kind}, ${describeDevice(stream.userAgent)}` : kind;
}

/** "Watching News 24" for a channel, "Playing Night Train" for a video. */
export function describePlaying(stream: Pick<PlayingStream, 'kind' | 'subject'>): string {
  return `${stream.kind === 'LIVE' ? 'Watching' : 'Playing'} ${stream.subject}`;
}

/**
 * Reads the answer of a refused playback request. Null when it was refused
 * for another reason than the limit.
 */
export function readStreamLimit(status: number, body: unknown): StreamLimitRefusal | null {
  if (status !== 409 || typeof body !== 'object' || body === null) {
    return null;
  }
  const answer = body as { code?: unknown; limit?: unknown; streams?: unknown };
  if (answer.code !== 'stream_limit') {
    return null;
  }
  return {
    limit: typeof answer.limit === 'number' ? answer.limit : 1,
    streams: Array.isArray(answer.streams) ? (answer.streams as PlayingStream[]) : [],
  };
}

/** "on 1 device" or "on 3 devices". */
export function devicesPhrase(limit: number): string {
  return limit === 1 ? 'on 1 device' : `on ${limit} devices`;
}

const path = (id: string, action = '') => `/v1/viewer/streams/${encodeURIComponent(id)}${action}`;

/** What the account is playing, as the account itself sees it. */
export interface OwnStreams {
  /** Devices that may play at the same time. Null: no limit. */
  limit: number | null;
  streams: (PlayingStream & { here: boolean })[];
}

export const streamsApi = {
  /** What the devices of the account are playing right now. */
  async list(): Promise<OwnStreams> {
    const response = await fetch('/v1/viewer/streams', { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error('The list could not be loaded');
    }
    return (await response.json()) as OwnStreams;
  },
  /**
   * Says that this device is still playing.
   *
   * @returns "stopped" when the place was taken away and the player has to
   *   stop. Anything else, a lost connection included, lets it play on: a
   *   viewer is not interrupted because a report did not get through.
   */
  async beat(id: string): Promise<'playing' | 'stopped'> {
    try {
      const response = await fetch(path(id, '/beat'), {
        method: 'POST',
        credentials: 'same-origin',
      });
      return response.status === 410 ? 'stopped' : 'playing';
    } catch {
      return 'playing';
    }
  },
  /** Gives the place back. It may be the last thing a page does. */
  end(id: string): void {
    try {
      void fetch(path(id), {
        method: 'DELETE',
        credentials: 'same-origin',
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // The place frees itself a little later.
    }
  },
  /** Stops what another device of the account is playing. @returns Whether the site took it. */
  async stop(id: string): Promise<boolean> {
    try {
      const response = await fetch(path(id), { method: 'DELETE', credentials: 'same-origin' });
      return response.ok;
    } catch {
      return false;
    }
  },
};

interface Clock {
  setInterval: (run: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

/** What a player is told about its place. */
export interface StreamEvents {
  /** The place was taken away: stop playing. */
  onStopped: () => void;
  /**
   * The page was left, the place given back, and the browser then brought the
   * page back as it was: ask for playback again.
   */
  onReturned?: () => void;
}

/** The browser leaving a page for another, and bringing it back from its memory. */
interface PageLife {
  /** @returns Stops listening. */
  listen: (onLeave: () => void, onReturn: () => void) => () => void;
}

const browserPage: PageLife = {
  listen(onLeave, onReturn) {
    const returned = (event: PageTransitionEvent) => {
      if (event.persisted) {
        onReturn();
      }
    };
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('pageshow', returned);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('pageshow', returned);
    };
  },
};

/**
 * Holds a place while a player plays: reports on time, tells the player when
 * the place is gone, and gives the place back when the page is left, also by
 * closing the tab or going to another site.
 *
 * @returns Lets go of the place. Call it when the player leaves the video.
 */
export function holdStream(
  ticket: StreamTicket,
  events: StreamEvents,
  api: Pick<typeof streamsApi, 'beat' | 'end'> = streamsApi,
  clock: Clock = {
    setInterval: (run, ms) => window.setInterval(run, ms),
    clearInterval: (handle) => window.clearInterval(handle as number),
  },
  page: PageLife = browserPage,
): () => void {
  let held = true;
  const report = async () => {
    if (!held) {
      return;
    }
    if ((await api.beat(ticket.id)) === 'stopped' && held) {
      held = false;
      clock.clearInterval(timer);
      events.onStopped();
    }
  };
  const timer = clock.setInterval(() => void report(), Math.max(5, ticket.beatSeconds) * 1000);
  const letGo = () => {
    clock.clearInterval(timer);
    if (held) {
      held = false;
      api.end(ticket.id);
      return true;
    }
    return false;
  };
  let left = false;
  const unlisten = page.listen(
    () => {
      left = letGo() || left;
    },
    () => {
      if (left) {
        left = false;
        events.onReturned?.();
      }
    },
  );
  return () => {
    unlisten();
    letGo();
  };
}
