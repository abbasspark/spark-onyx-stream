// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { StoragePoolsController } from './storage-pools.controller.js';
import { StoragePoolsService } from './storage-pools.service.js';
import { StorageService } from './storage.service.js';

/**
 * Storage access for every role: workers and the API both read and write files.
 * Loaded in all processes.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}

/** Storage pool management endpoints. Loaded only in the api role. */
@Module({
  controllers: [StoragePoolsController],
  providers: [StoragePoolsService],
})
export class StoragePoolsModule {}
