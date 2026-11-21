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

/** How a subscription stands, in words and a tone for its badge. */
export function describeSubscription(subscription: Pick<Subscription, 'status' | 'running'>): {
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
      return { label: 'Running', tone: 'success' };
  }
}
