// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { MetadataModule } from '../metadata/metadata.module.js';
import { WatchController } from './watch.controller.js';
import { WatchRunner } from './watch-runner.service.js';
import { WatchService } from './watch.service.js';

/**
 * Watched folders and buckets: looked through for new videos, which are
 * imported by the name of their file.
 *
 * Loaded only in the api role. The runner lives here and not with the
 * scheduler, because importing needs the catalog and the import of details,
 * which only the API has. A lock keeps it to one process at a time.
 */
@Module({
  imports: [CatalogModule, MetadataModule],
  controllers: [WatchController],
  providers: [WatchService, WatchRunner],
  exports: [WatchService, WatchRunner],
})
export class WatchModule {}
