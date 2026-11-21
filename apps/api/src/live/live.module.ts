// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { FfmpegRunner } from '../processing/ffmpeg/ffmpeg-runner.js';
import { ChannelsController } from './channels.controller.js';
import { ChannelsService } from './channels.service.js';
import { FfmpegLiveEngine } from './ffmpeg-live-engine.js';
import { LiveMediaController } from './live-media.controller.js';
import { LivePlaybackService } from './live-playback.service.js';
import { LiveSupervisorService } from './live-supervisor.service.js';

/** Channel management and live delivery. Loaded only in the api role. */
@Module({
  controllers: [ChannelsController, LiveMediaController],
  providers: [ChannelsService, LivePlaybackService, FfmpegRunner],
  exports: [ChannelsService, LivePlaybackService],
})
export class LiveModule {}

/** Keeps the enabled channels running. Loaded only in the live role. */
@Module({
  providers: [FfmpegRunner, FfmpegLiveEngine, LiveSupervisorService],
  exports: [LiveSupervisorService],
})
export class LiveSupervisorModule {}
