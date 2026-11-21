// SPDX-License-Identifier: AGPL-3.0-only
import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { PUBLIC_CATALOG_ROUTE } from '../catalog/public-catalog.controller.js';
import { slugParamSchema } from '../catalog/public-catalog.schemas.js';
import type { Watcher } from '../catalog/public-catalog.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { ViewerSessionService } from '../viewers/viewer-session.service.js';
import type { LivePlaybackInfo } from './live-playback.service.js';
import { type PublicChannel, PublicChannelsService } from './public-channels.service.js';

/**
 * Whether a channel is on air changes at any moment, so these answers are
 * kept for a shorter time than the rest of the catalog.
 */
const CACHE_READS = 'public, max-age=10';

const READS = { name: 'catalog', limit: 600, windowSeconds: 60 };
const PLAYBACK = { name: 'catalog-playback', limit: 120, windowSeconds: 60 };

const slugPipe = new ZodValidationPipe(slugParamSchema);

/** Live channels in the public catalog, for the viewer website and the apps. */
@Public()
@Controller(`${PUBLIC_CATALOG_ROUTE}/channels`)
export class PublicChannelsController {
  constructor(
    @Inject(PublicChannelsService) private readonly channels: PublicChannelsService,
    @Inject(ViewerSessionService) private readonly viewerSessions: ViewerSessionService,
  ) {}

  @Get()
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  list(): Promise<PublicChannel[]> {
    return this.channels.list();
  }

  @Get(':slug')
  @RateLimit(READS)
  @Header('Cache-Control', CACHE_READS)
  get(@Param('slug', slugPipe) slug: string): Promise<PublicChannel> {
    return this.channels.get(slug);
  }

  /** A signed, short-lived address for watching a channel. Never cached. */
  @Post(':slug/playback')
  @RateLimit(PLAYBACK)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async play(
    @Param('slug', slugPipe) slug: string,
    @Req() request: Request,
  ): Promise<LivePlaybackInfo> {
    const identity = await this.viewerSessions.identify(request);
    const watcher: Watcher = identity
      ? { viewerId: identity.viewer.id, emailVerified: identity.viewer.emailVerifiedAt !== null }
      : null;
    return this.channels.play(slug, watcher);
  }
}
