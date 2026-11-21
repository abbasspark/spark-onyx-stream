// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { PlaybackModule } from '../playback/playback.module.js';
import { ViewersModule } from '../viewers/viewers.module.js';
import { CatalogController } from './catalog.controller.js';
import { CategoriesService } from './categories.service.js';
import { ImagesService } from './images.service.js';
import { PublicCatalogController } from './public-catalog.controller.js';
import { PublicCatalogService } from './public-catalog.service.js';
import { TitlesService } from './titles.service.js';

/**
 * The catalog: titles, seasons, episodes, categories and artwork, and the
 * public view of it for viewers.
 * Loaded only in the api role. It reads assets of the media engine but the
 * media engine does not depend on it.
 */
@Module({
  imports: [PlaybackModule, ViewersModule],
  controllers: [CatalogController, PublicCatalogController],
  providers: [TitlesService, CategoriesService, ImagesService, PublicCatalogService],
  exports: [TitlesService, CategoriesService, ImagesService],
})
export class CatalogModule {}
