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
  /** Whether the plan opens every paid title. Left out by an API older than packages. */
  includesAll?: boolean;
  /** The packages the plan opens when it does not open everything. */
  packages?: { id: string; name: string }[];
  /** Devices a subscriber plays on at the same time. Null or left out: no limit. */
  maxStreams?: number | null;
}

/** "Watch on 2 devices at the same time", for the list under the price. Null without a limit. */
export function describeStreams(plan: Pick<Plan, 'maxStreams'>): string | null {
  const limit = plan.maxStreams ?? null;
  if (limit === null) {
    return null;
  }
  return limit === 1 ? 'Watch on 1 device at a time' : `Watch on ${limit} devices at the same time`;
}

/**
 * What a viewer's subscription opens: every paid title, or the titles of
 * some packages. Null for a viewer without a running subscription.
 */
export type Opens = { all: boolean; packageIds: string[] } | null;

/** What a subscription opens when the site only says that there is one. */
export function opensFrom(result: { entitled: boolean; access?: Opens }): Opens {
  if (result.access !== undefined) {
    return result.access;
  }
  // An API older than packages: every plan opens everything.
  return result.entitled ? { all: true, packageIds: [] } : null;
}

type Lockable = { access?: 'FREE' | 'PAID'; packageIds?: string[] };

/** Whether a title is open to a viewer as far as their subscription goes. */
export function opensTitle(opens: Opens, title: Lockable): boolean {
  if (title.access !== 'PAID') {
    return true;
  }
  if (!opens) {
    return false;
  }
  return opens.all || (title.packageIds ?? []).some((id) => opens.packageIds.includes(id));
}

/** Whether a plan opens a title. */
export function planOpensTitle(
  plan: Pick<Plan, 'includesAll' | 'packages'>,
  title: Lockable,
): boolean {
  if (title.access !== 'PAID' || plan.includesAll !== false) {
    return true;
  }
  const ids = (plan.packages ?? []).map((item) => item.id);
  return (title.packageIds ?? []).some((id) => ids.includes(id));
}

/** "Kids, Sports and Films" */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** What a plan opens, in words for the page of plans. */
export function describeOpens(plan: Pick<Plan, 'includesAll' | 'packages'>): string {
  if (plan.includesAll !== false || !plan.packages || plan.packages.length === 0) {
    return 'every title with a lock';
  }
  return listNames(plan.packages.map((item) => item.name));
}

export interface Plans {
  /** Currency of all prices, such as "EUR". */
  currency: string;
  /** Whether a viewer can pay on the site. */
  checkout: boolean;
  /** Where to ask for a subscription when there is no payment on the site. */
  contactUrl: string | null;
  /** How long a rented title can be watched. Left out by an API older than renting. */
  rental?: { startDays: number; watchHours: number };
  plans: Plan[];
}

/** A title the viewer rented or bought and can watch now. */
export interface OwnedTitle {
  titleId: string;
  kind: 'RENT' | 'BUY';
  /** Until when it may be watched. Null for a bought title. */
  expiresAt: string | null;
  /** Whether a rental was started, so the hours to finish it are running. */
  started: boolean;
}

/** The viewer's right to a title, if they rented or bought it. */
export function ownedTitle(
  purchases: readonly OwnedTitle[],
  titleId: string,
  now: Date = new Date(),
): OwnedTitle | null {
  const owned = purchases.find((purchase) => purchase.titleId === titleId);
  if (!owned || (owned.expiresAt !== null && new Date(owned.expiresAt) <= now)) {
    return null;
  }
  return owned;
}

/**
 * "30 days", "48 hours", "20 minutes": what is left until a moment. Rounded
 * up to the unit named, so thirty days read as thirty a second after paying.
 */
export function timeLeft(until: string, now: Date = new Date()): string {
  const minutes = Math.max(1, Math.ceil((new Date(until).getTime() - now.getTime()) / 60_000));
  const count = (value: number, unit: string) => `${value} ${unit}${value === 1 ? '' : 's'}`;
  if (minutes > 48 * 60) {
    return count(Math.ceil(minutes / (24 * 60)), 'day');
  }
  if (minutes > 60) {
    return count(Math.ceil(minutes / 60), 'hour');
  }
  return count(minutes, 'minute');
}

/** What is said under the Play button of a rented or bought title. */
export function describeOwned(owned: OwnedTitle, now: Date = new Date()): string {
  if (owned.kind === 'BUY' || owned.expiresAt === null) {
    return 'You bought this title.';
  }
  const left = timeLeft(owned.expiresAt, now);
  return owned.started
    ? `Rented. ${left} left to watch.`
    : `Rented. Start within ${left}. Once you press play, the time to finish it runs.`;
}

