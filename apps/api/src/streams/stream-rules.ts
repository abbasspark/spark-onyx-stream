// SPDX-License-Identifier: AGPL-3.0-only

/** How often a player says that it is still playing. */
export const BEAT_SECONDS = 30;
/**
 * How long a stream counts without a word from its player: two reports may
 * be lost before a device that went away frees its place.
 */
export const STREAM_TTL_SECONDS = 75;
/** After this long without a word, the row of a stream is cleared away. */
export const STREAM_KEEP_SECONDS = 3600;
/** The most devices a limit can allow. More than this is "no limit". */
export const MAX_STREAM_LIMIT = 20;

/** Where the limit of a viewer comes from. */
export type LimitSource = 'VIEWER' | 'PLAN' | 'SITE';

export interface StreamLimit {
  /** Devices that may play at the same time. Null: as many as they like. */
  limit: number | null;
  source: LimitSource;
}

/**
 * On how many devices a viewer plays at the same time.
 *
 * What an admin set for the viewer wins. Otherwise the plans the viewer
 * watches through decide, the most generous of them, and a plan that says
 * nothing follows the installation. A viewer without a plan follows the
 * installation too.
 *
 * @param viewerLimit What an admin set for this viewer, or null.
 * @param planLimits The limit of each plan the viewer watches through right now. Null: the plan says nothing.
 * @param siteLimit The limit of the installation. 0: none.
 */
export function limitOf(
  viewerLimit: number | null,
  planLimits: readonly (number | null)[],
  siteLimit: number,
): StreamLimit {
  if (viewerLimit !== null) {
    return { limit: viewerLimit, source: 'VIEWER' };
  }
  const site = siteLimit > 0 ? siteLimit : null;
  const own = planLimits.filter((limit): limit is number => limit !== null);
  if (own.length === 0) {
    return { limit: site, source: 'SITE' };
  }
  // A plan that says nothing follows the installation, which may be more generous.
  const follows = planLimits.length > own.length;
  if (follows && site === null) {
    return { limit: null, source: 'SITE' };
  }
  const best = Math.max(...own);
  return follows && site !== null && site > best
    ? { limit: site, source: 'SITE' }
    : { limit: best, source: 'PLAN' };
}

/** The moment before which a stream that last reported then is over. */
export function staleBefore(now: Date): Date {
  return new Date(now.getTime() - STREAM_TTL_SECONDS * 1000);
}

/** "on 1 device" or "on 3 devices". */
export function devicesPhrase(limit: number): string {
  return limit === 1 ? 'on 1 device' : `on ${limit} devices`;
}
