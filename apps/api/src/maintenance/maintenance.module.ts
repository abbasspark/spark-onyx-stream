// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service.js';

/** Periodic repairs. Loaded only in the scheduler role. */
@Module({
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
