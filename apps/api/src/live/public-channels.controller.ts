// SPDX-License-Identifier: AGPL-3.0-only
import { DeliveryHintInterceptor } from '../delivery/delivery-hint.js';
import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../auth/auth.decorators.js';
import { PUBLIC_CATALOG_ROUTE } from '../catalog/public-catalog.controller.js';
import { slugParamSchema } from '../catalog/public-catalog.schemas.js';
import type { Watcher } from '../catalog/public-catalog.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { ViewerSessionService } from '../viewers/viewer-session.service.js';
import { requestInfo } from '../auth/request-info.js';
import {
  type LiveAnswer,
  type PublicChannel,
  PublicChannelsService,
  type PublicGuideRow,
} from './public-channels.service.js';

/**
 * Whether a channel is on air changes at any moment, so these answers are
 * kept for a shorter time than the rest of the catalog.
 */
const CACHE_READS = 'public, max-age=10';

const READS = { name: 'catalog', limit: 600, windowSeconds: 60 };
const PLAYBACK = { name: 'catalog-playback', limit: 120, windowSeconds: 60 };

const slugPipe = new ZodValidationPipe(slugParamSchema);

/** The longest stretch of the guide given in one answer. */
const MAX_GUIDE_HOURS = 48;
const guideQuerySchema = z.object({
  /** Where the stretch begins. Left out: an hour ago, at the full hour. */
  from: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
  hours: z.coerce.number().int().min(1).max(MAX_GUIDE_HOURS).default(24),
});

/**
 * The programme guide of the published channels.
 *
 *   GET /v1/catalog/guide?from=2026-11-22T18:00:00Z&hours=24
 */
@Public()
@Controller(`${PUBLIC_CATALOG_ROUTE}/guide`)
export class PublicGuideController {
  constructor(@Inject(PublicChannelsService) private readonly channels: PublicChannelsService) {}

  @Get()
  @RateLimit(READS)
  @Header('Cache-Control', 'public, max-age=60')
  guide(
    @Query(new ZodValidationPipe(guideQuerySchema)) query: { from?: Date; hours: number },
  ): Promise<{ from: string; to: string; channels: PublicGuideRow[] }> {
    const from = query.from ?? new Date(Math.floor(Date.now() / 3_600_000 - 1) * 3_600_000);
    const to = new Date(from.getTime() + query.hours * 3_600_000);
    return this.channels
      .guide(from, to)
      .then((channels) => ({ from: from.toISOString(), to: to.toISOString(), channels }));
  }
}

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
  @UseInterceptors(DeliveryHintInterceptor)
  @RateLimit(PLAYBACK)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async play(@Param('slug', slugPipe) slug: string, @Req() request: Request): Promise<LiveAnswer> {
    const identity = await this.viewerSessions.identify(request);
    const watcher: Watcher = identity
      ? {
          viewerId: identity.viewer.id,
          emailVerified: identity.viewer.emailVerifiedAt !== null,
          sessionId: identity.session.id,
          profileId: identity.session.profileId,
        }
      : null;
    return this.channels.play(slug, watcher, requestInfo(request).userAgent);
  }
}
