// SPDX-License-Identifier: AGPL-3.0-only
import {
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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/auth.decorators.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { PlaybackInfo } from '../playback/playback.service.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { ViewerSessionService } from '../viewers/viewer-session.service.js';
import {
  type ListPublicTitlesInput,
  listPublicTitlesSchema,
  slugParamSchema,
} from './public-catalog.schemas.js';
import { PublicCatalogService } from './public-catalog.service.js';
import type {
  PublicCategory,
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
  home(): Promise<PublicHome> {
    return this.catalog.home();
  }

  @Get('categories')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  categories(): Promise<PublicCategory[]> {
    return this.catalog.categories();
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
  get(@Param('slug', slugPipe) slug: string): Promise<PublicTitleDetail> {
    return this.catalog.get(slug);
  }

  /** Signed, short-lived addresses for playing a movie. Never cached. */
  @Post('titles/:slug/playback')
  @RateLimit(PLAYBACK)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async playTitle(
    @Param('slug', slugPipe) slug: string,
    @Req() request: Request,
  ): Promise<PlaybackInfo> {
    return this.catalog.playTitle(slug, await this.isSignedIn(request));
  }

  @Post('titles/:slug/trailer/playback')
  @RateLimit(PLAYBACK)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async playTrailer(
    @Param('slug', slugPipe) slug: string,
    @Req() request: Request,
  ): Promise<PlaybackInfo> {
    return this.catalog.playTrailer(slug, await this.isSignedIn(request));
  }

  @Post('episodes/:id/playback')
  @RateLimit(PLAYBACK)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async playEpisode(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<PlaybackInfo> {
    return this.catalog.playEpisode(id, await this.isSignedIn(request));
  }

  /**
   * Whether a viewer is signed in. Asking for playback changes nothing, so a
   * cookie is enough here and the request needs no further check.
   */
  private async isSignedIn(request: Request): Promise<boolean> {
    return (await this.viewerSessions.identify(request)) !== null;
  }
}
