// SPDX-License-Identifier: AGPL-3.0-only

/** The roles one process can take. A process may run several at once. */
export const APP_ROLES = ['api', 'worker', 'live', 'scheduler'] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Shorthand that enables every role, used in development and on small installs. */
export const ALL_ROLES_KEYWORD = 'all';

function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
}

/**
 * Parses the APP_ROLE setting.
 *
 * Accepts "all", a single role, or a comma-separated list such as "api,scheduler".
 * The result has no duplicates and follows the order of APP_ROLES.
 *
 * @throws Error when the value is empty or names an unknown role.
 */
export function parseAppRoles(value: string): AppRole[] {
  const names = value
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);

  if (names.length === 0) {
    throw new Error('APP_ROLE must not be empty');
  }

  if (names.includes(ALL_ROLES_KEYWORD)) {
    if (names.length > 1) {
      throw new Error(`APP_ROLE "${ALL_ROLES_KEYWORD}" cannot be combined with other roles`);
    }
    return [...APP_ROLES];
  }

  const unknown = names.filter((name) => !isAppRole(name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown APP_ROLE value: ${unknown.join(', ')}. ` +
        `Allowed: ${ALL_ROLES_KEYWORD}, ${APP_ROLES.join(', ')}`,
    );
  }

  const selected = new Set(names);
  return APP_ROLES.filter((role) => selected.has(role));
}
