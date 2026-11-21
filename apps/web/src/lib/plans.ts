// SPDX-License-Identifier: AGPL-3.0-only
//
// The plans a site offers, and the words and numbers shown about them.
// Free of anything that only works on the server, so pages and the parts of
// them that run in the browser can both use it.

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  /** Short lines shown under the price. */
  features: string[];
  /** Prices in the smallest unit of the currency. Null when not sold for that interval. */
  monthlyAmount: number | null;
  yearlyAmount: number | null;
  trialDays: number;
  isRecommended: boolean;
}

export interface Plans {
  /** Currency of all prices, such as "EUR". */
  currency: string;
  /** Whether a viewer can pay on the site. */
  checkout: boolean;
  /** Where to ask for a subscription when there is no payment on the site. */
  contactUrl: string | null;
  plans: Plan[];
}

/** A viewer's own subscription. */
export interface OwnSubscription {
  plan: { id: string; name: string };
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
  interval: 'MONTH' | 'YEAR' | null;
  startedAt: string;
  /** Until when it lets the viewer watch. Null means it has no end. */
  endsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export type Interval = 'month' | 'year';

/** What a site without plans answers, also when its API is older than plans. */
export const NO_PLANS: Plans = { currency: 'EUR', checkout: false, contactUrl: null, plans: [] };

/** How many digits a currency has after the point: 2 for EUR, 0 for JPY. */
function fractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/**
 * "€7.99" for 799 in EUR. Always written the same way, whatever the language
 * of the browser, so the page the server sends and the page in the browser agree.
 */
export function formatMoney(amount: number, currency: string): string {
  const digits = fractionDigits(currency);
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      // A round price reads better without ".00".
      minimumFractionDigits: amount % 10 ** digits === 0 ? 0 : digits,
    }).format(amount / 10 ** digits);
  } catch {
    return `${(amount / 10 ** digits).toFixed(digits)} ${currency}`;
  }
}

/** The price of a plan for an interval, or null when it is not sold that way. */
export function priceOf(plan: Plan, interval: Interval): number | null {
  return interval === 'month' ? plan.monthlyAmount : plan.yearlyAmount;
}

/**
 * How much less a year costs when paid at once than twelve months, in whole
 * percent. Null when a plan has only one price, or the year is not cheaper.
 */
export function yearlySaving(plan: Pick<Plan, 'monthlyAmount' | 'yearlyAmount'>): number | null {
  if (plan.monthlyAmount === null || plan.yearlyAmount === null) {
    return null;
  }
  const saving = Math.round((1 - plan.yearlyAmount / (plan.monthlyAmount * 12)) * 100);
  return saving > 0 ? saving : null;
}

/** Which intervals the plans of a site are sold in. The toggle shows only with both. */
export function intervalsOf(plans: readonly Plan[]): Interval[] {
  const intervals: Interval[] = [];
  if (plans.some((plan) => plan.monthlyAmount !== null)) {
    intervals.push('month');
  }
  if (plans.some((plan) => plan.yearlyAmount !== null)) {
    intervals.push('year');
  }
  return intervals;
}

/** The largest saving a year brings among the plans, to say it on the toggle. */
export function bestYearlySaving(plans: readonly Plan[]): number | null {
  const savings = plans.map(yearlySaving).filter((saving) => saving !== null);
  return savings.length > 0 ? Math.max(...savings) : null;
}

/** "until 24 December 2026", or how a subscription without an end is described. */
export function describeEnd(subscription: Pick<OwnSubscription, 'endsAt'>): string {
  if (!subscription.endsAt) {
    return 'with no end date';
  }
  const date = new Date(subscription.endsAt);
  return `until ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
