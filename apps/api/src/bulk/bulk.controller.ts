// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
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
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type BulkInput, bulkSchema, type ListJobsInput, listJobsSchema } from './bulk.schemas.js';
import { type BulkResult, BulkService } from './bulk.service.js';
import { type TranslationJobView, TranslationJobsService } from './translation-jobs.service.js';

/** Actions on many titles at once, and the jobs that translate them. */
@Controller()
export class BulkController {
  constructor(
    @Inject(BulkService) private readonly bulk: BulkService,
    @Inject(TranslationJobsService) private readonly jobs: TranslationJobsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Does one thing to many titles. Answers with what happened to how many, and
   * names the titles that could not be changed.
   */
  @Post('titles/bulk')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.OK)
  async run(
    @Body(new ZodValidationPipe(bulkSchema)) body: BulkInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<BulkResult> {
    const result = await this.bulk.run(body, principal.adminId);
    // One line for the whole action, not one per title: the log stays readable.
    await this.audit.record({
      action: `title.bulk.${body.action.type}`,
      adminId: principal.adminId,
      entityType: result.job ? 'TranslationJob' : 'Title',
      entityId: result.job?.id,
      metadata: {
        ...body.action,
        selection: body.ids ? 'chosen' : 'filter',
        ...(body.filter ? { filter: body.filter } : {}),
        matched: result.matched,
        changed: result.changed,
        unchanged: result.unchanged,
        failed: result.failed,
      },
      ipAddress: requestInfo(request).ipAddress,
    });
    return result;
  }

  /** Lists the translation jobs. */
  @Get('translation-jobs')
  @RequirePermissions('catalog:read')
  list(
    @Query(new ZodValidationPipe(listJobsSchema)) query: ListJobsInput,
  ): Promise<TranslationJobView[]> {
    return this.jobs.list(query.active ?? false);
  }

  /** Cancels a translation job that is still running. */
  @Post('translation-jobs/:id/cancel')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<TranslationJobView> {
    const job = await this.jobs.cancel(id);
    await this.audit.record({
      action: 'translation_job.cancel',
      adminId: principal.adminId,
      entityType: 'TranslationJob',
      entityId: id,
      metadata: { language: job.language, done: job.done, total: job.total },
      ipAddress: requestInfo(request).ipAddress,
    });
    return job;
  }
}
