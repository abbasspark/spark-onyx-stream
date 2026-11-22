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
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, Public, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import {
  type BackupSettings,
  backupSettingsSchema,
  type FileQuery,
  fileQuerySchema,
} from './backups.schemas.js';
import { type BackupOverview, type BackupView, BackupsService } from './backups.service.js';

/**
 * Backups of the database. Reading needs "settings:read". Everything else
 * needs "settings:write", downloading included: a backup holds everything.
 */
@Controller('backups')
export class BackupsController {
  constructor(
    @Inject(BackupsService) private readonly backups: BackupsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** The settings, how well the installation is protected, and the backups there are. */
  @Get()
  @RequirePermissions('settings:read')
  overview(): Promise<BackupOverview> {
    return this.backups.overview();
  }

  /** Asks for a backup now. The answer is the backup, waiting to be made. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('settings:write')
  @RateLimit({ name: 'backup-create', limit: 20, windowSeconds: 3600 })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<BackupView> {
    const backup = await this.backups.request(principal.adminId);
    await this.audit.record({
      action: 'backup.create',
      adminId: principal.adminId,
      entityType: 'Backup',
      entityId: backup.id,
      ipAddress: requestInfo(request).ipAddress,
    });
    return backup;
  }

  @Put('settings')
  @RequirePermissions('settings:write')
  async updateSettings(
    @Body(new ZodValidationPipe(backupSettingsSchema)) body: BackupSettings,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<BackupSettings> {
    const settings = await this.backups.updateSettings(body);
    await this.audit.record({
      action: 'backup.settings',
      adminId: principal.adminId,
      entityType: 'Backup',
      metadata: { ...settings },
      ipAddress: requestInfo(request).ipAddress,
    });
    return settings;
  }

  /** A link that downloads the file. It works for a minute. */
  @Post(':id/download')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('settings:write')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<{ path: string; expiresAt: string }> {
    const { backup, path, expiresAt } = await this.backups.downloadLink(id);
    await this.audit.record({
      action: 'backup.download',
      adminId: principal.adminId,
      entityType: 'Backup',
      entityId: id,
      metadata: { file: backup.fileName },
      ipAddress: requestInfo(request).ipAddress,
    });
    return { path, expiresAt };
  }

  /** The file itself. The token in the address is the permission. */
  @Get(':id/file')
  @Public()
  @RateLimit({ name: 'backup-file', limit: 30, windowSeconds: 600 })
  async file(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(fileQuerySchema)) query: FileQuery,
    @Res() response: Response,
  ): Promise<void> {
    const { stream, size, fileName } = await this.backups.openFile(id, query.token);
    response.status(HttpStatus.OK).set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('settings:write')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const backup = await this.backups.remove(id);
    await this.audit.record({
      action: 'backup.delete',
      adminId: principal.adminId,
      entityType: 'Backup',
      entityId: id,
      metadata: { file: backup.fileName, status: backup.status },
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
