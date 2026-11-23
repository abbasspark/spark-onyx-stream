// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyAuthService } from '../api-keys/api-key-auth.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { CryptoModule } from '../crypto/crypto.module.js';
import { SessionService } from './session.service.js';
import { TwoFactorService } from './two-factor.service.js';

/**
 * Authentication for the admin API.
 *
 * Registers AuthGuard for every route, so new endpoints are protected by
 * default and have to opt out with @Public().
 */
@Global()
@Module({
  imports: [CryptoModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TwoFactorService,
    SessionService,
    LoginThrottleService,
    ApiKeyAuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionService, LoginThrottleService, TwoFactorService],
})
export class AuthModule {}
