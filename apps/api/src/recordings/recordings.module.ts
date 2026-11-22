// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { LiveSupervisorModule } from '../live/live.module.js';
import { FfmpegRunner } from '../processing/ffmpeg/ffmpeg-runner.js';
import { RecordingSupervisorService } from './recording-supervisor.service.js';
import { RecordingsController } from './recordings.controller.js';
import { RecordingsService } from './recordings.service.js';

/** Planning and listing recordings. Loaded only in the api role. */
@Module({
  controllers: [RecordingsController],
  providers: [RecordingsService],
  exports: [RecordingsService],
})
export class RecordingsModule {}

/** Makes the recordings that are due. Loaded only in the live role, beside the channels. */
@Module({
  imports: [LiveSupervisorModule],
  providers: [FfmpegRunner, RecordingSupervisorService],
  exports: [RecordingSupervisorService],
})
export class RecordingSupervisorModule {}
