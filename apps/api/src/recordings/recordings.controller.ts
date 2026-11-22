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
  type CreateRecordingInput,
  createRecordingSchema,
  type ListRecordingsQuery,
  listRecordingsSchema,
} from './recordings.schemas.js';
import { RecordingsService, type RecordingView } from './recordings.service.js';

/**
 * Recordings of live channels. A recording ends up in the library as an
 * asset, so making one needs the right to change channels.
 */
@Controller()
export class RecordingsController {
  constructor(
    @Inject(RecordingsService) private readonly recordings: RecordingsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('recordings')
  @RequirePermissions('live:read')
  list(
    @Query(new ZodValidationPipe(listRecordingsSchema)) query: ListRecordingsQuery,
  ): Promise<Page<RecordingView>> {
    return this.recordings.list(query);
  }

  @Post('recordings')
  @RequirePermissions('live:write')
  async create(
    @Body(new ZodValidationPipe(createRecordingSchema)) body: CreateRecordingInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<RecordingView> {
    const created = await this.recordings.create(body, principal.adminId);
    await this.record('recording.create', created, principal, request);
    return created;
  }

  /** Records a programme of the guide. */
  @Post('programmes/:id/record')
  @RequirePermissions('live:write')
  async recordProgramme(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<RecordingView> {
    const created = await this.recordings.createFromProgramme(id, principal.adminId);
    await this.record('recording.create', created, principal, request);
    return created;
  }

  /** Calls a waiting recording off, or stops a running one and keeps what it has. */
  @Post('recordings/:id/stop')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('live:write')
  async stop(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<RecordingView> {
    const stopped = await this.recordings.stop(id);
    await this.record('recording.stop', stopped, principal, request);
    return stopped;
  }

  @Delete('recordings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('live:write')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const removed = await this.recordings.remove(id);
    await this.record('recording.delete', removed, principal, request);
  }

  private record(
    action: string,
    recording: RecordingView,
    principal: Principal,
    request: Request,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'recording',
      entityId: recording.id,
      metadata: { title: recording.title, channel: recording.channel.name },
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
