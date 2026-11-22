// SPDX-License-Identifier: AGPL-3.0-only
import type { Backup, BackupOverview, BackupSettings } from '@/api/types';
import type { BadgeTone } from '@/components/ui/display';
import type { SelectOption } from '@/components/ui/form';
import { formatRelative } from './format';

const HOUR_MS = 60 * 60 * 1000;
/** A Sunday at midnight UTC, to count days of the week and hours from. */
const A_SUNDAY = Date.UTC(2026, 10, 22);

/** The moment of a week that a weekday and hour in UTC stand for. */
const slotDate = (weekday: number, hour: number) =>
  new Date(A_SUNDAY + weekday * 24 * HOUR_MS + hour * HOUR_MS);

const timeFormat = (timeZone?: string) =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone });
/** Sorts the same in every language: "04:00", never "4:00 AM". */
const sortFormat = (timeZone?: string) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  });
const dayFormat = (timeZone?: string) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone });

/**
 * The hours a backup can be made at, as the person choosing reads the clock.
 * The value is the hour in UTC, which is what the server keeps.
 *
 * @param timeZone For tests. The browser's zone when left out.
 */
export function hourOptions(timeZone?: string): SelectOption[] {
  const time = timeFormat(timeZone);
  const sort = sortFormat(timeZone);
  return Array.from({ length: 24 }, (_, hour) => ({
    value: String(hour),
    label: time.format(slotDate(0, hour)),
    sort: sort.format(slotDate(0, hour)),
  }))
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .map(({ value, label }) => ({ value, label }));
}

/**
 * The days a weekly backup can be made on, named as they are where the
 * person is. Late in the evening in UTC is already the next day further east.
 */
export function weekdayOptions(hour: number, timeZone?: string): SelectOption[] {
  const day = dayFormat(timeZone);
  return Array.from({ length: 7 }, (_, weekday) => ({
    value: String(weekday),
    label: day.format(slotDate(weekday, hour)),
  }));
}

/** "Every day at 04:00", in the time of the person reading. */
export function describeSchedule(settings: BackupSettings, timeZone?: string): string {
  if (settings.schedule === 'off') {
    return 'Off';
  }
  const at = slotDate(settings.weekday, settings.hour);
  const time = timeFormat(timeZone).format(at);
  return settings.schedule === 'daily'
    ? `Every day at ${time}`
    : `Every ${dayFormat(timeZone).format(at)} at ${time}`;
}

export type ProtectionLook = {
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  title: string;
  text: string;
};

/** What to say at the top of the page about how safe the data is. */
export function protectionLook(overview: BackupOverview, now: number = Date.now()): ProtectionLook {
  const age = formatRelative(overview.lastGoodAt, now);
  const next = overview.nextRunAt ? formatRelative(overview.nextRunAt, now) : null;
  const blocked = overview.runner === null || overview.runner.problem !== null;
  switch (overview.protection) {
    case 'protected':
      return blocked
        ? {
            tone: 'warning',
            title: 'Protected for now',
            text: `The newest backup was made ${age}. No further ones can be made until the problem above is solved.`,
          }
        : {
            tone: 'success',
            title: 'Protected',
            text: `The newest backup was made ${age}.${next ? ` The next one is due ${next}.` : ''}`,
          };
    case 'late':
      return {
        tone: 'danger',
        title: 'A backup is overdue',
        text: `The newest backup that can be restored was made ${age}. What changed since then is not protected.`,
      };
    case 'none':
      return {
        tone: blocked ? 'danger' : 'warning',
        title: 'No backup yet',
        text: blocked
          ? 'Nothing protects the database, and no backup can be made until the problem above is solved.'
          : `Nothing protects the database yet.${next ? ` The first scheduled backup is due ${next}.` : ''} You can make one now.`,
      };
    case 'off':
      return overview.lastGoodAt
        ? {
            tone: 'warning',
            title: 'Scheduled backups are off',
            text: `The newest backup was made ${age}. Further ones are made only when someone asks for them here.`,
          }
        : {
            tone: 'danger',
            title: 'Not protected',
            text: 'There is no backup, and none is scheduled. A lost server would take every title, viewer and payment with it.',
          };
  }
}

