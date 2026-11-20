// SPDX-License-Identifier: AGPL-3.0-only
import type { AdminRole, AdminUser } from '@onyx/database';

/** An admin as returned by the API. Never includes the password hash or TOTP secret. */
export interface AdminView {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminView(admin: AdminUser): AdminView {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}
