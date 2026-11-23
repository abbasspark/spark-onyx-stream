// SPDX-License-Identifier: AGPL-3.0-only
import type { AdminRole } from '@onyx/database';
import { missingPermissions, type Permission } from '../auth/permissions.js';

/** A role as it is given to an admin: built in, or one made in the panel. */
export interface RoleAssignment {
  role: AdminRole;
  /** Which custom role. Set when role is CUSTOM, and only then. */
  customRoleId: string | null;
  /** What the role lets its holder do. */
  permissions: readonly Permission[];
}

/** The part of an admin the rules need. */
export interface AdminSubject extends RoleAssignment {
  id: string;
  isActive: boolean;
}

export interface AdminChange {
  role?: RoleAssignment;
  isActive?: boolean;
  password?: string;
  displayName?: string;
}

function sameRole(a: RoleAssignment, b: RoleAssignment): boolean {
  return a.role === b.role && a.customRoleId === b.customRoleId;
}

/**
 * Decides whether an admin may hand out a role.
 *
 * Nobody gives away more than they hold: otherwise an admin who may only
 * manage admins could make a second account that may do everything.
 *
 * @returns A reason when it is not allowed, otherwise null.
 */
export function grantDenialReason(actor: AdminSubject, role: RoleAssignment): string | null {
  if (role.role === 'OWNER' && actor.role !== 'OWNER') {
    return 'Only an owner can make someone an owner';
  }
  if (missingPermissions(actor.permissions, role.permissions).length > 0) {
    return 'You cannot give a role that may do more than your own';
  }
  return null;
}

/**
 * Decides whether an admin may create another admin with the given role.
 *
 * @returns A reason when the action is not allowed, otherwise null.
 */
export function createDenialReason(actor: AdminSubject, role: RoleAssignment): string | null {
  if (role.role === 'OWNER' && actor.role !== 'OWNER') {
    return 'Only an owner can create another owner';
  }
  return grantDenialReason(actor, role);
}

/**
 * Decides whether an admin may touch another admin at all: rename them, reset
 * their password, deactivate them or take their two-factor sign-in off.
 *
 * Resetting a password is a way into the account, so it is only open to
 * someone who may already do everything the target may.
 *
 * @returns A reason when it is not allowed, otherwise null.
 */
export function manageDenialReason(actor: AdminSubject, target: AdminSubject): string | null {
  if (target.role === 'OWNER' && actor.role !== 'OWNER') {
    return 'Only an owner can change another owner';
  }
  if (missingPermissions(actor.permissions, target.permissions).length > 0) {
    return 'You cannot change an admin who may do more than you';
  }
  return null;
}

/**
 * Decides whether an admin may apply a change to another admin (or to themselves).
 *
 * The rule that the last active owner cannot be removed needs a database
 * count and is checked separately in AdminsService.
 *
 * @returns A reason when the change is not allowed, otherwise null.
 */
export function updateDenialReason(
  actor: AdminSubject,
  target: AdminSubject,
  change: AdminChange,
): string | null {
  const isSelf = actor.id === target.id;

  if (isSelf) {
    if (change.role !== undefined && !sameRole(change.role, target)) {
      return 'You cannot change your own role';
    }
    if (change.isActive === false) {
      return 'You cannot deactivate your own account';
    }
    if (change.password !== undefined) {
      return 'Change your own password under your account settings';
    }
    return null;
  }

  const denial = manageDenialReason(actor, target);
  if (denial) {
    return denial;
  }
  if (change.role !== undefined && !sameRole(change.role, target)) {
    return grantDenialReason(actor, change.role);
  }

  return null;
}

/** True when the change takes owner rights away from an active owner. */
export function removesActiveOwner(target: AdminSubject, change: AdminChange): boolean {
  if (target.role !== 'OWNER' || !target.isActive) {
    return false;
  }
  const demoted = change.role !== undefined && change.role.role !== 'OWNER';
  const deactivated = change.isActive === false;
  return demoted || deactivated;
}

/** True when the change should sign the target out everywhere. */
export function requiresSessionRevocation(target: AdminSubject, change: AdminChange): boolean {
  return (
    change.isActive === false ||
    change.password !== undefined ||
    (change.role !== undefined && !sameRole(change.role, target))
  );
}
