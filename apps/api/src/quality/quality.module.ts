// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { QualityRecorder } from './quality-recorder.service.js';
import { PlaybackReportsController, QualityController } from './quality.controller.js';
import { QualityService } from './quality.service.js';

/**
 * The record of how playbacks went. In every role: the API records, and the
 * scheduler clears away what is no longer kept.
 */
@Global()
@Module({
  providers: [QualityRecorder],
  exports: [QualityRecorder],
})
export class QualityRecorderModule {}

/** The figures for the panel, and the address players report to. Loaded only in the api role. */
@Module({
  controllers: [PlaybackReportsController, QualityController],
  providers: [QualityService],
})
export class QualityModule {}
