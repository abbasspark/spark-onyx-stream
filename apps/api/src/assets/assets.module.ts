// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { PlaybackModule } from '../playback/playback.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';

@Module({
  imports: [UploadsModule, PlaybackModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
