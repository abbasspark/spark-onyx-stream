// SPDX-License-Identifier: AGPL-3.0-only
import type {
  BillingInterval,
  Plan,
  Subscription,
  SubscriptionSource,
  SubscriptionStatus,
} from '@onyx/database';
import { isRunning } from './entitlement.js';

/** A plan as viewers see it on the page of plans. */
export interface PublicPlan {
  id: string;
  name: string;
  description: string | null;
  features: string[];
  /** Prices in the smallest unit of the currency. Null when not sold for that interval. */
  monthlyAmount: number | null;
  yearlyAmount: number | null;
  trialDays: number;
  isRecommended: boolean;
}

/** What a site offers, for its page of plans. */
export interface PublicPlans {
  /** Currency of all prices, as three letters such as "EUR". */
  currency: string;
  /** Whether a viewer can pay online. Without it, access is granted by the operator. */
  checkout: boolean;
  /** Where to ask for access when there is no online payment. An https or mailto address. */
  contactUrl: string | null;
  plans: PublicPlan[];
}

export function toPublicPlan(plan: Plan): PublicPlan {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    features: plan.features,
    monthlyAmount: plan.monthlyAmount,
    yearlyAmount: plan.yearlyAmount,
    trialDays: plan.trialDays,
    isRecommended: plan.isRecommended,
  };
}

/** A plan as admins see it. */
export interface PlanAdminView extends PublicPlan {
  isOffered: boolean;
  position: number;
  /** Viewers who can watch through this plan right now. */
  subscribers: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toPlanAdminView(plan: Plan, subscribers: number): PlanAdminView {
  return {
    ...toPublicPlan(plan),
    isOffered: plan.isOffered,
    position: plan.position,
    subscribers,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

/** A viewer's own subscription. */
export interface ViewerSubscriptionView {
  plan: { id: string; name: string };
  status: SubscriptionStatus;
  interval: BillingInterval | null;
  startedAt: Date;
  /** Until when it lets the viewer watch. Null means it has no end. */
  endsAt: Date | null;
  /** Set when it ends at endsAt and is not renewed. */
  cancelAtPeriodEnd: boolean;
}

type WithPlan = Subscription & { plan: Pick<Plan, 'id' | 'name'> };

export function toViewerSubscriptionView(subscription: WithPlan): ViewerSubscriptionView {
  return {
    plan: { id: subscription.plan.id, name: subscription.plan.name },
    status: subscription.status,
    interval: subscription.interval,
    startedAt: subscription.startedAt,
    endsAt: subscription.endsAt,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}

/** A subscription as admins see it. */
export interface SubscriptionAdminView extends ViewerSubscriptionView {
  id: string;
  source: SubscriptionSource;
  /** Whether it lets the viewer watch right now. */
  running: boolean;
  canceledAt: Date | null;
  note: string | null;
  grantedBy: { id: string; displayName: string } | null;
  createdAt: Date;
}

type ForAdmin = WithPlan & { grantedBy: { id: string; displayName: string } | null };

export function toSubscriptionAdminView(
  subscription: ForAdmin,
  now: Date = new Date(),
): SubscriptionAdminView {
  return {
    ...toViewerSubscriptionView(subscription),
    id: subscription.id,
    source: subscription.source,
    running: isRunning(subscription, now),
    canceledAt: subscription.canceledAt,
    note: subscription.note,
    grantedBy: subscription.grantedBy,
    createdAt: subscription.createdAt,
  };
}

/** How billing is set up and how it is doing, for the panel. */
export interface BillingOverview {
  currency: string;
  checkout: boolean;
  contactUrl: string | null;
  plans: number;
  /** Viewers who can watch through a plan right now. */
  subscribers: number;
  /** Of those, the ones an admin granted access to. */
  grantedByHand: number;
  /** Running subscriptions that end within the next seven days and are not renewed. */
  endingSoon: number;
  /** Published titles that need a subscription, and all published titles. */
  paidTitles: number;
  publishedTitles: number;
}
