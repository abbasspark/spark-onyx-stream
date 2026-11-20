// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { EventStreamService } from './event-stream.service.js';
import { EventsController } from './events.controller.js';

/** The live event stream for admin panels. Loaded only in the api role. */
@Module({
  controllers: [EventsController],
  providers: [EventStreamService],
  exports: [EventStreamService],
})
export class EventStreamModule {}
