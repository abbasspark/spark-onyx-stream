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
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, Public, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type CreateCategoryInput,
  createCategorySchema,
  type CreateEpisodeInput,
  createEpisodeSchema,
  type CreateSeasonInput,
  createSeasonSchema,
  type CreateTitleInput,
  createTitleSchema,
  type ListTitlesInput,
  listTitlesSchema,
  type ReorderCategoriesInput,
  reorderCategoriesSchema,
  type SetStatusInput,
  setStatusSchema,
  type UpdateCategoryInput,
  updateCategorySchema,
  type UpdateEpisodeInput,
  updateEpisodeSchema,
  type UpdateSeasonInput,
  updateSeasonSchema,
  type UpdateTitleInput,
  updateTitleSchema,
  type UploadImageQuery,
  uploadImageQuerySchema,
} from './catalog.schemas.js';
import {
  ARTWORK_ROUTE,
  type CategoryView,
  type EpisodeView,
  type ImageView,
  type TitleDetail,
  type TitleSummary,
} from './catalog.views.js';
import { CategoriesService } from './categories.service.js';
import { ImagesService } from './images.service.js';
import { type DuplicateTitleInput, duplicateTitleSchema } from './title-duplicate.js';
import { type DuplicateResult, TitleDuplicateService } from './title-duplicate.service.js';
import { TitlesService } from './titles.service.js';

/** What the audit log needs from a request. */
interface AuditContext {
  principal: Principal;
  request: Request;
}

@Controller()
export class CatalogController {
  constructor(
    @Inject(TitlesService) private readonly titles: TitlesService,
    @Inject(TitleDuplicateService) private readonly duplicates: TitleDuplicateService,
    @Inject(CategoriesService) private readonly categories: CategoriesService,
    @Inject(ImagesService) private readonly images: ImagesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // --- Categories ----------------------------------------------------------------

  @Get('categories')
  @RequirePermissions('catalog:read')
  listCategories(): Promise<CategoryView[]> {
    return this.categories.list();
  }

  @Post('categories')
  @RequirePermissions('catalog:write')
  async createCategory(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
    @Req() request: Request,
  ): Promise<CategoryView> {
    const category = await this.categories.create(body);
    await this.record(
      'category.create',
      'Category',
      category.id,
      { principal, request },
      {
        name: category.name,
      },
    );
    return category;
  }

  /** Puts all categories into a new order. */
  @Put('categories/order')
  @RequirePermissions('catalog:write')
  reorderCategories(
    @Body(new ZodValidationPipe(reorderCategoriesSchema)) body: ReorderCategoriesInput,
  ): Promise<CategoryView[]> {
    return this.categories.reorder(body);
  }

  @Patch('categories/:id')
  @RequirePermissions('catalog:write')
  async updateCategory(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
    @Req() request: Request,
  ): Promise<CategoryView> {
    const category = await this.categories.update(id, body);
    await this.record(
      'category.update',
      'Category',
      id,
      { principal, request },
      {
        name: category.name,
      },
    );
    return category;
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('catalog:write')
  async removeCategory(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    const category = await this.categories.remove(id);
    await this.record(
      'category.delete',
      'Category',
      id,
      { principal, request },
      {
        name: category.name,
        titles: category.titleCount,
      },
    );
  }

  // --- Titles ----------------------------------------------------------------------

  @Get('titles')
  @RequirePermissions('catalog:read')
  listTitles(
    @Query(new ZodValidationPipe(listTitlesSchema)) query: ListTitlesInput,
  ): Promise<Page<TitleSummary>> {
    return this.titles.list(query);
  }

  @Post('titles')
  @RequirePermissions('catalog:write')
  async createTitle(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(createTitleSchema)) body: CreateTitleInput,
    @Req() request: Request,
  ): Promise<TitleDetail> {
    const title = await this.titles.create(body, principal.adminId);
    await this.record(
      'title.create',
      'Title',
      title.id,
      { principal, request },
      {
        name: title.name,
        type: title.type,
      },
    );
    return title;
  }

  /**
   * Makes a copy of a title as a draft. The body says what comes along; the
   * videos and pictures of the copy are the same ones, not new files.
   */
  @Post('titles/:id/duplicate')
  @RequirePermissions('catalog:write')
  async duplicateTitle(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(duplicateTitleSchema)) body: DuplicateTitleInput,
    @Req() request: Request,
  ): Promise<DuplicateResult> {
    const result = await this.duplicates.duplicate(id, body, principal.adminId);
    await this.record(
      'title.duplicate',
      'Title',
      result.title.id,
      { principal, request },
      { name: result.title.name, from: id, parts: body.parts },
    );
    return result;
  }

  @Get('titles/:id')
  @RequirePermissions('catalog:read')
  getTitle(@Param('id', ParseUUIDPipe) id: string): Promise<TitleDetail> {
    return this.titles.get(id);
  }

