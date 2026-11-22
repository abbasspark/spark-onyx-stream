// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { LiveModule } from '../live/live.module.js';
import { P2pController, SharingReportController } from '../p2p/p2p.controller.js';
import { SharingStatsService } from '../p2p/sharing-stats.service.js';
import { P2pService } from '../p2p/p2p.service.js';
import { PlaybackModule } from '../playback/playback.module.js';
import { DeliveryOverviewService } from './delivery-overview.service.js';
import { DeliveryRouter } from './delivery-router.service.js';
import { EdgeAgentController } from './edge-agent.controller.js';
import { EdgeAgentGuard } from './edge-agent.guard.js';
import { EdgeRegistry } from './edge-registry.service.js';
import { EdgesController, PublicDeliveryController } from './edges.controller.js';
import { EdgesService } from './edges.service.js';
import { OriginTrafficService } from './origin-traffic.service.js';

/**
 * Knowing the edges and choosing one for a viewer. Global, because every
 * module that hands out addresses for watching needs the router.
 */
@Global()
@Module({
  providers: [EdgeRegistry, DeliveryRouter, P2pService, SharingStatsService],
  exports: [EdgeRegistry, DeliveryRouter, P2pService, SharingStatsService],
})
export class DeliveryCoreModule {}

/** Managing edges, and what their agents talk to. Loaded only in the api role. */
@Module({
  imports: [PlaybackModule, LiveModule],
  controllers: [
    EdgesController,
    EdgeAgentController,
    PublicDeliveryController,
    P2pController,
    SharingReportController,
  ],
  providers: [EdgesService, EdgeAgentGuard, DeliveryOverviewService],
})
export class DeliveryModule {}

/** Asks the gateway what it delivered. Loaded only in the scheduler role. */
@Module({ providers: [OriginTrafficService], exports: [OriginTrafficService] })
export class DeliverySchedulerModule {}
