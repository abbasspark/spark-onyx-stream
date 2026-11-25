// SPDX-License-Identifier: AGPL-3.0-only
import type { Readable } from 'node:stream';
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
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { SubtitleTrack } from '@onyx/database';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type AddSubtitleQuery,
  addSubtitleQuerySchema,
  type UpdateSubtitleBody,
  updateSubtitleSchema,
} from './subtitles.schemas.js';
import { MAX_SUBTITLE_BYTES, SubtitlesService } from './subtitles.service.js';

export interface SubtitleTrackView {
  id: string;
  language: string;
  label: string | null;
  source: string;
  isDefault: boolean;
  isForced: boolean;
}

export interface AddedSubtitleView {
  track: SubtitleTrackView;
  /** How many subtitles the file holds. */
  cues: number;
  /** What the file was: "srt", "vtt" or "ass". */
  format: string;
  /** What its bytes were read as, such as "utf-8" or "windows-1256". */
  encoding: string;
  /** Something to check, when the file looks as if it belonged to another video. */
  warning: string | null;
}

const toView = (track: SubtitleTrack): SubtitleTrackView => ({
  id: track.id,
  language: track.language,
  label: track.label,
  source: track.source,
  isDefault: track.isDefault,
  isForced: track.isForced,
});

async function readBody(body: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > MAX_SUBTITLE_BYTES) {
      throw new PayloadTooLargeException(
        `The file is larger than ${MAX_SUBTITLE_BYTES / 1024 / 1024} MB, which no subtitle file is`,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/** The subtitle tracks of a video: adding files, renaming, removing. Listed with the asset's media. */
@Controller('assets/:assetId/subtitles')
export class SubtitlesController {
  constructor(
    @Inject(SubtitlesService) private readonly subtitles: SubtitlesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Adds a subtitle file to a video. The body is the file itself (.srt, .vtt,
   * .ass or .ssa, up to 5 MB), not a form. It is converted to WebVTT and
   * offered by the player at once.
   */
  @Post()
  @RequirePermissions('assets:write')
  async add(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Query(new ZodValidationPipe(addSubtitleQuerySchema)) query: AddSubtitleQuery,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<AddedSubtitleView> {
    const data = await readBody(request);
    const added = await this.subtitles.add(assetId, data, {
      fileName: query.filename,
      language: query.language,
      label: query.label,
      forced: query.forced,
      encoding: query.encoding,
    });
    await this.audit.record({
      action: 'asset.subtitle.add',
      adminId: principal.adminId,
      entityType: 'Asset',
      entityId: assetId,
      metadata: {
        language: added.track.language,
        label: added.track.label,
        file: query.filename,
        cues: added.cues,
      },
      ipAddress: requestInfo(request).ipAddress,
    });
    return { ...added, track: toView(added.track) };
  }

  /** Renames a subtitle track or changes its language and flags. */
  @Patch(':trackId')
  @RequirePermissions('assets:write')
  async update(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @Body(new ZodValidationPipe(updateSubtitleSchema)) body: UpdateSubtitleBody,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<SubtitleTrackView> {
    const track = await this.subtitles.update(assetId, trackId, body);
    await this.audit.record({
      action: 'asset.subtitle.update',
      adminId: principal.adminId,
      entityType: 'Asset',
      entityId: assetId,
      metadata: { ...body, trackId },
      ipAddress: requestInfo(request).ipAddress,
    });
    return toView(track);
  }

  /** Removes a subtitle track from a video. */
  @Delete(':trackId')
  @RequirePermissions('assets:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('trackId', ParseUUIDPipe) trackId: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const track = await this.subtitles.remove(assetId, trackId);
    await this.audit.record({
      action: 'asset.subtitle.remove',
      adminId: principal.adminId,
      entityType: 'Asset',
      entityId: assetId,
      metadata: { language: track.language, label: track.label, source: track.source },
      ipAddress: requestInfo(request).ipAddress,
    });
  }

  /** The WebVTT file of a track, to read or to download. */
  @Get(':trackId/file')
  @RequirePermissions('assets:read')
  @Header('Content-Type', 'text/vtt; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async file(
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Param('trackId', ParseUUIDPipe) trackId: string,
  ): Promise<StreamableFile> {
    const { track, vtt } = await this.subtitles.read(assetId, trackId);
    return new StreamableFile(vtt, {
      type: 'text/vtt; charset=utf-8',
      disposition: `attachment; filename="${track.language}.vtt"`,
    });
  }
}
