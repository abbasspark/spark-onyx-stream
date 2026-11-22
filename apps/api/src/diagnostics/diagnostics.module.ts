// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { BackupsModule } from '../backups/backups.module.js';
import { DiagnosticsWatch } from './diagnostics-watch.service.js';
import { DiagnosticsController } from './diagnostics.controller.js';
import { DiagnosticsService } from './diagnostics.service.js';
import { UpdateCheckService } from './update-check.service.js';

/** The diagnostics page and the alerts. Loaded only in the api role. */
@Module({
  imports: [BackupsModule],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService, UpdateCheckService, DiagnosticsWatch],
  exports: [DiagnosticsService, DiagnosticsWatch],
})
export class DiagnosticsModule {}
