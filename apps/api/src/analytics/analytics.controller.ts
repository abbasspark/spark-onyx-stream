// SPDX-License-Identifier: AGPL-3.0-only
import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.decorators.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type SummaryInput,
  summarySchema,
  type TitleInput,
  titleSchema,
  type TitlesInput,
  titlesSchema,
} from './analytics.schemas.js';
import {
  AnalyticsService,
  type AnalyticsSummary,
  type TitleAnalytics,
  type TitleFigures,
  type WatchingNow,
} from './analytics.service.js';

/** What is watched, for the panel. Figures only: no viewer is named. */
@Controller('analytics')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}

  /** Returns viewing totals for a period, with a figure per day. */
  @Get('summary')
  @RequirePermissions('analytics:read')
  summary(
    @Query(new ZodValidationPipe(summarySchema)) query: SummaryInput,
  ): Promise<AnalyticsSummary> {
    return this.analytics.summary(query);
  }

  /** Returns who is watching right now, by title, device and quality. */
  @Get('now')
  @RequirePermissions('analytics:read')
  now(): Promise<WatchingNow> {
    return this.analytics.now();
  }

  /** Ranks titles by how much they were watched in a period. */
  @Get('titles')
  @RequirePermissions('analytics:read')
  titles(
    @Query(new ZodValidationPipe(titlesSchema)) query: TitlesInput,
  ): Promise<Page<TitleFigures>> {
    return this.analytics.titles(query);
  }

  /** Returns the viewing statistics of one title, with a figure per day. */
  @Get('titles/:id')
  @RequirePermissions('analytics:read')
  title(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(titleSchema)) query: TitleInput,
  ): Promise<TitleAnalytics> {
    return this.analytics.title(id, query);
  }
}
