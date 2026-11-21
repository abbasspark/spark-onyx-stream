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
