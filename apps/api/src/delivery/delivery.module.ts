// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { LiveModule } from '../live/live.module.js';
import { PlaybackModule } from '../playback/playback.module.js';
import { DeliveryRouter } from './delivery-router.service.js';
import { EdgeAgentController } from './edge-agent.controller.js';
import { EdgeAgentGuard } from './edge-agent.guard.js';
import { EdgeRegistry } from './edge-registry.service.js';
import { EdgesController, PublicDeliveryController } from './edges.controller.js';
import { EdgesService } from './edges.service.js';

/**
 * Knowing the edges and choosing one for a viewer. Global, because every
 * module that hands out addresses for watching needs the router.
 */
@Global()
@Module({
  providers: [EdgeRegistry, DeliveryRouter],
  exports: [EdgeRegistry, DeliveryRouter],
})
export class DeliveryCoreModule {}

/** Managing edges, and what their agents talk to. Loaded only in the api role. */
@Module({
  imports: [PlaybackModule, LiveModule],
  controllers: [EdgesController, EdgeAgentController, PublicDeliveryController],
  providers: [EdgesService, EdgeAgentGuard],
})
export class DeliveryModule {}
