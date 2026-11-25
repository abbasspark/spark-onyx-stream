// SPDX-License-Identifier: AGPL-3.0-only

/** What the API tells a player about the ads of one video. */
export interface AdBreak {
  id: string;
  position: 'PRE' | 'MID' | 'POST';
  /** Where in the video a break in the middle comes, in milliseconds. */
  atMs: number | null;
  sourceId: string;
}

export interface AdPlan {
  breaks: AdBreak[];
}

export type TrackedEvent =
  'start' | 'firstQuartile' | 'midpoint' | 'thirdQuartile' | 'complete' | 'skip';

/** The ad a break plays: the file, and everyone to tell about it. */
export interface ResolvedAd {
  mediaUrl: string;
  mimeType: string;
  durationMs: number | null;
  skipOffsetMs: number | null;
  clickThrough: string | null;
  clickTracking: string[];
  impressions: string[];
  errors: string[];
  tracking: Record<TrackedEvent, string[]>;
}

/** What is counted at our own server, per source. */
export type CountedEvent =
  | 'IMPRESSION'
  | 'FIRST_QUARTILE'
  | 'MIDPOINT'
  | 'THIRD_QUARTILE'
  | 'COMPLETE'
  | 'SKIP'
  | 'CLICK'
  | 'ERROR';

/** A jump in the video is not a break that was reached by watching. */
const NATURAL_STEP_SECONDS = 2;

/** The break of the given position that has not played yet. */
export function pendingBreak(
  plan: AdPlan | null | undefined,
  position: 'PRE' | 'POST',
  played: ReadonlySet<string>,
): AdBreak | null {
  return plan?.breaks.find((item) => item.position === position && !played.has(item.id)) ?? null;
}

/**
 * The break in the middle that the video just reached. Only watching into it
 * counts: whoever seeks past a break, or starts further on, is not stopped
 * for it afterwards.
 */
export function reachedBreak(
  plan: AdPlan | null | undefined,
  played: ReadonlySet<string>,
  previousSeconds: number,
  nowSeconds: number,
): AdBreak | null {
  if (
    !plan ||
    nowSeconds <= previousSeconds ||
    nowSeconds - previousSeconds > NATURAL_STEP_SECONDS
  ) {
    return null;
  }
  return (
    plan.breaks.find(
      (item) =>
        item.position === 'MID' &&
        item.atMs !== null &&
        !played.has(item.id) &&
        item.atMs / 1000 > previousSeconds &&
        item.atMs / 1000 <= nowSeconds,
    ) ?? null
  );
}

const QUARTILES = [
  ['firstQuartile', 0.25, 'FIRST_QUARTILE'],
  ['midpoint', 0.5, 'MIDPOINT'],
  ['thirdQuartile', 0.75, 'THIRD_QUARTILE'],
] as const;

/** The quartiles of an ad that playing from one moment to the next passed. */
export function quartilesCrossed(
  previousMs: number,
  nowMs: number,
  durationMs: number,
): { tracked: TrackedEvent; counted: CountedEvent }[] {
  if (!(durationMs > 0) || nowMs <= previousMs) {
    return [];
  }
  return QUARTILES.filter(
    ([, share]) => previousMs < durationMs * share && nowMs >= durationMs * share,
  ).map(([tracked, , counted]) => ({ tracked, counted }));
}

/** Whether the viewer may skip now, and how many seconds are left until they may. */
export function skipState(
  skipOffsetMs: number | null,
  elapsedMs: number,
): { skippable: boolean; secondsLeft: number } {
  if (skipOffsetMs === null) {
    return { skippable: false, secondsLeft: 0 };
  }
  const left = skipOffsetMs - elapsedMs;
  return left <= 0
    ? { skippable: true, secondsLeft: 0 }
    : { skippable: false, secondsLeft: Math.ceil(left / 1000) };
}

/** Puts the code of what went wrong where an error address asks for it. */
export function fillErrorCode(url: string, code: number): string {
  return url.replaceAll(/\[ERRORCODE\]|%5BERRORCODE%5D/gi, String(code));
}

/** Fills the macros of an address that is called while the ad plays. */
export function fillPlayerMacros(
  url: string,
  extras: { position?: number; random?: number; now?: Date } = {},
): string {
  const random = String(extras.random ?? Math.floor(Math.random() * 1e10));
  const position = Math.round((extras.position ?? 0) * 1000);
  return url
    .replaceAll(/\[(?:CACHEBUSTING|RANDOM)\]|%5B(?:CACHEBUSTING|RANDOM)%5D/gi, random)
    .replaceAll(/\[TIMESTAMP\]|%5BTIMESTAMP%5D/gi, (extras.now ?? new Date()).toISOString())
    .replaceAll(/\[ASSETURI\]|%5BASSETURI%5D/gi, '')
    .replaceAll(/\[CONTENTPLAYHEAD\]|%5BCONTENTPLAYHEAD%5D/gi, String(position));
}

/** Calls an address that wants to hear that something happened. Nothing depends on the answer. */
export function fire(url: string, position = 0): void {
  try {
    // A picture request, which the policy of the page allows from the hosts of the ads.
    if (typeof Image !== 'undefined') {
      new Image().src = fillPlayerMacros(url, { position });
    }
  } catch {
    // An ad that cannot say it was shown is still shown.
  }
}

export function fireAll(urls: readonly string[], position = 0): void {
  for (const url of urls) {
    fire(url, position);
  }
}

/** Counts an event at our own server. */
export function countEvent(sourceId: string, event: CountedEvent): void {
  try {
    void fetch('/v1/catalog/ads/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId, event }),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // Counting is not worth a word to the viewer.
  }
}

/** How long a break waits for its ad before the film goes on, in milliseconds. */
export const RESOLVE_TIMEOUT_MS = 6000;

/** Asks for the ad of a source. Null when there is none, or it did not come in time. */
export async function resolveAd(sourceId: string): Promise<ResolvedAd | null> {
  try {
    const response = await fetch('/v1/catalog/ads/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId }),
      credentials: 'omit',
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { ad: ResolvedAd | null };
    return body.ad;
  } catch {
    return null;
  }
}
