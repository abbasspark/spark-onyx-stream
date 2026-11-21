// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { ViewersModule } from '../viewers/viewers.module.js';
import { ViewerWatchingAdminController, WatchingController } from './watching.controller.js';
import { WatchingService } from './watching.service.js';

/** Watch history: where each viewer is in each video. */
@Module({
  imports: [ViewersModule],
  controllers: [WatchingController, ViewerWatchingAdminController],
  providers: [WatchingService],
})
export class WatchingModule {}
