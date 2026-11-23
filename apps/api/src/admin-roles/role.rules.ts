// SPDX-License-Identifier: AGPL-3.0-only
import type { AdminSubject } from '../admins/admin.rules.js';
import {
  type BuiltInRole,
  missingPermissions,
  type Permission,
  permissionsOfRole,
} from '../auth/permissions.js';

/** The colours a role badge can have. The panel knows how each one looks. */
export const ROLE_COLORS = [
  'slate',
  'blue',
  'cyan',
  'teal',
  'green',
  'amber',
  'orange',
  'rose',
  'violet',
] as const;
export type RoleColor = (typeof ROLE_COLORS)[number];

/** How many roles can be made. Far more than a team needs; it stops a runaway script. */
export const MAX_CUSTOM_ROLES = 100;

/** The roles that ship with the software, as the panel lists them. */
export const BUILT_IN_ROLE_INFO: Record<
  BuiltInRole,
  { name: string; description: string; color: RoleColor }
> = {
  OWNER: {
    name: 'Owner',
    description:
      'May do everything, and is the only one who can change other owners. There is always at least one.',
    color: 'amber',
  },
  ADMIN: {
    name: 'Admin',
    description: 'May do everything except change owners.',
    color: 'violet',
  },
  EDITOR: {
    name: 'Editor',
    description:
      'Manages titles, media files and encoding. Cannot reach viewers, billing, settings or admins.',
    color: 'blue',
  },
  VIEWER: {
    name: 'Viewer',
    description: 'Sees the content and the analytics, and changes nothing.',
    color: 'slate',
  },
};

/** Names a custom role cannot take, so two badges never read the same. */
export function isReservedRoleName(name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return Object.values(BUILT_IN_ROLE_INFO).some((info) => info.name.toLowerCase() === wanted);
}

/** A custom role as far as the rules need it. */
export interface RoleSubject {
  id: string;
  permissions: readonly Permission[];
}

function list(permissions: readonly Permission[]): string {
  return permissions.join(', ');
}

/**
 * Decides whether an admin may make a role with these permissions.
 *
 * A role is a way to hand permissions to someone, so nobody builds one that
 * may do more than they can themselves.
 *
 * @returns A reason when it is not allowed, otherwise null.
 */
export function roleCreateDenialReason(
  actor: AdminSubject,
  permissions: readonly Permission[],
): string | null {
  const missing = missingPermissions(actor.permissions, permissions);
  if (missing.length > 0) {
    return `You cannot put into a role what you may not do yourself: ${list(missing)}`;
  }
  return null;
}

/**
 * Decides whether an admin may change or delete a role.
 *
 * @param next The permissions after the change. Leave out when they stay.
 * @returns A reason when it is not allowed, otherwise null.
 */
export function roleChangeDenialReason(
  actor: AdminSubject,
  role: RoleSubject,
  next?: readonly Permission[],
): string | null {
  if (actor.customRoleId === role.id) {
    return 'You cannot change the role you hold yourself';
  }
  if (missingPermissions(actor.permissions, role.permissions).length > 0) {
    return 'You cannot change a role that may do more than your own';
  }
  return next ? roleCreateDenialReason(actor, next) : null;
}

/** What changed between two lists of permissions, for the audit log. */
export function permissionChanges(
  before: readonly Permission[],
  after: readonly Permission[],
): { added: Permission[]; removed: Permission[] } {
  return {
    added: after.filter((permission) => !before.includes(permission)),
    removed: before.filter((permission) => !after.includes(permission)),
  };
}

/**
 * The built-in role closest to a list of permissions without going over it:
 * what a custom role is "like", shown as a hint in the panel.
 */
export function closestBuiltIn(permissions: readonly Permission[]): BuiltInRole | null {
  const candidates: BuiltInRole[] = ['ADMIN', 'EDITOR', 'VIEWER'];
  for (const candidate of candidates) {
    if (missingPermissions(permissions, permissionsOfRole(candidate)).length === 0) {
      return candidate;
    }
  }
  return null;
}
