// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  PrismaClient,
  type Webhook,
  type WebhookDelivery,
  type WebhookDeliveryStatus,
} from '@onyx/database';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { AppConfig } from '../config/app-config.js';
import { SecretBox } from '../crypto/secret-box.js';
import { envelopeOf, WebhookDeliveryService } from './webhook-delivery.service.js';
import {
  TEST_EVENT,
  WEBHOOK_EVENT_LIST,
  type WebhookEnvelope,
  type WebhookEventInfo,
} from './webhook-events.js';
import { MAX_ATTEMPTS, RETRY_DELAYS_SECONDS } from './webhook-retry.js';
import { generateWebhookSecret, SIGNATURE_TOLERANCE_SECONDS } from './webhook-signature.js';
import { urlProblem } from './webhook-target.js';
import type {
  CreateWebhookInput,
  ListDeliveriesInput,
  UpdateWebhookInput,
} from './webhooks.schemas.js';

/** How many webhooks an installation can have. */
export const MAX_WEBHOOKS = 20;

/** A webhook as the panel shows it. Never with its secret. */
export interface WebhookView {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  /** Since when nothing got through. Null while the last delivery did. */
  failingSince: Date | null;
  /** Why the system switched it off, when it did. */
  disabledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** The last try of any delivery. */
  lastDelivery: { status: WebhookDeliveryStatus; at: Date; event: string } | null;
  /** Deliveries of the last 24 hours, by what became of them. */
  recent: { delivered: number; failed: number; pending: number };
}

/** A webhook with its signing secret: shown once, when it is made or the secret is replaced. */
export interface WebhookWithSecret extends WebhookView {
  secret: string;
}

export interface DeliveryView {
  id: string;
  event: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  /** How many tries a delivery gets before it is given up. */
  maxAttempts: number;
  nextAttemptAt: Date | null;
  responseStatus: number | null;
  error: string | null;
  durationMs: number | null;
  createdAt: Date;
  attemptedAt: Date | null;
  deliveredAt: Date | null;
}

export interface DeliveryDetail extends DeliveryView {
  /** The body as it is sent and signed. */
  payload: WebhookEnvelope;
  /** The start of what the address answered at the last try. */
  responseBody: string | null;
}

/** One hour of deliveries of a webhook, by what became of them. */
export interface WebhookActivityHour {
  /** The start of the hour. */
  start: Date;
  delivered: number;
  failed: number;
  pending: number;
}

/** What the panel needs to explain webhooks: the events, and how requests are signed and retried. */
export interface WebhookReference {
  events: readonly WebhookEventInfo[];
  /** Seconds between tries after a failure. */
  retryDelaysSeconds: readonly number[];
  /** How old a request may be before a receiver should refuse it. */
  signatureToleranceSeconds: number;
  /** Whether webhooks may go to private and local addresses. */
  targets: 'any' | 'public';
  maxWebhooks: number;
}

function toDeliveryView(delivery: WebhookDelivery): DeliveryView {
  return {
    id: delivery.id,
    event: delivery.event,
    status: delivery.status,
    attempts: delivery.attempts,
    maxAttempts: delivery.event === TEST_EVENT ? 1 : MAX_ATTEMPTS,
    nextAttemptAt: delivery.status === 'PENDING' ? delivery.nextAttemptAt : null,
    responseStatus: delivery.responseStatus,
    error: delivery.error,
    durationMs: delivery.durationMs,
    createdAt: delivery.createdAt,
    attemptedAt: delivery.attemptedAt,
    deliveredAt: delivery.deliveredAt,
  };
}

