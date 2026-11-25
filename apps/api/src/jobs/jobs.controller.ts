// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictException,
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
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { type Page, paginationSchema } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { PipelineService } from '../processing/pipeline.service.js';
import { type JobView, JobsService, toJobView } from './jobs.service.js';

const listJobsSchema = paginationSchema.extend({
  assetId: z.uuid().optional(),
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
  type: z
    .enum(['PROBE', 'REMUX', 'TRANSCODE', 'THUMBNAILS', 'AUDIO', 'MARKERS', 'CLEANUP'])
    .optional(),
});
type ListJobsInput = z.infer<typeof listJobsSchema>;

@Controller('jobs')
export class JobsController {
  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(PipelineService) private readonly pipeline: PipelineService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Lists the processing jobs. */
  @Get()
  @RequirePermissions('jobs:read')
  list(@Query(new ZodValidationPipe(listJobsSchema)) query: ListJobsInput): Promise<Page<JobView>> {
    const { page, pageSize, ...filter } = query;
    return this.jobs.list(filter, { page, pageSize });
  }

  /** Returns one processing job. */
  @Get(':id')
  @RequirePermissions('jobs:read')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<JobView> {
    return toJobView(await this.jobs.get(id));
  }

  /** Stops a waiting or running job. A running job stops within moments, not instantly. */
  @Post(':id/cancel')
  @RequirePermissions('jobs:write')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<JobView> {
    const job = await this.jobs.cancel(id);
    if (job.status === 'CANCELLED') {
      await this.pipeline.afterJobStopped(job.type, job.assetId);
    }

    await this.audit.record({
      action: 'job.cancel',
      adminId: principal.adminId,
      entityType: 'Job',
      entityId: id,
      metadata: { type: job.type, assetId: job.assetId },
      ipAddress: requestInfo(request).ipAddress,
    });
    return toJobView(job);
  }

  /** Runs a failed or cancelled job again as a new job. */
  @Post(':id/retry')
  @RequirePermissions('jobs:write')
  @HttpCode(HttpStatus.OK)
  async retry(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<JobView> {
    const job = await this.jobs.get(id);
    if (job.status !== 'FAILED' && job.status !== 'CANCELLED') {
      throw new ConflictException('Only a failed or cancelled job can be retried');
    }
    if (!job.assetId) {
      throw new ConflictException('This job belongs to no asset and cannot be retried');
    }

    const retried = await this.pipeline.retryJob(job.type, job.assetId);

    await this.audit.record({
      action: 'job.retry',
      adminId: principal.adminId,
      entityType: 'Job',
      entityId: retried.id,
      metadata: { type: job.type, assetId: job.assetId, retryOf: id },
      ipAddress: requestInfo(request).ipAddress,
    });
    return toJobView(retried);
  }
}
