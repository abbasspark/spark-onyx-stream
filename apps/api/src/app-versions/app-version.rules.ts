// SPDX-License-Identifier: AGPL-3.0-only

export const APP_VERSIONS_SETTINGS_KEY = 'app-versions';

/** The header an app names itself in: "android-tv/1.4.0". */
export const CLIENT_HEADER = 'x-onyx-client';

/** Sent with the refusal, for apps to act on without reading the message. */
export const CLIENT_TOO_OLD = 'client_too_old';

export const MAX_RULES = 20;

const NAME = /^[a-z][a-z0-9-]{0,31}$/;
const VERSION = /^\d{1,6}(\.\d{1,6}){0,3}$/;

/** The oldest version of one app that may still use the installation. */
export interface AppVersionRule {
  /** What the app calls itself, such as "android-tv". */
  app: string;
  /** Versions below this one are turned away. */
  minimum: string;
  /** What the app shows the viewer. Null for the standard sentence. */
  message: string | null;
  /** Where the newer version is, such as its page in a store. */
  updateUrl: string | null;
}

export interface ClientIdentity {
  app: string;
  version: string;
}

/**
 * Reads "name/version" from the header. A version may carry a suffix such as
 * "-beta.2" or "+41", which is ignored: a beta of 1.4.0 counts as 1.4.0.
 *
 * @returns null for a header that is absent or not in this form. Such a
 *   request is let through: the gate is for apps that take part in it.
 */
export function parseClient(header: string | string[] | undefined): ClientIdentity | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || value.length > 80) {
    return null;
  }
  const [app = '', rest = '', ...more] = value.trim().toLowerCase().split('/');
  const version = rest.split(/[-+]/)[0] ?? '';
  if (more.length > 0 || !isAppName(app) || !isVersion(version)) {
    return null;
  }
  return { app, version };
}

export const isAppName = (value: string) => NAME.test(value);
export const isVersion = (value: string) => VERSION.test(value);

/** Below zero when a is older than b, zero when they are the same. "1.4" is "1.4.0". */
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

/** The rule a client falls under, when it is too old for it. */
export function ruleAgainst(
  client: ClientIdentity,
  rules: readonly AppVersionRule[],
): AppVersionRule | null {
  const rule = rules.find((candidate) => candidate.app === client.app);
  return rule && compareVersions(client.version, rule.minimum) < 0 ? rule : null;
}

export function defaultMessage(): string {
  return 'This version of the app is no longer supported. Update the app to continue.';
}

/** What is stored, read with care: a damaged entry is left out and never breaks a request. */
export function readRules(value: unknown): AppVersionRule[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rules: AppVersionRule[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const { app, minimum, message, updateUrl } = entry as Record<string, unknown>;
    if (
      typeof app !== 'string' ||
      typeof minimum !== 'string' ||
      !isAppName(app) ||
      !isVersion(minimum)
    ) {
      continue;
    }
    rules.push({
      app,
      minimum,
      message: typeof message === 'string' && message ? message : null,
      updateUrl: typeof updateUrl === 'string' && updateUrl ? updateUrl : null,
    });
  }
  return rules;
}
