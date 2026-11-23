// SPDX-License-Identifier: AGPL-3.0-only
import { DeliveryHintInterceptor } from '../delivery/delivery-hint.js';
import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/auth.decorators.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { LayoutPagePipe } from '../home/home.controller.js';
import type { LayoutPage } from '../home/home.service.js';
import { requestInfo } from '../auth/request-info.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { ViewerSessionService } from '../viewers/viewer-session.service.js';
import {
  type LanguageQuery,
  languageQuerySchema,
  type ListPublicTitlesInput,
  listPublicTitlesSchema,
  slugParamSchema,
} from './public-catalog.schemas.js';
import {
  type PlayAnswer,
  PublicCatalogService,
  type PublicSubjectPage,
  type Watcher,
} from './public-catalog.service.js';
import type {
  PublicCategory,
  PublicGenre,
  PublicLanguages,
  PublicPerson,
  PublicCollection,
  PublicCollectionDetail,
  PublicHome,
  PublicTitleCard,
  PublicTitleDetail,
} from './public-catalog.views.js';

/** Route of the public catalog, relative to the API prefix. */
export const PUBLIC_CATALOG_ROUTE = 'catalog';

/**
 * Answers may be kept for a short time by browsers, the gateway and edges.
 * A change in the panel therefore reaches viewers within this time.
 */
const CACHE_READS = 'public, max-age=30';

const READS = { name: 'catalog', limit: 600, windowSeconds: 60 };
const PLAYBACK = { name: 'catalog-playback', limit: 120, windowSeconds: 60 };

const slugPipe = new ZodValidationPipe(slugParamSchema);

/**
 * The catalog for the viewer website and the apps. No sign-in is needed.
 * Only published titles that can be played are ever returned.
 */
@Public()
@Controller(PUBLIC_CATALOG_ROUTE)
export class PublicCatalogController {
  constructor(
    @Inject(PublicCatalogService) private readonly catalog: PublicCatalogService,
    @Inject(ViewerSessionService) private readonly viewerSessions: ViewerSessionService,
  ) {}

  @Get('home')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  home(
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<PublicHome> {
    return this.catalog.home(query.language);
  }

  /**
   * A page of the website as it is arranged in the panel: "home", "movies",
   * "series" or "live". `custom` is false, and there are no rows, while a
   * page other than the home page was not arranged: clients then show what
   * the page was before.
   */
  @Get('pages/:page')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  page(
    @Param('page', LayoutPagePipe) page: LayoutPage,
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<PublicHome> {
    // The pages of categories and genres are about one of them: see below.
    if (page === 'CATEGORY' || page === 'GENRE') {
      throw new NotFoundException('There is no such page');
    }
    return this.catalog.page(page, query.language);
  }

  /**
   * The page of one category, as the page of categories is arranged: every
   * row holds titles of this category only. 404 for a category that does not
   * exist or has nothing to watch.
   */
  @Get('pages/category/:slug')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  categoryPage(
    @Param('slug', slugPipe) slug: string,
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<PublicSubjectPage> {
    return this.catalog.subjectPage('category', slug, query.language);
  }

  /** The same for one genre. */
  @Get('pages/genre/:slug')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  genrePage(
    @Param('slug', slugPipe) slug: string,
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<PublicSubjectPage> {
    return this.catalog.subjectPage('genre', slug, query.language);
  }

  @Get('genres')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  genres(
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<PublicGenre[]> {
    return this.catalog.genres(query.language);
  }

  @Get('languages')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  languages(): Promise<PublicLanguages> {
    return this.catalog.languages();
  }

  @Get('people/:slug')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  person(
    @Param('slug', slugPipe) slug: string,
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<PublicPerson> {
    return this.catalog.person(slug, query.language);
  }

  @Get('collections')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  collections(
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<PublicCollection[]> {
    return this.catalog.collections(query.language);
  }

  @Get('collections/:slug')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  collection(
    @Param('slug', slugPipe) slug: string,
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<PublicCollectionDetail> {
    return this.catalog.collection(slug, query.language);
  }

  @Get('categories')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  categories(
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<PublicCategory[]> {
    return this.catalog.categories(query.language);
  }

  @Get('titles')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  list(
    @Query(new ZodValidationPipe(listPublicTitlesSchema)) query: ListPublicTitlesInput,
  ): Promise<Page<PublicTitleCard>> {
    return this.catalog.list(query);
  }

  @Get('titles/:slug')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  get(
    @Param('slug', slugPipe) slug: string,
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<PublicTitleDetail> {
    return this.catalog.get(slug, query.language);
  }

  /** Signed, short-lived addresses for playing a movie. Never cached. */
  @Post('titles/:slug/playback')
  @UseInterceptors(DeliveryHintInterceptor)
  @RateLimit(PLAYBACK)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async playTitle(
    @Param('slug', slugPipe) slug: string,
    @Req() request: Request,
  ): Promise<PlayAnswer> {
    return this.catalog.playTitle(slug, await this.watcher(request), requestInfo(request));
  }

  @Post('titles/:slug/extras/:id/playback')
  @UseInterceptors(DeliveryHintInterceptor)
  @RateLimit(PLAYBACK)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async playExtra(
    @Param('slug', slugPipe) slug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PlayAnswer> {
    return this.catalog.playExtra(slug, id, await this.watcher(request), requestInfo(request));
  }

  @Post('titles/:slug/trailer/playback')
  @UseInterceptors(DeliveryHintInterceptor)
  @RateLimit(PLAYBACK)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async playTrailer(
    @Param('slug', slugPipe) slug: string,
    @Req() request: Request,
  ): Promise<PlayAnswer> {
    return this.catalog.playTrailer(slug, await this.watcher(request), requestInfo(request));
  }

  @Post('episodes/:id/playback')
  @UseInterceptors(DeliveryHintInterceptor)
  @RateLimit(PLAYBACK)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async playEpisode(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PlayAnswer> {
    return this.catalog.playEpisode(id, await this.watcher(request), requestInfo(request));
  }

  /**
   * The viewer who asks, if one is signed in. Asking for playback changes
   * nothing, so a cookie is enough here and the request needs no further check.
   */
  private async watcher(request: Request): Promise<Watcher> {
    const identity = await this.viewerSessions.identify(request);
    return identity
      ? {
          viewerId: identity.viewer.id,
          emailVerified: identity.viewer.emailVerifiedAt !== null,
          sessionId: identity.session.id,
          profileId: identity.session.profileId,
        }
      : null;
  }
}
