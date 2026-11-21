// SPDX-License-Identifier: AGPL-3.0-only
import type { Purchase } from '@onyx/database';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type Timed = Pick<Purchase, 'status' | 'expiresAt'>;

/** Whether a rented or bought title may be watched at the given moment. */
export function isValid(purchase: Timed, now: Date = new Date()): boolean {
  return (
    purchase.status === 'ACTIVE' &&
    (purchase.expiresAt === null || purchase.expiresAt.getTime() > now.getTime())
  );
}

/** The same rule, for the database to apply. */
export function validAt(now: Date = new Date()) {
  return {
    status: 'ACTIVE' as const,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

/** Until when a rental has to be started, counted from when it was paid. */
export function rentalDeadline(paidAt: Date, startDays: number): Date {
  return new Date(paidAt.getTime() + startDays * DAY_MS);
}

/**
 * Until when a rental can be watched once it was started: the hours to
 * finish it, and never past the day it had to be started by.
 */
export function rentalEnd(startedAt: Date, deadline: Date | null, watchHours: number): Date {
  const end = startedAt.getTime() + watchHours * HOUR_MS;
  return new Date(deadline ? Math.min(end, deadline.getTime()) : end);
}

/** A rented or bought title, as the session of a viewer carries it. */
export interface OwnedTitle {
  titleId: string;
  kind: Purchase['kind'];
  /** Until when it may be watched. Null for a bought title. */
  expiresAt: Date | null;
  /** Whether a rental was started, so the hours to finish it are running. */
  started: boolean;
}

/** One entry per title from a viewer's valid purchases: the strongest right to each. */
export function toOwnedTitles(
  purchases: readonly Pick<Purchase, 'titleId' | 'kind' | 'expiresAt' | 'startedAt'>[],
): OwnedTitle[] {
  const byTitle = new Map<string, (typeof purchases)[number][]>();
  for (const purchase of purchases) {
    byTitle.set(purchase.titleId, [...(byTitle.get(purchase.titleId) ?? []), purchase]);
  }
  return [...byTitle.values()].map((group) => {
    const best = strongest(group) as (typeof purchases)[number];
    return {
      titleId: best.titleId,
      kind: best.kind,
      expiresAt: best.expiresAt,
      started: best.startedAt !== null,
    };
  });
}

/** Of several rights to the same title, the one that lasts longest. Bought beats rented. */
export function strongest<Item extends Pick<Purchase, 'kind' | 'expiresAt'>>(
  purchases: readonly Item[],
): Item | null {
  let best: Item | null = null;
  for (const purchase of purchases) {
    if (
      best === null ||
      (purchase.kind === 'BUY' && best.kind !== 'BUY') ||
      (purchase.kind === best.kind &&
        (purchase.expiresAt?.getTime() ?? Infinity) > (best.expiresAt?.getTime() ?? Infinity))
    ) {
      best = purchase;
    }
  }
  return best;
}
