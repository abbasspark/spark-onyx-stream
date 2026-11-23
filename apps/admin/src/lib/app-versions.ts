// SPDX-License-Identifier: AGPL-3.0-only
import type { AppVersionRule } from '@/api/types';

/** The apps a streaming service usually has, with the name each sends in its header. */
export const KNOWN_APPS: readonly { app: string; label: string }[] = [
  { app: 'android-tv', label: 'Android TV' },
  { app: 'android', label: 'Android phones and tablets' },
  { app: 'fire-tv', label: 'Amazon Fire TV' },
  { app: 'ios', label: 'iPhone and iPad' },
  { app: 'tvos', label: 'Apple TV' },
  { app: 'tizen', label: 'Samsung TV' },
  { app: 'webos', label: 'LG TV' },
  { app: 'roku', label: 'Roku' },
];

/** Stands for "an app that is not on the list" in the form. */
export const OTHER_APP = 'other';

export function appLabel(app: string): string {
  return KNOWN_APPS.find((known) => known.app === app)?.label ?? app;
}

export function isKnownApp(app: string): boolean {
  return KNOWN_APPS.some((known) => known.app === app);
}

export function appNameProblem(text: string): string | null {
  const value = text.trim().toLowerCase();
  if (!value) {
    return 'Enter the name the app sends';
  }
  return /^[a-z][a-z0-9-]{0,31}$/.test(value)
    ? null
    : 'Use lower-case letters, digits and hyphens, starting with a letter';
}

export function versionProblem(text: string): string | null {
  const value = text.trim();
  if (!value) {
    return 'Enter a version';
  }
  return /^\d{1,6}(\.\d{1,6}){0,3}$/.test(value)
    ? null
    : 'Write the version as numbers with dots, such as 1.4.0';
}

export function linkProblem(text: string): string | null {
  const value = text.trim();
  return !value || /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(value)
    ? null
    : 'Enter a full address, such as https://play.google.com/store/apps/details?id=…';
}

/** Below zero when a is older than b. "1.4" is "1.4.0". */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export interface RuleDraft {
  /** One of the known apps, or OTHER_APP. */
  choice: string;
  /** The name typed for an app that is not on the list. */
  custom: string;
  minimum: string;
  message: string;
  updateUrl: string;
}

export const EMPTY_RULE: RuleDraft = {
  choice: '',
  custom: '',
  minimum: '',
  message: '',
  updateUrl: '',
};

export function draftOf(rule: AppVersionRule): RuleDraft {
  const known = isKnownApp(rule.app);
  return {
    choice: known ? rule.app : OTHER_APP,
    custom: known ? '' : rule.app,
    minimum: rule.minimum,
    message: rule.message ?? '',
    updateUrl: rule.updateUrl ?? '',
  };
}

export function appOf(draft: RuleDraft): string {
  return draft.choice === OTHER_APP ? draft.custom.trim().toLowerCase() : draft.choice;
}

export function ruleOf(draft: RuleDraft): AppVersionRule {
  return {
    app: appOf(draft),
    minimum: draft.minimum.trim(),
    message: draft.message.trim() || null,
    updateUrl: draft.updateUrl.trim() || null,
  };
}

/**
 * What stops a rule from being saved, one thing at a time.
 *
 * @param editing The app of the rule that is being changed, which may keep its name.
 */
export function draftProblem(
  draft: RuleDraft,
  rules: readonly AppVersionRule[],
  editing: string | null,
): string | null {
  if (!draft.choice) {
    return 'Choose the app';
  }
  const app = appOf(draft);
  const nameProblem = draft.choice === OTHER_APP ? appNameProblem(draft.custom) : null;
  if (nameProblem) {
    return nameProblem;
  }
  if (app !== editing && rules.some((rule) => rule.app === app)) {
    return `${appLabel(app)} has a rule already`;
  }
  return versionProblem(draft.minimum) ?? linkProblem(draft.updateUrl);
}

/** The rules with one added, or put in the place of the one it replaces. */
export function withRule(
  rules: readonly AppVersionRule[],
  rule: AppVersionRule,
  editing: string | null,
): AppVersionRule[] {
  return [...rules.filter((other) => other.app !== editing && other.app !== rule.app), rule];
}

export const STANDARD_MESSAGE =
  'This version of the app is no longer supported. Update the app to continue.';

/** What an app that is too old gets back, as an example for the people who build it. */
export function refusalExample(rule: AppVersionRule | undefined) {
  return {
    statusCode: 426,
    error: 'Upgrade Required',
    code: 'client_too_old',
    minimumVersion: rule?.minimum ?? '1.4.0',
    message: rule?.message ?? STANDARD_MESSAGE,
    updateUrl: rule?.updateUrl ?? null,
  };
}
