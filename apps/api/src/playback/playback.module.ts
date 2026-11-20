// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { MediaController } from './media.controller.js';
import { PlaybackService } from './playback.service.js';

@Module({
  controllers: [MediaController],
  providers: [PlaybackService],
  exports: [PlaybackService],
})
export class PlaybackModule {}
