// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, type StripeEvent } from '@onyx/database';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { AppConfig } from '../config/app-config.js';
import { StripeError } from '../stripe/stripe.client.js';
import { verifySignature } from '../stripe/stripe.signature.js';
import { StripeSyncService } from '../stripe/stripe-sync.service.js';
import { idOf, type StripeEventPayload } from '../stripe/stripe.types.js';
import type { StripeEventView } from './billing.views.js';

/** Where Stripe reports to, after the prefix of the API. */
export const STRIPE_WEBHOOK_ROUTE = 'billing/stripe/webhook';

/** The events the endpoint at Stripe must be subscribed to. */
export const STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
] as const;

export type WebhookOutcome = 'handled' | 'duplicate' | 'ignored';

export function toStripeEventView(event: StripeEvent): StripeEventView {
  return {
    id: event.id,
    type: event.type,
    receivedAt: event.receivedAt,
    state: event.processedAt ? 'handled' : event.error ? 'failed' : 'pending',
    error: event.error,
  };
}

/** Receives what Stripe reports: payments that went through, renewals, cancellations. */
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(StripeSyncService) private readonly sync: StripeSyncService,
  ) {}

  /**
   * Handles one message.
   *
   * @param payload The body exactly as received: the signature covers every byte.
   * @throws NotFoundException when online payment is off.
   * @throws BadRequestException when the message is not signed by Stripe, or is not one of its events.
   * @throws BadGatewayException when Stripe could not be asked. Stripe then sends the message again later.
   */
  async receive(
    payload: Buffer | undefined,
    signature: string | undefined,
  ): Promise<WebhookOutcome> {
    const stripe = this.config.stripe;
    if (!stripe) {
      throw new NotFoundException();
    }
    if (!payload || payload.length === 0) {
      throw new BadRequestException('The message is empty');
    }
    const problem = verifySignature(payload, signature, stripe.webhookSecret);
    if (problem) {
      throw new BadRequestException(
        problem === 'too_old'
          ? 'The message is too old'
          : 'The message is not signed with the secret of this endpoint',
      );
    }

    const event = this.parse(payload);
    if (event.livemode !== stripe.livemode) {
      // A test event reached a live site, or the other way round. Nothing to do with it.
      this.logger.warn(`Ignored ${event.type} ${event.id}: it is from the other mode of Stripe`);
      return 'ignored';
    }
    if (!(await this.begin(event))) {
      return 'duplicate';
    }

    try {
      const handled = await this.handle(event);
      await this.prisma.stripeEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), error: null },
      });
      return handled ? 'handled' : 'ignored';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.stripeEvent.update({
        where: { id: event.id },
        data: { error: message.slice(0, 500) },
      });
      this.logger.error(`Could not handle ${event.type} ${event.id}: ${message}`);
      if (error instanceof StripeError) {
        // Any answer but 2xx makes Stripe send the message again later.
        throw new BadGatewayException('Stripe could not be asked about this event');
      }
      throw error;
    }
  }

  /** The last messages, newest first. */
  async recent(limit: number): Promise<StripeEventView[]> {
    const events = await this.prisma.stripeEvent.findMany({
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return events.map(toStripeEventView);
  }

  private parse(payload: Buffer): StripeEventPayload {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload.toString('utf8'));
    } catch {
      throw new BadRequestException('The message is not JSON');
    }
    const event = parsed as Partial<StripeEventPayload> | null;
    if (
      !event ||
      typeof event.id !== 'string' ||
      !/^evt_[A-Za-z0-9_]{1,250}$/.test(event.id) ||
      typeof event.type !== 'string' ||
      typeof event.livemode !== 'boolean' ||
      typeof event.data?.object !== 'object' ||
      event.data.object === null
    ) {
      throw new BadRequestException('The message is not an event of Stripe');
    }
    return event as StripeEventPayload;
  }

  /**
   * Notes that a message arrived.
   *
   * @returns false when it was handled before. A message whose handling failed is handled again.
   */
  private async begin(event: StripeEventPayload): Promise<boolean> {
    try {
      await this.prisma.stripeEvent.create({
        data: { id: event.id, type: event.type.slice(0, 120), livemode: event.livemode },
      });
      return true;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
    const known = await this.prisma.stripeEvent.findUnique({ where: { id: event.id } });
    return known !== null && known.processedAt === null;
  }

  /** @returns false for an event this version has no use for. */
  private async handle(event: StripeEventPayload): Promise<boolean> {
    const object = event.data.object as {
      id?: unknown;
      mode?: unknown;
      subscription?: string | { id: string } | null;
    };
    if (event.type === 'checkout.session.completed') {
      const subscriptionId = idOf(object.subscription);
      if (object.mode !== 'subscription' || !subscriptionId) {
        return false;
      }
      await this.sync.syncById(subscriptionId);
      return true;
    }
    if (event.type.startsWith('customer.subscription.') && typeof object.id === 'string') {
      // The message describes the subscription as it was when sent. Stripe is asked
      // for it as it is now, so an old message cannot undo a newer one.
      await this.sync.syncById(object.id);
      return true;
    }
    return false;
  }
}
