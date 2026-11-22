// SPDX-License-Identifier: AGPL-3.0-only
import {
  type BackupSettings,
  DEFAULT_BACKUP_SETTINGS,
  isDue,
  lastSlot,
  nextSlot,
  protectionOf,
  readBackupSettings,
} from './backup-schedule.js';

const daily: BackupSettings = { ...DEFAULT_BACKUP_SETTINGS, schedule: 'daily', hour: 3 };
// 2026-11-22 is a Sunday.
const weekly: BackupSettings = { ...daily, schedule: 'weekly', weekday: 3 };
const off: BackupSettings = { ...daily, schedule: 'off' };
const at = (text: string) => new Date(text);

describe('readBackupSettings', () => {
  it('starts with a backup every night', () => {
    expect(readBackupSettings(null)).toEqual(DEFAULT_BACKUP_SETTINGS);
    expect(DEFAULT_BACKUP_SETTINGS.schedule).toBe('daily');
  });

  it('fills in what is missing and ignores what makes no sense', () => {
    expect(readBackupSettings({ keep: 30 })).toEqual({ ...DEFAULT_BACKUP_SETTINGS, keep: 30 });
    expect(readBackupSettings({ hour: 99 })).toEqual(DEFAULT_BACKUP_SETTINGS);
    expect(readBackupSettings('nonsense')).toEqual(DEFAULT_BACKUP_SETTINGS);
  });
});

describe('slots', () => {
  it('finds the latest daily slot', () => {
    expect(lastSlot(daily, at('2026-11-22T10:00:00Z'))).toEqual(at('2026-11-22T03:00:00Z'));
    expect(lastSlot(daily, at('2026-11-22T03:00:00Z'))).toEqual(at('2026-11-22T03:00:00Z'));
    expect(lastSlot(daily, at('2026-11-22T02:59:59Z'))).toEqual(at('2026-11-21T03:00:00Z'));
  });

  it('finds the latest weekly slot', () => {
    expect(lastSlot(weekly, at('2026-11-22T10:00:00Z'))).toEqual(at('2026-11-18T03:00:00Z'));
    expect(lastSlot(weekly, at('2026-11-18T03:00:00Z'))).toEqual(at('2026-11-18T03:00:00Z'));
    expect(lastSlot(weekly, at('2026-11-18T02:00:00Z'))).toEqual(at('2026-11-11T03:00:00Z'));
  });

  it('finds the next slot', () => {
    expect(nextSlot(daily, at('2026-11-22T10:00:00Z'))).toEqual(at('2026-11-23T03:00:00Z'));
    expect(nextSlot(weekly, at('2026-11-22T10:00:00Z'))).toEqual(at('2026-11-25T03:00:00Z'));
    expect(nextSlot(off, at('2026-11-22T10:00:00Z'))).toBeNull();
    expect(lastSlot(off, at('2026-11-22T10:00:00Z'))).toBeNull();
  });

  it('crosses the end of a month and of a year', () => {
    expect(lastSlot(daily, at('2027-01-01T01:00:00Z'))).toEqual(at('2026-12-31T03:00:00Z'));
  });
});

describe('isDue', () => {
  const now = at('2026-11-22T03:00:20Z');

  it('is due when the slot passed without a backup', () => {
    expect(isDue(daily, null, now)).toBe(true);
    expect(isDue(daily, at('2026-11-21T03:00:10Z'), now)).toBe(true);
  });

  it('is not due twice for one slot', () => {
    expect(isDue(daily, at('2026-11-22T03:00:05Z'), now)).toBe(false);
  });

  it('catches up after the server was off', () => {
    expect(isDue(daily, at('2026-11-19T03:00:05Z'), at('2026-11-22T17:00:00Z'))).toBe(true);
  });

  it('is never due when the schedule is off', () => {
    expect(isDue(off, null, now)).toBe(false);
  });

  it('waits for its day of the week', () => {
    expect(isDue(weekly, at('2026-11-18T03:00:05Z'), at('2026-11-24T23:00:00Z'))).toBe(false);
    expect(isDue(weekly, at('2026-11-18T03:00:05Z'), at('2026-11-25T03:00:00Z'))).toBe(true);
  });
});

describe('protectionOf', () => {
  const now = at('2026-11-22T12:00:00Z');

  it('is protected with a fresh backup', () => {
    expect(protectionOf(daily, at('2026-11-22T03:00:00Z'), now)).toBe('protected');
    expect(protectionOf(daily, at('2026-11-20T12:00:00Z'), now)).toBe('protected');
    expect(protectionOf(weekly, at('2026-11-10T12:00:00Z'), now)).toBe('protected');
  });

  it('is late when a round was missed', () => {
    expect(protectionOf(daily, at('2026-11-20T10:00:00Z'), now)).toBe('late');
    expect(protectionOf(weekly, at('2026-11-01T12:00:00Z'), now)).toBe('late');
  });

  it('tells no backup from no schedule', () => {
    expect(protectionOf(daily, null, now)).toBe('none');
    expect(protectionOf(off, null, now)).toBe('off');
    expect(protectionOf(off, at('2026-11-22T03:00:00Z'), now)).toBe('off');
  });
});
