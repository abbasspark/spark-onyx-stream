// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { PlaybackModule } from '../playback/playback.module.js';
import { AdsEventsController } from './ads-events.controller.js';
import { AdsController } from './ads.controller.js';
import { AdsService } from './ads.service.js';
import { VastResolverService } from './vast-resolver.service.js';

/** Ads in front of, in the middle of and after videos. */
@Module({
  imports: [PlaybackModule],
  controllers: [AdsController, AdsEventsController],
  providers: [AdsService, VastResolverService],
  exports: [AdsService, VastResolverService],
})
export class AdsModule {}