  @Patch('titles/:id')
  @RequirePermissions('catalog:write')
  async updateTitle(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTitleSchema)) body: UpdateTitleInput,
    @Req() request: Request,
  ): Promise<TitleDetail> {
    const title = await this.titles.update(id, body);
    await this.record(
      'title.update',
      'Title',
      id,
      { principal, request },
      {
        name: title.name,
        changed: Object.keys(body),
      },
    );
    return title;
  }

  /** Publishes, unpublishes or archives a title. */
  @Put('titles/:id/status')
  @RequirePermissions('catalog:write')
  async setTitleStatus(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setStatusSchema)) body: SetStatusInput,
    @Req() request: Request,
  ): Promise<TitleDetail> {
    const title = await this.titles.setStatus(id, body);
    const action =
      body.status === 'PUBLISHED'
        ? 'title.publish'
        : body.status === 'ARCHIVED'
          ? 'title.archive'
          : 'title.unpublish';
    await this.record(action, 'Title', id, { principal, request }, { name: title.name });
    return title;
  }

  @Delete('titles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('catalog:write')
  async removeTitle(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    const title = await this.titles.remove(id);
    await this.record(
      'title.delete',
      'Title',
      id,
      { principal, request },
      {
        name: title.name,
        type: title.type,
        episodes: title.episodeCount,
      },
    );
  }

  // --- Seasons and episodes --------------------------------------------------------

  @Post('titles/:id/seasons')
  @RequirePermissions('catalog:write')
  createSeason(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createSeasonSchema)) body: CreateSeasonInput,
  ): Promise<TitleDetail> {
    return this.titles.createSeason(id, body);
  }

  @Patch('seasons/:id')
  @RequirePermissions('catalog:write')
  updateSeason(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSeasonSchema)) body: UpdateSeasonInput,
  ): Promise<TitleDetail> {
    return this.titles.updateSeason(id, body);
  }

  @Delete('seasons/:id')
  @RequirePermissions('catalog:write')
  async removeSeason(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<TitleDetail> {
    const title = await this.titles.removeSeason(id);
    await this.record(
      'season.delete',
      'Title',
      title.id,
      { principal, request },
      {
        name: title.name,
      },
    );
    return title;
  }

  @Post('seasons/:id/episodes')
  @RequirePermissions('catalog:write')
  createEpisode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createEpisodeSchema)) body: CreateEpisodeInput,
  ): Promise<EpisodeView> {
    return this.titles.createEpisode(id, body);
  }

  @Patch('episodes/:id')
  @RequirePermissions('catalog:write')
  async updateEpisode(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEpisodeSchema)) body: UpdateEpisodeInput,
    @Req() request: Request,
  ): Promise<EpisodeView> {
    const episode = await this.titles.updateEpisode(id, body);
    if (body.status) {
      await this.record(
        body.status === 'PUBLISHED' ? 'episode.publish' : 'episode.unpublish',
        'Episode',
        id,
        { principal, request },
        { name: episode.name },
      );
    }
    return episode;
  }

  @Delete('episodes/:id')
  @RequirePermissions('catalog:write')
  removeEpisode(@Param('id', ParseUUIDPipe) id: string): Promise<TitleDetail> {
    return this.titles.removeEpisode(id);
  }

  // --- Artwork -------------------------------------------------------------------------

  /**
   * Uploads a picture. The body is the file itself (JPEG, PNG or WebP, up to
   * 10 MB), not a form.
   */
  @Post('images')
  @RequirePermissions('catalog:write')
  async uploadImage(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(uploadImageQuerySchema)) query: UploadImageQuery,
    @Req() request: Request,
  ): Promise<ImageView> {
    const data = await this.images.readBody(request);
    return this.images.upload(query.kind, data, principal.adminId);
  }

  /** Deletes a picture that no title or episode uses. */
  @Delete('images/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('catalog:write')
  removeImage(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.images.remove(id);
  }

  /**
   * Serves a picture. Public: artwork is shown to visitors who are not signed
   * in. The address never changes for the same picture, so it is cached for good.
   */
  @Get(`${ARTWORK_ROUTE}/:file`)
  @Public()
  async artwork(@Param('file') file: string, @Res() response: Response): Promise<void> {
    const match = /^([0-9a-f-]{36})\.(?:jpg|png|webp)$/.exec(file);
    const image = match ? await this.images.open(match[1] as string) : null;
    if (!image) {
      response.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Not found' });
      return;
    }

    response.setHeader('Content-Type', image.mimeType);
    response.setHeader('Content-Length', String(image.bytes));
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // The content was verified as a picture on upload. This stops a browser from guessing otherwise.
    response.setHeader('X-Content-Type-Options', 'nosniff');
    image.stream.on('error', () => response.destroy());
    image.stream.pipe(response);
  }

  private record(
    action: string,
    entityType: string,
    entityId: string,
    context: AuditContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: context.principal.adminId,
      entityType,
      entityId,
      metadata,
      ipAddress: requestInfo(context.request).ipAddress,
    });
  }
}
