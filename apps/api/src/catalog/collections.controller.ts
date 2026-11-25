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
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TitleHistoryService } from '../history/title-history.service.js';
import {
  type CollectionTitlesInput,
  collectionTitlesSchema,
  type CreateCollectionInput,
  createCollectionSchema,
  type CreateExtraInput,
  createExtraSchema,
  type OrderCollectionsInput,
  orderCollectionsSchema,
  type OrderExtrasInput,
  orderExtrasSchema,
  type UpdateCollectionInput,
  updateCollectionSchema,
  type UpdateExtraInput,
  updateExtraSchema,
} from './catalog.schemas.js';
import type { CollectionDetail, CollectionView, ExtraView } from './catalog.views.js';
import { CollectionsService } from './collections.service.js';

/** Collections of titles, and the extra videos of a title. */
@Controller()
export class CollectionsController {
  constructor(
    @Inject(CollectionsService) private readonly collections: CollectionsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TitleHistoryService) private readonly history: TitleHistoryService,
  ) {}

  private record(
    action: string,
    entityType: string,
    entityId: string,
    principal: Principal,
    request: Request,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType,
      entityId,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }

  // --- Collections --------------------------------------------------------------

  /** Lists the collections. */
  @Get('collections')
  @RequirePermissions('catalog:read')
  list(): Promise<CollectionView[]> {
    return this.collections.list();
  }

  /** Creates a collection. */
  @Post('collections')
  @RequirePermissions('catalog:write')
  async create(
    @Body(new ZodValidationPipe(createCollectionSchema)) body: CreateCollectionInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<CollectionDetail> {
    const collection = await this.collections.create(body);
    await this.record('collection.create', 'Collection', collection.id, principal, request, {
      name: collection.name,
    });
    return collection;
  }

  /** Before ":id", so that "order" is not read as an id. */
  @Put('collections/order')
  @RequirePermissions('catalog:write')
  async order(
    @Body(new ZodValidationPipe(orderCollectionsSchema)) body: OrderCollectionsInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<CollectionView[]> {
    const collections = await this.collections.order(body);
    await this.record('collection.order', 'Collection', 'all', principal, request);
    return collections;
  }

  /** Returns one collection. */
  @Get('collections/:id')
  @RequirePermissions('catalog:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CollectionDetail> {
    return this.collections.get(id);
  }

  /** Changes a collection. */
  @Patch('collections/:id')
  @RequirePermissions('catalog:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCollectionSchema)) body: UpdateCollectionInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<CollectionDetail> {
    const collection = await this.collections.update(id, body);
    await this.record('collection.update', 'Collection', id, principal, request, {
      name: collection.name,
      fields: Object.keys(body),
    });
    return collection;
  }

  /** Replaces the titles of a collection and their order. */
  @Put('collections/:id/titles')
  @RequirePermissions('catalog:write')
  async setTitles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(collectionTitlesSchema)) body: CollectionTitlesInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<CollectionDetail> {
    const collection = await this.collections.setTitles(id, body);
    await this.record('collection.titles', 'Collection', id, principal, request, {
      name: collection.name,
      titles: body.titleIds.length,
    });
    return collection;
  }

  /** Deletes a collection. */
  @Delete('collections/:id')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const { name } = await this.collections.remove(id);
    await this.record('collection.delete', 'Collection', id, principal, request, { name });
  }

  // --- Extras -------------------------------------------------------------------

  /** Adds a trailer or clip to a title. */
  @Post('titles/:id/extras')
  @RequirePermissions('catalog:write')
  async addExtra(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createExtraSchema)) body: CreateExtraInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ExtraView[]> {
    const extras = await this.collections.addExtra(id, body);
    await this.history.capture(id, principal.adminId, 'extras');
    await this.record('title.extra.add', 'Title', id, principal, request, {
      name: body.name,
      kind: body.kind,
    });
    return extras;
  }

  /** Sets the order of the extras of a title. */
  @Put('titles/:id/extras/order')
  @RequirePermissions('catalog:write')
  async orderExtras(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(orderExtrasSchema)) body: OrderExtrasInput,
    @CurrentPrincipal() principal: Principal,
  ): Promise<ExtraView[]> {
    const extras = await this.collections.orderExtras(id, body);
    await this.history.capture(id, principal.adminId, 'extras');
    return extras;
  }

  /** Changes a trailer or clip of a title. */
  @Patch('extras/:id')
  @RequirePermissions('catalog:write')
  async updateExtra(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateExtraSchema)) body: UpdateExtraInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ExtraView[]> {
    const { titleId, extras } = await this.collections.updateExtra(id, body);
    await this.history.capture(titleId, principal.adminId, 'extras');
    await this.record('title.extra.update', 'Title', titleId, principal, request, {
      fields: Object.keys(body),
    });
    return extras;
  }

  /** Deletes a trailer or clip of a title. */
  @Delete('extras/:id')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeExtra(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const { titleId, name } = await this.collections.removeExtra(id);
    await this.history.capture(titleId, principal.adminId, 'extras');
    await this.record('title.extra.remove', 'Title', titleId, principal, request, { name });
  }
}
