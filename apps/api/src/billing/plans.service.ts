// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Plan, PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import type { CreatePlanInput, UpdatePlanInput } from './billing.schemas.js';
import {
  type PlanAdminView,
  type PublicPlans,
  toPlanAdminView,
  toPublicPlan,
} from './billing.views.js';
import { runningAt } from './entitlement.js';

/** The plans viewers can subscribe to. */
@Injectable()
export class PlansService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  /** What the site offers, in the order of the page. */
  async offered(): Promise<PublicPlans> {
    const plans = await this.prisma.plan.findMany({
      where: { isOffered: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      currency: this.config.billingCurrency,
      checkout: this.config.stripe !== null,
      contactUrl: this.config.billingContactUrl || null,
      plans: plans.map(toPublicPlan),
    };
  }

  /** Every plan, with how many viewers watch through it. */
  async list(): Promise<PlanAdminView[]> {
    const [plans, counts] = await Promise.all([
      this.prisma.plan.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.subscription.groupBy({
        by: ['planId'],
        where: runningAt(),
        _count: { _all: true },
      }),
    ]);
    const subscribers = new Map(counts.map((count) => [count.planId, count._count._all]));
    return plans.map((plan) => toPlanAdminView(plan, subscribers.get(plan.id) ?? 0));
  }

  /** @throws NotFoundException */
  async find(id: string): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    return plan;
  }

  async create(input: CreatePlanInput): Promise<PlanAdminView> {
    const last = await this.prisma.plan.aggregate({ _max: { position: true } });
    const plan = await this.prisma.$transaction(async (tx) => {
      if (input.isRecommended) {
        await tx.plan.updateMany({ data: { isRecommended: false } });
      }
      return tx.plan.create({ data: { ...input, position: (last._max.position ?? -1) + 1 } });
    });
    return toPlanAdminView(plan, 0);
  }

  /**
   * @throws NotFoundException
   * @throws BadRequestException when the change would leave the plan without a price.
   */
  async update(
    id: string,
    input: UpdatePlanInput,
  ): Promise<{ plan: PlanAdminView; changed: string[] }> {
    const before = await this.find(id);
    const after = { ...before, ...input };
    if (after.monthlyAmount === null && after.yearlyAmount === null) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        issues: [{ field: 'monthlyAmount', message: 'Set a price per month, per year, or both' }],
      });
    }
    const changed = (Object.keys(input) as (keyof UpdatePlanInput)[]).filter(
      (key) => JSON.stringify(input[key]) !== JSON.stringify(before[key]),
    );
    const plan =
      changed.length === 0
        ? before
        : await this.prisma.$transaction(async (tx) => {
            // One plan at most is the recommended one.
            if (input.isRecommended) {
              await tx.plan.updateMany({
                where: { id: { not: id } },
                data: { isRecommended: false },
              });
            }
            return tx.plan.update({ where: { id }, data: input });
          });
    const subscribers = await this.prisma.subscription.count({
      where: { planId: id, ...runningAt() },
    });
    return { plan: toPlanAdminView(plan, subscribers), changed };
  }

  /**
   * Deletes a plan nobody ever subscribed to.
   *
   * @throws NotFoundException
   * @throws ConflictException when the plan has subscriptions, running or ended.
   */
  async remove(id: string): Promise<Plan> {
    const plan = await this.find(id);
    const used = await this.prisma.subscription.count({ where: { planId: id } });
    if (used > 0) {
      throw new ConflictException(
        'Viewers have or had this plan, so it is part of their history. Stop offering it instead.',
      );
    }
    await this.prisma.plan.delete({ where: { id } });
    return plan;
  }

  /**
   * Sets the order of the page of plans.
   *
   * @throws BadRequestException when the list is not exactly the plans there are.
   */
  async reorder(ids: readonly string[]): Promise<PlanAdminView[]> {
    const existing = await this.prisma.plan.findMany({ select: { id: true } });
    const known = new Set(existing.map((plan) => plan.id));
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== known.size ||
      !ids.every((id) => known.has(id))
    ) {
      throw new BadRequestException('Send every plan once, in the order you want');
    }
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.plan.update({ where: { id }, data: { position } })),
    );
    return this.list();
  }
}
