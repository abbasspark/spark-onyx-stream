// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminSessionOnly, CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { AdminPrincipal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { TwoFactorService } from '../auth/two-factor.service.js';
import { type Page, type PaginationInput, paginationSchema } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AdminView } from './admin.view.js';
import {
  type CreateAdminInput,
  createAdminSchema,
  type UpdateAdminInput,
  updateAdminSchema,
} from './admins.schemas.js';
import { AdminsService } from './admins.service.js';

@Controller('admins')
export class AdminsController {
  constructor(
    @Inject(AdminsService) private readonly admins: AdminsService,
    @Inject(TwoFactorService) private readonly twoFactor: TwoFactorService,
  ) {}

  @Get()
  @RequirePermissions('admins:read')
  list(
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationInput,
  ): Promise<Page<AdminView>> {
    return this.admins.list(query);
  }

  @Get(':id')
  @RequirePermissions('admins:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminView> {
    return this.admins.get(id);
  }

  @Post()
  @AdminSessionOnly()
  @RequirePermissions('admins:write')
  create(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Body(new ZodValidationPipe(createAdminSchema)) body: CreateAdminInput,
    @Req() request: Request,
  ): Promise<AdminView> {
    return this.admins.create(principal, body, requestInfo(request).ipAddress);
  }

  @Patch(':id')
  @AdminSessionOnly()
  @RequirePermissions('admins:write')
  update(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAdminSchema)) body: UpdateAdminInput,
    @Req() request: Request,
  ): Promise<AdminView> {
    return this.admins.update(principal, id, body, requestInfo(request).ipAddress);
  }

  /**
   * Takes two-factor sign-in off an admin who lost their phone and their
   * recovery codes, and signs them out. They set it up again after signing in.
   */
  @Delete(':id/two-factor')
  @AdminSessionOnly()
  @RequirePermissions('admins:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetTwoFactor(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.twoFactor.resetFor(principal, id, requestInfo(request));
  }

  /** Deactivates the admin and signs them out. Admins are never deleted, so the audit log stays complete. */
  @Delete(':id')
  @AdminSessionOnly()
  @RequirePermissions('admins:write')
  deactivate(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<AdminView> {
    return this.admins.update(principal, id, { isActive: false }, requestInfo(request).ipAddress);
  }
}
