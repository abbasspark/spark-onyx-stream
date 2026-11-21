// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import type { ChangeSubscriptionInput, GrantSubscriptionInput } from './billing.schemas.js';
import {
  type BillingOverview,
  type StripeStatus,
  type SubscriptionAdminView,
  toSubscriptionAdminView,
  toViewerSubscriptionView,
  type ViewerSubscriptionView,
} from './billing.views.js';
import { StripeClient, StripeError } from '../stripe/stripe.client.js';
import { StripeSyncService } from '../stripe/stripe-sync.service.js';
import { runningAt } from './entitlement.js';
import {
  STRIPE_WEBHOOK_EVENTS,
  STRIPE_WEBHOOK_ROUTE,
  toStripeEventView,
} from './stripe-webhook.service.js';

const FOR_ADMIN = {
  plan: { select: { id: true, name: true } },
  grantedBy: { select: { id: true, displayName: true } },
} as const;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Who may watch paid titles. A viewer has at most one subscription that is
 * running: one an admin granted, or one the viewer pays for online.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(StripeClient) private readonly stripe: StripeClient,
    @Inject(StripeSyncService) private readonly sync: StripeSyncService,
  ) {}

  /** Whether the viewer may watch paid titles right now. */
  async isEntitled(viewerId: string): Promise<boolean> {
    const running = await this.prisma.subscription.findFirst({
      where: { viewerId, ...runningAt() },
      select: { id: true },
    });
    return running !== null;
  }

  /** Whether the viewer paid online before. A free trial is offered once. */
  async paidBefore(viewerId: string): Promise<boolean> {
    const earlier = await this.prisma.subscription.count({
      where: { viewerId, source: 'STRIPE' },
    });
    return earlier > 0;
  }

  /** The viewer's running subscription, as they see it themselves. */
  async ownOf(viewerId: string): Promise<ViewerSubscriptionView | null> {
    const running = await this.prisma.subscription.findFirst({
      where: { viewerId, ...runningAt() },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { id: true, name: true } } },
    });
    return running ? toViewerSubscriptionView(running) : null;
  }

  /**
   * A viewer's subscriptions for an admin: the running one, and all of them
   * newest first as the history of the account.
   *
   * @throws NotFoundException when there is no such viewer.
   */
  async forViewer(
    viewerId: string,
  ): Promise<{ current: SubscriptionAdminView | null; history: SubscriptionAdminView[] }> {
    await this.assertViewer(viewerId);
    const now = new Date();
    const all = await this.prisma.subscription.findMany({
      where: { viewerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: FOR_ADMIN,
    });
    const history = all.map((subscription) => this.view(subscription, now));
    return { current: history.find((subscription) => subscription.running) ?? null, history };
  }

  /**
   * Gives a viewer access by hand.
   *
   * @throws NotFoundException when the viewer or the plan does not exist.
   * @throws ConflictException when the viewer has a running subscription already.
   */
  async grant(
    viewerId: string,
    input: GrantSubscriptionInput,
    adminId: string | null,
  ): Promise<SubscriptionAdminView> {
    await this.assertViewer(viewerId);
    await this.assertPlan(input.planId);
    if (await this.isEntitled(viewerId)) {
      throw new ConflictException(
        'This viewer has a running subscription. Change it, or end it first.',
      );
    }
    const created = await this.prisma.subscription.create({
      data: {
        viewerId,
        planId: input.planId,
        status: 'ACTIVE',
        source: 'MANUAL',
        endsAt: input.endsAt,
        note: input.note,
        grantedById: adminId,
      },
      include: FOR_ADMIN,
    });
    return this.view(created);
  }

  /**
   * Changes access an admin granted: the plan, how long it lasts, the note.
   *
   * @throws NotFoundException
   * @throws ConflictException when it is over, or paid online and so not an admin's to change.
   */
  async change(
    id: string,
    input: ChangeSubscriptionInput,
  ): Promise<{ subscription: SubscriptionAdminView; changed: string[] }> {
    const before = await this.findChangeable(id);
    if (input.planId !== undefined) {
      await this.assertPlan(input.planId);
    }
    const changed = (Object.keys(input) as (keyof ChangeSubscriptionInput)[]).filter((key) => {
      const next = input[key];
      const current = before[key];
      return next instanceof Date && current instanceof Date
        ? next.getTime() !== current.getTime()
        : next !== current;
    });
    const updated = await this.prisma.subscription.update({
      where: { id },
      data: input,
      include: FOR_ADMIN,
    });
    return { subscription: this.view(updated), changed };
  }

  /**
   * Ends access now. A subscription paid online is cancelled at Stripe, which
   * stops further payments; money already paid is returned in Stripe, if at all.
   *
   * @throws NotFoundException
   * @throws ConflictException when it is over already.
   * @throws BadGatewayException when Stripe refuses or cannot be reached.
   */
  async end(id: string): Promise<SubscriptionAdminView> {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });
    if (subscription?.source === 'STRIPE' && subscription.externalId) {
      if (subscription.status === 'CANCELED') {
        throw new ConflictException('This subscription is over.');
      }
      const externalId = subscription.externalId;
      await this.withStripe(async () => {
        const remote = await this.stripe.cancelSubscription(externalId);
        await this.sync.apply(remote);
      });
      return this.one(id);
    }
    await this.findChangeable(id);
    const now = new Date();
    const ended = await this.prisma.subscription.update({
      where: { id },
      data: { status: 'CANCELED', canceledAt: now, endsAt: now, cancelAtPeriodEnd: false },
      include: FOR_ADMIN,
    });
    return this.view(ended, now);
  }

  /**
   * Reads a subscription paid online from Stripe again, for when the record
   * here looks out of date.
   *
   * @throws NotFoundException
   * @throws ConflictException when it is not paid online.
   * @throws BadGatewayException when Stripe refuses or cannot be reached.
   */
  async refresh(id: string): Promise<SubscriptionAdminView> {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    const externalId = subscription.externalId;
    if (subscription.source !== 'STRIPE' || !externalId) {
      throw new ConflictException('Only a subscription paid online has a record at Stripe.');
    }
    await this.withStripe(() => this.sync.syncById(externalId));
    return this.one(id);
  }

  async overview(): Promise<BillingOverview> {
    const now = new Date();
    const running = runningAt(now);
    const [
      plans,
      subscribers,
      grantedByHand,
      paidOnline,
      pastDue,
      endingSoon,
      paidTitles,
      publishedTitles,
      stripe,
    ] = await Promise.all([
      this.prisma.plan.count(),
      this.prisma.subscription.count({ where: running }),
      this.prisma.subscription.count({ where: { ...running, source: 'MANUAL' } }),
      this.prisma.subscription.count({ where: { ...running, source: 'STRIPE' } }),
      this.prisma.subscription.count({ where: { ...running, status: 'PAST_DUE' } }),
      this.prisma.subscription.count({
        where: {
          status: running.status,
          endsAt: { gt: now, lte: new Date(now.getTime() + SEVEN_DAYS_MS) },
          OR: [{ source: 'MANUAL' }, { cancelAtPeriodEnd: true }],
        },
      }),
      this.prisma.title.count({ where: { status: 'PUBLISHED', access: 'PAID' } }),
      this.prisma.title.count({ where: { status: 'PUBLISHED' } }),
      this.stripeStatus(now),
    ]);
    return {
      currency: this.config.billingCurrency,
      checkout: stripe !== null,
      contactUrl: this.config.billingContactUrl || null,
      plans,
      subscribers,
      grantedByHand,
      paidOnline,
      pastDue,
      stripe,
      endingSoon,
      paidTitles,
      publishedTitles,
    };
  }

  private async stripeStatus(now: Date): Promise<StripeStatus | null> {
    const stripe = this.config.stripe;
    if (!stripe) {
      return null;
    }
    const [last, failedEvents] = await Promise.all([
      this.prisma.stripeEvent.findFirst({ orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.stripeEvent.count({
        where: {
          processedAt: null,
          error: { not: null },
          receivedAt: { gt: new Date(now.getTime() - DAY_MS) },
        },
      }),
    ]);
    return {
      livemode: stripe.livemode,
      webhookPath: `/v1/${STRIPE_WEBHOOK_ROUTE}`,
      webhookEvents: STRIPE_WEBHOOK_EVENTS,
      siteUrl: this.config.siteUrl,
      automaticTax: stripe.automaticTax,
      lastEvent: last ? toStripeEventView(last) : null,
      failedEvents,
    };
  }

  private view(
    subscription: Parameters<typeof toSubscriptionAdminView>[0],
    now: Date = new Date(),
  ): SubscriptionAdminView {
    return toSubscriptionAdminView(subscription, now, this.config.stripe?.livemode ?? false);
  }

  private async one(id: string): Promise<SubscriptionAdminView> {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({
      where: { id },
      include: FOR_ADMIN,
    });
    return this.view(subscription);
  }

  private async withStripe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof StripeError)) {
        throw error;
      }
      throw new BadGatewayException({
        statusCode: 502,
        error: 'Bad Gateway',
        code: 'payment_provider_error',
        message: `Stripe said: ${error.message}`,
      });
    }
  }

  private async findChangeable(id: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    if (subscription.source !== 'MANUAL') {
      throw new ConflictException(
        'This subscription is paid online and follows the payment provider.',
      );
    }
    const over =
      !['TRIALING', 'ACTIVE', 'PAST_DUE'].includes(subscription.status) ||
      (subscription.endsAt !== null && subscription.endsAt.getTime() <= Date.now());
    if (over) {
      throw new ConflictException('This subscription is over. Grant access again instead.');
    }
    return subscription;
  }

  private async assertViewer(viewerId: string): Promise<void> {
    const viewer = await this.prisma.viewer.findUnique({
      where: { id: viewerId },
      select: { id: true },
    });
    if (!viewer) {
      throw new NotFoundException('Viewer not found');
    }
  }

  private async assertPlan(planId: string): Promise<void> {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
  }
}
