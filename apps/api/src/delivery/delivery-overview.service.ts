// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import { SharingStatsService } from '../p2p/sharing-stats.service.js';
import { hourOf } from './edge-state.js';
import { TRAFFIC_RANGES, type TrafficRange } from './edges.schemas.js';

/**
 * One hour of delivery, in bytes:
 * [start in seconds, sent by the gateway to viewers, delivered by edges,
 *  fetched by edges from the main server, passed between viewers].
 */
export type OverviewPoint = [number, number, number, number, number];

export interface DeliveryOverview {
  range: TrafficRange;
  from: Date;
  hours: number;
  /**
   * Whether the gateway's own delivery is counted. Without it the main
   * server's share is unknown and no overall figure can be given.
   */
  gatewayCounted: boolean;
  points: OverviewPoint[];
}

/** Brings together who delivered what: the main server, the edges, the viewers. */
@Injectable()
export class DeliveryOverviewService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(SharingStatsService) private readonly sharing: SharingStatsService,
  ) {}

  async overview(range: TrafficRange): Promise<DeliveryOverview> {
    // What players reported to this process a moment ago belongs to the picture.
    await this.sharing.flush();
    const hours = TRAFFIC_RANGES[range];
    const from = new Date(hourOf(Date.now()).getTime() - (hours - 1) * 3_600_000);
    const where = { hour: { gte: from } };
    const [origin, edges, viewers] = await Promise.all([
      this.prisma.originTrafficHour.groupBy({ by: ['hour'], where, _sum: { bytes: true } }),
      this.prisma.edgeTrafficHour.groupBy({
        by: ['hour'],
        where,
        _sum: { bytes: true, fetchedBytes: true },
      }),
      this.prisma.sharingHour.groupBy({ by: ['hour'], where, _sum: { fromViewers: true } }),
    ]);

    const byHour = new Map<number, OverviewPoint>();
    const at = (hour: Date): OverviewPoint => {
      const seconds = Math.round(hour.getTime() / 1000);
      let point = byHour.get(seconds);
      if (!point) {
        point = [seconds, 0, 0, 0, 0];
        byHour.set(seconds, point);
      }
      return point;
    };
    for (const row of origin) {
      at(row.hour)[1] = Number(row._sum.bytes ?? 0);
    }
    for (const row of edges) {
      const point = at(row.hour);
      point[2] = Number(row._sum.bytes ?? 0);
      point[3] = Number(row._sum.fetchedBytes ?? 0);
    }
    for (const row of viewers) {
      at(row.hour)[4] = Number(row._sum.fromViewers ?? 0);
    }

    return {
      range,
      from,
      hours,
      gatewayCounted: this.config.gatewayInternalUrl !== null,
      points: [...byHour.values()].sort((a, b) => a[0] - b[0]),
    };
  }
}
