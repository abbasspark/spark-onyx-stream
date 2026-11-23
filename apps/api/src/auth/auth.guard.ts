// SPDX-License-Identifier: AGPL-3.0-only
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyAuthService } from '../api-keys/api-key-auth.service.js';
import { AppConfig } from '../config/app-config.js';
import {
  ADMIN_SESSION_ONLY_KEY,
  ALLOW_WITHOUT_TWO_FACTOR_KEY,
  IS_PUBLIC_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from './auth.decorators.js';
import { hasAllPermissions, type Permission, permissionsOf } from './permissions.js';
import type { AuthenticatedRequest, Principal } from './principal.js';
import { bearerToken } from './request-info.js';
import { SessionService } from './session.service.js';
import { credentialKind } from './tokens.js';

/**
 * Global guard. Every endpoint needs valid credentials unless marked @Public().
 *
 * It authenticates the bearer token as a session or an API key, attaches the
 * resulting principal to the request, then enforces @AdminSessionOnly() and
 * @RequirePermissions().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ApiKeyAuthService) private readonly apiKeys: ApiKeyAuthService,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = await this.authenticate(request);
    request.principal = principal;

    if (
      this.reflector.getAllAndOverride<boolean>(ADMIN_SESSION_ONLY_KEY, targets) &&
      principal.type !== 'admin'
    ) {
      throw new ForbiddenException('This action needs a signed-in admin, not an API key');
    }

    if (
      principal.type === 'admin' &&
      principal.twoFactorSetupRequired &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_TWO_FACTOR_KEY, targets)
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'two_factor_setup_required',
        message: 'Set up two-factor sign-in first. This installation asks every admin for it.',
      });
    }

    const required =
      this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS_KEY, targets) ?? [];
    if (!hasAllPermissions(principal.permissions, required)) {
      throw new ForbiddenException('You do not have permission to do this');
    }

    return true;
  }

  private async authenticate(request: AuthenticatedRequest): Promise<Principal> {
    const token = bearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    switch (credentialKind(token)) {
      case 'session': {
        const found = await this.sessions.validate(token);
        if (!found) {
          throw new UnauthorizedException('Session is invalid or has expired');
        }
        return {
          type: 'admin',
          adminId: found.admin.id,
          sessionId: found.session.id,
          email: found.admin.email,
          displayName: found.admin.displayName,
          role: found.admin.role,
          customRole: found.admin.customRole
            ? {
                id: found.admin.customRole.id,
                name: found.admin.customRole.name,
                color: found.admin.customRole.color,
              }
            : null,
          permissions: permissionsOf(found.admin),
          twoFactorEnabled: found.admin.totpEnabledAt !== null,
          twoFactorSetupRequired:
            this.config.adminTwoFactorRequired && found.admin.totpEnabledAt === null,
        };
      }
      case 'apiKey': {
        const principal = await this.apiKeys.authenticate(token);
        if (!principal) {
          throw new UnauthorizedException('API key is invalid, expired or revoked');
        }
        return principal;
      }
      default:
        throw new UnauthorizedException('Unrecognized credentials');
    }
  }
}
