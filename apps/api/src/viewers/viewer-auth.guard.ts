// SPDX-License-Identifier: AGPL-3.0-only
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { AppConfig } from '../config/app-config.js';
import { isSameSiteRequest } from './cookies.js';
import { type ViewerIdentity, ViewerSessionService } from './viewer-session.service.js';

type ViewerRequest = Request & { viewerIdentity?: ViewerIdentity };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Lets a request through only when it comes from a signed-in viewer.
 *
 * A token in the cookie is accepted for a request that changes something only
 * when the request comes from this site itself, so another website cannot act
 * in a viewer's name.
 */
@Injectable()
export class ViewerAuthGuard implements CanActivate {
  constructor(
    @Inject(ViewerSessionService) private readonly sessions: ViewerSessionService,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ViewerRequest>();
    const credentials = this.sessions.credentials(request);
    if (!credentials) {
      throw new UnauthorizedException('Sign in to continue');
    }
    if (
      credentials.source === 'cookie' &&
      !SAFE_METHODS.has(request.method) &&
      !isSameSiteRequest(request, this.config.corsOrigins)
    ) {
      throw new ForbiddenException('This request did not come from this site');
    }

    const identity = await this.sessions.validate(credentials.token);
    if (!identity) {
      throw new UnauthorizedException('Your session has ended. Sign in again.');
    }
    request.viewerIdentity = identity;
    return true;
  }
}

/**
 * Marks an endpoint as one for signed-in viewers. Admin credentials do not
 * open it, and viewer credentials open nothing else.
 */
export const ViewerOnly = () => applyDecorators(Public(), UseGuards(ViewerAuthGuard));

/** The signed-in viewer and their session, on an endpoint marked @ViewerOnly(). */
export const CurrentViewer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ViewerIdentity => {
    const identity = context.switchToHttp().getRequest<ViewerRequest>().viewerIdentity;
    if (!identity) {
      throw new UnauthorizedException('Sign in to continue');
    }
    return identity;
  },
);
