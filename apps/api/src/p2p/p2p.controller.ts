// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { Public, RequirePermissions } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type TrafficQuery, trafficQuerySchema } from '../delivery/edges.schemas.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { type P2pStatus, P2pService } from './p2p.service.js';
import {
  type SharingReport,
  sharingReportSchema,
  SharingStatsService,
  type SharingTraffic,
} from './sharing-stats.service.js';

/** Many viewers can sit behind one address, each reporting about twice a minute. */
const REPORTS = { name: 'sharing-report', limit: 600, windowSeconds: 60 };

/** P2P between viewers, as the admin panel shows it. */
@Controller('p2p')
export class P2pController {
  constructor(
    @Inject(P2pService) private readonly p2p: P2pService,
    @Inject(SharingStatsService) private readonly stats: SharingStatsService,
  ) {}

  /** Whether P2P is on, and how the tracker is doing. */
  @Get()
  @RequirePermissions('delivery:read')
  status(): Promise<P2pStatus> {
    return this.p2p.status();
  }

  /** How much of what viewers played came from other viewers, hour by hour. */
  @Get('traffic')
  @RequirePermissions('delivery:read')
  traffic(
    @Query(new ZodValidationPipe(trafficQuerySchema)) query: TrafficQuery,
  ): Promise<SharingTraffic> {
    return this.stats.traffic(query.range);
  }
}

/**
 * Where the players of viewers say what they took from servers and from each
 * other. Only a player that was let watch can report: it shows the token it
 * got for the tracker. The figures are statistics and decide nothing.
 */
@Public()
@Controller('catalog/delivery')
export class SharingReportController {
  constructor(
    @Inject(P2pService) private readonly p2p: P2pService,
    @Inject(SharingStatsService) private readonly stats: SharingStatsService,
  ) {}

  /** A player reports how much it got from other viewers and how much from servers. */
  @Post('report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(REPORTS)
  report(@Body(new ZodValidationPipe(sharingReportSchema)) body: SharingReport): void {
    const { token, ...figures } = body;
    if (!this.p2p.isViewerToken(token)) {
      throw new ForbiddenException('This token does not belong to a viewer who is watching');
    }
    this.stats.add(figures);
  }
}