export const BACKUP_STATUS_LOOKS: Record<
  Backup['status'],
  { label: string; tone: BadgeTone; live?: boolean }
> = {
  PENDING: { label: 'Waiting', tone: 'neutral', live: true },
  RUNNING: { label: 'Being made', tone: 'info', live: true },
  COMPLETED: { label: 'Ready', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
};

/** Who or what asked for a backup. */
export function triggerOf(backup: Backup): string {
  if (backup.trigger === 'SCHEDULED') {
    return 'Scheduled';
  }
  return backup.createdBy ? `By ${backup.createdBy.displayName}` : 'By hand';
}

/** How long making a backup took, in milliseconds. Null while it is not finished. */
export function tookMs(backup: Backup): number | null {
  return backup.startedAt && backup.finishedAt
    ? new Date(backup.finishedAt).getTime() - new Date(backup.startedAt).getTime()
    : null;
}

/** "4 s", "2 min 5 s", "1 h 12 min". */
export function formatTook(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds < 0) {
    return '–';
  }
  const seconds = Math.max(1, Math.round(milliseconds / 1000));
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes} min${seconds % 60 ? ` ${seconds % 60} s` : ''}`
    : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}

/** Whether a backup was written by another version than the one running. */
export function fromOtherVersion(backup: Backup, appVersion: string): boolean {
  return backup.appVersion !== appVersion;
}

export type DayLook = 'good' | 'failed' | 'mixed' | 'none';

/** What became of the backups of one day. */
export function dayLook(day: { good: number; failed: number }): DayLook {
  if (day.good > 0) {
    return day.failed > 0 ? 'mixed' : 'good';
  }
  return day.failed > 0 ? 'failed' : 'none';
}

const dayLabel = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Sun, Nov 22: 1 backup" */
export function describeDay(day: { date: string; good: number; failed: number }): string {
  const date = dayLabel.format(new Date(`${day.date}T00:00:00Z`));
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (day.good === 0 && day.failed === 0) {
    return `${date}: no backup`;
  }
  const parts = [
    day.good > 0 ? count(day.good, 'backup') : null,
    day.failed > 0 ? `${count(day.failed, 'failure')}` : null,
  ].filter(Boolean);
  return `${date}: ${parts.join(', ')}`;
}

export interface RestoreStep {
  title: string;
  text: string;
  /** Commands to carry to a terminal. */
  code?: string;
}

/**
 * How to bring a backup back, for an installation run with Docker Compose.
 *
 * @param fileName The file to restore, or null to leave a placeholder.
 */
export function restoreSteps(fileName: string | null): RestoreStep[] {
  const file = `/var/lib/onyx/storage/backups/${fileName ?? '<file>.onyxbackup'}`;
  const tool = 'docker compose run --rm api node dist/cli/backup.js';
  return [
    {
      title: 'Have the file and the key on the server',
      text: 'Backups in a storage pool on the server are in its storage volume already. A file you downloaded, or one from a bucket, goes into the folder "backups" of that volume. The .env file must hold the MASTER_KEY the backup was made under: no backup opens without it.',
      code: `cd deploy/compose\ndocker compose cp ./${fileName ?? '<file>.onyxbackup'} api:${file}`,
    },
    {
      title: 'Check that it opens',
      text: 'Reads the whole file and changes nothing. It tells you when the backup was made and by which version.',
      code: `${tool} verify ${file}`,
    },
    {
      title: 'Stop what uses the database',
      text: 'Viewers cannot watch or sign in from here until the last step.',
      code: 'docker compose stop api worker live',
    },
    {
      title: 'Restore',
      text: 'Replaces everything in the database with the backup. With --save-current, the database as it is now is put aside first, in case you want it back.',
      code: `${tool} restore ${file} \\\n  --yes --save-current /var/lib/onyx/storage/backups/before-restore.onyxbackup`,
    },
    {
      title: 'Start again',
      text: 'Brings the database up to the version you run, should the backup be from an older one, and starts everything.',
      code: 'docker compose up -d',
    },
  ];
}
