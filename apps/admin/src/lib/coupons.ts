// SPDX-License-Identifier: AGPL-3.0-only
import type { Coupon, CouponInput, CouponState } from '@/api/types';
import { formatMoney, parsePrice, toPriceText } from './billing';
import { fromLocalInput, toLocalInput } from './catalog';

export const STATE_LOOKS: Record<
  CouponState,
  { label: string; tone: 'success' | 'info' | 'warning' | 'neutral'; about: string }
> = {
  ACTIVE: { label: 'Active', tone: 'success', about: 'Viewers can use it now.' },
  SCHEDULED: { label: 'Scheduled', tone: 'info', about: 'It starts on its first day.' },
  ENDED: { label: 'Ended', tone: 'neutral', about: 'Its last day has passed.' },
  USED_UP: { label: 'Used up', tone: 'warning', about: 'It was used as often as it may be.' },
  OFF: {
    label: 'Switched off',
    tone: 'neutral',
    about: 'It takes no more uses until switched on.',
  },
};

export const SCOPE_LABELS = {
  EVERYTHING: { label: 'Plans and single titles', short: 'Everything' },
  SUBSCRIPTIONS: { label: 'Plans only', short: 'Plans' },
  TITLES: { label: 'Renting and buying titles only', short: 'Single titles' },
} as const;

/** "20 % off" or "€5.00 off". */
export function describeOff(
  coupon: Pick<Coupon, 'kind' | 'percentOff' | 'amountOff'>,
  currency: string,
): string {
  return coupon.kind === 'PERCENT'
    ? `${coupon.percentOff ?? 0} % off`
    : `${formatMoney(coupon.amountOff ?? 0, currency)} off`;
}

/** For how long a subscription costs less. Nothing for a code for single titles. */
export function describeLasts(
  coupon: Pick<Coupon, 'scope' | 'duration' | 'durationMonths'>,
): string | null {
  if (coupon.scope === 'TITLES') {
    return null;
  }
  if (coupon.duration === 'FOREVER') {
    return 'every payment';
  }
  if (coupon.duration === 'REPEATING') {
    const months = coupon.durationMonths ?? 1;
    return months === 1 ? 'the first month' : `the first ${months} months`;
  }
  return 'the first payment';
}

/** What a coupon is for, in a few words: "Plans: Standard, Premium". */
export function describeScope(coupon: Pick<Coupon, 'scope' | 'plans'>): string {
  if (coupon.scope !== 'TITLES' && coupon.plans.length > 0) {
    const names = coupon.plans.map((plan) => plan.name).join(', ');
    return coupon.scope === 'EVERYTHING' ? `${names}, and single titles` : names;
  }
  return SCOPE_LABELS[coupon.scope].short;
}

/** "12 of 100", or "12" without a limit. */
export function describeUses(coupon: Pick<Coupon, 'used' | 'maxRedemptions'>): string {
  return coupon.maxRedemptions === null
    ? String(coupon.used)
    : `${coupon.used} of ${coupon.maxRedemptions}`;
}

/** How much of its limit is used, 0 to 1. Null without a limit. */
export function usedShare(coupon: Pick<Coupon, 'used' | 'maxRedemptions'>): number | null {
  return coupon.maxRedemptions === null
    ? null
    : Math.min(1, coupon.used / Math.max(1, coupon.maxRedemptions));
}

/** Letters and digits that are not mistaken for each other when read out or typed. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * A code nobody will guess: two groups of four, such as "K7QM-2XHP".
 *
 * @param random Returns a whole number from 0 up to, not including, its argument.
 */
export function generateCode(
  random: (below: number) => number = (below) => {
    const box = new Uint32Array(1);
    crypto.getRandomValues(box);
    return (box[0] as number) % below;
  },
): string {
  const group = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[random(CODE_ALPHABET.length)]).join('');
  return `${group()}-${group()}`;
}

/** A code as the API keeps it. */
export const tidyCode = (raw: string): string => raw.trim().toUpperCase();

export interface CouponForm {
  code: string;
  note: string;
  kind: 'PERCENT' | 'AMOUNT';
  percent: string;
  amount: string;
  scope: Coupon['scope'];
  duration: Coupon['duration'];
  months: string;
  planIds: string[];
  from: string;
  until: string;
  limited: boolean;
  max: string;
  oncePerViewer: boolean;
  newCustomersOnly: boolean;
  isActive: boolean;
}

