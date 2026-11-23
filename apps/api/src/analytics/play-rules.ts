// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';

export type PlayDevice = 'DESKTOP' | 'MOBILE' | 'TABLET' | 'TV' | 'OTHER';

/**
 * The kind of device, from what the browser says it is. Only the kind is
 * kept: the description itself is not stored.
 */
export function deviceOf(userAgent: string | null | undefined): PlayDevice {
  const agent = userAgent ?? '';
  if (!agent) {
    return 'OTHER';
  }
  if (
    /smart-?tv|smarttv|hbbtv|appletv|googletv|android tv|tizen|web0s|webos|roku|aft[a-z]|bravia|crkey|playstation|xbox/i.test(
      agent,
    )
  ) {
    return 'TV';
  }
  if (
    /ipad|tablet|playbook|silk|kindle/i.test(agent) ||
    (/android/i.test(agent) && !/mobile/i.test(agent))
  ) {
    return 'TABLET';
  }
  if (/iphone|ipod|android|windows phone|mobile/i.test(agent)) {
    return 'MOBILE';
  }
  if (/windows nt|macintosh|mac os x|x11|linux|cros/i.test(agent)) {
    return 'DESKTOP';
  }
  return 'OTHER';
}

/** The day a moment falls on, in UTC, as "2026-12-24". */
export const dayOf = (moment: Date): string => moment.toISOString().slice(0, 10);

/**
 * A mark for a visitor who is not signed in, to count the same device once
 * a day. It is made from the address and the description of the device, the
 * day, and a secret of the installation, and only its hash is kept: neither
 * can be read back from it, and the next day the same device gets another.
 */
export function visitorKeyOf(
  secret: string,
  moment: Date,
  ipAddress: string | null,
  userAgent: string | null,
): string | null {
  if (!ipAddress) {
    return null;
  }
  return createHash('sha256')
    .update(`${dayOf(moment)}\n${secret}\n${ipAddress}\n${userAgent ?? ''}`)
    .digest('hex')
    .slice(0, 32);
}

/** A play counts as a view once this much of it was watched. */
export const VIEW_SECONDS = 30;
/** A video shorter than twice that counts once half of it was watched. */
export function viewThreshold(durationSeconds: number): number {
  return durationSeconds > 0
    ? Math.min(VIEW_SECONDS, Math.ceil(durationSeconds / 2))
    : VIEW_SECONDS;
}
/** A view counts as watched to the end at this share of the length. */
export const COMPLETE_SHARE = 0.85;

/** The player reports at least this often while it plays. */
export const BEAT_SECONDS = 30;
/** The most one report can add, whatever it says: twice the usual time between two. */
export const MAX_BEAT_SECONDS = BEAT_SECONDS * 2;
/** A play takes reports this long after it was made. */
export const PLAY_OPEN_MS = 24 * 60 * 60 * 1000;

export interface BeatInput {
  /** Where the player is, in seconds. */
  position: number;
  /** Seconds played since the report before. */
  watched: number;
}

export interface PlayState {
  durationSeconds: number;
  watchedSeconds: number;
  positionSeconds: number;
  lastBeatAt: Date;
}

/**
 * What a report of the player adds to a play. The player is not trusted:
 * time watched cannot be more than the time that passed since the report
 * before, nor more than a report may carry, and a video cannot be watched
 * more than a few times its length in one play.
 */
export function applyBeat(
  play: PlayState,
  beat: BeatInput,
  now: Date,
): { watchedSeconds: number; positionSeconds: number } {
  const passed = Math.max(0, (now.getTime() - play.lastBeatAt.getTime()) / 1000) + 5;
  const added = Math.max(0, Math.min(beat.watched, passed, MAX_BEAT_SECONDS));
  const ceiling = play.durationSeconds > 0 ? play.durationSeconds * 3 : 6 * 60 * 60;
  const limit = play.durationSeconds > 0 ? play.durationSeconds : Number.MAX_SAFE_INTEGER;
  return {
    watchedSeconds: Math.min(ceiling, Math.round(play.watchedSeconds + added)),
    positionSeconds: Math.max(
      play.positionSeconds,
      Math.min(limit, Math.max(0, Math.round(beat.position))),
    ),
  };
}
