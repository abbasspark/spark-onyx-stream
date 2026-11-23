// SPDX-License-Identifier: AGPL-3.0-only
import type { AdminRole } from '@onyx/database';

/** The four roles that ship with the software. A custom role is made in the panel. */
export type BuiltInRole = Exclude<AdminRole, 'CUSTOM'>;

export const BUILT_IN_ROLES: readonly BuiltInRole[] = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'];

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
  'analytics:read',
  'billing:read',
  'billing:write',
  'live:read',
  'live:write',
  'delivery:read',
  'delivery:write',
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
  'analytics:read',
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
const ROLE_PERMISSIONS: Record<BuiltInRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS,
  EDITOR: [...CONTENT_READ, ...CONTENT_WRITE],
  VIEWER: CONTENT_READ,
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function permissionsOfRole(role: BuiltInRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

/** The part of an admin that decides what they may do. */
export interface RoleHolder {
  role: AdminRole;
  customRole?: { permissions: readonly string[] } | null;
}

/**
 * What an admin may do: the list of their built-in role, or of the custom
 * role they hold. Entries of a custom role the code does not know are left
 * out, and a custom role that is missing grants nothing.
 */
export function permissionsOf(holder: RoleHolder): readonly Permission[] {
  if (holder.role !== 'CUSTOM') {
    return ROLE_PERMISSIONS[holder.role];
  }
  return normalizePermissions(holder.customRole?.permissions ?? []);
}

/** The area a permission belongs to: `catalog` for `catalog:write`. */
function areaOf(permission: Permission): string {
  return permission.slice(0, permission.lastIndexOf(':'));
}

/**
 * Cleans a list of permissions: unknown entries and doubles go, the order
 * becomes that of PERMISSIONS, and changing an area includes seeing it.
 */
export function normalizePermissions(values: readonly string[]): Permission[] {
  const known = values.filter(isPermission);
  const wanted = new Set<string>(known);
  for (const permission of known) {
    if (permission.endsWith(':write')) {
      const read = `${areaOf(permission)}:read`;
      if (isPermission(read)) {
        wanted.add(read);
      }
    }
  }
  return PERMISSIONS.filter((permission) => wanted.has(permission));
}

/** The entries of `wanted` that `granted` does not hold. */
export function missingPermissions(
  granted: readonly Permission[],
  wanted: readonly Permission[],
): Permission[] {
  return wanted.filter((permission) => !granted.includes(permission));
}

/**
 * Permissions an API key actually has: the scopes stored on the key, limited
 * to what its creator may do today and to what can be delegated at all.
 * A key therefore loses access when its creator is moved to a lower role, or
 * when the custom role of its creator loses a permission.
 */
export function effectiveApiKeyPermissions(
  scopes: readonly string[],
  creatorPermissions: readonly Permission[],
): Permission[] {
  const held = new Set<string>(creatorPermissions);

  return scopes.filter(
    (scope): scope is Permission =>
      isPermission(scope) && held.has(scope) && !NON_DELEGABLE_PERMISSIONS.includes(scope),
  );
}

export function hasAllPermissions(
  granted: readonly Permission[],
  required: readonly Permission[],
): boolean {
  return required.every((permission) => granted.includes(permission));
}
