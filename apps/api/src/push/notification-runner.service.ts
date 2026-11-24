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
import { AnnouncerService } from './announcer.service.js';
import { CampaignsService } from './campaigns.service.js';
import { NotificationsService } from './notifications.service.js';
import { type PushMessage, PushSender } from './push-sender.service.js';

const LOOK_EVERY_MS = 5000;
/** Looking for what is new in the catalog, and for messages whose time has come, is done less often. */
const SLOW_EVERY_LOOKS = 6;
const BATCH = 100;
/** So that one round ends: what is left is taken by the next. */
const MAX_BATCHES_PER_LOOK = 50;
/** Notifications that are sent at the same time. */
const TOGETHER = 10;
/** A notification that was taken is not taken again for this long, should the process die over it. */
const HOLD_SECONDS = 120;
/** How long to wait before the next try, after each failed one. After the last, it is given up. */
export const RETRY_AFTER_SECONDS = [60, 5 * 60, 30 * 60];
/** A device the push service refused this often in a row is forgotten. */
const MAX_DEVICE_FAILURES = 10;
/** Notifications older than this leave the lists of viewers. */
export const KEEP_NOTIFICATIONS_MS = 90 * 24 * 60 * 60 * 1000;
const PRUNE_EVERY_LOOKS = 720;

export interface Pushed {
  /** Notifications taken, and of those the ones at least one device took. */
  taken: number;
  sent: number;
  /** Devices that were forgotten because they are gone. */
  forgotten: number;
}

/**
 * Sends what is waiting: it tells viewers what is new in the catalog, makes
 * the notifications of messages whose time has come, and pushes
 * notifications to devices.
 *
 * It runs in every process. Each takes what it sends with a lock on the row,
 * so two never send the same.
 */
