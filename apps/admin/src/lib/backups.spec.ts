// SPDX-License-Identifier: AGPL-3.0-only
import type { Backup, BackupOverview, BackupSettings } from '@/api/types';
import {
  dayLook,
  describeDay,
  describeSchedule,
  formatTook,
  fromOtherVersion,
  hourOptions,
  protectionLook,
  restoreSteps,
  tookMs,
  triggerOf,
  weekdayOptions,
} from './backups';

const settings: BackupSettings = {
  schedule: 'daily',
  hour: 3,
  weekday: 0,
  keep: 14,
  storagePoolId: null,
};
const NOW = Date.parse('2026-11-22T12:00:00Z');

const overview = (over: Partial<BackupOverview> = {}): BackupOverview => ({
  settings,
  protection: 'protected',
  lastGoodAt: '2026-11-22T03:00:00Z',
  nextRunAt: '2026-11-23T03:00:00Z',
  runner: { pgDump: '17.2', server: '17.2', problem: null },
  appVersion: '0.1.0',
  totalBytes: 0,
  days: [],
  pools: [],
  backups: [],
  ...over,
});

const backup = (over: Partial<Backup> = {}): Backup => ({
  id: 'b1',
  status: 'COMPLETED',
  trigger: 'SCHEDULED',
  pool: { id: 'p1', name: 'Local storage' },
  fileName: '2026-11-22T03-00-04Z-1a2b3c4d.onyxbackup',
  sizeBytes: 1000,
  sha256: 'ab'.repeat(32),
  entries: 300,
  appVersion: '0.1.0',
  migration: '20261124090000_backups',
  error: null,
  createdBy: null,
  createdAt: '2026-11-22T03:00:04Z',
  startedAt: '2026-11-22T03:00:04Z',
  finishedAt: '2026-11-22T03:00:09Z',
  ...over,
});

describe('times as the person reads the clock', () => {
  it('offers every hour once, in the order of the local day', () => {
    const options = hourOptions('Europe/Berlin');
    expect(options).toHaveLength(24);
    // Midnight in Berlin in winter is 23:00 UTC.
    expect(options[0]).toMatchObject({ value: '23' });
    expect(options[4]).toMatchObject({ value: '3' });
    expect(options[4]?.label).toMatch(/^0?4[:.]00/);
    expect(new Set(options.map((option) => option.value)).size).toBe(24);
  });

  it('keeps UTC as it is', () => {
    expect(hourOptions('UTC')[3]).toMatchObject({ value: '3' });
  });

  it('names the day as it is where the person is', () => {
    const utc = weekdayOptions(23, 'UTC');
    const tokyo = weekdayOptions(23, 'Asia/Tokyo');
    expect(utc.map((option) => option.value)).toEqual(['0', '1', '2', '3', '4', '5', '6']);
    // Sunday 23:00 UTC is Monday morning in Tokyo.
    expect(tokyo[0]?.label).toBe(utc[1]?.label);
    expect(weekdayOptions(3, 'Asia/Tokyo')[0]?.label).toBe(utc[0]?.label);
  });

  it('describes the schedule', () => {
    expect(describeSchedule({ ...settings, schedule: 'off' })).toBe('Off');
    expect(describeSchedule(settings, 'UTC')).toMatch(/^Every day at 0?3[:.]00/);
    const weekly = describeSchedule({ ...settings, schedule: 'weekly', weekday: 0 }, 'UTC');
    expect(weekly).toBe(
      `Every ${weekdayOptions(3, 'UTC')[0]?.label} at ${weekly.split(' at ')[1]}`,
    );
  });
});

