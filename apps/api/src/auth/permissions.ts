// SPDX-License-Identifier: AGPL-3.0-only
import type { AdminRole } from '@onyx/database';

/**
 * Everything an authenticated caller can be allowed to do.
 * Endpoints declare the permissions they need. Roles and API keys grant them.
 */
export const PERMISSIONS = [
  'admins:read',
  'admins:write',
  'api-keys:read',
  'api-keys:write',
  'audit:read',
  'assets:read',
  'assets:write',
  'jobs:read',
  'jobs:write',
  'encoding-profiles:read',
  'encoding-profiles:write',
  'storage:read',
  'storage:write',
  'catalog:read',
  'catalog:write',
  'viewers:read',
  'viewers:write',
  'billing:read',
  'billing:write',
  'live:read',
  'live:write',
  'settings:read',
  'settings:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissions that an API key can never carry.
 * Managing admins and keys always needs a signed-in person.
 */
export const NON_DELEGABLE_PERMISSIONS: readonly Permission[] = ['admins:write', 'api-keys:write'];

const CONTENT_READ: readonly Permission[] = [
  'catalog:read',
  'assets:read',
  'jobs:read',
  'encoding-profiles:read',
  'storage:read',
  'live:read',
];

const CONTENT_WRITE: readonly Permission[] = [
  'catalog:write',
  'assets:write',
  'jobs:write',
  'encoding-profiles:write',
];

/**
 * OWNER and ADMIN hold every permission. What separates them is enforced in
 * AdminsService: only an owner can create, change or deactivate an owner.
 */
const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  EDITOR: [...CONTENT_READ, ...CONTENT_WRITE],
  VIEWER: CONTENT_READ,
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function permissionsOfRole(role: AdminRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/**
 * Permissions an API key actually has: the scopes stored on the key, limited
 * to what its creator may do today and to what can be delegated at all.
 * A key therefore loses access when its creator is moved to a lower role.
 */
export function effectiveApiKeyPermissions(
  scopes: readonly string[],
  creatorRole: AdminRole,
): Permission[] {
  const creatorPermissions = new Set<string>(permissionsOfRole(creatorRole));

  return scopes.filter(
    (scope): scope is Permission =>
      isPermission(scope) &&
      creatorPermissions.has(scope) &&
      !NON_DELEGABLE_PERMISSIONS.includes(scope),
  );
}

export function hasAllPermissions(
  granted: readonly Permission[],
  required: readonly Permission[],
): boolean {
  return required.every((permission) => granted.includes(permission));
}
