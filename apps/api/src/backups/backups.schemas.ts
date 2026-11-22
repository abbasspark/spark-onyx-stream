// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

export { type BackupSettings, backupSettingsSchema } from './backup-schedule.js';

export const fileQuerySchema = z.object({ token: z.string().min(1).max(200) });
export type FileQuery = z.infer<typeof fileQuerySchema>;
