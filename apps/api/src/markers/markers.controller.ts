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
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type DetectMarkersInput,
  detectMarkersSchema,
  type ReplaceMarkersInput,
  replaceMarkersSchema,
} from './markers.schemas.js';
import { type AdminMarkerView, MarkersService, toMarkerView } from './markers.service.js';

/** How a search for intros and credits in a season goes, or went. */
export interface MarkerDetectionView {
  jobId: string;
  status: string;
  /** 0 to 100. */
  progress: number;
  queuedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  /** Set once it is done. */
  result: {
    /** Episodes that were listened to. */
    episodes: number;
    /** How many of them got an intro, and how many got credits. */
    intros: number;
    credits: number;
    /** Markers an admin set that were left as they are. */
    keptManual: number;
    perEpisode: { episode: number; intro: boolean; credits: boolean }[];
    /** What could not be done, in words. */
    notes?: string[];
  } | null;
}

interface JobLike {
  id: string;
  status: string;
  progress: number;
  queuedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  output: unknown;
}

function toDetectionView(job: JobLike): MarkerDetectionView {
  const output = job.output as MarkerDetectionView['result'] | null;
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    queuedAt: job.queuedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    result:
      job.status === 'COMPLETED' && output && typeof output.episodes === 'number' ? output : null,
  };
}

/** The stretches of a video a player offers to skip: recap, intro and credits. */
@Controller()
export class MarkersController {
  constructor(
    @Inject(MarkersService) private readonly markers: MarkersService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** The markers of a video, in the order they come. */
  @Get('assets/:assetId/markers')
  @RequirePermissions('assets:read')
  @Header('Cache-Control', 'no-store')
  async list(@Param('assetId', ParseUUIDPipe) assetId: string): Promise<AdminMarkerView[]> {
    return (await this.markers.list(assetId)).map((marker) => ({
      ...toMarkerView(marker),
      source: marker.source,
    }));
  }

  /**
   * Sets all the markers of a video at once: at most one recap, one intro
   * and one credits, inside the video and not overlapping. What is left out
   * is removed. Credits with "endMs": null run to the end.
   */
  @Put('assets/:assetId/markers')
  @RequirePermissions('assets:write')
  async replace(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Body(new ZodValidationPipe(replaceMarkersSchema)) body: ReplaceMarkersInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<AdminMarkerView[]> {
    const markers = await this.markers.replace(assetId, body.markers);
    await this.audit.record({
      action: 'asset.markers.update',
      adminId: principal.adminId,
      entityType: 'Asset',
      entityId: assetId,
      metadata: { markers: markers.map(toMarkerView) },
      ipAddress: requestInfo(request).ipAddress,
    });
    return markers.map((marker) => ({ ...toMarkerView(marker), source: marker.source }));
  }

  /**
   * Starts a search for the intros and credits of a season. Its episodes are
   * compared by their sound, in the background; what they share at the start
   * is marked as intro, what they share at the end as credits, both as
   * "DETECTED" for an admin to check. Needs two episodes with a video.
   */
  @Post('seasons/:id/markers/detect')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.ACCEPTED)
  async detect(
    @Param('id', ParseUUIDPipe) seasonId: string,
    @Body(new ZodValidationPipe(detectMarkersSchema)) body: DetectMarkersInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<MarkerDetectionView> {
    const job = await this.markers.detectInSeason(seasonId, body.overwrite);
    await this.audit.record({
      action: 'season.markers.detect',
      adminId: principal.adminId,
      entityType: 'Season',
      entityId: seasonId,
      metadata: { overwrite: body.overwrite, jobId: job.id },
      ipAddress: requestInfo(request).ipAddress,
    });
    return toDetectionView(job);
  }

  /** How the newest search of a season goes, or went. "detection" is null when it was never searched. */
  @Get('seasons/:id/markers/detection')
  @RequirePermissions('catalog:read')
  @Header('Cache-Control', 'no-store')
  async detection(
    @Param('id', ParseUUIDPipe) seasonId: string,
  ): Promise<{ detection: MarkerDetectionView | null }> {
    const job = await this.markers.lastDetection(seasonId);
    return { detection: job ? toDetectionView(job) : null };
  }
}
