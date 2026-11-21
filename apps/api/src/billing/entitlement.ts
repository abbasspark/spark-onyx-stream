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

/**
 * What a viewer's subscription opens: every paid title, or the titles of
 * some packages. Null for a viewer without a running subscription.
 */
export type ViewerAccess = { all: boolean; packageIds: string[] } | null;

/** What to read of a subscription to know what it opens. */
export const ACCESS_SELECT = {
  plan: { select: { includesAll: true, packages: { select: { packageId: true } } } },
} as const;

type WithAccess = { plan: { includesAll: boolean; packages: { packageId: string }[] } };

/** Puts together what running subscriptions open. */
export function accessOf(running: readonly WithAccess[]): ViewerAccess {
  if (running.length === 0) {
    return null;
  }
  const all = running.some((subscription) => subscription.plan.includesAll);
  return {
    all,
    packageIds: all
      ? []
      : [
          ...new Set(
            running.flatMap((subscription) =>
              subscription.plan.packages.map((link) => link.packageId),
            ),
          ),
        ].sort(),
  };
}

/**
 * Whether a paid title is open to a viewer. A title in no package is opened
 * only by a plan that opens everything, so a title that was not sorted yet
 * is never given away by mistake.
 */
export function opensTitle(access: ViewerAccess, titlePackageIds: readonly string[]): boolean {
  if (!access) {
    return false;
  }
  return access.all || titlePackageIds.some((id) => access.packageIds.includes(id));
}

/** The same rule as isRunning, for the database to apply. */
export function runningAt(now: Date = new Date()): Prisma.SubscriptionWhereInput {
  return {
    status: { in: [...RUNNING_STATUSES] },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}
