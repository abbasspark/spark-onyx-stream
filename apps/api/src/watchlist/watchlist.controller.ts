// SPDX-License-Identifier: AGPL-3.0-only
import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../auth/auth.decorators.js';
import { type LanguageQuery, languageQuerySchema } from '../catalog/public-catalog.schemas.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { CurrentViewer, ViewerOnly } from '../viewers/viewer-auth.guard.js';
import { ViewerProfilesService } from '../viewers/viewer-profiles.service.js';
import type { ViewerIdentity } from '../viewers/viewer-session.service.js';
import { type ListScope, WatchlistService } from './watchlist.service.js';
import type { SavedTitles, ViewerList, ViewerListAdminView } from './watchlist.views.js';

/** A person adds a title now and then. This stops a script that writes without end. */
const CHANGES = { name: 'viewer-list', limit: 60, windowSeconds: 60 };

const savedSchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
type SavedInput = z.infer<typeof savedSchema>;

/** The list of the profile in use. Answers are about one person and never cached. */
@Controller('viewer/list')
export class WatchlistController {
  constructor(
    @Inject(WatchlistService) private readonly watchlist: WatchlistService,
    @Inject(ViewerProfilesService) private readonly profiles: ViewerProfilesService,
  ) {}

  /** The titles on the list, as cards. */
  @ViewerOnly()
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentViewer() identity: ViewerIdentity,
    @Query(new ZodValidationPipe(languageQuerySchema)) query: LanguageQuery,
  ): Promise<ViewerList> {
    return this.watchlist.list(await this.scope(identity), query.language);
  }

  /** Only the ids: enough to mark the titles of a page that are on the list. */
  @ViewerOnly()
  @Get('ids')
  @Header('Cache-Control', 'no-store')
  async ids(@CurrentViewer() identity: ViewerIdentity): Promise<{ ids: string[] }> {
    return { ids: await this.watchlist.ids(await this.scope(identity)) };
  }

  /** Puts a title on the list. Safe to repeat. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Put(':slug')
  @Header('Cache-Control', 'no-store')
  async add(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('slug') slug: string,
  ): Promise<{ id: string; saved: true }> {
    const title = await this.watchlist.add(await this.scope(identity), slug);
    return { id: title.id, saved: true };
  }

  /** Empties the list. */
  @ViewerOnly()
  @Delete()
  @HttpCode(HttpStatus.OK)
  async clear(@CurrentViewer() identity: ViewerIdentity): Promise<{ removed: number }> {
    return { removed: await this.watchlist.clear(await this.scope(identity)) };
  }

  /** Takes a title off the list. Safe to repeat. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Delete(':slug')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('slug') slug: string,
  ): Promise<{ id: string; saved: false }> {
    const title = await this.watchlist.remove(await this.scope(identity), slug);
    return { id: title.id, saved: false };
  }

  /** The list is that of the profile in use on the device of the request. */
  private async scope(identity: ViewerIdentity): Promise<ListScope> {
    const profile = await this.profiles.current(identity);
    return { viewerId: identity.viewer.id, profileId: profile.id };
  }
}

/** What a viewer saved, for admins who may see viewers. */
@Controller('viewers')
export class ViewerListAdminController {
  constructor(@Inject(WatchlistService) private readonly watchlist: WatchlistService) {}

  @Get(':id/list')
  @RequirePermissions('viewers:read')
  forViewer(@Param('id', ParseUUIDPipe) id: string): Promise<ViewerListAdminView> {
    return this.watchlist.forAdmin(id);
  }
}

/** What stands on lists, in figures, beside what is watched. */
@Controller('analytics')
export class SavedTitlesController {
  constructor(@Inject(WatchlistService) private readonly watchlist: WatchlistService) {}

  @Get('saved')
  @RequirePermissions('analytics:read')
  saved(@Query(new ZodValidationPipe(savedSchema)) query: SavedInput): Promise<SavedTitles> {
    return this.watchlist.saved(query.days);
  }
}
