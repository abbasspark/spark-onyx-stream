// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { isAppName, isVersion, MAX_RULES } from './app-version.rules.js';

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

const ruleSchema = z.object({
  app: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isAppName, 'Use lower-case letters, digits and hyphens, starting with a letter'),
  minimum: z
    .string()
    .trim()
    .refine(isVersion, 'Write the version as numbers with dots, such as 1.4.0'),
  message: text(300),
  updateUrl: text(500).refine(
    (value) =>
      value === null || /^https?:\/\/\S+$/.test(value) || /^[a-z][a-z0-9+.-]*:\/\/\S+$/.test(value),
    'Enter a full address, such as https://play.google.com/store/apps/details?id=…',
  ),
});

export const saveAppVersionsSchema = z.object({
  rules: z
    .array(ruleSchema)
    .max(MAX_RULES, `Keep it to ${MAX_RULES} apps`)
    .refine(
      (rules) => new Set(rules.map((rule) => rule.app)).size === rules.length,
      'Each app can have one rule',
    ),
});
export type SaveAppVersionsInput = z.infer<typeof saveAppVersionsSchema>;
