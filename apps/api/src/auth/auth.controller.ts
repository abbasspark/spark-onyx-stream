// SPDX-License-Identifier: AGPL-3.0-only
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminView } from '../admins/admin.view.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import {
  AdminSessionOnly,
  AllowWithoutTwoFactor,
  CurrentPrincipal,
  Public,
} from './auth.decorators.js';
import {
  type ChangePasswordInput,
  changePasswordSchema,
  type LoginInput,
  loginSchema,
  type SetupInput,
  setupSchema,
  type TwoFactorBeginInput,
  twoFactorBeginSchema,
  type TwoFactorConfirmInput,
  twoFactorConfirmSchema,
  type TwoFactorProveInput,
  twoFactorProveSchema,
} from './auth.schemas.js';
import {
  TwoFactorService,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from './two-factor.service.js';
import { AuthService, type LoginResult } from './auth.service.js';
import type { AdminPrincipal, Principal } from './principal.js';
import { requestInfo } from './request-info.js';

/**
 * A person types a code a few times. This is little enough that a code
 * cannot be found by trying, also by someone who holds a session.
 */
const CODES = { name: 'admin-two-factor', limit: 10, windowSeconds: 600 } as const;

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(TwoFactorService) private readonly twoFactor: TwoFactorService,
  ) {}

  /** Tells the admin panel whether to show the first-run setup screen. */
  @Public()
  @Get('setup')
  async setupStatus(): Promise<{ required: boolean }> {
    return { required: await this.auth.isSetupRequired() };
  }

  /** Creates the first owner. Available only while no admin exists. */
  @Public()
  @Post('setup')
  setup(
    @Body(new ZodValidationPipe(setupSchema)) body: SetupInput,
    @Req() request: Request,
  ): Promise<AdminView> {
    return this.auth.setup(body, requestInfo(request));
  }

  /** Signs an admin in with email and password. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: Request,
  ): Promise<LoginResult> {
    return this.auth.login(body, requestInfo(request));
  }

  @AdminSessionOnly()
  @AllowWithoutTwoFactor()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.logout(principal, requestInfo(request));
  }

  /** The authenticated caller: an admin or an API key, with its permissions. */
  @AllowWithoutTwoFactor()
  @Get('me')
  me(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }

  @AdminSessionOnly()
  @AllowWithoutTwoFactor()
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.changePassword(principal, body, requestInfo(request));
  }

  /** Where the caller stands with two-factor sign-in. */
  @AdminSessionOnly()
  @AllowWithoutTwoFactor()
  @Get('two-factor')
  twoFactorStatus(@CurrentPrincipal() principal: AdminPrincipal): Promise<TwoFactorStatus> {
    return this.twoFactor.status(principal.adminId);
  }

  /** Starts setting it up: answers with the secret for the authenticator app. */
  @AdminSessionOnly()
  @AllowWithoutTwoFactor()
  @RateLimit(CODES)
  @Post('two-factor/setup')
  @HttpCode(HttpStatus.OK)
  twoFactorBegin(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Body(new ZodValidationPipe(twoFactorBeginSchema)) body: TwoFactorBeginInput,
  ): Promise<TwoFactorSetup> {
    return this.twoFactor.begin(principal, body.password);
  }

  /** Switches it on with the first code from the app. Answers with the recovery codes, once. */
  @AdminSessionOnly()
  @AllowWithoutTwoFactor()
  @RateLimit(CODES)
  @Post('two-factor/enable')
  @HttpCode(HttpStatus.OK)
  twoFactorConfirm(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Body(new ZodValidationPipe(twoFactorConfirmSchema)) body: TwoFactorConfirmInput,
    @Req() request: Request,
  ): Promise<{ recoveryCodes: string[] }> {
    return this.twoFactor.confirm(principal, body.code, requestInfo(request));
  }

  /** Switches it off. Needs the password and a code. */
  @AdminSessionOnly()
  @RateLimit(CODES)
  @Post('two-factor/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async twoFactorDisable(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Body(new ZodValidationPipe(twoFactorProveSchema)) body: TwoFactorProveInput,
    @Req() request: Request,
  ): Promise<void> {
    await this.twoFactor.disable(principal, body.password, body.code, requestInfo(request));
  }

  /** Makes new recovery codes and ends the old ones. Needs the password and a code. */
  @AdminSessionOnly()
  @RateLimit(CODES)
  @Post('two-factor/recovery-codes')
  @HttpCode(HttpStatus.OK)
  twoFactorRecoveryCodes(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Body(new ZodValidationPipe(twoFactorProveSchema)) body: TwoFactorProveInput,
    @Req() request: Request,
  ): Promise<{ recoveryCodes: string[] }> {
    return this.twoFactor.regenerate(principal, body.password, body.code, requestInfo(request));
  }
}
