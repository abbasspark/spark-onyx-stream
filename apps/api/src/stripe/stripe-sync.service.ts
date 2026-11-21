// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient, type Subscription } from '@onyx/database';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { StripeClient, StripeError } from './stripe.client.js';
import { mapSubscription } from './stripe.mapper.js';
import { idOf, type StripeSubscription } from './stripe.types.js';

/** A renewal Stripe has not reported this long after it was due is asked for. */
const OVERDUE_MS = 60 * 60 * 1000;
/** How many subscriptions one check asks Stripe about, so a run stays short. */
const RECONCILE_BATCH = 25;
/** How long messages from Stripe are kept. Stripe repeats one for three days at most. */
const KEEP_EVENTS_MS = 30 * 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keeps the subscriptions recorded here equal to the ones at Stripe. Stripe is
 * the authority for a subscription paid online: every change is read from
 * Stripe again instead of being taken from a message, so messages that arrive
 * twice or out of order do no harm.
 */
@Injectable()
export class StripeSyncService {
  private readonly logger = new Logger(StripeSyncService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(StripeClient) private readonly stripe: StripeClient,
  ) {}

  /**
   * Reads a subscription from Stripe and records its state.
   *
   * @returns The record, or null when the subscription gives no access yet or
   *   belongs to nobody known here.
   * @throws StripeError
   */
  async syncById(stripeSubscriptionId: string): Promise<Subscription | null> {
    return this.apply(await this.stripe.retrieveSubscription(stripeSubscriptionId));
  }

  /** Records the state of a subscription as Stripe describes it. */
  async apply(remote: StripeSubscription): Promise<Subscription | null> {
    const existing = await this.prisma.subscription.findUnique({
      where: { externalId: remote.id },
    });
    const state = mapSubscription(remote);
    if (!state) {
      // The first payment is still open. There is nothing to record or to change.
      return existing;
    }

    const customerId = idOf(remote.customer);
    const viewerId = existing?.viewerId ?? (await this.viewerOf(remote, customerId));
    if (!viewerId) {
      this.logger.warn(`Stripe subscription ${remote.id} belongs to no viewer of this site`);
      return null;
    }
    const planId = (await this.planOf(remote)) ?? existing?.planId ?? null;
    if (!planId) {
      this.logger.warn(`Stripe subscription ${remote.id} is for no plan of this site`);
      return null;
    }

    const data = {
      planId,
      status: state.status,
      interval: state.interval,
      endsAt: state.endsAt,
      renewsAt: state.renewsAt,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      canceledAt: state.canceledAt,
    };
    const write = () =>
      this.prisma.subscription.upsert({
        where: { externalId: remote.id },
        update: data,
        create: {
          ...data,
          viewerId,
          source: 'STRIPE',
          externalId: remote.id,
          ...(state.startedAt ? { startedAt: state.startedAt } : {}),
        },
      });
    // A message from Stripe and the viewer's return from paying can record it at the same moment.
    const saved = await write().catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        return write();
      }
      throw error;
    });
    if (customerId) {
      // A customer made in Stripe's dashboard for a known viewer is remembered too.
      await this.prisma.viewer.updateMany({
        where: { id: viewerId, stripeCustomerId: null },
        data: { stripeCustomerId: customerId },
      });
    }
    return saved;
  }

  /**
   * Asks Stripe about subscriptions whose renewal or end is overdue here: the
   * safety net for a message that never arrived.
   *
   * @returns How many subscriptions were checked.
   */
  async reconcile(now: Date = new Date()): Promise<number> {
    if (!this.stripe.enabled) {
      return 0;
    }
    const overdue = await this.prisma.subscription.findMany({
      where: {
        source: 'STRIPE',
        externalId: { not: null },
        status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] },
        OR: [
          { renewsAt: { lt: new Date(now.getTime() - OVERDUE_MS) } },
          { renewsAt: null, endsAt: { lte: now } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: RECONCILE_BATCH,
      select: { id: true, externalId: true },
    });
    for (const subscription of overdue) {
      try {
        await this.syncById(subscription.externalId as string);
        // Moves it to the end of the line when Stripe says nothing changed.
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { updatedAt: new Date() },
        });
      } catch (error) {
        if (error instanceof StripeError && error.missing) {
          // Stripe does not know it: the key was changed to another account or mode.
          await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'EXPIRED', renewsAt: null },
          });
          continue;
        }
        this.logger.warn(
          `Could not check subscription ${subscription.externalId} with Stripe: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return overdue.length;
  }

  /** Deletes messages from Stripe that are too old to be repeated. */
  async purgeEvents(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.stripeEvent.deleteMany({
      where: { receivedAt: { lt: new Date(now.getTime() - KEEP_EVENTS_MS) } },
    });
    return result.count;
  }

  private async viewerOf(
    remote: StripeSubscription,
    customerId: string | null,
  ): Promise<string | null> {
    const fromMetadata = remote.metadata?.viewerId;
    if (fromMetadata && UUID.test(fromMetadata)) {
      const viewer = await this.prisma.viewer.findUnique({
        where: { id: fromMetadata },
        select: { id: true },
      });
      if (viewer) {
        return viewer.id;
      }
    }
    if (customerId) {
      const viewer = await this.prisma.viewer.findUnique({
        where: { stripeCustomerId: customerId },
        select: { id: true },
      });
      return viewer?.id ?? null;
    }
    return null;
  }

  private async planOf(remote: StripeSubscription): Promise<string | null> {
    const fromMetadata = remote.metadata?.planId;
    if (!fromMetadata || !UUID.test(fromMetadata)) {
      return null;
    }
    const plan = await this.prisma.plan.findUnique({
      where: { id: fromMetadata },
      select: { id: true },
    });
    return plan?.id ?? null;
  }
}
