// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { ViewersModule } from '../viewers/viewers.module.js';
import { ViewerStreamsAdminController, ViewerStreamsController } from './streams.controller.js';
import { StreamsService } from './streams.service.js';

/**
 * The count of what each account is playing. In every role: the API hands out
 * places, and the scheduler clears away what is long over.
 */
@Global()
@Module({
  providers: [StreamsService],
  exports: [StreamsService],
})
export class StreamsCoreModule {}

/** The addresses players report to, and what the panel sees. Loaded only in the api role. */
@Module({
  imports: [ViewersModule],
  controllers: [ViewerStreamsController, ViewerStreamsAdminController],
})
export class StreamsModule {}
