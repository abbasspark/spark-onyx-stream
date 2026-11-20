// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { type AdminSession, type AdminUser, PrismaClient } from '@onyx/database';
import type { RequestInfo } from './request-info.js';
import { generateSessionToken, hashToken } from './tokens.js';

/** How long a session lasts after login. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** lastUsedAt is refreshed at most this often, to avoid a database write on every request. */
const LAST_USED_REFRESH_MS = 5 * 60 * 1000;

export interface CreatedSession {
  /** The token for the client. It cannot be recovered later. */
  token: string;
  session: AdminSession;
}

@Injectable()
export class SessionService {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async create(adminId: string, info: RequestInfo): Promise<CreatedSession> {
    const { token, tokenHash } = generateSessionToken();

    const session = await this.prisma.adminSession.create({
      data: {
        adminId,
        tokenHash,
        ipAddress: info.ipAddress,
        userAgent: info.userAgent,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return { token, session };
  }

  /**
   * Finds the session for a token and its admin.
   * Returns null when the token is unknown, revoked or expired, or the admin is deactivated.
   */
  async validate(token: string): Promise<{ session: AdminSession; admin: AdminUser } | null> {
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { admin: true },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    if (!session.admin.isActive) {
      return null;
    }

    if (Date.now() - session.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
      await this.prisma.adminSession.update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      });
    }

    const { admin, ...sessionOnly } = session;
    return { session: sessionOnly, admin };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revokes every active session of an admin, optionally keeping one.
   * Used after a password change, a role change and deactivation.
   *
   * @returns The number of sessions revoked.
   */
  async revokeAllForAdmin(adminId: string, exceptSessionId?: string): Promise<number> {
    const result = await this.prisma.adminSession.updateMany({
      where: {
        adminId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }
}
