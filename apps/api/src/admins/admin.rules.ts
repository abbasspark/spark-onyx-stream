// SPDX-License-Identifier: AGPL-3.0-only
import type { AdminRole } from '@onyx/database';

/** The part of an admin the rules need. */
export interface AdminSubject {
  id: string;
  role: AdminRole;
  isActive: boolean;
}

export interface AdminChange {
  role?: AdminRole;
  isActive?: boolean;
  password?: string;
  displayName?: string;
}

/**
 * Decides whether an admin may create another admin with the given role.
 *
 * @returns A reason when the action is not allowed, otherwise null.
 */
export function createDenialReason(actor: AdminSubject, newRole: AdminRole): string | null {
  if (newRole === 'OWNER' && actor.role !== 'OWNER') {
    return 'Only an owner can create another owner';
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
    if (change.role !== undefined && change.role !== target.role) {
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

  if (target.role === 'OWNER' && actor.role !== 'OWNER') {
    return 'Only an owner can change another owner';
  }
  if (change.role === 'OWNER' && actor.role !== 'OWNER') {
    return 'Only an owner can make someone an owner';
  }

  return null;
}

/** True when the change takes owner rights away from an active owner. */
export function removesActiveOwner(target: AdminSubject, change: AdminChange): boolean {
  if (target.role !== 'OWNER' || !target.isActive) {
    return false;
  }
  const demoted = change.role !== undefined && change.role !== 'OWNER';
  const deactivated = change.isActive === false;
  return demoted || deactivated;
}

/** True when the change should sign the target out everywhere. */
export function requiresSessionRevocation(target: AdminSubject, change: AdminChange): boolean {
  return (
    change.isActive === false ||
    change.password !== undefined ||
    (change.role !== undefined && change.role !== target.role)
  );
}
