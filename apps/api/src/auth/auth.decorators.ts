// SPDX-License-Identifier: AGPL-3.0-only
import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { Permission } from './permissions.js';
import type { AuthenticatedRequest, Principal } from './principal.js';

export const IS_PUBLIC_KEY = 'onyx:isPublic';
export const REQUIRED_PERMISSIONS_KEY = 'onyx:requiredPermissions';
export const ADMIN_SESSION_ONLY_KEY = 'onyx:adminSessionOnly';

/** Marks an endpoint as reachable without credentials. Every other endpoint needs them. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Lists the permissions the caller needs. All of them are required. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const ALLOW_WITHOUT_TWO_FACTOR_KEY = 'onyx:allowWithoutTwoFactor';

/**
 * Leaves an endpoint open to an admin who still has to set up two-factor
 * sign-in on an installation that asks for it: what is needed to do exactly that.
 */
export const AllowWithoutTwoFactor = () => SetMetadata(ALLOW_WITHOUT_TWO_FACTOR_KEY, true);

/** Restricts an endpoint to signed-in admins. API keys are rejected. */
export const AdminSessionOnly = () => SetMetadata(ADMIN_SESSION_ONLY_KEY, true);

/** Injects the authenticated caller into a handler parameter. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) {
      throw new UnauthorizedException();
    }
    return request.principal;
  },
);
