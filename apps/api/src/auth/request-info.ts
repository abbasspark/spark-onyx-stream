// SPDX-License-Identifier: AGPL-3.0-only
import type { Request } from 'express';

const MAX_USER_AGENT_LENGTH = 512;

export interface RequestInfo {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Extracts the client details that are stored with sessions and audit entries. */
export function requestInfo(request: Request): RequestInfo {
  const userAgent = request.headers['user-agent'];

  return {
    ipAddress: request.ip ?? null,
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}

/** Reads the token from an "Authorization: Bearer <token>" header. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}
