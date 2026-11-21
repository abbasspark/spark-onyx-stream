// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { ViewersModule } from '../viewers/viewers.module.js';
import { FfmpegRunner } from '../processing/ffmpeg/ffmpeg-runner.js';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';
import { FfmpegLiveEngine } from './ffmpeg-live-engine.js';
import { IngestClient } from './ingest-client.js';
import { IngestController } from './ingest.controller.js';
import { IngestService } from './ingest.service.js';
import { LiveMediaController } from './live-media.controller.js';
import { LivePlaybackService } from './live-playback.service.js';
import { PublicChannelsController } from './public-channels.controller.js';
import { PublicChannelsService } from './public-channels.service.js';
import { LiveSupervisorService } from './live-supervisor.service.js';

/** Channel management and live delivery. Loaded only in the api role. */
@Module({
  imports: [ViewersModule, BillingModule],
  controllers: [
    ChannelsController,
    IngestController,
    LiveMediaController,
    PublicChannelsController,
  ],
  providers: [
    ChannelsService,
    PublicChannelsService,
    IngestService,
    IngestClient,
    LivePlaybackService,
    FfmpegRunner,
  ],
  exports: [ChannelsService, LivePlaybackService],
})
export class LiveModule {}

/** Keeps the enabled channels running. Loaded only in the live role. */
@Module({
  providers: [FfmpegRunner, FfmpegLiveEngine, IngestClient, LiveSupervisorService],
  exports: [LiveSupervisorService],
})
export class LiveSupervisorModule {}
