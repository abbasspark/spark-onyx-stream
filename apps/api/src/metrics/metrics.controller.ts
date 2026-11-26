// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { AppConfig } from '../config/app-config.js';
import { MetricsService } from './metrics.service.js';

const BEARER = /^Bearer (.+)$/;

/** Compares two secrets without revealing, by timing, how much of one was right. */
function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * The numbers for a monitoring system.
 *
 * It is open to nobody by default: with no `METRICS_TOKEN` the address answers
 * 404, as if it did not exist. With one, only a request that carries it as a
 * bearer token gets an answer. It does not use an admin session or an API key,
 * because a scraper is not a person and should not be able to do anything else.
 */
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  /** Answers with the numbers in the Prometheus text format, to a request that carries the token. */
  @Get()
  // No rate limit: its counters live in Redis, and this is the address to ask when Redis is down.
  async scrape(@Req() request: Request, @Res() response: Response): Promise<void> {
    if (!this.metrics.enabled) {
      throw new NotFoundException();
    }
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (token === undefined || !sameSecret(token, this.config.metricsToken)) {
      throw new UnauthorizedException();
    }

    response.setHeader('Content-Type', this.metrics.contentType);
    response.setHeader('Cache-Control', 'no-store');
    response.send(await this.metrics.render());
  }
}
