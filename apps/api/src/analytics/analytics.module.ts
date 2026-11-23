// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { PlaysController } from './plays.controller.js';
import { PlaysService } from './plays.service.js';

/**
 * Recording of what is watched. In every role: the API records, and the
 * scheduler clears away what is no longer kept.
 */
@Global()
@Module({
  providers: [PlaysService],
  exports: [PlaysService],
})
export class PlaysModule {}

/** The figures for the panel, and the address players report to. Loaded only in the api role. */
@Module({
  controllers: [AnalyticsController, PlaysController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
