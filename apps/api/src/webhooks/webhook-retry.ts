// SPDX-License-Identifier: AGPL-3.0-only

/**
 * How long to wait after each failed try, in seconds. Seven tries in all,
 * spread over about a day: a receiver that is down for a deployment gets its
 * messages minutes later, one that is down overnight still gets them.
 */
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 21_600, 43_200] as const;

export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;

/** After this long without one delivery getting through, a webhook is switched off. */
export const DISABLE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** How long a try may take before it counts as failed, in milliseconds. */
export const ATTEMPT_TIMEOUT_MS = 10_000;

/** How much of an answer is kept, in characters. */
export const RESPONSE_KEPT = 1000;

/** How long deliveries are kept, in milliseconds. */
export const KEEP_DELIVERIES_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * When to try again after a failed try.
 *
 * @param attempts How often it has been tried, the failed one included.
 * @returns The moment of the next try, or null when it was the last.
 */
export function nextAttemptAfter(attempts: number, now: Date): Date | null {
  const delay = RETRY_DELAYS_SECONDS[attempts - 1];
  return delay === undefined ? null : new Date(now.getTime() + delay * 1000);
}

/** Whether a webhook that fails since then has failed for long enough to be switched off. */
export function shouldDisable(failingSince: Date | null, now: Date): boolean {
  return failingSince !== null && now.getTime() - failingSince.getTime() >= DISABLE_AFTER_MS;
}

/** A status that counts as "got it". Redirects do not: they are not followed. */
export function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}
