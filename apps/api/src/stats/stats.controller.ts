// SPDX-License-Identifier: AGPL-3.0-only
import { Controller, Get, Inject } from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.decorators.js';
import { type OverviewStats, StatsService } from './stats.service.js';

@Controller('stats')
export class StatsController {
  constructor(@Inject(StatsService) private readonly stats: StatsService) {}

  /** Figures for the dashboard: assets, jobs, storage and recent failures. */
  @Get('overview')
  @RequirePermissions('assets:read', 'jobs:read')
  overview(): Promise<OverviewStats> {
    return this.stats.overview();
  }
}
