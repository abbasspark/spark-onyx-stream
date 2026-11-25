// SPDX-License-Identifier: AGPL-3.0-only
import { Body, Controller, Header, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { requestInfo } from '../auth/request-info.js';
import { PUBLIC_CATALOG_ROUTE } from '../catalog/public-catalog.controller.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import {
  type AdEventInput,
  type AdResolveInput,
  adEventSchema,
  adResolveSchema,
} from './ads.schemas.js';
import { AdsService } from './ads.service.js';
import type { ResolvedAd } from './vast.js';

const EVENTS = { name: 'ad-events', limit: 240, windowSeconds: 60 };
const RESOLVE = { name: 'ad-resolve', limit: 60, windowSeconds: 60 };

/** Where players say what became of an ad. Nothing says who watched. */
@Public()
@Controller(PUBLIC_CATALOG_ROUTE)
export class AdsEventsController {
  constructor(@Inject(AdsService) private readonly ads: AdsService) {}

  /** Counts an ad that was shown, watched to a point, skipped, clicked or failed. */
  @Post('ads/events')
  @RateLimit(EVENTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async event(@Body(new ZodValidationPipe(adEventSchema)) body: AdEventInput): Promise<void> {
    await this.ads.record(body.sourceId, body.event);
  }

  /**
   * Asks a source for the ad a break plays now. Answers with the file to play
   * and everyone to tell about it, or with null when there is no ad.
   */
  @Post('ads/resolve')
  @RateLimit(RESOLVE)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async resolve(
    @Body(new ZodValidationPipe(adResolveSchema)) body: AdResolveInput,
    @Req() request: Request,
  ): Promise<{ ad: ResolvedAd | null }> {
    const client = requestInfo(request);
    return {
      ad: await this.ads.resolve(body.sourceId, {
        ipAddress: client.ipAddress ?? null,
        userAgent: client.userAgent ?? null,
      }),
    };
  }
}