/** "30 days to start, then 48 hours to finish." */
export function describeRentalTerms(rental: { startDays: number; watchHours: number }): string {
  const days = `${rental.startDays} ${rental.startDays === 1 ? 'day' : 'days'}`;
  const hours = `${rental.watchHours} ${rental.watchHours === 1 ? 'hour' : 'hours'}`;
  return `${days} to start, then ${hours} to finish.`;
}

type Sellable = Lockable & {
  rentAmount?: number | null;
  buyAmount?: number | null;
  purchaseOnly?: boolean;
};

/**
 * Whether a title is open to a viewer: free, opened by their plan, or rented
 * or bought. A title for buyers only is not opened by any plan.
 */
export function canWatch(
  title: Sellable & { id: string },
  opens: Opens,
  purchases: readonly OwnedTitle[],
  now: Date = new Date(),
): boolean {
  if (title.access !== 'PAID') {
    return true;
  }
  if (!title.purchaseOnly && opensTitle(opens, title)) {
    return true;
  }
  return ownedTitle(purchases, title.id, now) !== null;
}

/** Whether a plan on offer opens the title, so "Subscribe" is one of the ways to watch it. */
export function subscribable(title: Sellable, plans: readonly Plan[]): boolean {
  return !title.purchaseOnly && plans.some((plan) => planOpensTitle(plan, title));
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
  /** When the next payment is due. Null when it is not renewed. */
  renewsAt?: string | null;
  /** Whether it is paid online, so the viewer manages it at the payment provider. */
  online?: boolean;
  /** Whether it came from a prepaid code, so another code adds days to it. */
  prepaid?: boolean;
}

/** A payment of the viewer's own. Amounts are in the smallest unit of the currency. */
export interface OwnPayment {
  id: string;
  planName: string | null;
  status: 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  /** What was paid for. Left out by an API older than renting. */
  kind?: 'SUBSCRIPTION' | 'RENTAL' | 'PURCHASE';
  /** The title that was rented or bought. */
  titleName?: string | null;
  amount: number;
  refundedAmount: number;
  currency: string;
  paidAt: string;
  invoiceNumber: string | null;
  /** Where the invoice can be read and downloaded. */
  invoiceUrl: string | null;
}

/** What is said next to a payment that was returned, or null for one that was not. */
export function describeRefund(
  payment: Pick<OwnPayment, 'status' | 'refundedAmount' | 'currency'>,
): string | null {
  if (payment.status === 'REFUNDED') {
    return 'Returned';
  }
  if (payment.status === 'PARTIALLY_REFUNDED') {
    return `${formatMoney(payment.refundedAmount, payment.currency)} returned`;
  }
  return null;
}

export type Interval = 'month' | 'year';

/** What a site without plans answers, also when its API is older than plans. */
export const NO_PLANS: Plans = { currency: 'EUR', checkout: false, contactUrl: null, plans: [] };

/** How long a rental lasts on a site that does not say. */
export const DEFAULT_RENTAL = { startDays: 30, watchHours: 48 };

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

/** "24 December 2026". Written the same way for everyone, like the prices. */
export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * How long a subscription lasts, in words that follow "You can watch ...,":
 * "until 24 December 2026", "with no end date", or when it is paid next.
 */
export function describeEnd(
  subscription: Pick<OwnSubscription, 'endsAt' | 'renewsAt' | 'status'>,
): string {
  if (subscription.renewsAt) {
    const day = formatDate(subscription.renewsAt);
    return subscription.status === 'TRIALING'
      ? `free until ${day}, then paid`
      : `renewed on ${day}`;
  }
  if (!subscription.endsAt) {
    return 'with no end date';
  }
  return `until ${formatDate(subscription.endsAt)}`;
}

/** The words on the button that starts a payment. */
export function subscribeLabel(plan: Pick<Plan, 'trialDays'>, trialOffered: boolean): string {
  return trialOffered && plan.trialDays > 0
    ? `Start ${plan.trialDays} ${plan.trialDays === 1 ? 'day' : 'days'} free`
    : 'Subscribe';
}

/**
 * Where a viewer wanted to go when they were sent to the plans, kept while
 * they are away paying. Session storage: it is gone with the tab.
 */
const AFTER_CHECKOUT = 'onyx.web.afterCheckout';

export function rememberAfterCheckout(path: string): void {
  try {
    window.sessionStorage.setItem(AFTER_CHECKOUT, path);
  } catch {
    // Without it the viewer lands on the start page.
  }
}

export function takeAfterCheckout(): string | null {
  try {
    const path = window.sessionStorage.getItem(AFTER_CHECKOUT);
    window.sessionStorage.removeItem(AFTER_CHECKOUT);
    return path;
  } catch {
    return null;
  }
}
