// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ViewersModule } from '../viewers/viewers.module.js';
import { CoWatchService } from './co-watch.service.js';
import {
  PublicSimilarController,
  RecommendationsController,
  SimilarController,
} from './similar.controller.js';
import { SimilarService } from './similar.service.js';

/** Which titles are like a title, and rows of them for a profile. Loaded only in the api role. */
@Module({
  imports: [CatalogModule, ViewersModule],
  controllers: [PublicSimilarController, RecommendationsController, SimilarController],
  providers: [SimilarService, CoWatchService],
})
export class SimilarModule {}
