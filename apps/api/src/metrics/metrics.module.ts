// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

@Module({
  imports: [HealthModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
