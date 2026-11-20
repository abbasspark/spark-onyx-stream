// SPDX-License-Identifier: AGPL-3.0-only
import type { AdminRole } from '@onyx/database';
import type { Request } from 'express';
import type { Permission } from './permissions.js';

/** A signed-in admin using a session token. */
export interface AdminPrincipal {
  type: 'admin';
  adminId: string;
  sessionId: string;
  email: string;
  displayName: string;
  role: AdminRole;
  permissions: readonly Permission[];
}

/** A program using an API key. It acts with a subset of its creator's permissions. */
export interface ApiKeyPrincipal {
  type: 'apiKey';
  apiKeyId: string;
  /** The admin who created the key. Used as the actor in the audit log. */
  adminId: string;
  name: string;
  permissions: readonly Permission[];
}

export type Principal = AdminPrincipal | ApiKeyPrincipal;

/** Request after the authentication guard has run. */
export type AuthenticatedRequest = Request & { principal?: Principal };
