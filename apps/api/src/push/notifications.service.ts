// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type NotificationTopic, type Prisma, PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import type { RegisterDeviceInput } from './push.schemas.js';
import { PushSender } from './push-sender.service.js';
import { isPublicPoint, isPushServiceAddress } from './web-push.js';

export const TOPICS = ['NEW_EPISODES', 'NEW_TITLES', 'ANNOUNCEMENTS'] as const;

/** How many notifications the list of a viewer shows at once. */
const PAGE = 30;
/** A viewer has this many devices at most. The one unused longest makes room. */
export const MAX_DEVICES = 20;

export interface NotificationView {
  id: string;
  topic: NotificationTopic;
  title: string;
  body: string;
  /** An address of a picture, or null. */
  image: string | null;
  /** Where it leads on the website, as a path such as "/title/the-long-road". */
  link: string | null;
  /** What it is about, for apps: {"type":"title","slug":"…"}. */
  data: Record<string, string>;
  createdAt: Date;
  read: boolean;
}

export interface NotificationList {
  items: NotificationView[];
  /** How many the viewer has not seen. */
  unread: number;
  /** Pass as `before` for older ones. Null: there are none. */
  next: string | null;
}

/** What is to be told to viewers. */
export interface NotificationContent {
  topic: NotificationTopic;
  title: string;
  body: string;
  imageUrl?: string | null;
  link?: string | null;
  data?: Record<string, string>;
  campaignId?: string | null;
  /** Makes an automatic notification once per viewer. */
  dedupeKey?: string | null;
}

export const tokenHashOf = (provider: string, token: string): string =>
  createHash('sha256').update(`${provider}\n${token}`).digest('hex');