/** Webhooks as admins manage them. */
@Injectable()
export class WebhooksService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SecretBox) private readonly secrets: SecretBox,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(WebhookDeliveryService) private readonly deliveries: WebhookDeliveryService,
  ) {}

  reference(): WebhookReference {
    return {
      events: WEBHOOK_EVENT_LIST,
      retryDelaysSeconds: RETRY_DELAYS_SECONDS,
      signatureToleranceSeconds: SIGNATURE_TOLERANCE_SECONDS,
      targets: this.config.webhookTargets,
      maxWebhooks: MAX_WEBHOOKS,
    };
  }

  private async views(webhooks: Webhook[]): Promise<WebhookView[]> {
    if (webhooks.length === 0) {
      return [];
    }
    const ids = webhooks.map((webhook) => webhook.id);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [counts, last] = await Promise.all([
      this.prisma.webhookDelivery.groupBy({
        by: ['webhookId', 'status'],
        where: { webhookId: { in: ids }, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.webhookDelivery.findMany({
        where: { webhookId: { in: ids }, attemptedAt: { not: null } },
        orderBy: { attemptedAt: 'desc' },
        distinct: ['webhookId'],
        select: { webhookId: true, status: true, attemptedAt: true, event: true },
      }),
    ]);
    return webhooks.map((webhook) => {
      const count = (status: WebhookDeliveryStatus) =>
        counts.find((row) => row.webhookId === webhook.id && row.status === status)?._count._all ??
        0;
      const latest = last.find((row) => row.webhookId === webhook.id);
      return {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        isActive: webhook.isActive,
        failingSince: webhook.failingSince,
        disabledReason: webhook.disabledReason,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
        lastDelivery: latest
          ? { status: latest.status, at: latest.attemptedAt as Date, event: latest.event }
          : null,
        recent: {
          delivered: count('DELIVERED'),
          failed: count('FAILED'),
          pending: count('PENDING'),
        },
      };
    });
  }

  private async view(webhook: Webhook): Promise<WebhookView> {
    return (await this.views([webhook]))[0] as WebhookView;
  }

  async list(): Promise<WebhookView[]> {
    return this.views(await this.prisma.webhook.findMany({ orderBy: { createdAt: 'asc' } }));
  }

  /** @throws NotFoundException */
  async get(id: string): Promise<WebhookView> {
    return this.view(await this.findOrThrow(id));
  }

  /**
   * The deliveries of the last 24 hours, hour by hour, oldest first. Hours
   * without deliveries are there with zeros, so the result draws as it is.
   *
   * @throws NotFoundException
   */
  async activity(id: string, now: Date = new Date()): Promise<WebhookActivityHour[]> {
    await this.findOrThrow(id);
    const hour = 60 * 60 * 1000;
    const last = Math.floor(now.getTime() / hour) * hour;
    const first = last - 23 * hour;
    const rows = await this.prisma.$queryRaw<
      { start: Date; status: WebhookDeliveryStatus; count: number }[]
    >`
      SELECT date_trunc('hour', "createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS start,
             status, count(*)::int AS count
      FROM webhook_deliveries
      WHERE "webhookId" = ${id}::uuid AND "createdAt" >= ${new Date(first)}
      GROUP BY 1, 2`;
    return Array.from({ length: 24 }, (_, index) => {
      const start = first + index * hour;
      const count = (status: WebhookDeliveryStatus) =>
        rows.find((row) => row.start.getTime() === start && row.status === status)?.count ?? 0;
      return {
        start: new Date(start),
        delivered: count('DELIVERED'),
        failed: count('FAILED'),
        pending: count('PENDING'),
      };
    });
  }

  private assertUrl(url: string): void {
    const problem = urlProblem(url, this.config.webhookTargets);
    if (problem) {
      throw new UnprocessableEntityException(problem);
    }
  }

  /**
   * @returns The webhook with its signing secret, which is not shown again.
   * @throws UnprocessableEntityException for an address that cannot be used.
   * @throws ConflictException when there are twenty already.
   */
  async create(input: CreateWebhookInput, adminId: string | null): Promise<WebhookWithSecret> {
    this.assertUrl(input.url);
    if ((await this.prisma.webhook.count()) >= MAX_WEBHOOKS) {
      throw new ConflictException(
        `There are ${MAX_WEBHOOKS} webhooks already. Delete one you no longer use first.`,
      );
    }
    const secret = generateWebhookSecret();
    const webhook = await this.prisma.webhook.create({
      data: {
        name: input.name,
        url: input.url,
        events: input.events,
        secret: this.secrets.encrypt(secret),
        createdById: adminId,
      },
    });
    return { ...(await this.view(webhook)), secret };
  }

  /**
   * Switching a webhook on again clears why it was switched off and since
   * when it failed: it starts with a clean record. Switching it off gives up
   * what was still waiting.
   *
   * @throws NotFoundException
   * @throws UnprocessableEntityException for an address that cannot be used.
   */
  async update(id: string, input: UpdateWebhookInput): Promise<WebhookView> {
    const webhook = await this.findOrThrow(id);
    if (input.url !== undefined) {
      this.assertUrl(input.url);
    }
    if (input.isActive === false && webhook.isActive) {
      await this.deliveries.switchOff(id, null);
    }
    const updated = await this.prisma.webhook.update({
      where: { id },
      data: {
        name: input.name,
        url: input.url,
        events: input.events,
        ...(input.isActive === true && !webhook.isActive
          ? { isActive: true, disabledReason: null, failingSince: null }
          : {}),
      },
    });
    return this.view(updated);
  }

  /** @throws NotFoundException */
  async remove(id: string): Promise<Webhook> {
    const webhook = await this.findOrThrow(id);
    await this.prisma.webhook.delete({ where: { id } });
    return webhook;
  }

  /**
   * Replaces the signing secret. The old one stops working at once.
   *
   * @throws NotFoundException
   */
  async rollSecret(id: string): Promise<WebhookWithSecret> {
    await this.findOrThrow(id);
    const secret = generateWebhookSecret();
    const updated = await this.prisma.webhook.update({
      where: { id },
      data: { secret: this.secrets.encrypt(secret) },
    });
    return { ...(await this.view(updated)), secret };
  }

  /**
   * Sends a test message now and waits for the answer. It is tried once, is
   * sent whatever the webhook listens to and also while it is switched off,
   * and does not count for or against its health.
   *
   * @throws NotFoundException
   */
  async test(id: string, sentBy: string): Promise<DeliveryDetail> {
    const webhook = await this.findOrThrow(id);
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: TEST_EVENT,
        data: {
          message: 'This is a test from your Spark Onyx Stream installation.',
          webhook: { id: webhook.id, name: webhook.name },
          sentBy,
        },
        // No time for a next try: the runner leaves it alone.
        nextAttemptAt: null,
      },
    });
    const attempted = await this.deliveries.attempt(delivery.id, false);
    return this.detail(attempted ?? delivery);
  }

  /** @throws NotFoundException */
  async listDeliveries(id: string, input: ListDeliveriesInput): Promise<Page<DeliveryView>> {
    await this.findOrThrow(id);
    const where = {
      webhookId: id,
      ...(input.status ? { status: input.status } : {}),
      ...(input.event ? { event: input.event } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(input),
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);
    return toPage(rows.map(toDeliveryView), total, input);
  }

  private detail(delivery: WebhookDelivery): DeliveryDetail {
    return {
      ...toDeliveryView(delivery),
      payload: envelopeOf(delivery),
      responseBody: delivery.responseBody,
    };
  }

  /** @throws NotFoundException */
  async getDelivery(webhookId: string, deliveryId: string): Promise<DeliveryDetail> {
    const delivery = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, webhookId },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    return this.detail(delivery);
  }

  /**
   * Sends a delivery again, as a new one with the same content: what became
   * of the first stays on record.
   *
   * @throws NotFoundException
   * @throws ConflictException while the webhook is switched off.
   */
  async redeliver(webhookId: string, deliveryId: string): Promise<DeliveryView> {
    const [webhook, delivery] = await Promise.all([
      this.findOrThrow(webhookId),
      this.prisma.webhookDelivery.findFirst({ where: { id: deliveryId, webhookId } }),
    ]);
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    if (!webhook.isActive) {
      throw new ConflictException('Switch the webhook on first. It sends nothing while it is off.');
    }
    const again = await this.prisma.webhookDelivery.create({
      data: {
        webhookId,
        event: delivery.event,
        data: delivery.data as object,
        nextAttemptAt: new Date(),
      },
    });
    return toDeliveryView(again);
  }

  private async findOrThrow(id: string): Promise<Webhook> {
    const webhook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }
    return webhook;
  }
}
