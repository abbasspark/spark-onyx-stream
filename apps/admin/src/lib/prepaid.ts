// SPDX-License-Identifier: AGPL-3.0-only
import type { PrepaidBatch, PrepaidBatchInput, PrepaidCodeState } from '@/api/types';

type Tone = 'success' | 'info' | 'warning' | 'neutral' | 'danger';

export const BATCH_LOOKS: Record<
  PrepaidBatch['state'],
  { label: string; tone: Tone; about: string }
> = {
  open: { label: 'Open', tone: 'success', about: 'Its unused codes can be used.' },
  expired: {
    label: 'Expired',
    tone: 'warning',
    about: 'The last day for using its codes has passed. Give it more time to open it again.',
  },
  withdrawn: {
    label: 'Withdrawn',
    tone: 'neutral',
    about: 'Its unused codes were taken back and no longer work.',
  },
};

export const CODE_LOOKS: Record<PrepaidCodeState, { label: string; tone: Tone }> = {
  unused: { label: 'Unused', tone: 'info' },
  redeemed: { label: 'Used', tone: 'success' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'warning' },
};

/** Lengths a code is usually sold for. */
export const DAY_PRESETS: { days: number; label: string }[] = [
  { days: 7, label: '1 week' },
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
];

export const MAX_DAYS = 3650;
export const MAX_BATCH = 5000;
/** Characters of a code without its dashes. */
export const CODE_LENGTH = 16;

/** How long a code lets somebody watch, in words: "30 days", "1 year". */
export function describeDays(days: number): string {
  if (days === 365) {
    return '1 year';
  }
  if (days % 365 === 0) {
    return `${days / 365} years`;
  }
  return days === 1 ? '1 day' : `${days} days`;
}

/** What one code of a batch gives: "30 days of Standard". */
export function describeGives(batch: Pick<PrepaidBatch, 'days' | 'plan'>): string {
  return `${describeDays(batch.days)} of ${batch.plan.name}`;
}

/** Which share of a batch was used, from 0 to 1. */
export function usedShare(batch: Pick<PrepaidBatch, 'total' | 'redeemed'>): number {
  return batch.total > 0 ? Math.min(1, batch.redeemed / batch.total) : 0;
}

/** A count with its noun: "1 code", "2,500 codes". */
export function countCodes(count: number): string {
  return `${count.toLocaleString('en')} ${count === 1 ? 'code' : 'codes'}`;
}

/** What a viewer typed, as codes are written: capitals in groups of four. */
export function formatCodeInput(raw: string): string {
  const plain = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
  return plain.match(/.{1,4}/g)?.join('-') ?? '';
}

export function isCompleteCode(text: string): boolean {
  return text.replace(/-/g, '').length === CODE_LENGTH;
}

export interface BatchForm {
  name: string;
  planId: string;
  /** Text of the field, so that it can be empty while typing. */
  days: string;
  count: string;
  /** A calendar day such as "2027-01-31", or empty for no end. */
  until: string;
  note: string;
}

export function emptyForm(planId = ''): BatchForm {
  return { name: '', planId, days: '30', count: '100', until: '', note: '' };
}

function wholeNumber(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

/** The end of a calendar day in the admin's own time zone, as the API takes it. */
export function endOfDay(day: string): string | null {
  const date = new Date(`${day}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A moment of the API as the calendar day it falls on here: "2027-01-31". */
export function toDayField(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** What keeps a form from being saved, in words for the admin. Null: nothing. */
export function formProblem(form: BatchForm, now: Date = new Date()): string | null {
  if (!form.name.trim()) {
    return 'Give the batch a name, such as where the codes are sold.';
  }
  if (!form.planId) {
    return 'Choose the plan the codes are for.';
  }
  const days = wholeNumber(form.days);
  if (days === null || days < 1 || days > MAX_DAYS) {
    return `A code gives between 1 and ${MAX_DAYS.toLocaleString('en')} days.`;
  }
  const count = wholeNumber(form.count);
  if (count === null || count < 1 || count > MAX_BATCH) {
    return `A batch holds between 1 and ${MAX_BATCH.toLocaleString('en')} codes. Make a second batch for more.`;
  }
  if (form.until) {
    const until = endOfDay(form.until);
    if (!until) {
      return 'The last day is not a date.';
    }
    if (Date.parse(until) <= now.getTime()) {
      return 'The last day for using the codes is in the past.';
    }
  }
  return null;
}

/** A checked form as the API takes it. */
export function toInput(form: BatchForm): PrepaidBatchInput {
  return {
    name: form.name.trim(),
    planId: form.planId,
    days: Number(form.days.trim()),
    count: Number(form.count.trim()),
    expiresAt: form.until ? endOfDay(form.until) : null,
    note: form.note.trim() || null,
  };
}

/** One sentence that says what the form would make. Null while it is incomplete. */
export function describeForm(form: BatchForm, planName: string | null): string | null {
  const days = wholeNumber(form.days);
  const count = wholeNumber(form.count);
  if (!planName || days === null || count === null || days < 1 || count < 1) {
    return null;
  }
  return `${countCodes(count)}, each for ${describeDays(days)} of ${planName}: ${(days * count).toLocaleString('en')} days of watching in all.`;
}
