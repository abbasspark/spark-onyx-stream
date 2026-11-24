// SPDX-License-Identifier: AGPL-3.0-only
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { stricter, withAudience } from '../audience/audience.js';
import { LOCKED_AGE, MAX_PROFILE_AGE } from '../catalog/age-rating.js';
import type { ViewerRequest } from './viewer-auth.guard.js';
import { type ViewerIdentity, ViewerSessionService } from './viewer-session.service.js';

/** Addresses where anyone may ask for a stricter view of the catalog. */
const OPEN_CATALOG = /^\/v\d+\/catalog(\/|$)/;

/** A limit asked for in the address: a whole number of years. Anything else asks for none. */
export function readMaxAge(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,2}$/.test(value)) {
    return null;
  }
  return Math.min(Number(value), MAX_PROFILE_AGE);
}

/**
 * Works out who a request is answered for, and answers it on their behalf.
 *
 * The age limit comes from two places, and the stricter one counts:
 *
 * - **The profile of the sign-in.** This is the one that cannot be talked
 *   around: it is read from the session, whatever the request says.
 * - **`maxAge` in the address** of the open catalog. Anyone may ask to see
 *   less. The website does, so the pages its server renders for a child's
 *   profile differ by their address and can still be cached.
 *
 * An answer that was narrowed by a sign-in is marked private, so no cache
 * hands it to somebody else, or hands somebody else's to this viewer.
 */
@Injectable()
export class AudienceInterceptor implements NestInterceptor {
  constructor(
    @Inject(ViewerSessionService) private readonly sessions: ViewerSessionService,
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const http = context.switchToHttp();
    const request = http.getRequest<Request & ViewerRequest>();
    const fromSession = await this.limitOfSession(request);
    const fromAddress = OPEN_CATALOG.test(request.path) ? readMaxAge(request.query.maxAge) : null;
    if (fromSession !== null) {
      keepPrivate(http.getResponse<Response>());
    }
    const audience = { maxAge: stricter(fromSession, fromAddress) };
    return new Observable((subscriber) =>
      withAudience(audience, () => next.handle().subscribe(subscriber)),
    );
  }

  private async limitOfSession(request: Request & ViewerRequest): Promise<number | null> {
    // An endpoint for viewers has looked the sign-in up already.
    const identity: ViewerIdentity | null =
      request.viewerIdentity ?? (await this.sessions.identify(request));
    if (!identity) {
      return null;
    }
    const { session, viewer } = identity;
    if (session.profileLocked) {
      return LOCKED_AGE;
    }
    if (!session.profileId) {
      return null;
    }
    const profile = await this.prisma.viewerProfile.findFirst({
      where: { id: session.profileId, viewerId: viewer.id },
      select: { maxAge: true },
    });
    return profile?.maxAge ?? null;
  }
}

/**
 * Marks an answer as for this viewer alone. Endpoints of the catalog say
 * "public" by themselves, after this runs, so that later word is ignored.
 */
function keepPrivate(response: Response): void {
  response.setHeader('Cache-Control', 'private, no-store');
  const setHeader = response.setHeader.bind(response);
  response.setHeader = ((name: string, value: number | string | readonly string[]) =>
    name.toLowerCase() === 'cache-control'
      ? response
      : setHeader(name, value)) as Response['setHeader'];
}
