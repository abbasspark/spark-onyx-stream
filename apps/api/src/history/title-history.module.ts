// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { TitleHistoryService } from './title-history.service.js';

/**
 * Recording of what changes on titles. In every role: the API records what
 * admins do, and background work (translating many titles) records its own.
 */
@Global()
@Module({
  providers: [TitleHistoryService],
  exports: [TitleHistoryService],
})
export class TitleHistoryCoreModule {}