describe('protectionLook', () => {
  it('is calm when a fresh backup exists', () => {
    const look = protectionLook(overview(), NOW);
    expect(look.tone).toBe('success');
    expect(look.text).toMatch(/9 hours ago/);
    expect(look.text).toMatch(/next one is due/);
  });

  it('warns when backups can no longer be made', () => {
    expect(protectionLook(overview({ runner: null }), NOW).tone).toBe('warning');
    const look = protectionLook(
      overview({ runner: { pgDump: null, server: '17.2', problem: 'pg_dump is not installed' } }),
      NOW,
    );
    expect(look.title).toBe('Protected for now');
  });

  it('is loud about an overdue backup', () => {
    const look = protectionLook(
      overview({ protection: 'late', lastGoodAt: '2026-11-19T03:00:00Z' }),
      NOW,
    );
    expect(look.tone).toBe('danger');
    expect(look.title).toBe('A backup is overdue');
  });

  it('tells a new installation from one that cannot back up', () => {
    const fresh = protectionLook(overview({ protection: 'none', lastGoodAt: null }), NOW);
    expect(fresh.tone).toBe('warning');
    expect(fresh.text).toMatch(/You can make one now/);
    const stuck = protectionLook(
      overview({ protection: 'none', lastGoodAt: null, runner: null }),
      NOW,
    );
    expect(stuck.tone).toBe('danger');
  });

  it('does not call a switched-off schedule protected', () => {
    const withOne = protectionLook(overview({ protection: 'off', nextRunAt: null }), NOW);
    expect(withOne.tone).toBe('warning');
    const withNone = protectionLook(
      overview({ protection: 'off', nextRunAt: null, lastGoodAt: null }),
      NOW,
    );
    expect(withNone).toMatchObject({ tone: 'danger', title: 'Not protected' });
  });
});

describe('one backup', () => {
  it('says who asked for it', () => {
    expect(triggerOf(backup())).toBe('Scheduled');
    expect(
      triggerOf(backup({ trigger: 'MANUAL', createdBy: { id: 'a', displayName: 'Olivia' } })),
    ).toBe('By Olivia');
    expect(triggerOf(backup({ trigger: 'MANUAL' }))).toBe('By hand');
  });

  it('says how long it took', () => {
    expect(tookMs(backup())).toBe(5000);
    expect(tookMs(backup({ finishedAt: null }))).toBeNull();
    expect(formatTook(5000)).toBe('5 s');
    expect(formatTook(200)).toBe('1 s');
    expect(formatTook(125_000)).toBe('2 min 5 s');
    expect(formatTook(120_000)).toBe('2 min');
    expect(formatTook(4_320_000)).toBe('1 h 12 min');
    expect(formatTook(null)).toBe('–');
  });

  it('notices another version', () => {
    expect(fromOtherVersion(backup(), '0.1.0')).toBe(false);
    expect(fromOtherVersion(backup({ appVersion: '0.0.9' }), '0.1.0')).toBe(true);
  });
});

describe('days', () => {
  it('sums a day up', () => {
    expect(dayLook({ good: 1, failed: 0 })).toBe('good');
    expect(dayLook({ good: 0, failed: 2 })).toBe('failed');
    expect(dayLook({ good: 1, failed: 1 })).toBe('mixed');
    expect(dayLook({ good: 0, failed: 0 })).toBe('none');
  });

  it('describes a day in words', () => {
    expect(describeDay({ date: '2026-11-22', good: 0, failed: 0 })).toMatch(/22.*: no backup$/);
    expect(describeDay({ date: '2026-11-22', good: 1, failed: 0 })).toMatch(/: 1 backup$/);
    expect(describeDay({ date: '2026-11-22', good: 2, failed: 1 })).toMatch(
      /: 2 backups, 1 failure$/,
    );
  });
});

describe('restoreSteps', () => {
  it('names the file in every command that needs it', () => {
    const steps = restoreSteps('2026-11-22T03-00-04Z-1a2b3c4d.onyxbackup');
    const file = '/var/lib/onyx/storage/backups/2026-11-22T03-00-04Z-1a2b3c4d.onyxbackup';
    expect(steps.map((step) => step.title)).toEqual([
      'Have the file and the key on the server',
      'Check that it opens',
      'Stop what uses the database',
      'Restore',
      'Start again',
    ]);
    expect(steps[1]?.code).toBe(
      `docker compose run --rm api node dist/cli/backup.js verify ${file}`,
    );
    expect(steps[3]?.code).toContain(`restore ${file}`);
    expect(steps[3]?.code).toContain('--yes --save-current');
  });

  it('leaves a placeholder without a file', () => {
    expect(restoreSteps(null)[1]?.code).toContain('<file>.onyxbackup');
  });
});
