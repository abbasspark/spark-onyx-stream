// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { PlaybackModule } from '../playback/playback.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { AudioTracksController } from '../audio-tracks/audio-tracks.controller.js';
import { MarkersController } from '../markers/markers.controller.js';
import { AssetsController } from './assets.controller.js';
import { SubtitlesController } from '../subtitles/subtitles.controller.js';
import { AssetsService } from './assets.service.js';

@Module({
  imports: [UploadsModule, PlaybackModule],
  controllers: [AssetsController, SubtitlesController, AudioTracksController, MarkersController],
  providers: [AssetsService],
})
export class AssetsModule {}
