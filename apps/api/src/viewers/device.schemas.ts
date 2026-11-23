// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

const deviceNameSchema = z
  .string()
  .transform((value) => value.replaceAll(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Give the device a name').max(40, 'Use at most 40 characters'));

/** What an app says about the device it runs on. */
export const deviceInfoSchema = z.object({
  /** Made up by the app when it is installed, and kept. A random UUID is right. */
  installationId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Use 8 to 64 letters, digits, hyphens or underscores'),
  /** A name to start with, such as "Living room TV". The viewer can change it. */
  name: deviceNameSchema,
  kind: z.enum(['TV', 'MOBILE', 'TABLET', 'DESKTOP', 'OTHER']).default('OTHER'),
  /** The app, as in the X-Onyx-Client header: "android-tv". */
  platform: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9-]{0,31}$/, 'Use lower-case letters, digits and hyphens'),
  /** Make and model, as the device says. */
  model: z.string().trim().max(80).optional(),
  appVersion: z
    .string()
    .trim()
    .regex(
      /^\d{1,6}(\.\d{1,6}){0,3}([-+][0-9A-Za-z.-]{1,32})?$/,
      'Write the version as numbers with dots',
    )
    .optional(),
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

export const startDeviceCodeSchema = z.object({ device: deviceInfoSchema });
export type StartDeviceCodeInput = z.infer<typeof startDeviceCodeSchema>;

export const pollDeviceCodeSchema = z.object({
  deviceCode: z.string().min(20).max(200),
});
export type PollDeviceCodeInput = z.infer<typeof pollDeviceCodeSchema>;

export const renameDeviceSchema = z.object({ name: deviceNameSchema });
export type RenameDeviceInput = z.infer<typeof renameDeviceSchema>;
