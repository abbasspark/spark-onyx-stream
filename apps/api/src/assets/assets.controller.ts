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
import type { AssetView } from './asset.view.js';
import {
  type CreateAssetInput,
  createAssetSchema,
  type ListAssetsInput,
  listAssetsSchema,
  type UpdateAssetInput,
  updateAssetSchema,
} from './assets.schemas.js';
import { AssetsService, type CreatedAsset } from './assets.service.js';

@Controller('assets')
export class AssetsController {
  constructor(@Inject(AssetsService) private readonly assets: AssetsService) {}

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
