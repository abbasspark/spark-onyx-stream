// SPDX-License-Identifier: AGPL-3.0-only
import type { Programme } from '@/api/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A day as "2026-11-22", in the time zone of the browser. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Reads a day key. Null when the text is not a day. */
export function parseDayKey(value: string | null): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return dayKey(date) === value ? date : null;
}

/** The start of a day and of the day after it, as the API takes them. */
export function dayBounds(day: Date): { from: string; to: string } {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function shiftDay(day: Date, days: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

/** "Today", "Tomorrow", "Yesterday", or the day written out. */
export function dayLabel(day: Date, now: Date = new Date()): string {
  const difference = Math.round(
    (new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      DAY_MS,
  );
  if (difference === 0) {
    return 'Today';
  }
  if (difference === 1) {
    return 'Tomorrow';
  }
  if (difference === -1) {
    return 'Yesterday';
  }
  return day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** A moment as an input of type "datetime-local" takes it: local time, to the minute. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${dayKey(date)}T${hours}:${minutes}`;
}

/** Reads the value of such an input. Null when it is empty or not a time. */
export function fromLocalInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** "45 min", "1 h", "1 h 30 min" */
export function formatLength(startsAt: string, endsAt: string): string {
  const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

export function isOnNow(programme: Pick<Programme, 'startsAt' | 'endsAt'>, now: number): boolean {
  return (
    new Date(programme.startsAt).getTime() <= now && new Date(programme.endsAt).getTime() > now
  );
}

/** Why a programme cannot be saved with these times. Null when it can. */
export function timesProblem(startsAt: string | null, endsAt: string | null): string | null {
  if (!startsAt || !endsAt) {
    return 'Enter when the programme starts and ends.';
  }
  const length = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (length <= 0) {
    return 'The end must be after the start.';
  }
  return length > DAY_MS ? 'A programme lasts a day at most.' : null;
}

/** A programme that has not ended can be recorded: what is to come, and what the channel may still keep. */
export function canRecord(programme: Pick<Programme, 'endsAt'>, now: number): boolean {
  return new Date(programme.endsAt).getTime() > now;
}
