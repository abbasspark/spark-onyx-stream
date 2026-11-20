// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller.js';
import { StatsService } from './stats.service.js';

/** Dashboard figures. Loaded only in the api role. */
@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
