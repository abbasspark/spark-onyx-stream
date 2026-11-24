// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What a report of a player does to the record of a playback.
 *
 * A player sends what it counted so far, not what changed since its last
 * report: a report that is lost on the way costs nothing, the next one holds
 * it all. The player is not trusted. Nothing can have lasted longer than the
 * time that passed, figures only grow, and what it says in words is cut
 * short and cleaned of addresses.
 */

/** The problems a player names. Apps may send others: they are kept and shown as sent. */
export const ERROR_CODES = [
  /** A playlist or a piece of the video could not be loaded. */
  'network',
  /** The device could not decode what it got. */
  'media',
  /** The device cannot play this kind of video at all. */
  'unsupported',
  /** The addresses stopped working: they ran out, or were refused. */
  'expired',
  /** The key of a protected video could not be had. */
  'key',
  /** Nothing came for too long and the player gave up. */
  'timeout',
  'other',
] as const;

/** A code is a short word: letters, digits, dashes. */
export const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

/** A playback takes reports this long after it was asked for. */
export const SESSION_OPEN_MS = 24 * 60 * 60 * 1000;
/** Clocks differ and requests take time: this much more than passed is believed. */
const GRACE_MS = 10_000;
/** No start takes longer than this and is still a start: the player has given up before. */
export const MAX_STARTUP_MS = 5 * 60 * 1000;
export const MAX_MESSAGE_LENGTH = 300;
const MAX_COUNT = 100_000;

export interface ReportInput {
  /** From the wish to play to the first picture. Sent once it is known. */
  startupMs?: number;
  /** Seconds played so far. */
  played: number;
  /** How often playback stopped to load so far, and for how long. */
  stalls: number;
  stallMs: number;
  qualityChanges: number;
  /** The average bitrate so far, and the height mostly played in. */
  bitrateKbps?: number;
  height?: number;
  droppedFrames?: number;
  recoveredErrors?: number;
  /** The problem that ended playback. */
  error?: { code: string; message?: string; position?: number };
  /** True once the video ended or was left. */
  ended?: boolean;
  player?: { name: string; version?: string };
}

export interface SessionState {
  startedAt: Date;
  startupMs: number | null;
  playedSeconds: number;
  stallCount: number;
  stallMs: number;
  qualityChanges: number;
  bitrateKbps: number | null;
  height: number | null;
  droppedFrames: number;
  recoveredErrors: number;
  errorCode: string | null;
  errorMessage: string | null;
  errorAtSeconds: number | null;
  ended: boolean;
  player: string | null;
  playerVersion: string | null;
}

export type SessionUpdate = Omit<SessionState, 'startedAt'>;

const whole = (value: number): number => Math.max(0, Math.round(value));
const grown = (before: number, now: number, most: number): number =>
  Math.max(before, Math.min(whole(now), most));

/**
 * What a player said in words, made safe to keep: addresses lose everything
 * after the host, since a signed address is a key to the video, and the
 * rest is cut to a length.
 */
export function cleanMessage(message: string | undefined): string | null {
  const cleaned = (message ?? '')
    // Control characters would break a line of the list they are shown in.
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\b(https?:\/\/[^/\s"'<>]+)[^\s"'<>]*/gi, '$1/…')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, MAX_MESSAGE_LENGTH) : null;
}

/**
 * The record of a playback after a report.
 *
 * - Nothing lasted longer than the time since the playback was asked for.
 * - Counts and durations only grow.
 * - The time to start and the problem that ended playback are kept as first
 *   said: a player that reports twice does not get to change its story.
 */
export function applyReport(session: SessionState, report: ReportInput, now: Date): SessionUpdate {
  const passedMs = Math.max(0, now.getTime() - session.startedAt.getTime()) + GRACE_MS;
  const passedSeconds = Math.ceil(passedMs / 1000);

  const startupMs =
    session.startupMs ??
    (report.startupMs !== undefined && report.startupMs <= Math.min(passedMs, MAX_STARTUP_MS)
      ? whole(report.startupMs)
      : null);
  // What did not start has not played, whatever the player says.
  const started = startupMs !== null;

  const error =
    session.errorCode === null && report.error && ERROR_CODE_PATTERN.test(report.error.code)
      ? {
          errorCode: report.error.code,
          errorMessage: cleanMessage(report.error.message),
          errorAtSeconds:
            report.error.position === undefined
              ? null
              : Math.min(whole(report.error.position), 1_000_000),
        }
      : {
          errorCode: session.errorCode,
          errorMessage: session.errorMessage,
          errorAtSeconds: session.errorAtSeconds,
        };

  return {
    startupMs,
    playedSeconds: started
      ? grown(session.playedSeconds, report.played, passedSeconds)
      : session.playedSeconds,
    stallCount: started ? grown(session.stallCount, report.stalls, MAX_COUNT) : session.stallCount,
    stallMs: started ? grown(session.stallMs, report.stallMs, passedMs) : session.stallMs,
    qualityChanges: grown(session.qualityChanges, report.qualityChanges, MAX_COUNT),
    bitrateKbps:
      report.bitrateKbps !== undefined && report.bitrateKbps > 0
        ? Math.min(whole(report.bitrateKbps), 1_000_000)
        : session.bitrateKbps,
    height:
      report.height !== undefined && report.height > 0
        ? Math.min(whole(report.height), 16_000)
        : session.height,
    droppedFrames: grown(session.droppedFrames, report.droppedFrames ?? 0, 100_000_000),
    recoveredErrors: grown(session.recoveredErrors, report.recoveredErrors ?? 0, MAX_COUNT),
    ...error,
    ended: session.ended || report.ended === true,
    player: session.player ?? report.player?.name ?? null,
    playerVersion: session.playerVersion ?? report.player?.version ?? null,
  };
}

/**
 * Where a player was sent for its files, for the figures per server:
 * "origin" for the main server, otherwise the host of the address.
 */
export function serverOf(playbackUrl: string, mediaBaseUrl: string): string {
  const hostOf = (address: string): string | null => {
    try {
      return new URL(address).host.toLowerCase() || null;
    } catch {
      return null;
    }
  };
  const host = hostOf(playbackUrl);
  // A relative address is the main server itself.
  if (!host || host === hostOf(mediaBaseUrl)) {
    return 'origin';
  }
  return host.slice(0, 200);
}
