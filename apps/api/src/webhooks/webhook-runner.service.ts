// SPDX-License-Identifier: AGPL-3.0-only
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import { WebhookDeliveryService } from './webhook-delivery.service.js';
import { KEEP_DELIVERIES_MS } from './webhook-retry.js';

/** How often it looks for deliveries that are due, in milliseconds. */
const LOOK_EVERY_MS = 2000;
/** Deliveries taken per look. */
const BATCH = 20;
/** How long a delivery is held by the process that took it, in seconds. */
const HOLD_SECONDS = 120;
/** Old deliveries are cleared out every this many looks: about once an hour. */
const PRUNE_EVERY_LOOKS = 1800;

/**
 * Makes the requests of webhooks: looks every two seconds for deliveries
 * that are due and tries them. Runs in processes with the scheduler role;
 * several can run side by side without sending anything twice.
 */
@Injectable()
export class WebhookRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WebhookRunner.name);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private looks = 0;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(WebhookDeliveryService) private readonly deliveries: WebhookDeliveryService,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    // Tests call look() themselves, when they want something sent.
    if (this.config.nodeEnv === 'test') {
      return;
    }
    this.timer = setInterval(() => void this.look(), LOOK_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  /**
   * Takes the deliveries that are due and tries each once.
   *
   * @returns How many were tried.
   */
  async look(): Promise<number> {
    if (this.busy) {
      return 0;
    }
    this.busy = true;
    try {
      // Taken by moving their time forward, under a lock that other processes
      // step around: whoever takes a delivery holds it, and if that process
      // dies, it comes due again by itself.
      const taken = await this.prisma.$queryRaw<
        { id: string; webhookId: string; createdAt: Date }[]
      >`
        UPDATE webhook_deliveries
        SET "nextAttemptAt" = now() + make_interval(secs => ${HOLD_SECONDS})
        WHERE id IN (
          SELECT d.id
          FROM webhook_deliveries d
          JOIN webhooks w ON w.id = d."webhookId"
          WHERE d.status = 'PENDING' AND d."nextAttemptAt" <= now() AND w."isActive"
          ORDER BY d."nextAttemptAt", d."createdAt"
          LIMIT ${BATCH}
          FOR UPDATE OF d SKIP LOCKED
        )
        RETURNING id, "webhookId", "createdAt"`;

      // One after the other for each webhook, oldest first, so a receiver
      // normally hears things in the order they happened; webhooks do not
      // wait for each other.
      const queues = new Map<string, typeof taken>();
      for (const delivery of taken) {
        queues.set(delivery.webhookId, [...(queues.get(delivery.webhookId) ?? []), delivery]);
      }
      await Promise.all(
        [...queues.values()].map(async (queue) => {
          queue.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          for (const { id } of queue) {
            await this.deliveries.attempt(id, true);
          }
        }),
      );

      this.looks += 1;
      if (this.looks % PRUNE_EVERY_LOOKS === 1) {
        await this.prune();
      }
      return taken.length;
    } catch (error) {
      this.logger.warn(
        `Could not look for webhooks to send: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    } finally {
      this.busy = false;
    }
  }

  /** Removes deliveries that are over and older than a month. */
  async prune(now: Date = new Date()): Promise<number> {
    const removed = await this.prisma.webhookDelivery.deleteMany({
      where: {
        status: { in: ['DELIVERED', 'FAILED'] },
        createdAt: { lt: new Date(now.getTime() - KEEP_DELIVERIES_MS) },
      },
    });
    return removed.count;
  }
}
