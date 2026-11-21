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
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { CurrentViewer, ViewerOnly } from '../viewers/viewer-auth.guard.js';
import { ViewerProfilesService } from '../viewers/viewer-profiles.service.js';
import type { ViewerIdentity } from '../viewers/viewer-session.service.js';
import { type SaveWatchPositionsInput, saveWatchPositionsSchema } from './watching.schemas.js';
import { type WatchScope, WatchingService } from './watching.service.js';
import type { TitleWatchState, ViewerWatchingAdminView, WatchingItem } from './watching.views.js';

/**
 * A player reports every few seconds. This leaves room for a household behind
 * one address and stops a script that writes without end.
 */
const REPORTS = { name: 'viewer-watching', limit: 240, windowSeconds: 60 };

/** What the profile in use is watching. Answers are about one person and never cached. */
@Controller('viewer/watching')
export class WatchingController {
  constructor(
    @Inject(WatchingService) private readonly watching: WatchingService,
    @Inject(ViewerProfilesService) private readonly profiles: ViewerProfilesService,
  ) {}

  /** The "Continue watching" row. */
  @ViewerOnly()
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@CurrentViewer() identity: ViewerIdentity): Promise<{ items: WatchingItem[] }> {
    return { items: await this.watching.list(await this.scope(identity)) };
  }

  /** Progress in the videos of one title, for its page. */
  @ViewerOnly()
  @Get('titles/:slug')
  @Header('Cache-Control', 'no-store')
  async forTitle(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('slug') slug: string,
  ): Promise<{ items: TitleWatchState[] }> {
    return { items: await this.watching.forTitle(await this.scope(identity), slug) };
  }

  /** Reports where the viewer is, in one video or in several. */
  @ViewerOnly()
  @RateLimit(REPORTS)
  @Put()
  @Header('Cache-Control', 'no-store')
  async save(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(saveWatchPositionsSchema)) body: SaveWatchPositionsInput,
  ): Promise<{ saved: number }> {
    return { saved: await this.watching.save(await this.scope(identity), body.items) };
  }

  /** Forgets everything the viewer watched. */
  @ViewerOnly()
  @Delete()
  @HttpCode(HttpStatus.OK)
  async clear(@CurrentViewer() identity: ViewerIdentity): Promise<{ removed: number }> {
    return { removed: await this.watching.clear(await this.scope(identity)) };
  }

  /** Forgets one video. */
  @ViewerOnly()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    if (!(await this.watching.remove(await this.scope(identity), id))) {
      throw new NotFoundException('Nothing remembered for this video');
    }
  }

  /** The history is that of the profile in use on the device of the request. */
  private async scope(identity: ViewerIdentity): Promise<WatchScope> {
    const profile = await this.profiles.current(identity);
    return { viewerId: identity.viewer.id, profileId: profile.id };
  }
}

/** What a viewer watched, for admins who may see viewers. */
@Controller('viewers')
export class ViewerWatchingAdminController {
  constructor(@Inject(WatchingService) private readonly watching: WatchingService) {}

  @Get(':id/watching')
  @RequirePermissions('viewers:read')
  forViewer(@Param('id', ParseUUIDPipe) id: string): Promise<ViewerWatchingAdminView> {
    return this.watching.forAdmin(id);
  }
}
