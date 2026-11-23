// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { MetadataModule } from '../metadata/metadata.module.js';
import { BulkController } from './bulk.controller.js';
import { BulkService } from './bulk.service.js';
import { TranslationJobsService } from './translation-jobs.service.js';

/**
 * Actions on many titles at once.
 *
 * Loaded only in the api role. The job that translates titles runs here and
 * not with the scheduler, because it needs the catalog and the import of
 * details. A lock keeps it to one process at a time.
 */
@Module({
  imports: [CatalogModule, MetadataModule],
  controllers: [BulkController],
  providers: [BulkService, TranslationJobsService],
  exports: [BulkService, TranslationJobsService],
})
export class BulkModule {}