@Injectable()
export class NotificationRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotificationRunner.name);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private looks = 0;

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(AnnouncerService) private readonly announcer: AnnouncerService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(PushSender) private readonly sender: PushSender,
  ) {}

  onApplicationBootstrap(): void {
    // Tests call look() themselves, so that nothing is sent behind their back.
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

  /** One round. Never throws: what goes wrong is logged and tried again with the next round. */
  async look(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      if (this.looks % SLOW_EVERY_LOOKS === 0) {
        const told = await this.announcer.announce();
        if (told.notifications > 0) {
          this.logger.log(
            `Told viewers of ${told.titles} new titles and new episodes of ${told.series} series: ${told.notifications} notifications`,
          );
        }
        await this.campaigns.sendDue();
      }
      if (this.looks % PRUNE_EVERY_LOOKS === 1) {
        await this.prune();
      }
      this.looks += 1;
      await this.pushAll();
    } catch (error) {
      this.logger.warn(
        `Could not send notifications: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.busy = false;
    }
  }

  /**
   * Sends what an admin just asked for without waiting for the next round:
   * the messages whose time has come, and what waits for devices. Answers at
   * once; the sending goes on behind.
   */
  kick(): void {
    // Tests send when they say so, like the timer.
    if (this.busy || this.config.nodeEnv === 'test') {
      return;
    }
    this.busy = true;
    void (async () => {
      try {
        await this.campaigns.sendDue();
        await this.pushAll();
      } catch (error) {
        this.logger.warn(
          `Could not send notifications: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        this.busy = false;
      }
    })();
  }

  /** Pushes batch after batch until nothing waits, up to a number of batches per round. */
  private async pushAll(): Promise<void> {
    for (let batch = 0; batch < MAX_BATCHES_PER_LOOK; batch += 1) {
      if ((await this.push()).taken < BATCH) {
        return;
      }
    }
  }

  /** Pushes one batch of the notifications that wait to the devices of their viewers. */
  async push(): Promise<Pushed> {
    const taken = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE notifications
      SET "nextAttemptAt" = now() + make_interval(secs => ${HOLD_SECONDS})
      WHERE id IN (
        SELECT id FROM notifications
        WHERE "pushState" = 'PENDING' AND "nextAttemptAt" <= now()
        ORDER BY "nextAttemptAt", id
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    const result: Pushed = { taken: taken.length, sent: 0, forgotten: 0 };
    if (taken.length === 0) {
      return result;
    }
    const rows = await this.prisma.notification.findMany({
      where: { id: { in: taken.map((row) => row.id) } },
    });
    const now = new Date();
    // Only devices whose sign-in still holds: signing out, here or from another device, ends it.
    const devices = await this.prisma.pushDevice.findMany({
      where: {
        viewerId: { in: [...new Set(rows.map((row) => row.viewerId))] },
        session: { revokedAt: null, expiresAt: { gt: now } },
      },
    });
    const byViewer = new Map<string, typeof devices>();
    for (const device of devices) {
      byViewer.set(device.viewerId, [...(byViewer.get(device.viewerId) ?? []), device]);
    }

    const one = async (row: (typeof rows)[number]): Promise<void> => {
      const targets = byViewer.get(row.viewerId) ?? [];
      if (targets.length === 0) {
        // Nothing to push to: it stays in the list of the viewer.
        await this.prisma.notification.update({
          where: { id: row.id },
          data: { pushState: 'NONE' },
        });
        return;
      }
      const message: PushMessage = {
        id: row.id,
        topic: row.topic,
        title: row.title,
        body: row.body,
        image: this.notifications.absolute(row.imageUrl, this.config.mediaBaseUrl),
        link: this.notifications.absolute(row.link, this.config.siteUrl) ?? row.link,
        data: (row.data ?? {}) as Record<string, string>,
      };
      const outcomes = await Promise.all(
        targets.map(async (device) => ({
          device,
          result: await this.sender.send(device, message),
        })),
      );
      let sent = 0;
      let retry = false;
      for (const { device, result: outcome } of outcomes) {
        if (outcome.status === 'sent') {
          sent += 1;
          await this.prisma.pushDevice.updateMany({
            where: { id: device.id },
            data: { failures: 0, lastSentAt: now },
          });
        } else if (
          outcome.status === 'gone' ||
          (outcome.status === 'retry' && device.failures + 1 >= MAX_DEVICE_FAILURES)
        ) {
          result.forgotten += (
            await this.prisma.pushDevice.deleteMany({ where: { id: device.id } })
          ).count;
          byViewer.set(
            row.viewerId,
            (byViewer.get(row.viewerId) ?? []).filter((entry) => entry.id !== device.id),
          );
        } else if (outcome.status === 'retry') {
          retry = true;
          await this.prisma.pushDevice.updateMany({
            where: { id: device.id },
            data: { failures: { increment: 1 } },
          });
        } else {
          this.logger.warn(`A notification was not sent: ${outcome.reason}`);
        }
      }

      const wait = RETRY_AFTER_SECONDS[row.pushAttempts];
      if (sent > 0) {
        result.sent += 1;
        await this.prisma.notification.update({
          where: { id: row.id },
          data: { pushState: 'SENT', devices: sent, pushAttempts: { increment: 1 } },
        });
      } else if (retry && wait !== undefined) {
        await this.prisma.notification.update({
          where: { id: row.id },
          data: {
            pushAttempts: { increment: 1 },
            nextAttemptAt: new Date(now.getTime() + wait * 1000),
          },
        });
      } else {
        await this.prisma.notification.update({
          where: { id: row.id },
          data: { pushState: 'FAILED', pushAttempts: { increment: 1 } },
        });
      }
    };
    for (let start = 0; start < rows.length; start += TOGETHER) {
      await Promise.all(rows.slice(start, start + TOGETHER).map(one));
    }
    return result;
  }

  /** Takes old notifications out of the lists of viewers. */
  async prune(now: Date = new Date()): Promise<number> {
    const removed = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - KEEP_NOTIFICATIONS_MS) } },
    });
    return removed.count;
  }
}
