// SPDX-License-Identifier: AGPL-3.0-only
import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminView } from '../admins/admin.view.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AdminSessionOnly, CurrentPrincipal, Public } from './auth.decorators.js';
import {
  type ChangePasswordInput,
  changePasswordSchema,
  type LoginInput,
  loginSchema,
  type SetupInput,
  setupSchema,
} from './auth.schemas.js';
import { AuthService, type LoginResult } from './auth.service.js';
import type { AdminPrincipal, Principal } from './principal.js';
import { requestInfo } from './request-info.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

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
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.logout(principal, requestInfo(request));
  }

  /** The authenticated caller: an admin or an API key, with its permissions. */
  @Get('me')
  me(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }

  @AdminSessionOnly()
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.changePassword(principal, body, requestInfo(request));
  }
}