/**
 * Notifications from the side of a viewer: the devices that take them, the
 * kinds the viewer wants, and the list of what was sent.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(PushSender) private readonly sender: PushSender,
  ) {}

  /**
   * Notes that a device takes notifications for the account signed in on
   * it. Registering the same device again, also for another account, moves
   * it: a device belongs to whoever is signed in on it now.
   *
   * @throws BadRequestException when a browser names an address that is not a push service.
   */
  async register(
    viewerId: string,
    sessionId: string,
    input: RegisterDeviceInput,
  ): Promise<{ id: string }> {
    const web = input.provider === 'WEB' ? input.subscription : null;
    const token = web ? web.endpoint : (input as { token: string }).token;
    if (web) {
      if (!isPushServiceAddress(web.endpoint, this.sender.webHosts())) {
        throw new BadRequestException('This is not the address of a push service');
      }
      if (
        !isPublicPoint(web.keys.p256dh) ||
        Buffer.from(web.keys.auth, 'base64url').length !== 16
      ) {
        throw new BadRequestException('These are not the keys of a subscription');
      }
    }
    const tokenHash = tokenHashOf(input.provider, token);
    const fields = {
      viewerId,
      sessionId,
      provider: input.provider,
      token,
      p256dh: web?.keys.p256dh ?? null,
      auth: web?.keys.auth ?? null,
      platform: input.platform,
      appVersion: input.appVersion ?? null,
      language: input.language ?? null,
      failures: 0,
      lastSeenAt: new Date(),
    };
    const device = await this.prisma.pushDevice.upsert({
      where: { tokenHash },
      create: { ...fields, tokenHash },
      update: fields,
      select: { id: true },
    });
    // The oldest go when an account gathers more devices than anyone has.
    const extra = await this.prisma.pushDevice.findMany({
      where: { viewerId },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
      skip: MAX_DEVICES,
      select: { id: true },
    });
    if (extra.length > 0) {
      await this.prisma.pushDevice.deleteMany({ where: { id: { in: extra.map((d) => d.id) } } });
    }
    return device;
  }

  /** Stops notifications for a device. Safe to repeat. */
  async unregister(viewerId: string, id: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { id, viewerId } });
  }

  /** The same by what the device registered with, for one that forgot its id. */
  async unregisterToken(viewerId: string, provider: 'WEB' | 'FCM', token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({
      where: { viewerId, tokenHash: tokenHashOf(provider, token) },
    });
  }

  async settings(
    viewerId: string,
    sessionId: string,
  ): Promise<{ topics: Record<NotificationTopic, boolean>; devices: number; thisDevice: boolean }> {
    const [viewer, devices, here] = await Promise.all([
      this.prisma.viewer.findUniqueOrThrow({
        where: { id: viewerId },
        select: { mutedTopics: true },
      }),
      this.prisma.pushDevice.count({ where: { viewerId } }),
      this.prisma.pushDevice.count({ where: { viewerId, sessionId } }),
    ]);
    return {
      topics: Object.fromEntries(
        TOPICS.map((topic) => [topic, !viewer.mutedTopics.includes(topic)]),
      ) as Record<NotificationTopic, boolean>,
      devices,
      thisDevice: here > 0,
    };
  }

  async setTopics(
    viewerId: string,
    topics: Partial<Record<NotificationTopic, boolean>>,
  ): Promise<void> {
    const viewer = await this.prisma.viewer.findUniqueOrThrow({
      where: { id: viewerId },
      select: { mutedTopics: true },
    });
    const muted = new Set(viewer.mutedTopics);
    for (const topic of TOPICS) {
      if (topics[topic] === false) {
        muted.add(topic);
      } else if (topics[topic] === true) {
        muted.delete(topic);
      }
    }
    await this.prisma.viewer.update({
      where: { id: viewerId },
      data: { mutedTopics: TOPICS.filter((topic) => muted.has(topic)) },
    });
  }

  /** What was sent to a viewer, the newest first. */
  async list(viewerId: string, before?: string): Promise<NotificationList> {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { viewerId, ...(before ? { id: { lt: before } } : {}) },
        // Ids are made in the order of time, so they order and page at once.
        orderBy: { id: 'desc' },
        take: PAGE + 1,
      }),
      this.prisma.notification.count({ where: { viewerId, readAt: null } }),
    ]);
    const items = rows.slice(0, PAGE);
    return {
      items: items.map((row) => ({
        id: row.id,
        topic: row.topic,
        title: row.title,
        body: row.body,
        image: this.absolute(row.imageUrl, this.config.mediaBaseUrl),
        link: row.link,
        data: (row.data ?? {}) as Record<string, string>,
        createdAt: row.createdAt,
        read: row.readAt !== null,
      })),
      unread,
      next: rows.length > PAGE ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async unread(viewerId: string): Promise<number> {
    return this.prisma.notification.count({ where: { viewerId, readAt: null } });
  }

  /** Marks notifications as seen: the ones named, or all. */
  async markRead(viewerId: string, ids?: readonly string[]): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { viewerId, readAt: null, ...(ids ? { id: { in: [...ids] } } : {}) },
      data: { readAt: new Date() },
    });
    return result.count;
  }

  /**
   * Notes that the viewer opened a notification, from the list or from a
   * device. Opening is also seeing.
   *
   * @throws NotFoundException when the viewer has no such notification.
   */
  async markOpened(viewerId: string, id: string): Promise<void> {
    const now = new Date();
    const found = await this.prisma.notification.findFirst({
      where: { id, viewerId },
      select: { openedAt: true, readAt: true },
    });
    if (!found) {
      throw new NotFoundException('Notification not found');
    }
    await this.prisma.notification.update({
      where: { id },
      data: { openedAt: found.openedAt ?? now, readAt: found.readAt ?? now },
    });
  }

  /** Takes a notification out of the list of a viewer. Safe to repeat. */
  async remove(viewerId: string, id: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { id, viewerId } });
  }

  /**
   * Makes a notification for each of some viewers. It is in their list at
   * once and goes to their devices with the next round of sending.
   *
   * @returns How many were made. Viewers who have one with the same dedupe key get no second.
   */
  async create(viewerIds: readonly string[], content: NotificationContent): Promise<number> {
    if (viewerIds.length === 0) {
      return 0;
    }
    const data: Prisma.NotificationCreateManyInput[] = viewerIds.map((viewerId) => ({
      viewerId,
      topic: content.topic,
      title: content.title,
      body: content.body,
      imageUrl: content.imageUrl ?? null,
      link: content.link ?? null,
      data: content.data ?? {},
      campaignId: content.campaignId ?? null,
      dedupeKey: content.dedupeKey ?? null,
      pushState: 'PENDING',
    }));
    return (await this.prisma.notification.createMany({ data, skipDuplicates: true })).count;
  }

  /** An address a device outside the website can load, or null when there is no way to make one. */
  absolute(path: string | null, base: string): string | null {
    if (!path) {
      return null;
    }
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    const origin = base || this.config.siteUrl;
    return origin ? `${origin.replace(/\/$/, '')}${path}` : null;
  }
}
