// SPDX-License-Identifier: AGPL-3.0-only
import type { AdminCustomRole, AdminRole, AdminUser } from '@onyx/database';
import { type Permission, permissionsOf } from '../auth/permissions.js';
import type { AdminSubject } from './admin.rules.js';

/** The custom role of an admin, as far as a list needs it. */
export interface CustomRoleRef {
  id: string;
  name: string;
  color: string;
}

/** An admin as returned by the API. Never includes the password hash or TOTP secret. */
export interface AdminView {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  /** The role made in the panel that this admin holds. Set when role is CUSTOM. */
  customRole: CustomRoleRef | null;
  isActive: boolean;
  /** Whether a code is asked for when this admin signs in. */
  twoFactorEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** An admin read together with the custom role they hold. */
export type AdminWithRole = AdminUser & { customRole: AdminCustomRole | null };

export function toAdminView(admin: AdminUser & { customRole?: AdminCustomRole | null }): AdminView {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    customRole: admin.customRole
      ? { id: admin.customRole.id, name: admin.customRole.name, color: admin.customRole.color }
      : null,
    isActive: admin.isActive,
    twoFactorEnabled: admin.totpEnabledAt !== null,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

/** The part of a stored admin the rules decide on. */
export function subjectOfAdmin(admin: AdminWithRole): AdminSubject {
  return {
    id: admin.id,
    isActive: admin.isActive,
    role: admin.role,
    customRoleId: admin.customRoleId,
    permissions: permissionsOf(admin),
  };
}

/** The part of the signed-in admin the rules decide on. */
export function subjectOfPrincipal(principal: {
  adminId: string;
  role: AdminRole;
  customRole: CustomRoleRef | null;
  permissions: readonly Permission[];
}): AdminSubject {
  return {
    id: principal.adminId,
    isActive: true,
    role: principal.role,
    customRoleId: principal.customRole?.id ?? null,
    permissions: principal.permissions,
  };
}
