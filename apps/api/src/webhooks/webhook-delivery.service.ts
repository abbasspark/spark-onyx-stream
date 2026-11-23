// SPDX-License-Identifier: AGPL-3.0-only
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient, type Webhook, type WebhookDelivery } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import { SecretBox } from '../crypto/secret-box.js';
import { listensTo, type WebhookEnvelope, type WebhookEventName } from './webhook-events.js';
import {
  ATTEMPT_TIMEOUT_MS,
  isSuccess,
  nextAttemptAfter,
  RESPONSE_KEPT,
  shouldDisable,
} from './webhook-retry.js';
import { signWebhook } from './webhook-signature.js';
import { addressProblem } from './webhook-target.js';

/** What one try came to. */
export interface AttemptOutcome {
  ok: boolean;
  /** The status the address answered with, when it answered. */
  status: number | null;
  /** The start of its answer. */
  body: string | null;
  /** Why there was no answer, when there was none. */
  error: string | null;
  durationMs: number;
}

/** What is said to an admin whose webhook the system switched off. */
export const DISABLED_REASON =
  'Switched off automatically: nothing got through for three days. Check the address, then switch it on again.';

/** The body of a delivery, exactly as it is sent and signed. */
export function envelopeOf(delivery: Pick<WebhookDelivery, 'id' | 'event' | 'data' | 'createdAt'>) {
  const envelope: WebhookEnvelope = {
    id: delivery.id,
    event: delivery.event,
    createdAt: delivery.createdAt.toISOString(),
    data: delivery.data,
  };
  return envelope;
}

/**
 * Hands events to webhooks and makes the requests.
 *
 * In every kind of process: videos become ready in a worker, backups are
 * made by the scheduler, viewers sign up at the API, and each of them has
 * something to tell.
 */
