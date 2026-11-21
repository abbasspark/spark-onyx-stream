// SPDX-License-Identifier: AGPL-3.0-only
import type { Prisma, Subscription, SubscriptionStatus } from '@onyx/database';

/**
 * States in which a subscription lets its viewer watch. A failed payment does
 * not lock a viewer out at once: access continues while the payment is
 * retried, and ends when the provider gives up.
 */
export const RUNNING_STATUSES: readonly SubscriptionStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE'];

/** Whether a subscription lets its viewer watch at the given moment. */
export function isRunning(
  subscription: Pick<Subscription, 'status' | 'endsAt'>,
  now: Date = new Date(),
): boolean {
  return (
    RUNNING_STATUSES.includes(subscription.status) &&
    (subscription.endsAt === null || subscription.endsAt.getTime() > now.getTime())
  );
}

/** The same rule as isRunning, for the database to apply. */
export function runningAt(now: Date = new Date()): Prisma.SubscriptionWhereInput {
  return {
    status: { in: [...RUNNING_STATUSES] },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}
