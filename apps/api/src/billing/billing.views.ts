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
  /** Whether the plan opens every paid title. Otherwise it opens its packages. */
  includesAll: boolean;
  packages: { id: string; name: string }[];
  /**
   * On how many devices a subscriber plays at the same time. For viewers this
   * is what applies: the plan's own limit, or that of the installation. Null:
   * no limit.
   */
  maxStreams: number | null;
  /** Whether subscribers watch without ads. */
  removesAds: boolean;
}

type PlanWithPackages = Plan & {
  packages: { package: { id: string; name: string; position: number } }[];
};

/** What to read of a plan to show what it opens. */
export const PLAN_INCLUDE = {
  packages: { include: { package: { select: { id: true, name: true, position: true } } } },
} as const;

/** What a site offers, for its page of plans. */
export interface PublicPlans {
  /** Currency of all prices, as three letters such as "EUR". */
  currency: string;
  /** Whether a viewer can pay online. Without it, access is granted by the operator. */
  checkout: boolean;
  /** Where to ask for access when there is no online payment. An https or mailto address. */
  contactUrl: string | null;
  /** How long a rented title can be watched: days to start, hours to finish once started. */
  rental: { startDays: number; watchHours: number };
  plans: PublicPlan[];
}

/**
 * @param siteLimit The limit of the installation, which a plan without one of its own follows. 0: none.
 */
export function toPublicPlan(plan: PlanWithPackages, siteLimit = 0): PublicPlan {
  return {
    maxStreams: plan.maxStreams ?? (siteLimit > 0 ? siteLimit : null),
    removesAds: plan.removesAds,
    id: plan.id,
    name: plan.name,
    description: plan.description,
    features: plan.features,
    monthlyAmount: plan.monthlyAmount,
    yearlyAmount: plan.yearlyAmount,
    trialDays: plan.trialDays,
    isRecommended: plan.isRecommended,
    includesAll: plan.includesAll,
    packages: plan.includesAll
      ? []
      : plan.packages
          .map((link) => link.package)
          .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
          .map(({ id, name }) => ({ id, name })),
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

export function toPlanAdminView(plan: PlanWithPackages, subscribers: number): PlanAdminView {
  return {
    ...toPublicPlan(plan),
    // For admins the plan's own value: empty means it follows the installation.
    maxStreams: plan.maxStreams,
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
  /** When the next payment is due. Null when it is not renewed. */
  renewsAt: Date | null;
  /** Whether it is paid online, so the viewer manages it at the payment provider. */
  online: boolean;
  /** Whether it came from a prepaid code, so another code of the same plan adds days to it. */
  prepaid: boolean;
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
    renewsAt: subscription.renewsAt,
    online: subscription.source === 'STRIPE',
    prepaid: subscription.source === 'PREPAID',
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
  /** Id of the subscription at the payment provider, and where to open it there. */
  externalId: string | null;
  externalUrl: string | null;
  createdAt: Date;
}

type ForAdmin = WithPlan & { grantedBy: { id: string; displayName: string } | null };

/** Address of a subscription in Stripe's dashboard. */
export function stripeDashboardUrl(externalId: string, livemode: boolean): string {
  return `https://dashboard.stripe.com/${livemode ? '' : 'test/'}subscriptions/${encodeURIComponent(externalId)}`;
}

export function toSubscriptionAdminView(
  subscription: ForAdmin,
  now: Date = new Date(),
  livemode = false,
): SubscriptionAdminView {
  return {
    ...toViewerSubscriptionView(subscription),
    id: subscription.id,
    source: subscription.source,
    running: isRunning(subscription, now),
    canceledAt: subscription.canceledAt,
    note: subscription.note,
    grantedBy: subscription.grantedBy,
    externalId: subscription.externalId,
    externalUrl:
      subscription.source === 'STRIPE' && subscription.externalId
        ? stripeDashboardUrl(subscription.externalId, livemode)
        : null,
    createdAt: subscription.createdAt,
  };
}

/** How billing is set up and how it is doing, for the panel. */
export interface BillingOverview {
  /** Devices one account plays on at once where a plan says nothing. 0: no limit. */
  streamLimit: number;
  currency: string;
  checkout: boolean;
  contactUrl: string | null;
  plans: number;
  /** Viewers who can watch through a plan right now. */
  subscribers: number;
  /** Of those, the ones an admin granted access to. */
  grantedByHand: number;
  /** Of those, the ones who pay online. */
  paidOnline: number;
  /** Of those, the ones who used a prepaid code. */
  prepaid: number;
  /** Paying subscribers whose last payment failed and is being tried again. */
  pastDue: number;
  /** How online payment is set up. Null when it is off. */
  stripe: StripeStatus | null;
  /** Running subscriptions that end within the next seven days and are not renewed. */
  endingSoon: number;
  /** Published titles that need a subscription, and all published titles. */
  paidTitles: number;
  publishedTitles: number;
  packages: number;
  /** Plans that open only their packages. */
  limitedPlans: number;
  /** Published paid titles in no package, which only plans that open everything show. */
  unpackagedPaidTitles: number;
}

/** A message from Stripe, as the panel lists it. */
export interface StripeEventView {
  id: string;
  type: string;
  receivedAt: Date;
  /** "handled", "failed" with the reason in error, or "pending" while it is worked on. */
  state: 'handled' | 'failed' | 'pending';
  error: string | null;
}

/** How online payment is set up, for the panel. */
export interface StripeStatus {
  /** False while the key is one for testing, where no money moves. */
  livemode: boolean;
  /** Path of the endpoint Stripe reports to, after the address of the API. */
  webhookPath: string;
  /** The events the endpoint must be subscribed to at Stripe. */
  webhookEvents: readonly string[];
  /** Where viewers return after paying. */
  siteUrl: string;
  automaticTax: boolean;
  /** The last message Stripe sent. Null when none arrived yet. */
  lastEvent: StripeEventView | null;
  /** Messages of the last day that could not be handled. */
  failedEvents: number;
}

/** The Stripe account behind the key, as proof that the key works. */
export interface StripeAccountView {
  id: string;
  name: string | null;
  country: string | null;
  defaultCurrency: string | null;
  chargesEnabled: boolean;
  livemode: boolean;
  /** Set when the account's currency is not the one prices are in here. */
  currencyMismatch: boolean;
}
