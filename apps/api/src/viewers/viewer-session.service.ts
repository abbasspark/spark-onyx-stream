// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Viewer, type ViewerDevice, type ViewerSession } from '@onyx/database';
import type { Request } from 'express';
import { CLIENT_HEADER, parseClient } from '../app-versions/app-version.rules.js';
import { bearerToken, type RequestInfo } from '../auth/request-info.js';
import { generateViewerToken, hashToken, VIEWER_TOKEN_PREFIX } from '../auth/tokens.js';
import { readCookie, VIEWER_COOKIE } from './cookies.js';

/** How long a viewer stays signed in on a device. */
export const VIEWER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** lastUsedAt is refreshed at most this often, to avoid a database write on every request. */
const LAST_USED_REFRESH_MS = 5 * 60 * 1000;

export interface CreatedViewerSession {
  /** The token for the client. It cannot be recovered later. */
  token: string;
  session: ViewerSession;
}

export interface ViewerCredentials {
  token: string;
  /** Where the token came from. A cookie needs protection against other websites. */
  source: 'cookie' | 'header';
}

/** A viewer who is signed in, with the session of the request. */
export interface ViewerIdentity {
  viewer: Viewer;
  session: ViewerSession;
}

/** A session that still works. */
export const ACTIVE_SESSION = () => ({ revokedAt: null, expiresAt: { gt: new Date() } });

@Injectable()
export class ViewerSessionService {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /**
   * Finds the viewer token of a request: in the Authorization header, as apps
   * send it, or in the cookie, as the website does.
   */
  credentials(request: Request): ViewerCredentials | null {
    const header = bearerToken(request);
    if (header?.startsWith(VIEWER_TOKEN_PREFIX)) {
      return { token: header, source: 'header' };
    }
    const cookie = readCookie(request, VIEWER_COOKIE);
    if (cookie?.startsWith(VIEWER_TOKEN_PREFIX)) {
      return { token: cookie, source: 'cookie' };
    }
    return null;
  }

  /** @param deviceId The app the sign-in belongs to. Left out for a browser. */
  async create(
    viewerId: string,
    info: RequestInfo,
    deviceId: string | null = null,
  ): Promise<CreatedViewerSession> {
    const { token, tokenHash } = generateViewerToken();
    // A sign-in starts in the main profile. Where that has a PIN, it has to be entered first.
    const main = await this.prisma.viewerProfile.findFirst({
      where: { viewerId, isMain: true },
      select: { pinHash: true },
    });
    const session = await this.prisma.viewerSession.create({
      data: {
        viewerId,
        deviceId,
        profileLocked: Boolean(main?.pinHash),
        tokenHash,
        ipAddress: info.ipAddress,
        userAgent: info.userAgent,
        expiresAt: new Date(Date.now() + VIEWER_SESSION_TTL_MS),
      },
    });
    return { token, session };
  }

  /**
   * Finds the viewer for a token.
   *
   * @param appVersion The version the app names itself with, kept with its device.
   * @returns Null when the token is unknown, ended or expired, or the viewer is disabled.
   */
  async validate(token: string, appVersion: string | null = null): Promise<ViewerIdentity | null> {
    const found = await this.prisma.viewerSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { viewer: true },
    });
    if (!found || found.revokedAt || found.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    if (found.viewer.status !== 'ACTIVE') {
      return null;
    }

    if (Date.now() - found.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
      await this.prisma.viewerSession.update({
        where: { id: found.id },
        data: { lastUsedAt: new Date() },
      });
      // The device is as recently used as its sign-in, and says which version it runs.
      if (found.deviceId) {
        await this.prisma.viewerDevice.updateMany({
          where: { id: found.deviceId },
          data: { lastSeenAt: new Date(), ...(appVersion ? { appVersion } : {}) },
        });
      }
    }
    const { viewer, ...session } = found;
    return { viewer, session };
  }

  /** The version of the app a request comes from, when the app names itself. */
  appVersion(request: Request): string | null {
    return parseClient(request.headers[CLIENT_HEADER])?.version ?? null;
  }

  /** The signed-in viewer of a request, or null. Never throws for bad credentials. */
  async identify(request: Request): Promise<ViewerIdentity | null> {
    const credentials = this.credentials(request);
    return credentials ? this.validate(credentials.token, this.appVersion(request)) : null;
  }

  /** Ends one session of a viewer. Does nothing when it is not theirs. */
  async revoke(viewerId: string, sessionId: string): Promise<boolean> {
    const result = await this.prisma.viewerSession.updateMany({
      where: { id: sessionId, viewerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  /**
   * Ends every session of a viewer, optionally keeping one.
   *
   * @returns The number of sessions ended.
   */
  async revokeAll(viewerId: string, exceptSessionId?: string): Promise<number> {
    const result = await this.prisma.viewerSession.updateMany({
      where: {
        viewerId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  listActive(viewerId: string): Promise<(ViewerSession & { device: ViewerDevice | null })[]> {
    return this.prisma.viewerSession.findMany({
      where: { viewerId, ...ACTIVE_SESSION() },
      orderBy: { lastUsedAt: 'desc' },
      include: { device: true },
    });
  }
}
