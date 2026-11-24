// SPDX-License-Identifier: AGPL-3.0-only
import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';

/**
 * Who a request is answered for, as far as it decides what they may see.
 *
 * A profile can have an age limit. That limit has to hold everywhere a title
 * or a channel reaches a viewer: lists, rows, search, a title's own page,
 * "continue watching", My list, playback. Handing it to every query by hand
 * would work until the day somebody writes a new query and forgets. So it is
 * kept beside the request, and the one place that decides what is visible
 * reads it from here.
 */
export interface Audience {
  /** The highest age a title may be for. Null: no limit. */
  maxAge: number | null;
}

const storage = new AsyncLocalStorage<Audience>();

/** Runs something on behalf of an audience. Everything it awaits sees the same one. */
export function withAudience<Result>(audience: Audience, run: () => Result): Result {
  return storage.run(audience, run);
}

/** The age limit of whoever is being answered. Null outside a request and for everyone without one. */
export function currentMaxAge(): number | null {
  return storage.getStore()?.maxAge ?? null;
}

/** The stricter of two limits, where null is no limit. */
export function stricter(a: number | null, b: number | null): number | null {
  if (a === null) {
    return b;
  }
  return b === null ? a : Math.min(a, b);
}

/**
 * What a limit means for something that says from which age it suits. With
 * a limit, what nobody rated is left out: a profile for a child shows
 * nothing on trust.
 */
export function suitsAudience(maxAge: number | null = currentMaxAge()): {
  minAge?: { lte: number };
} {
  return maxAge === null ? {} : { minAge: { lte: maxAge } };
}

/** The same rule for one thing in hand. */
export function suits(minAge: number | null, maxAge: number | null = currentMaxAge()): boolean {
  return maxAge === null || (minAge !== null && minAge <= maxAge);
}

/** Sent with the refusal, for apps to act on: offer to switch profiles. */
export const PROFILE_RESTRICTED = 'profile_restricted';

/**
 * Stops what a profile with an age limit must not do: spend money, or change
 * who may see what. Such a profile is a child's, or somebody's who has not
 * entered their PIN yet.
 *
 * @throws ForbiddenException with code "profile_restricted".
 */
export function assertUnrestricted(): void {
  if (currentMaxAge() !== null) {
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: PROFILE_RESTRICTED,
      message: 'This profile cannot do that. Switch to a profile without an age limit.',
    });
  }
}
