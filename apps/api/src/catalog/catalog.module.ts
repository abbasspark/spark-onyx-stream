// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CategoriesService } from './categories.service.js';
import { ImagesService } from './images.service.js';
import { TitlesService } from './titles.service.js';

/**
 * The catalog: titles, seasons, episodes, categories and artwork.
 * Loaded only in the api role. It reads assets of the media engine but the
 * media engine does not depend on it.
 */
@Module({
  controllers: [CatalogController],
  providers: [TitlesService, CategoriesService, ImagesService],
  exports: [TitlesService, CategoriesService, ImagesService],
})
export class CatalogModule {}
