// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { MetadataController } from './metadata.controller.js';
import { MetadataService } from './metadata.service.js';
import { TmdbClient } from './tmdb.client.js';

/** Import of details and artwork for titles of the catalog. Loaded only in the api role. */
@Module({
  imports: [CatalogModule],
  controllers: [MetadataController],
  providers: [TmdbClient, MetadataService],
  exports: [MetadataService],
})
export class MetadataModule {}
