// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  canRecord,
  dayBounds,
  dayKey,
  dayLabel,
  formatLength,
  fromLocalInput,
  isOnNow,
  parseDayKey,
  shiftDay,
  timesProblem,
  toLocalInput,
} from './guide';

describe('days', () => {
  const day = new Date(2026, 10, 22, 15, 30);

  it('are written and read as keys', () => {
    expect(dayKey(day)).toBe('2026-11-22');
    expect(dayKey(parseDayKey('2026-11-22') as Date)).toBe('2026-11-22');
    expect(parseDayKey('2026-13-01')).toBeNull();
    expect(parseDayKey('2026-02-30')).toBeNull();
    expect(parseDayKey('today')).toBeNull();
    expect(parseDayKey(null)).toBeNull();
  });

  it('span from midnight to midnight in local time', () => {
    const { from, to } = dayBounds(day);
    expect(new Date(from)).toEqual(new Date(2026, 10, 22));
    expect(new Date(to)).toEqual(new Date(2026, 10, 23));
  });

  it('step over the ends of months', () => {
    expect(dayKey(shiftDay(new Date(2026, 10, 30), 1))).toBe('2026-12-01');
    expect(dayKey(shiftDay(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
  });

  it('are named when they are near', () => {
    expect(dayLabel(day, day)).toBe('Today');
    expect(dayLabel(shiftDay(day, 1), day)).toBe('Tomorrow');
    expect(dayLabel(shiftDay(day, -1), day)).toBe('Yesterday');
    expect(dayLabel(shiftDay(day, 5), day)).toContain('27');
  });
});

describe('times in the form', () => {
  it('go to local time and back', () => {
    const iso = new Date(2026, 10, 22, 20, 15).toISOString();
    expect(toLocalInput(iso)).toBe('2026-11-22T20:15');
    expect(fromLocalInput('2026-11-22T20:15')).toBe(iso);
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('nonsense')).toBeNull();
  });

  it('are checked before saving', () => {
    const start = new Date(2026, 10, 22, 20).toISOString();
    const hourLater = new Date(2026, 10, 22, 21).toISOString();
    expect(timesProblem(start, hourLater)).toBeNull();
    expect(timesProblem(hourLater, start)).toBe('The end must be after the start.');
    expect(timesProblem(start, start)).toBe('The end must be after the start.');
    expect(timesProblem(start, new Date(2026, 10, 24, 20).toISOString())).toContain('a day');
    expect(timesProblem(null, hourLater)).toContain('Enter when');
  });
});

describe('programmes', () => {
  const programme = { startsAt: '2026-11-22T19:00:00.000Z', endsAt: '2026-11-22T20:30:00.000Z' };

  it('have a length in words', () => {
    expect(formatLength(programme.startsAt, programme.endsAt)).toBe('1 h 30 min');
    expect(formatLength(programme.startsAt, '2026-11-22T19:45:00.000Z')).toBe('45 min');
    expect(formatLength(programme.startsAt, '2026-11-22T21:00:00.000Z')).toBe('2 h');
  });

  it('can be recorded until they are over', () => {
    expect(canRecord(programme, Date.parse('2026-11-22T12:00:00.000Z'))).toBe(true);
    expect(canRecord(programme, Date.parse('2026-11-22T20:00:00.000Z'))).toBe(true);
    expect(canRecord(programme, Date.parse('2026-11-22T20:30:00.000Z'))).toBe(false);
  });

  it('are on from their start until just before their end', () => {
    expect(isOnNow(programme, Date.parse('2026-11-22T19:00:00.000Z'))).toBe(true);
    expect(isOnNow(programme, Date.parse('2026-11-22T20:29:59.000Z'))).toBe(true);
    expect(isOnNow(programme, Date.parse('2026-11-22T20:30:00.000Z'))).toBe(false);
    expect(isOnNow(programme, Date.parse('2026-11-22T18:59:59.000Z'))).toBe(false);
  });
});
