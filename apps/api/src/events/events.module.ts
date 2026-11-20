// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { EventPublisher } from './event-publisher.js';

/** Provides the publisher of live events to every module, in every role. */
@Global()
@Module({
  providers: [EventPublisher],
  exports: [EventPublisher],
})
export class EventsModule {}
