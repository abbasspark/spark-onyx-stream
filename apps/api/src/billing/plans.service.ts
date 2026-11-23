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
  PLAN_INCLUDE,
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
      include: PLAN_INCLUDE,
    });
    return {
      currency: this.config.billingCurrency,
      checkout: this.config.stripe !== null,
      contactUrl: this.config.billingContactUrl || null,
      rental: this.config.rental,
      plans: plans.map((plan) => toPublicPlan(plan, this.config.streamLimit)),
    };
  }

  /** Every plan, with how many viewers watch through it. */
  async list(): Promise<PlanAdminView[]> {
    const [plans, counts] = await Promise.all([
      this.prisma.plan.findMany({
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: PLAN_INCLUDE,
      }),
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
  async find(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id }, include: PLAN_INCLUDE });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    return plan;
  }

  /** @throws BadRequestException when a chosen package does not exist. */
  async create(input: CreatePlanInput): Promise<PlanAdminView> {
    const { packageIds, ...fields } = input;
    const chosen = [...new Set(packageIds)];
    await this.assertPackages(chosen);
    const last = await this.prisma.plan.aggregate({ _max: { position: true } });
    const plan = await this.prisma.$transaction(async (tx) => {
      if (fields.isRecommended) {
        await tx.plan.updateMany({ data: { isRecommended: false } });
      }
      return tx.plan.create({
        data: {
          ...fields,
          position: (last._max.position ?? -1) + 1,
          packages: { create: chosen.map((packageId) => ({ packageId })) },
        },
        include: PLAN_INCLUDE,
      });
    });
    return toPlanAdminView(plan, 0);
  }

  /**
   * @throws NotFoundException
   * @throws BadRequestException when the change would leave the plan without
   *   a price, or opening nothing.
   */
  async update(
    id: string,
    input: UpdatePlanInput,
  ): Promise<{ plan: PlanAdminView; changed: string[] }> {
    const before = await this.find(id);
    const { packageIds, ...fields } = input;
    const after = { ...before, ...fields };
    if (after.monthlyAmount === null && after.yearlyAmount === null) {
      throw invalid('monthlyAmount', 'Set a price per month, per year, or both');
    }
    const had = before.packages.map((link) => link.package.id).sort();
    const chosen = packageIds ? [...new Set(packageIds)].sort() : had;
    if (!after.includesAll && chosen.length === 0) {
      throw invalid('packageIds', 'Choose at least one package, or let the plan open everything');
    }
    if (packageIds) {
      await this.assertPackages(chosen);
    }

    const changed: string[] = (Object.keys(fields) as (keyof typeof fields)[]).filter(
      (key) => JSON.stringify(fields[key]) !== JSON.stringify(before[key]),
    );
    const packagesChanged = packageIds !== undefined && chosen.join() !== had.join();
    if (packagesChanged) {
      changed.push('packageIds');
    }
    const plan =
      changed.length === 0
        ? before
        : await this.prisma.$transaction(async (tx) => {
            // One plan at most is the recommended one.
            if (fields.isRecommended) {
              await tx.plan.updateMany({
                where: { id: { not: id } },
                data: { isRecommended: false },
              });
            }
            if (packagesChanged) {
              await tx.planPackage.deleteMany({ where: { planId: id } });
              await tx.planPackage.createMany({
                data: chosen.map((packageId) => ({ planId: id, packageId })),
              });
            }
            return tx.plan.update({ where: { id }, data: fields, include: PLAN_INCLUDE });
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

  private async assertPackages(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const found = await this.prisma.package.count({ where: { id: { in: [...ids] } } });
    if (found !== ids.length) {
      throw invalid('packageIds', 'One of the chosen packages does not exist');
    }
  }
}

function invalid(field: string, message: string): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Validation failed',
    issues: [{ field, message }],
  });
}
