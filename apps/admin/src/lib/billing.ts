// SPDX-License-Identifier: AGPL-3.0-only
import type { Plan, Subscription } from '@/api/types';

/** How many digits a currency has after the point: 2 for EUR, 0 for JPY, 3 for KWD. */
export function fractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** "€7.99" for 799 in EUR. Amounts are stored in the smallest unit of the currency. */
export function formatMoney(amount: number, currency: string): string {
  const digits = fractionDigits(currency);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      amount / 10 ** digits,
    );
  } catch {
    return `${(amount / 10 ** digits).toFixed(digits)} ${currency}`;
  }
}

/** "7.99" for 799 in EUR: an amount as it is typed into a price field. */
export function toPriceText(amount: number | null, currency: string): string {
  if (amount === null) {
    return '';
  }
  const digits = fractionDigits(currency);
  return (amount / 10 ** digits).toFixed(digits);
}

/**
 * Reads a typed price: "7.99" or "7,99" becomes 799 in EUR.
 *
 * @returns the amount in the smallest unit, null for an empty field, and
 *   "invalid" for anything that is not a price above zero.
 */
export function parsePrice(text: string, currency: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const digits = fractionDigits(currency);
  const pattern = digits === 0 ? /^\d{1,9}$/ : new RegExp(`^\\d{1,9}([.,]\\d{1,${digits}})?$`);
  if (!pattern.test(trimmed)) {
    return 'invalid';
  }
  const amount = Math.round(Number(trimmed.replace(',', '.')) * 10 ** digits);
  return amount >= 1 ? amount : 'invalid';
}

/**
 * How much cheaper a year is when paid at once than twelve months, in whole
 * percent. Null when a plan has only one of the prices, or the year is not cheaper.
 */
export function yearlySaving(plan: Pick<Plan, 'monthlyAmount' | 'yearlyAmount'>): number | null {
  if (plan.monthlyAmount === null || plan.yearlyAmount === null) {
    return null;
  }
  const saving = Math.round((1 - plan.yearlyAmount / (plan.monthlyAmount * 12)) * 100);
  return saving > 0 ? saving : null;
}

/** "€7.99 a month · €79.90 a year" */
export function describePrices(
  plan: Pick<Plan, 'monthlyAmount' | 'yearlyAmount'>,
  currency: string,
): string {
  return [
    plan.monthlyAmount === null ? null : `${formatMoney(plan.monthlyAmount, currency)} a month`,
    plan.yearlyAmount === null ? null : `${formatMoney(plan.yearlyAmount, currency)} a year`,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lengths of access an admin can grant with one click. */
export const GRANT_PRESETS: readonly { value: string; label: string; days: number | null }[] = [
  { value: '30', label: '30 days', days: 30 },
  { value: '90', label: '90 days', days: 90 },
  { value: '180', label: '6 months', days: 180 },
  { value: '365', label: '1 year', days: 365 },
  { value: 'open', label: 'No end', days: null },
  { value: 'custom', label: 'Until a date', days: 0 },
];

/** The moment access ends for a preset, counted from now. Null for "no end". */
export function presetEnd(days: number | null, now: Date = new Date()): string | null {
  return days === null ? null : new Date(now.getTime() + days * DAY_MS).toISOString();
}

/** The end of a day chosen in a date field, in the admin's own time zone. */
export function endOfDay(date: string): string | null {
  const parsed = new Date(`${date}T23:59:59`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** The address Stripe reports to: the address of the API as the browser knows it, and the path. */
export function webhookUrl(apiOrigin: string, pageOrigin: string, path: string): string {
  return `${apiOrigin || pageOrigin}${path}`;
}

/** "Customer subscription updated" for "customer.subscription.updated". */
export function describeEventType(type: string): string {
  const words = type.replace(/[._]/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : type;
}

/** How a subscription stands, in words and a tone for its badge. */
export function describeSubscription(
  subscription: Pick<Subscription, 'status' | 'running'> &
    Partial<Pick<Subscription, 'online' | 'cancelAtPeriodEnd'>>,
): {
  label: string;
  tone: 'success' | 'warning' | 'neutral' | 'danger';
} {
  if (!subscription.running) {
    return subscription.status === 'CANCELED'
      ? { label: 'Ended', tone: 'neutral' }
      : { label: 'Expired', tone: 'neutral' };
  }
  switch (subscription.status) {
    case 'TRIALING':
      return { label: 'Trial', tone: 'warning' };
    case 'PAST_DUE':
      return { label: 'Payment failed', tone: 'danger' };
    default:
      if (subscription.online && subscription.cancelAtPeriodEnd) {
        return { label: 'Cancelled, still running', tone: 'warning' };
      }
      return { label: 'Running', tone: 'success' };
  }
}

/** "Nov" for "2026-11", and "Nov 2026" when the year is wanted. */
export function monthLabel(month: string, withYear = false): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, index - 1, 1)));
}

/**
 * How a figure moved against the one before, in whole percent.
 * Null when there is nothing to compare with.
 */
export function percentChange(now: number, before: number): number | null {
  if (before <= 0) {
    return null;
  }
  return Math.round(((now - before) / before) * 100);
}

/** The time zone of this browser, in which the months of a report are cut. */
export function browserTimeZone(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export type PaymentPeriod = 'all' | 'this-month' | 'last-month' | 'this-year';

/** The moments a named period starts and ends, in the admin's own time zone. */
export function periodRange(
  period: PaymentPeriod,
  now: Date = new Date(),
): { from?: string; to?: string } {
  const start = (monthsBack: number) =>
    new Date(now.getFullYear(), now.getMonth() - monthsBack, 1).toISOString();
  switch (period) {
    case 'this-month':
      return { from: start(0) };
    case 'last-month':
      return { from: start(1), to: start(0) };
    case 'this-year':
      return { from: new Date(now.getFullYear(), 0, 1).toISOString() };
    default:
      return {};
  }
}

/** How a payment stands, in words and a tone for its badge. */
export function describePayment(payment: { status: 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' }): {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
} {
  switch (payment.status) {
    case 'REFUNDED':
      return { label: 'Refunded', tone: 'neutral' };
    case 'PARTIALLY_REFUNDED':
      return { label: 'Partly refunded', tone: 'warning' };
    default:
      return { label: 'Paid', tone: 'success' };
  }
}

/** The start of a day chosen in a date field, in the admin's own time zone. */
export function startOfDay(date: string): string | null {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Where the subscribers come from, in a few words under their number. */
export function describeSubscribers(overview: {
  subscribers: number;
  grantedByHand: number;
  paidOnline: number;
  prepaid?: number;
}): string {
  const parts = [
    overview.paidOnline > 0 ? `${overview.paidOnline} paying online` : null,
    (overview.prepaid ?? 0) > 0 ? `${overview.prepaid} through a prepaid code` : null,
    overview.grantedByHand > 0 ? `${overview.grantedByHand} granted by hand` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) {
    return 'Nobody yet';
  }
  if (parts.length === 1) {
    if (overview.grantedByHand === overview.subscribers) {
      return 'All granted by hand';
    }
    if (overview.prepaid === overview.subscribers) {
      return 'All through a prepaid code';
    }
  }
  return parts.join(', ');
}
