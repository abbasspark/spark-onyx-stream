// SPDX-License-Identifier: AGPL-3.0-only
import { type Opens, opensTitle } from './plans';
import type { Channel, Programme } from './types';

export function liveHref(slug: string): string {
  return `/live/${slug}`;
}

/** Whether a channel needs a plan the viewer does not have. Free channels never do. */
export function isLocked(channel: Pick<Channel, 'access' | 'packageIds'>, opens: Opens): boolean {
  return !opensTitle(opens, channel);
}

/** The channel before or after another in the lineup, going round at the ends. */
export function neighbour(
  channels: readonly Channel[],
  slug: string,
  step: 1 | -1,
): Channel | null {
  const index = channels.findIndex((channel) => channel.slug === slug);
  if (index === -1 || channels.length < 2) {
    return null;
  }
  return channels[(index + step + channels.length) % channels.length] ?? null;
}

/** What a failed request for a channel means for the viewer. */
export type LiveRefusal =
  | 'sign-in'
  | 'subscribe'
  | 'other-plan'
  | 'confirm-email'
  | 'off-air'
  | 'closed'
  | 'gone'
  | 'failed';

/** Reads the answer of the API to a request for watching a channel. */
export function refusalOf(status: number, code: string | undefined): LiveRefusal {
  if (status === 401) {
    return 'sign-in';
  }
  if (status === 402) {
    return code === 'plan_required' ? 'other-plan' : 'subscribe';
  }
  if (status === 403) {
    return code === 'email_unverified' ? 'confirm-email' : 'closed';
  }
  if (status === 409) {
    return 'off-air';
  }
  if (status === 404) {
    return 'gone';
  }
  return 'failed';
}

/** How far a programme has run, from 0 to 1. */
export function progressOf(programme: Pick<Programme, 'startsAt' | 'endsAt'>, now: number): number {
  const start = new Date(programme.startsAt).getTime();
  const end = new Date(programme.endsAt).getTime();
  if (!(end > start)) {
    return 0;
  }
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/**
 * What is on a channel at a moment, from what was known when the page was
 * made: the programme that was "now" may be over, and "next" may have begun.
 */
export function onNow(
  channel: Pick<Channel, 'now' | 'next'>,
  now: number,
): { now: Programme | null; next: Programme | null } {
  const runs = (programme: Programme): boolean =>
    new Date(programme.startsAt).getTime() <= now && new Date(programme.endsAt).getTime() > now;
  const current = channel.now ?? null;
  const following = channel.next ?? null;
  if (current && runs(current)) {
    return { now: current, next: following };
  }
  if (following && runs(following)) {
    return { now: following, next: null };
  }
  const upcoming = following && new Date(following.startsAt).getTime() > now ? following : null;
  return { now: null, next: upcoming };
}

/** Where a programme sits in a guide that shows a stretch of time, as parts of its width. */
export function placeOf(
  programme: Pick<Programme, 'startsAt' | 'endsAt'>,
  from: number,
  to: number,
): { start: number; width: number } | null {
  const start = Math.max(from, new Date(programme.startsAt).getTime());
  const end = Math.min(to, new Date(programme.endsAt).getTime());
  if (!(end > start) || !(to > from)) {
    return null;
  }
  return { start: (start - from) / (to - from), width: (end - start) / (to - from) };
}

/** How far behind the present a viewer is, as a clock: "0:45", "12:34", "1:02:03". */
export function formatBehind(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/**
 * Where in the video a programme began, to start it over. Null when that
 * moment is no longer kept, lies ahead, or is where the viewer already is.
 *
 * @param zeroAt The moment in the world that position 0 of the video stands for, in milliseconds.
 */
export function startOverPosition(
  programmeStartsAt: string,
  zeroAt: number | null,
  seekableStart: number,
  current: number,
): number | null {
  if (zeroAt === null) {
    return null;
  }
  const position = (new Date(programmeStartsAt).getTime() - zeroAt) / 1000;
  // A few seconds of slack at the old end: those segments are about to be deleted.
  if (!Number.isFinite(position) || position < seekableStart + 8 || position > current - 20) {
    return null;
  }
  return position;
}

/**
 * The channel a number stands for, as typed on a remote control. Numbers are
 * matched whole, so 1 finds channel 1 and not channel 10.
 */
export function channelByNumber<T extends Pick<Channel, 'number'>>(
  channels: readonly T[],
  number: number,
): T | null {
  return channels.find((channel) => channel.number === number) ?? null;
}

/**
 * Whether more channels begin with the digits typed so far, so that the
 * player knows to wait for another digit instead of tuning at once.
 */
export function moreBeginWith(
  channels: readonly Pick<Channel, 'number'>[],
  digits: string,
): boolean {
  const typed = Number(digits);
  return channels.some(
    (channel) =>
      channel.number !== null &&
      channel.number !== typed &&
      String(channel.number).startsWith(digits),
  );
}

/**
 * Where in the video a moment of the world lies, for a channel that keeps
 * what it sent. Null when the moment is no longer kept or has not come yet.
 *
 * @param at The moment, in milliseconds.
 * @param zeroAt The moment position 0 of the video stands for, in milliseconds.
 */
export function positionAt(
  at: number,
  zeroAt: number | null,
  range: { start: number; end: number } | null,
): number | null {
  if (zeroAt === null || range === null) {
    return null;
  }
  const position = (at - zeroAt) / 1000;
  // A few seconds of slack at each end: those parts are about to go, or are
  // not there yet.
  if (!Number.isFinite(position) || position < range.start + 8 || position > range.end - 4) {
    return null;
  }
  return position;
}

/** The programme a moment falls in, out of a channel's row of the guide. */
export function programmeAt(programmes: readonly Programme[], at: number): Programme | null {
  return (
    programmes.find(
      (programme) =>
        new Date(programme.startsAt).getTime() <= at && new Date(programme.endsAt).getTime() > at,
    ) ?? null
  );
}
