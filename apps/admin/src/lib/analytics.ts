// SPDX-License-Identifier: AGPL-3.0-only
import type { PlayDevice } from '@/api/types';

export const RANGE_PRESETS = [
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '28', label: 'Last 28 days', days: 28 },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: '365', label: 'Last 12 months', days: 365 },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]['value'];

const two = (value: number) => String(value).padStart(2, '0');

/** A date as the day it is where the admin sits: "2026-12-24". */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** The last so many days, today included. */
export function rangeOfPreset(preset: RangePreset, today: Date): { from: string; to: string } {
  const days = RANGE_PRESETS.find((entry) => entry.value === preset)?.days ?? 28;
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  return { from: localDay(from), to: localDay(today) };
}

export interface Change {
  /** Up or down against the days before, or the same. */
  direction: 'up' | 'down' | 'same';
  /** "+12 %", "−3 %", or "new" when there was nothing before. */
  label: string;
}

/** How a figure changed against the same stretch before. Null when both are nothing. */
export function changeOf(current: number, previous: number): Change | null {
  if (current === 0 && previous === 0) {
    return null;
  }
  if (previous === 0) {
    return { direction: 'up', label: 'new' };
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) {
    return { direction: 'same', label: '0 %' };
  }
  return {
    direction: percent > 0 ? 'up' : 'down',
    label: `${percent > 0 ? '+' : '−'}${Math.abs(percent).toLocaleString('en')} %`,
  };
}

/** Time watched, in the largest units that say something: "2 h 5 min", "14 min", "40 s". */
export function formatWatchTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) {
    return `${total} s`;
  }
  const minutes = Math.round(total / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours >= 100) {
    return `${Math.round(minutes / 60).toLocaleString('en')} h`;
  }
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export const formatCount = (value: number): string => Math.round(value).toLocaleString('en');
export const formatShare = (share: number): string => `${Math.round(share * 100)} %`;

/** A round number at or above a peak, for the top of a scale: 1, 2, 5 times a power of ten. */
export function niceTop(peak: number): number {
  if (!(peak > 0)) {
    return 1;
  }
  const power = 10 ** Math.floor(Math.log10(peak));
  const step = [1, 2, 5, 10].find((value) => value * power >= peak) ?? 10;
  return step * power;
}

/** "Dec 24" for "2026-12-24", read as a day and not as a moment in UTC. */
export function formatChartDay(day: string, long = false): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year as number, (month as number) - 1, date as number).toLocaleDateString(
    'en',
    long
      ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric' },
  );
}

/**
 * Brings many days into fewer bars: days stay days up to about three months,
 * beyond that they are added up by week. A year of single days would be 365
 * bars nobody can point at.
 */
export function bucketDays<Day extends { day: string }, Bucket>(
  days: readonly Day[],
  add: (days: readonly Day[]) => Bucket,
): { label: string; from: string; to: string; value: Bucket }[] {
  const size = days.length > 100 ? 7 : 1;
  const buckets: { label: string; from: string; to: string; value: Bucket }[] = [];
  for (let start = 0; start < days.length; start += size) {
    const slice = days.slice(start, start + size);
    const first = slice[0] as Day;
    const last = slice[slice.length - 1] as Day;
    buckets.push({
      label: formatChartDay(first.day),
      from: first.day,
      to: last.day,
      value: add(slice),
    });
  }
  return buckets;
}

export const DEVICE_LABELS: Record<PlayDevice, string> = {
  DESKTOP: 'Computers',
  MOBILE: 'Phones',
  TABLET: 'Tablets',
  TV: 'TVs',
  OTHER: 'Other',
};

/** "9 pm" for 21. */
export function formatHour(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${hour < 12 ? 'am' : 'pm'}`;
}

/** The hours of the day with the most views, as a sentence. Null without views. */
export function busiestHours(hours: readonly number[]): string | null {
  const peak = Math.max(...hours);
  if (!(peak > 0)) {
    return null;
  }
  // The three hours in a row with the most views between them.
  let best = 0;
  let bestSum = -1;
  for (let start = 0; start < 24; start += 1) {
    const sum = [0, 1, 2].reduce((total, step) => total + (hours[(start + step) % 24] ?? 0), 0);
    if (sum > bestSum) {
      bestSum = sum;
      best = start;
    }
  }
  return `Most is watched between ${formatHour(best)} and ${formatHour((best + 3) % 24)}`;
}
