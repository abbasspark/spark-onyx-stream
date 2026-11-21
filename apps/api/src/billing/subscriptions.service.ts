// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import type { ChangeSubscriptionInput, GrantSubscriptionInput } from './billing.schemas.js';
import {
  type BillingOverview,
  type SubscriptionAdminView,
  toSubscriptionAdminView,
  toViewerSubscriptionView,
  type ViewerSubscriptionView,
} from './billing.views.js';
import { runningAt } from './entitlement.js';

const FOR_ADMIN = {
  plan: { select: { id: true, name: true } },
  grantedBy: { select: { id: true, displayName: true } },
} as const;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Who may watch paid titles. A viewer has at most one subscription that is
 * running. This version knows one way to get one: an admin grants it.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  /** Whether the viewer may watch paid titles right now. */
  async isEntitled(viewerId: string): Promise<boolean> {
    const running = await this.prisma.subscription.findFirst({
      where: { viewerId, ...runningAt() },
      select: { id: true },
    });
    return running !== null;
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
    const history = all.map((subscription) => toSubscriptionAdminView(subscription, now));
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
    return toSubscriptionAdminView(created);
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
    return { subscription: toSubscriptionAdminView(updated), changed };
  }

  /**
   * Ends access now.
   *
   * @throws NotFoundException
   * @throws ConflictException when it is over already, or paid online.
   */
  async end(id: string): Promise<SubscriptionAdminView> {
    await this.findChangeable(id);
    const now = new Date();
    const ended = await this.prisma.subscription.update({
      where: { id },
      data: { status: 'CANCELED', canceledAt: now, endsAt: now, cancelAtPeriodEnd: false },
      include: FOR_ADMIN,
    });
    return toSubscriptionAdminView(ended, now);
  }

  async overview(): Promise<BillingOverview> {
    const now = new Date();
    const running = runningAt(now);
    const [plans, subscribers, grantedByHand, endingSoon, paidTitles, publishedTitles] =
      await Promise.all([
        this.prisma.plan.count(),
        this.prisma.subscription.count({ where: running }),
        this.prisma.subscription.count({ where: { ...running, source: 'MANUAL' } }),
        this.prisma.subscription.count({
          where: {
            status: running.status,
            endsAt: { gt: now, lte: new Date(now.getTime() + SEVEN_DAYS_MS) },
            OR: [{ source: 'MANUAL' }, { cancelAtPeriodEnd: true }],
          },
        }),
        this.prisma.title.count({ where: { status: 'PUBLISHED', access: 'PAID' } }),
        this.prisma.title.count({ where: { status: 'PUBLISHED' } }),
      ]);
    return {
      currency: this.config.billingCurrency,
      checkout: false,
      contactUrl: this.config.billingContactUrl || null,
      plans,
      subscribers,
      grantedByHand,
      endingSoon,
      paidTitles,
      publishedTitles,
    };
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
