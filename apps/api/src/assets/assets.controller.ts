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
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type CreateAssetInput,
  createAssetSchema,
  type ListAssetsInput,
  listAssetsSchema,
  type ReprocessAssetInput,
  reprocessAssetSchema,
  type UpdateAssetInput,
  updateAssetSchema,
} from './assets.schemas.js';
import { type PlaybackInfo, PlaybackService } from '../playback/playback.service.js';
import { PipelineService } from '../processing/pipeline.service.js';
import { type AssetMediaView, type AssetView, toAssetView } from './asset.view.js';
import { AssetsService, type CreatedAsset } from './assets.service.js';

@Controller('assets')
export class AssetsController {
  constructor(
    @Inject(AssetsService) private readonly assets: AssetsService,
    @Inject(PipelineService) private readonly pipeline: PipelineService,
    @Inject(PlaybackService) private readonly playback: PlaybackService,
  ) {}

  @Get()
  @RequirePermissions('assets:read')
  list(
    @Query(new ZodValidationPipe(listAssetsSchema)) query: ListAssetsInput,
  ): Promise<Page<AssetView>> {
    return this.assets.list(query);
  }

  @Get(':id')
  @RequirePermissions('assets:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AssetView> {
    return this.assets.get(id);
  }

  /** The generated outputs of an asset: qualities, subtitle tracks and pictures. */
  @Get(':id/media')
  @RequirePermissions('assets:read')
  media(@Param('id', ParseUUIDPipe) id: string): Promise<AssetMediaView> {
    return this.assets.media(id);
  }

  /** Creates the asset and returns what the client needs to upload its source file. */
  @Post()
  @RequirePermissions('assets:write')
  create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(createAssetSchema)) body: CreateAssetInput,
    @Req() request: Request,
  ): Promise<CreatedAsset> {
    return this.assets.create(principal, body, requestInfo(request).ipAddress);
  }

  @Patch(':id')
  @RequirePermissions('assets:write')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAssetSchema)) body: UpdateAssetInput,
    @Req() request: Request,
  ): Promise<AssetView> {
    return this.assets.update(principal, id, body, requestInfo(request).ipAddress);
  }

  /**
   * Processes the asset again from its source file and replaces earlier outputs.
   * Leave the body empty to let the mode be chosen again.
   */
  @Post(':id/reprocess')
  @RequirePermissions('assets:write')
  @HttpCode(HttpStatus.ACCEPTED)
  async reprocess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reprocessAssetSchema)) body: ReprocessAssetInput,
  ): Promise<AssetView> {
    return toAssetView(await this.pipeline.reprocess(id, body));
  }

  /** Returns signed, short-lived URLs for playing the asset. */
  @Post(':id/playback')
  @RequirePermissions('assets:read')
  @HttpCode(HttpStatus.OK)
  createPlayback(@Param('id', ParseUUIDPipe) id: string): Promise<PlaybackInfo> {
    return this.playback.createPlayback(id);
  }

  @Delete(':id')
  @RequirePermissions('assets:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.assets.softDelete(principal, id, requestInfo(request).ipAddress);
  }
}
