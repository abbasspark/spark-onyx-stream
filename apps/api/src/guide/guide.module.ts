// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { GuideController } from './guide.controller.js';
import { GuideService } from './guide.service.js';
import { GuideImportService } from './guide-import.service.js';
import { GuideRefreshService } from './guide-refresh.service.js';

/** The programme guide for admins. Loaded only in the api role. */
@Module({
  controllers: [GuideController],
  providers: [GuideService, GuideImportService],
  exports: [GuideService, GuideImportService],
})
export class GuideModule {}

/** Imports the guide again by itself. Loaded only in the scheduler role. */
@Module({
  providers: [GuideImportService, GuideRefreshService],
  exports: [GuideRefreshService],
})
export class GuideSchedulerModule {}
