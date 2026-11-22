// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

/** The key of the backup settings in the settings table. */
export const BACKUP_SETTINGS_KEY = 'backups';

export const backupSettingsSchema = z.object({
  /** How often a backup is made on its own. */
  schedule: z.enum(['off', 'daily', 'weekly']),
  /** The hour of the day it is made, in UTC. */
  hour: z.int().min(0).max(23),
  /** For weekly backups: the day, with 0 for Sunday as in JavaScript. */
  weekday: z.int().min(0).max(6),
  /** How many finished backups are kept. Older ones are deleted. */
  keep: z.int().min(1).max(365),
  /** Where backups are written. Null is the default storage pool. */
  storagePoolId: z.uuid().nullable(),
});
export type BackupSettings = z.infer<typeof backupSettingsSchema>;

/**
 * Backups are on from the start: an installation nobody has set up yet is
 * exactly the one that needs them.
 */
export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  schedule: 'daily',
  hour: 3,
  weekday: 0,
  keep: 14,
  storagePoolId: null,
};

/** The stored settings, or the defaults where nothing valid is stored. */
export function readBackupSettings(stored: unknown): BackupSettings {
  const parsed = backupSettingsSchema.safeParse({
    ...DEFAULT_BACKUP_SETTINGS,
    ...(typeof stored === 'object' && stored !== null ? stored : {}),
  });
  return parsed.success ? parsed.data : DEFAULT_BACKUP_SETTINGS;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The latest moment a scheduled backup was due, at or before now. Null when the schedule is off. */
export function lastSlot(settings: BackupSettings, now: Date): Date | null {
  if (settings.schedule === 'off') {
    return null;
  }
  let slot = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), settings.hour);
  if (slot > now.getTime()) {
    slot -= DAY_MS;
  }
  if (settings.schedule === 'weekly') {
    const back = (new Date(slot).getUTCDay() - settings.weekday + 7) % 7;
    slot -= back * DAY_MS;
  }
  return new Date(slot);
}

/** When the next scheduled backup is due, after now. Null when the schedule is off. */
export function nextSlot(settings: BackupSettings, now: Date): Date | null {
  const last = lastSlot(settings, now);
  return last && new Date(last.getTime() + (settings.schedule === 'weekly' ? 7 : 1) * DAY_MS);
}

/**
 * Whether a scheduled backup should start now.
 *
 * It should when the latest slot has passed without one. A server that was
 * switched off at the time catches up when it is back. A backup that failed
 * counts as made: the next attempt is the next slot, and the failure stays
 * on screen until then.
 *
 * @param lastScheduledAt When the newest scheduled backup was made, whatever came of it.
 */
export function isDue(settings: BackupSettings, lastScheduledAt: Date | null, now: Date): boolean {
  const slot = lastSlot(settings, now);
  return slot !== null && (lastScheduledAt === null || lastScheduledAt < slot);
}

/**
 * How well the installation is protected, going by its newest good backup.
 *
 * "late" is a backup older than two rounds of the schedule: one was missed.
 */
export type Protection = 'protected' | 'late' | 'none' | 'off';

export function protectionOf(
  settings: BackupSettings,
  lastGoodAt: Date | null,
  now: Date,
): Protection {
  if (!lastGoodAt) {
    return settings.schedule === 'off' ? 'off' : 'none';
  }
  if (settings.schedule === 'off') {
    return 'off';
  }
  const round = (settings.schedule === 'weekly' ? 7 : 1) * DAY_MS;
  return now.getTime() - lastGoodAt.getTime() > 2 * round + HOUR_MS ? 'late' : 'protected';
}
