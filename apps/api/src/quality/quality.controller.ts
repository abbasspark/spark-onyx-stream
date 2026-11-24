// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Public, RequirePermissions } from '../auth/auth.decorators.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { QualityRecorder } from './quality-recorder.service.js';
import {
  type FailuresInput,
  failuresSchema,
  type QualityInput,
  qualitySchema,
  type ReportBody,
  reportSchema,
} from './quality.schemas.js';
import { type QualityFailure, QualityService, type QualitySummary } from './quality.service.js';

/** A player reports twice a minute per playback. This leaves room for a household behind one address. */
const REPORTS = { name: 'playback-reports', limit: 240, windowSeconds: 60 };

/** Where players say how playback went. */
@Controller('playback/sessions')
export class PlaybackReportsController {
  constructor(@Inject(QualityRecorder) private readonly recorder: QualityRecorder) {}

  /**
   * A report of a player on one playback, to the `qualityId` that came with
   * the playback addresses. It holds everything counted since the playback
   * began, so it can be sent as often as wanted: about every half minute
   * while playing, when a problem ends playback, and last with `ended` when
   * the video ends or is left. Always answers the same, whether the
   * playback is known or not.
   */
  @Post(':id/report')
  @Public()
  @RateLimit(REPORTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  async report(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reportSchema)) body: ReportBody,
  ): Promise<void> {
    await this.recorder.report(id, body);
  }
}

/** How playback goes, for the panel. Figures about playbacks: no viewer is named. */
@Controller('analytics/quality')
export class QualityController {
  constructor(@Inject(QualityService) private readonly quality: QualityService) {}

  @Get()
  @RequirePermissions('analytics:read')
  summary(
    @Query(new ZodValidationPipe(qualitySchema)) query: QualityInput,
  ): Promise<QualitySummary> {
    return this.quality.summary(query);
  }

  /** The playbacks a problem ended, the newest first. */
  @Get('failures')
  @RequirePermissions('analytics:read')
  failures(
    @Query(new ZodValidationPipe(failuresSchema)) query: FailuresInput,
  ): Promise<Page<QualityFailure>> {
    return this.quality.failures(query);
  }
}
