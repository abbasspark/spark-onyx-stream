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
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, Public, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { PUBLIC_CATALOG_ROUTE } from '../catalog/public-catalog.controller.js';
import {
  type LanguageQuery,
  languageQuerySchema,
  slugParamSchema,
} from '../catalog/public-catalog.schemas.js';
import type { PublicTitleCard } from '../catalog/public-catalog.views.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { CurrentViewer, ViewerOnly } from '../viewers/viewer-auth.guard.js';
import { ViewerProfilesService } from '../viewers/viewer-profiles.service.js';
import type { ViewerIdentity } from '../viewers/viewer-session.service.js';
import { type CoWatchState, CoWatchService, MIN_SHARED_ACCOUNTS } from './co-watch.service.js';
import {
  type SimilarChoicesInput,
  similarChoicesSchema,
  type SimilarQuery,
  similarQuerySchema,
} from './similar.schemas.js';
import {
  type RecommendationRow,
  type SimilarAdminView,
  SimilarService,
} from './similar.service.js';

const READS = { name: 'catalog', limit: 600, windowSeconds: 60 };
/** Counting what was watched together reads the whole watching history: not something to start in a loop. */
const REBUILDS = { name: 'similar-rebuild', limit: 6, windowSeconds: 600 };

/** What is known about titles watched by the same people. */
export interface WatchingView {
  /** Null: never counted. */
  state: CoWatchState | null;
  /** A pair of titles only counts when this many accounts watched both. */
  minimumAccounts: number;
}

/** The similar titles of a title, for the website and the apps. */
@Public()
@Controller(PUBLIC_CATALOG_ROUTE)
export class PublicSimilarController {
  constructor(@Inject(SimilarService) private readonly similar: SimilarService) {}

  /**
   * Titles like this one, most alike first: what an editor pinned, then
   * what shares genres, keywords, people or a collection with it, or is
   * watched by the same viewers. Empty when nothing is alike. A profile with
   * an age limit only gets what suits it.
   */
  @Get('titles/:slug/similar')
  @RateLimit(READS)
  @Header('Cache-Control', 'public, max-age=30')
  async forTitle(
    @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
    @Query(new ZodValidationPipe(similarQuerySchema)) query: SimilarQuery,
  ): Promise<{ items: PublicTitleCard[] }> {
    return { items: await this.similar.forTitle(slug, query.limit, query.language) };
  }
}

/** Rows made for the profile in use. About one person, and never cached. */
@Controller('viewer/recommendations')
export class RecommendationsController {
  constructor(
    @Inject(SimilarService) private readonly similar: SimilarService,
    @Inject(ViewerProfilesService) private readonly profiles: ViewerProfilesService,
  ) {}

  /**
   * Up to three rows of titles like the ones the profile watched last, each
   * named after the title it comes from. Nothing the profile already started
   * is in them, and no title is in two rows. Empty for a profile that
   * watched nothing yet.
   */
  @ViewerOnly()
  @Get()
  @Header('Cache-Control', 'no-store')
  async rows(
    @CurrentViewer() identity: ViewerIdentity,
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<{ rows: RecommendationRow[] }> {
    const profile = await this.profiles.current(identity);
    return { rows: await this.similar.forProfile(profile.id, query.language) };
  }
}

/** The similar titles of a title in the panel: why each is listed, and what an editor decided. */
@Controller()
export class SimilarController {
  constructor(
    @Inject(SimilarService) private readonly similar: SimilarService,
    @Inject(CoWatchService) private readonly coWatch: CoWatchService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Returns titles viewers of this one also watched. */
  @Get('titles/:id/similar')
  @RequirePermissions('catalog:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SimilarAdminView> {
    return this.similar.forAdmin(id);
  }

  /**
   * Replaces what was decided for a title: the titles always shown, in
   * their order, and the titles never shown. It holds for this title only.
   */
  @Put('titles/:id/similar')
  @RequirePermissions('catalog:write')
  async set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(similarChoicesSchema)) body: SimilarChoicesInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<SimilarAdminView> {
    const { name, before } = await this.similar.setChoices(id, body);
    await this.audit.record({
      action: 'title.similar.update',
      adminId: principal.adminId,
      entityType: 'Title',
      entityId: id,
      metadata: {
        name,
        pinned: body.pinned.length,
        hidden: body.hidden.length,
        before,
      },
      ipAddress: requestInfo(request).ipAddress,
    });
    return this.similar.forAdmin(id);
  }

  /** When titles watched by the same people were last counted, and what was found. */
  @Get('similar/watching')
  @RequirePermissions('catalog:read')
  async watching(): Promise<WatchingView> {
    return { state: await this.coWatch.state(), minimumAccounts: MIN_SHARED_ACCOUNTS };
  }

  /** Counts now, instead of waiting for the scheduler. Takes a moment on a large audience. */
  @Post('similar/watching/rebuild')
  @RateLimit(REBUILDS)
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('catalog:write')
  async rebuild(
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<WatchingView> {
    const state = await this.coWatch.rebuild();
    await this.audit.record({
      action: 'similar.watching.rebuild',
      adminId: principal.adminId,
      entityType: 'Setting',
      metadata: { pairs: state.pairs, titles: state.titles, profiles: state.profiles },
      ipAddress: requestInfo(request).ipAddress,
    });
    return { state, minimumAccounts: MIN_SHARED_ACCOUNTS };
  }
}
