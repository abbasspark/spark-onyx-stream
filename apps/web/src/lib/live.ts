// SPDX-License-Identifier: AGPL-3.0-only
import { type Opens, opensTitle } from './plans';
import type { Channel } from './types';

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