export function toForm(coupon: Coupon | null, currency: string): CouponForm {
  return {
    code: coupon?.code ?? '',
    note: coupon?.note ?? '',
    kind: coupon?.kind ?? 'PERCENT',
    percent: coupon?.percentOff ? String(coupon.percentOff) : '',
    amount: toPriceText(coupon?.amountOff ?? null, currency),
    scope: coupon?.scope ?? 'EVERYTHING',
    duration: coupon?.duration ?? 'ONCE',
    months: String(coupon?.durationMonths ?? 3),
    planIds: coupon?.plans.map((plan) => plan.id) ?? [],
    from: toLocalInput(coupon?.startsAt ?? null),
    until: toLocalInput(coupon?.endsAt ?? null),
    limited: coupon ? coupon.maxRedemptions !== null : false,
    max: String(coupon?.maxRedemptions ?? 100),
    oncePerViewer: coupon?.oncePerViewer ?? true,
    newCustomersOnly: coupon?.newCustomersOnly ?? false,
    isActive: coupon?.isActive ?? true,
  };
}

const wholeNumber = (text: string): number | null =>
  /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;

/** What is still wrong with a form, as a sentence. Null: it can be saved. */
export function formProblem(form: CouponForm, currency: string): string | null {
  const code = tidyCode(form.code);
  if (code.length < 3) {
    return 'Give the code at least 3 characters.';
  }
  if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(code)) {
    return 'A code is made of letters and digits, with single hyphens between them.';
  }
  if (form.kind === 'PERCENT') {
    const percent = wholeNumber(form.percent);
    if (percent === null || percent < 1 || percent > 100) {
      return 'Say how many percent the code takes off, from 1 to 100.';
    }
  } else {
    const amount = parsePrice(form.amount, currency);
    if (amount === null || amount === 'invalid' || amount < 1) {
      return `Say how much the code takes off, such as ${toPriceText(500, currency)}.`;
    }
  }
  if (form.scope !== 'TITLES' && form.duration === 'REPEATING') {
    const months = wholeNumber(form.months);
    if (months === null || months < 1 || months > 36) {
      return 'Say for how many months the price stays lower, from 1 to 36.';
    }
  }
  if (form.limited) {
    const max = wholeNumber(form.max);
    if (max === null || max < 1) {
      return 'Say how often the code can be used in all.';
    }
  }
  const from = fromLocalInput(form.from);
  const until = fromLocalInput(form.until);
  if (from && until && until <= from) {
    return 'The last day must come after the first.';
  }
  return null;
}

/** The form as the API takes it. Call only when `formProblem` found nothing. */
export function toInput(form: CouponForm, currency: string): CouponInput {
  const amount = parsePrice(form.amount, currency);
  const forPlans = form.scope !== 'TITLES';
  return {
    code: tidyCode(form.code),
    note: form.note.trim() || null,
    kind: form.kind,
    percentOff: form.kind === 'PERCENT' ? wholeNumber(form.percent) : null,
    amountOff: form.kind === 'AMOUNT' && typeof amount === 'number' ? amount : null,
    scope: form.scope,
    duration: forPlans ? form.duration : 'ONCE',
    durationMonths: forPlans && form.duration === 'REPEATING' ? wholeNumber(form.months) : null,
    planIds: forPlans ? form.planIds : [],
    startsAt: fromLocalInput(form.from),
    endsAt: fromLocalInput(form.until),
    maxRedemptions: form.limited ? wholeNumber(form.max) : null,
    oncePerViewer: form.oncePerViewer,
    newCustomersOnly: form.newCustomersOnly,
    isActive: form.isActive,
  };
}

/**
 * What a viewer pays with the code for a price, to show an example while the
 * coupon is being made. Mirrors the rule of the API.
 */
export function exampleOf(
  form: Pick<CouponForm, 'kind' | 'percent' | 'amount'>,
  listAmount: number,
  currency: string,
): number | null {
  if (form.kind === 'PERCENT') {
    const percent = wholeNumber(form.percent);
    return percent === null || percent < 1 || percent > 100
      ? null
      : listAmount - Math.min(listAmount, Math.ceil((listAmount * percent) / 100));
  }
  const amount = parsePrice(form.amount, currency);
  return typeof amount === 'number' && amount > 0
    ? listAmount - Math.min(listAmount, amount)
    : null;
}
