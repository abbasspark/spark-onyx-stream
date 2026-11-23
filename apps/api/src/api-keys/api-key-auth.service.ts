// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { effectiveApiKeyPermissions, permissionsOf } from '../auth/permissions.js';
import type { ApiKeyPrincipal } from '../auth/principal.js';
import { hashToken } from '../auth/tokens.js';

/** lastUsedAt is refreshed at most this often, to avoid a database write on every request. */
const LAST_USED_REFRESH_MS = 5 * 60 * 1000;

/** Turns an API key into a principal. Lives apart from key management so the guard can use it. */
@Injectable()
export class ApiKeyAuthService {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /**
   * Returns the principal for a key, or null when the key is unknown, revoked
   * or expired, or the admin who created it has been deactivated.
   */
  async authenticate(key: string): Promise<ApiKeyPrincipal | null> {
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashToken(key) },
      include: { createdBy: { include: { customRole: true } } },
    });

    if (!apiKey || apiKey.revokedAt) {
      return null;
    }
    if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    if (!apiKey.createdBy.isActive) {
      return null;
    }

    const lastUsed = apiKey.lastUsedAt?.getTime() ?? 0;
    if (Date.now() - lastUsed > LAST_USED_REFRESH_MS) {
      await this.prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      });
    }

    return {
      type: 'apiKey',
      apiKeyId: apiKey.id,
      adminId: apiKey.createdById,
      name: apiKey.name,
      permissions: effectiveApiKeyPermissions(apiKey.scopes, permissionsOf(apiKey.createdBy)),
    };
  }
}
