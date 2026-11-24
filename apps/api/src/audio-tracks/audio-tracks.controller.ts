// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type AudioTrackView, toAudioTrackView } from './audio-track.view.js';
import {
  type AddAudioQuery,
  addAudioQuerySchema,
  type UpdateAudioBody,
  updateAudioSchema,
} from './audio-tracks.schemas.js';
import { AudioTracksService } from './audio-tracks.service.js';

/** The sound tracks of a video: adding a language, renaming, choosing the default, removing. */
@Controller('assets/:assetId/audio-tracks')
export class AudioTracksController {
  constructor(
    @Inject(AudioTracksService) private readonly tracks: AudioTracksService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** The sound tracks of a video: the one inside the video first. */
  @Get()
  @RequirePermissions('assets:read')
  @Header('Cache-Control', 'no-store')
  async list(@Param('assetId', ParseUUIDPipe) assetId: string): Promise<AudioTrackView[]> {
    return (await this.tracks.list(assetId)).map(toAudioTrackView);
  }

  /**
   * Adds a sound file to a video as another language or version. The body is
   * the file itself (MP3, AAC, M4A, WAV, FLAC, Opus, AC-3, or a video file
   * whose sound is taken), not a form. The answer comes at once with the
   * track as "PROCESSING": a job encodes it, and the player offers it when
   * that is done. The picture is not processed again.
   */
  @Post()
  @RequirePermissions('assets:write')
  async add(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Query(new ZodValidationPipe(addAudioQuerySchema)) query: AddAudioQuery,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<AudioTrackView> {
    const track = await this.tracks.add(assetId, request, {
      fileName: query.filename,
      language: query.language,
      label: query.label,
    });
    await this.record('asset.audio.add', assetId, principal, request, {
      trackId: track.id,
      language: track.language,
      label: track.label,
      file: query.filename,
    });
    return toAudioTrackView(track);
  }

  /** Renames a track, changes its language, or makes it the one players start with. */
  @Patch(':trackId')
  @RequirePermissions('assets:write')
  async update(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @Body(new ZodValidationPipe(updateAudioSchema)) body: UpdateAudioBody,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<AudioTrackView> {
    const track = await this.tracks.update(assetId, trackId, body);
    await this.record('asset.audio.update', assetId, principal, request, { ...body, trackId });
    return toAudioTrackView(track);
  }

  /** Tries an added track again that could not be made. */
  @Post(':trackId/retry')
  @RequirePermissions('assets:write')
  @HttpCode(HttpStatus.OK)
  async retry(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('trackId', ParseUUIDPipe) trackId: string,
  ): Promise<AudioTrackView> {
    return toAudioTrackView(await this.tracks.retry(assetId, trackId));
  }

  /** Takes a track out of a video. The sound inside the video itself cannot be taken out. */
  @Delete(':trackId')
  @RequirePermissions('assets:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const track = await this.tracks.remove(assetId, trackId);
    await this.record('asset.audio.remove', assetId, principal, request, {
      language: track.language,
      label: track.label,
      source: track.source,
    });
  }

  private record(
    action: string,
    assetId: string,
    principal: Principal,
    request: Request,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'Asset',
      entityId: assetId,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