@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SecretBox) private readonly secrets: SecretBox,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  /**
   * Tells every webhook that listens for an event. The requests are made a
   * moment later by whichever process runs the deliveries; this only writes
   * down what to send.
   *
   * Never fails: what is being announced has happened either way, and must
   * not be undone or reported as failed because a note about it could not be
   * written.
   */
  async emit(event: WebhookEventName, data: Record<string, unknown>): Promise<void> {
    try {
      const webhooks = await this.prisma.webhook.findMany({
        where: { isActive: true },
        select: { id: true, events: true },
      });
      const listening = webhooks.filter((webhook) => listensTo(webhook.events, event));
      if (listening.length === 0) {
        return;
      }
      const now = new Date();
      await this.prisma.webhookDelivery.createMany({
        data: listening.map((webhook) => ({
          webhookId: webhook.id,
          event,
          data: data as object,
          nextAttemptAt: now,
        })),
      });
    } catch (error) {
      this.logger.error(
        `Could not queue the webhooks for ${event}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Whether anybody listens for an event: looked at before reading what would be sent. */
  private async wanted(...events: WebhookEventName[]): Promise<boolean> {
    try {
      const webhooks = await this.prisma.webhook.findMany({
        where: { isActive: true },
        select: { events: true },
      });
      return webhooks.some((webhook) => events.some((event) => listensTo(webhook.events, event)));
    } catch {
      return false;
    }
  }

  /** Runs a piece of announcing that reads from the database. Never fails. */
  private async quietly(what: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(
        `Could not announce ${what}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Says that a video became ready or failed, whichever it now is. */
  async announceAsset(assetId: string): Promise<void> {
    if (!(await this.wanted('asset.ready', 'asset.failed'))) {
      return;
    }
    await this.quietly('an asset', async () => {
      const asset = await this.prisma.asset.findUnique({
        where: { id: assetId },
        select: { id: true, title: true, status: true },
      });
      if (asset?.status === 'READY') {
        await this.emit('asset.ready', { asset });
      } else if (asset?.status === 'FAILED') {
        await this.emit('asset.failed', { asset });
      }
    });
  }

  async announceSubscription(
    event: 'subscription.started' | 'subscription.ended',
    subscriptionId: string,
  ): Promise<void> {
    if (!(await this.wanted(event))) {
      return;
    }
    await this.quietly('a subscription', async () => {
      const subscription = await this.prisma.subscription.findUnique({
        where: { id: subscriptionId },
        select: {
          id: true,
          status: true,
          source: true,
          plan: { select: { id: true, name: true } },
          viewer: { select: { id: true, email: true } },
        },
      });
      if (subscription) {
        const { viewer, ...rest } = subscription;
        await this.emit(event, { subscription: rest, viewer });
      }
    });
  }

  async announcePurchase(purchaseId: string): Promise<void> {
    if (!(await this.wanted('purchase.completed'))) {
      return;
    }
    await this.quietly('a purchase', async () => {
      const purchase = await this.prisma.purchase.findUnique({
        where: { id: purchaseId },
        select: {
          id: true,
          kind: true,
          source: true,
          title: { select: { id: true, name: true } },
          viewer: { select: { id: true, email: true } },
        },
      });
      if (purchase) {
        const { viewer, title, ...rest } = purchase;
        await this.emit('purchase.completed', { purchase: rest, title, viewer });
      }
    });
  }

  async announcePayment(paymentId: string): Promise<void> {
    if (!(await this.wanted('payment.received'))) {
      return;
    }
    await this.quietly('a payment', async () => {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          amount: true,
          currency: true,
          source: true,
          kind: true,
          viewerId: true,
          viewerEmail: true,
        },
      });
      if (payment) {
        const { viewerId, viewerEmail, ...rest } = payment;
        await this.emit('payment.received', {
          payment: rest,
          viewer: { id: viewerId, email: viewerEmail },
        });
      }
    });
  }

  /** Says how a backup ended, once it has. */
  async announceBackup(backupId: string): Promise<void> {
    if (!(await this.wanted('backup.completed', 'backup.failed'))) {
      return;
    }
    await this.quietly('a backup', async () => {
      const backup = await this.prisma.backup.findUnique({ where: { id: backupId } });
      const scheduled = backup?.trigger === 'SCHEDULED';
      if (backup?.status === 'COMPLETED') {
        await this.emit('backup.completed', {
          backup: { id: backup.id, bytes: Number(backup.sizeBytes ?? 0), scheduled },
        });
      } else if (backup?.status === 'FAILED') {
        await this.emit('backup.failed', {
          backup: { id: backup.id, scheduled, error: backup.error },
        });
      }
    });
  }

  /** Why a host must not be sent to, after looking up where it leads. Null: it may. */
  private async hostProblem(hostname: string): Promise<string | null> {
    const host = hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host)
      ? [host]
      : (await lookup(host, { all: true })).map((entry) => entry.address);
    for (const address of addresses) {
      const problem = addressProblem(address, this.config.webhookTargets);
      if (problem) {
        return isIP(host) ? problem : `${host} leads to ${address}. ${problem}`;
      }
    }
    return null;
  }

  /** Makes one request. Never throws: whatever goes wrong is the outcome. */
  async send(webhook: Webhook, delivery: WebhookDelivery): Promise<AttemptOutcome> {
    const started = Date.now();
    const outcome = (partial: Partial<AttemptOutcome>): AttemptOutcome => ({
      ok: false,
      status: null,
      body: null,
      error: null,
      durationMs: Date.now() - started,
      ...partial,
    });
    try {
      const url = new URL(webhook.url);
      const problem = await this.hostProblem(url.hostname);
      if (problem) {
        return outcome({ error: problem });
      }
      const body = JSON.stringify(envelopeOf(delivery));
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Spark-Onyx-Stream-Webhooks/1',
          'X-Onyx-Event': delivery.event,
          'X-Onyx-Delivery': delivery.id,
          'X-Onyx-Timestamp': String(timestamp),
          'X-Onyx-Signature': signWebhook(this.secrets.decrypt(webhook.secret), timestamp, body),
        },
        body,
        // A redirect could lead anywhere, also to places a webhook must not reach.
        redirect: 'manual',
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      const text = await response.text().catch(() => '');
      return outcome({
        ok: isSuccess(response.status),
        status: response.status,
        body: text.slice(0, RESPONSE_KEPT) || null,
        error:
          response.status >= 300 && response.status < 400
            ? 'The address answered with a redirect, which is not followed. Enter the address it leads to.'
            : null,
      });
    } catch (error) {
      const cause =
        error instanceof Error
          ? (error.cause as { code?: string; message?: string } | undefined)
          : undefined;
      const message =
        error instanceof Error && error.name === 'TimeoutError'
          ? `No answer within ${ATTEMPT_TIMEOUT_MS / 1000} seconds`
          : cause?.code === 'ECONNREFUSED'
            ? 'The connection was refused: nothing is listening at this address'
            : cause?.code === 'ENOTFOUND' || (error as { code?: string }).code === 'ENOTFOUND'
              ? 'The host name could not be found'
              : error instanceof Error
                ? [error.message, cause?.code ?? cause?.message].filter(Boolean).join(': ')
                : String(error);
      return outcome({ error: message.slice(0, 300) });
    }
  }

  /**
   * Tries a delivery once and writes down what came of it.
   *
   * @param retry Whether a failure is tried again later. A test is not.
   * @returns The delivery after the try, or null when it or its webhook is gone.
   */
  async attempt(deliveryId: string, retry: boolean): Promise<WebhookDelivery | null> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });
    if (!delivery) {
      return null;
    }
    const { webhook, ...row } = delivery;
    const result = await this.send(webhook, row);
    const now = new Date();
    const attempts = row.attempts + 1;
    const next = result.ok || !retry ? null : nextAttemptAfter(attempts, now);
    const updated = await this.prisma.webhookDelivery
      .update({
        where: { id: deliveryId },
        data: {
          attempts,
          attemptedAt: now,
          responseStatus: result.status,
          responseBody: result.body,
          error: result.error,
          durationMs: result.durationMs,
          status: result.ok ? 'DELIVERED' : next ? 'PENDING' : 'FAILED',
          nextAttemptAt: next,
          deliveredAt: result.ok ? now : null,
        },
      })
      .catch(() => null);
    if (retry) {
      await this.noteHealth(webhook, result.ok, now);
    }
    return updated;
  }

  /** Remembers since when a webhook fails, and switches it off when that is too long. */
  private async noteHealth(webhook: Webhook, ok: boolean, now: Date): Promise<void> {
    if (ok) {
      if (webhook.failingSince) {
        await this.prisma.webhook.updateMany({
          where: { id: webhook.id },
          data: { failingSince: null },
        });
      }
      return;
    }
    const failingSince = webhook.failingSince ?? now;
    if (shouldDisable(failingSince, now)) {
      await this.switchOff(webhook.id, DISABLED_REASON);
      this.logger.warn(`Webhook "${webhook.name}" was switched off after three days of failures`);
      return;
    }
    if (!webhook.failingSince) {
      await this.prisma.webhook.updateMany({
        where: { id: webhook.id, failingSince: null },
        data: { failingSince },
      });
    }
  }

  /** Switches a webhook off and gives up what was still waiting for it. */
  async switchOff(webhookId: string, reason: string | null): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.webhook.updateMany({
        where: { id: webhookId },
        data: { isActive: false, disabledReason: reason },
      }),
      this.prisma.webhookDelivery.updateMany({
        where: { webhookId, status: 'PENDING' },
        data: {
          status: 'FAILED',
          nextAttemptAt: null,
          error: 'Not sent: the webhook was switched off',
        },
      }),
    ]);
  }
}
