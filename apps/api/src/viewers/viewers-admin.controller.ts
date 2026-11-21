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
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type CreateViewerInput,
  createViewerSchema,
  type ListViewersInput,
  listViewersSchema,
  type ResetViewerPasswordInput,
  resetViewerPasswordSchema,
  type UpdateViewerInput,
  updateViewerSchema,
} from './viewer.schemas.js';
import type { ViewerAdminDetail, ViewerAdminView } from './viewer.view.js';
import { ViewersAdminService } from './viewers-admin.service.js';

/**
 * Viewers as admins manage them in the panel. The audit log names the viewer
 * by id and never stores an email address or a name.
 */
@Controller('viewers')
export class ViewersAdminController {
  constructor(
    @Inject(ViewersAdminService) private readonly viewers: ViewersAdminService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('viewers:read')
  list(
    @Query(new ZodValidationPipe(listViewersSchema)) query: ListViewersInput,
  ): Promise<Page<ViewerAdminView>> {
    return this.viewers.list(query);
  }

  @Get(':id')
  @RequirePermissions('viewers:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ViewerAdminDetail> {
    return this.viewers.get(id);
  }

  @Post()
  @RequirePermissions('viewers:write')
  async create(
    @Body(new ZodValidationPipe(createViewerSchema)) body: CreateViewerInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ViewerAdminView> {
    const viewer = await this.viewers.create(body);
    await this.record('viewer.create', viewer.id, principal, request);
    return viewer;
  }

  @Patch(':id')
  @RequirePermissions('viewers:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateViewerSchema)) body: UpdateViewerInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ViewerAdminView> {
    const change = await this.viewers.update(id, body);
    if (change.changed.length > 0) {
      const statusOnly = change.changed.length === 1 && change.changed[0] === 'status';
      const action = !statusOnly
        ? 'viewer.update'
        : change.viewer.status === 'DISABLED'
          ? 'viewer.disable'
          : 'viewer.enable';
      await this.record(action, id, principal, request, {
        changed: change.changed,
        ...(change.sessionsEnded > 0 ? { sessionsEnded: change.sessionsEnded } : {}),
      });
    }
    return change.viewer;
  }

  /** Sets a new password. The viewer is signed out everywhere. */
  @Post(':id/password')
  @RequirePermissions('viewers:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resetViewerPasswordSchema)) body: ResetViewerPasswordInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const sessionsEnded = await this.viewers.resetPassword(id, body.newPassword);
    await this.record('viewer.password_reset', id, principal, request, { sessionsEnded });
  }

  @Post(':id/sign-out')
  @RequirePermissions('viewers:write')
  @HttpCode(HttpStatus.OK)
  async signOut(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<{ sessionsEnded: number }> {
    const sessionsEnded = await this.viewers.signOutEverywhere(id);
    await this.record('viewer.sign_out', id, principal, request, { sessionsEnded });
    return { sessionsEnded };
  }

  @Delete(':id')
  @RequirePermissions('viewers:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    await this.viewers.remove(id);
    await this.record('viewer.delete', id, principal, request);
  }

  private record(
    action: string,
    viewerId: string,
    principal: Principal,
    request: Request,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'Viewer',
      entityId: viewerId,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
