// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { StripeModule } from '../stripe/stripe.module.js';
import { CoWatchService } from '../similar/co-watch.service.js';
import { MaintenanceService } from './maintenance.service.js';

/** Periodic repairs. Loaded only in the scheduler role. */
@Module({
  imports: [StripeModule],
  providers: [MaintenanceService, CoWatchService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
