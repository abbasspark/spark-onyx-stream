// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type Coupon, Prisma, PrismaClient } from '@onyx/database';
import { type Page, toSkipTake } from '../common/pagination.js';
import { AppConfig } from '../config/app-config.js';
import type { StripeCheckoutSession } from '../stripe/stripe.types.js';
import {
  couponState,
  coversKind,
  describeDuration,
  discountFor,
  MIN_CHARGE,
  normalizeCode,
} from './coupon-rules.js';
import type {
  CreateCouponInput,
  ListRedemptionsInput,
  UpdateCouponInput,
} from './coupons.schemas.js';
import type { CouponQuote, CouponView, RedemptionView } from './coupons.views.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WITH_PLANS = {
  plans: { include: { plan: { select: { id: true, name: true } } } },
} satisfies Prisma.CouponInclude;
type CouponRecord = Prisma.CouponGetPayload<{ include: typeof WITH_PLANS }>;

/** What a viewer is about to pay for. */
export interface CouponTarget {
  kind: 'SUBSCRIPTION' | 'RENTAL' | 'PURCHASE';
  /** Set for a subscription. */
  planId?: string;
  /** The price without a code, in the smallest unit of the currency. */
  amount: number;
}

/** A coupon a viewer may use, with the plans it is limited to. */
export type UsableCoupon = Coupon & { plans: { planId: string }[] };

/** A code that was accepted for a checkout: what it takes off, and the coupon behind it. */
export interface AcceptedCoupon {
  coupon: Coupon;
  quote: CouponQuote;
}

const refuse = (code: string, message: string) =>
  new ConflictException({ statusCode: 409, error: 'Conflict', code, message });

/**
 * Coupons: codes that lower a price. Admins make them, viewers enter them
 * before paying, and every checkout completed with one is written down.
 */
@Injectable()
export class CouponsService {
  private readonly logger = new Logger(CouponsService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  async list(now = new Date()): Promise<CouponView[]> {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: WITH_PLANS,
    });
    const usage = await this.usage(coupons.map((coupon) => coupon.id));
    return coupons.map((coupon) => this.toView(coupon, usage.get(coupon.id), now));
  }

  /** @throws NotFoundException */
  async get(id: string, now = new Date()): Promise<CouponView> {
    const coupon = await this.prisma.coupon.findUnique({ where: { id }, include: WITH_PLANS });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return this.toView(coupon, (await this.usage([id])).get(id), now);
  }

  /**
   * @throws ConflictException when the code is taken.
   * @throws BadRequestException when the terms do not fit together.
   */
  async create(input: CreateCouponInput, adminId: string | null): Promise<CouponView> {
    const { planIds = [], code, ...rest } = input;
    const terms = this.checked({
      kind: input.kind,
      percentOff: rest.percentOff ?? null,
      amountOff: rest.amountOff ?? null,
      scope: rest.scope ?? 'EVERYTHING',
      duration: rest.duration ?? 'ONCE',
      durationMonths: rest.durationMonths ?? null,
      startsAt: rest.startsAt ?? null,
      endsAt: rest.endsAt ?? null,
    });
    await this.assertPlans(planIds, terms.scope);
    try {
      const created = await this.prisma.coupon.create({
        data: {
          code,
          note: rest.note ?? null,
          ...terms,
          maxRedemptions: rest.maxRedemptions ?? null,
          oncePerViewer: rest.oncePerViewer ?? true,
          newCustomersOnly: rest.newCustomersOnly ?? false,
          isActive: rest.isActive ?? true,
          createdById: adminId,
          plans: { create: planIds.map((planId) => ({ planId })) },
        },
      });
      return await this.get(created.id);
    } catch (error) {
      throw this.taken(error, code);
    }
  }

  /**
   * Changes a coupon. Viewers who subscribed with it keep the terms they got.
   *
   * @throws NotFoundException
   * @throws ConflictException when the new code is taken.
   * @throws BadRequestException when the terms do not fit together.
   */
  async update(id: string, input: UpdateCouponInput): Promise<CouponView> {
    const current = await this.prisma.coupon.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Coupon not found');
    }
    const { planIds, code, note, maxRedemptions, oncePerViewer, newCustomersOnly, isActive } =
      input;
    const terms = this.checked({
      kind: input.kind ?? current.kind,
      percentOff: input.percentOff === undefined ? current.percentOff : input.percentOff,
      amountOff: input.amountOff === undefined ? current.amountOff : input.amountOff,
      scope: input.scope ?? current.scope,
      duration: input.duration ?? current.duration,
      durationMonths:
        input.durationMonths === undefined ? current.durationMonths : input.durationMonths,
      startsAt: input.startsAt === undefined ? current.startsAt : input.startsAt,
      endsAt: input.endsAt === undefined ? current.endsAt : input.endsAt,
    });
    if (planIds) {
      await this.assertPlans(planIds, terms.scope);
    }
    try {
      await this.prisma.coupon.update({
        where: { id },
        data: {
          ...terms,
          ...(code === undefined ? {} : { code }),
          ...(note === undefined ? {} : { note }),
          ...(maxRedemptions === undefined ? {} : { maxRedemptions }),
          ...(oncePerViewer === undefined ? {} : { oncePerViewer }),
          ...(newCustomersOnly === undefined ? {} : { newCustomersOnly }),
          ...(isActive === undefined ? {} : { isActive }),
          ...(planIds
            ? { plans: { deleteMany: {}, create: planIds.map((planId) => ({ planId })) } }
            : // A code for single titles has no plans to be for.
              terms.scope === 'TITLES'
              ? { plans: { deleteMany: {} } }
              : {}),
        },
      });
    } catch (error) {
      throw this.taken(error, code ?? current.code);
    }
    return this.get(id);
  }

  /**
   * Deletes a coupon that was never used. One that was used is part of the
   * books and can only be switched off.
   *
   * @throws NotFoundException
   * @throws ConflictException when it was used.
   */
  async remove(id: string): Promise<{ code: string }> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      select: { code: true, _count: { select: { redemptions: true } } },
    });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    if (coupon._count.redemptions > 0) {
      throw refuse(
        'coupon_used',
        'This code was used, so it stays in the books. Switch it off instead.',
      );
    }
    await this.prisma.coupon.delete({ where: { id } });
    return { code: coupon.code };
  }

  /** @throws NotFoundException */
  async redemptions(id: string, input: ListRedemptionsInput): Promise<Page<RedemptionView>> {
    if (!(await this.prisma.coupon.findUnique({ where: { id }, select: { id: true } }))) {
      throw new NotFoundException('Coupon not found');
    }
    const where = { couponId: id };
    const [rows, total] = await Promise.all([
      this.prisma.couponRedemption.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(input),
      }),
      this.prisma.couponRedemption.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        viewer: { id: row.viewerId, email: row.viewerEmail },
        kind: row.kind,
        subject: row.subject,
        listAmount: row.listAmount,
        discountAmount: row.discountAmount,
        currency: row.currency,
        createdAt: row.createdAt,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  /**
   * Decides whether a viewer may pay for something with a code, and what it
   * takes off.
   *
   * A code that does not exist, is switched off or has not begun gets one and
   * the same answer, so that trying codes tells nothing about them.
   *
   * @throws NotFoundException for such a code.
   * @throws ConflictException with a `code` that says why, for a code that
   *   exists and is not for this viewer or this purchase.
   */
  async accept(
    viewerId: string,
    rawCode: string,
    target: CouponTarget,
    now = new Date(),
  ): Promise<AcceptedCoupon> {
    return this.applyTo(await this.usable(viewerId, rawCode, now), target);
  }

  /**
   * The coupon behind a code, when this viewer may use it at all: it exists,
   * runs, has uses left and is not kept from them. Whether it fits what they
   * want to pay for is decided by `applyTo`.
   *
   * @throws NotFoundException, ConflictException as `accept` does.
   */
  async usable(viewerId: string, rawCode: string, now = new Date()): Promise<UsableCoupon> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: normalizeCode(rawCode) },
      include: { plans: { select: { planId: true } } },
    });
    const used = coupon
      ? await this.prisma.couponRedemption.count({ where: { couponId: coupon.id } })
      : 0;
    const state = coupon ? couponState(coupon, used, now) : 'OFF';
    if (!coupon || state === 'OFF' || state === 'SCHEDULED') {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        code: 'coupon_unknown',
        message: 'This code is not valid. Check the spelling.',
      });
    }
    if (state === 'ENDED') {
      throw refuse('coupon_ended', 'This code is no longer valid.');
    }
    if (state === 'USED_UP') {
      throw refuse('coupon_used_up', 'This code has been used as often as it could be.');
    }
    if (coupon.oncePerViewer) {
      const before = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, viewerId },
      });
      if (before > 0) {
        throw refuse('coupon_already_used', 'You have used this code already.');
      }
    }
    if (coupon.newCustomersOnly) {
      // A subscription or a title paid online counts before its payment is in the books.
      const [payments, subscriptions, purchases] = await Promise.all([
        this.prisma.payment.count({ where: { viewerId } }),
        this.prisma.subscription.count({ where: { viewerId, source: 'STRIPE' } }),
        this.prisma.purchase.count({ where: { viewerId, source: 'STRIPE' } }),
      ]);
      if (payments + subscriptions + purchases > 0) {
        throw refuse('coupon_new_customers', 'This code is for a first payment on this site.');
      }
    }
    return coupon;
  }

  /**
   * What a usable coupon takes off one thing.
   *
   * @throws ConflictException when the coupon is not for it, or would leave
   *   too little to pay by card.
   */
  applyTo(coupon: UsableCoupon, target: CouponTarget): AcceptedCoupon {
    if (!coversKind(coupon.scope, target.kind)) {
      throw refuse(
        'coupon_not_for_this',
        coupon.scope === 'SUBSCRIPTIONS'
          ? 'This code is for subscriptions, not for single titles.'
          : 'This code is for renting or buying a title, not for subscriptions.',
      );
    }
    if (
      target.kind === 'SUBSCRIPTION' &&
      coupon.plans.length > 0 &&
      !coupon.plans.some((entry) => entry.planId === target.planId)
    ) {
      throw refuse('coupon_not_for_this', 'This code is not for this plan.');
    }
    const discountAmount = discountFor(coupon, target.amount);
    const finalAmount = target.amount - discountAmount;
    if (finalAmount > 0 && finalAmount < MIN_CHARGE) {
      throw refuse(
        'coupon_too_much',
        'This code would leave too little to pay by card. It cannot be used for this price.',
      );
    }
    const recurring = target.kind === 'SUBSCRIPTION';
    return {
      coupon,
      quote: {
        code: coupon.code,
        kind: coupon.kind,
        percentOff: coupon.percentOff,
        amountOff: coupon.amountOff,
        currency: this.config.billingCurrency,
        listAmount: target.amount,
        discountAmount,
        finalAmount,
        duration: recurring ? coupon.duration : null,
        durationMonths: recurring ? coupon.durationMonths : null,
        lasts: recurring ? describeDuration(coupon) : null,
      },
    };
  }

  /**
   * Writes down that a checkout was completed with a code. Safe to call for
   * any checkout and more than once: a checkout counts one time.
   *
   * @returns Whether this call wrote the use down.
   */
  async recordRedemption(session: StripeCheckoutSession): Promise<boolean> {
    const meta = session.metadata ?? {};
    const couponId = meta.couponId;
    const viewerId = meta.viewerId ?? session.client_reference_id;
    if (!couponId || !viewerId || !UUID.test(couponId) || !UUID.test(viewerId)) {
      return false;
    }
    if (session.status !== 'complete') {
      return false;
    }
    const kind =
      session.mode === 'subscription'
        ? 'SUBSCRIPTION'
        : meta.kind === 'RENT'
          ? 'RENTAL'
          : 'PURCHASE';
    const [coupon, viewer, subject] = await Promise.all([
      this.prisma.coupon.findUnique({ where: { id: couponId }, select: { id: true } }),
      this.prisma.viewer.findUnique({ where: { id: viewerId }, select: { id: true, email: true } }),
      kind === 'SUBSCRIPTION'
        ? meta.planId && UUID.test(meta.planId)
          ? this.prisma.plan.findUnique({ where: { id: meta.planId }, select: { name: true } })
          : null
        : meta.titleId && UUID.test(meta.titleId)
          ? this.prisma.title.findUnique({ where: { id: meta.titleId }, select: { name: true } })
          : null,
    ]);
    if (!coupon || !viewer) {
      this.logger.warn(`Checkout ${session.id} used a coupon or belongs to a viewer that is gone`);
      return false;
    }
    const amount = (value: string | undefined) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
    };
    try {
      await this.prisma.couponRedemption.create({
        data: {
          couponId: coupon.id,
          viewerId: viewer.id,
          viewerEmail: viewer.email,
          kind,
          subject: subject?.name ?? (kind === 'SUBSCRIPTION' ? 'A plan' : 'A title'),
          listAmount: amount(meta.couponListAmount),
          discountAmount: amount(meta.couponDiscount),
          currency: (session.currency ?? this.config.billingCurrency).toUpperCase(),
          externalId: session.id,
          ...(session.created ? { createdAt: new Date(session.created * 1000) } : {}),
        },
      });
      return true;
    } catch (error) {
      // Stripe's message and the viewer's return can both report the same checkout.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  /** Makes sure the terms fit together, and drops what the kind does not use. */
  private checked<
    Terms extends {
      kind: 'PERCENT' | 'AMOUNT';
      percentOff: number | null;
      amountOff: number | null;
      scope: 'EVERYTHING' | 'SUBSCRIPTIONS' | 'TITLES';
      duration: 'ONCE' | 'REPEATING' | 'FOREVER';
      durationMonths: number | null;
      startsAt: Date | null;
      endsAt: Date | null;
    },
  >(terms: Terms): Terms {
    if (terms.kind === 'PERCENT' && terms.percentOff === null) {
      throw new BadRequestException('Say how many percent the code takes off');
    }
    if (terms.kind === 'AMOUNT' && terms.amountOff === null) {
      throw new BadRequestException('Say how much the code takes off');
    }
    // A code for single titles is used on one payment: it has no duration.
    const duration = terms.scope === 'TITLES' ? 'ONCE' : terms.duration;
    if (duration === 'REPEATING' && terms.durationMonths === null) {
      throw new BadRequestException('Say for how many months the code lowers the price');
    }
    if (terms.startsAt && terms.endsAt && terms.endsAt <= terms.startsAt) {
      throw new BadRequestException('The end of the dates must come after their start');
    }
    return {
      ...terms,
      percentOff: terms.kind === 'PERCENT' ? terms.percentOff : null,
      amountOff: terms.kind === 'AMOUNT' ? terms.amountOff : null,
      duration,
      durationMonths: duration === 'REPEATING' ? terms.durationMonths : null,
    };
  }

  private async assertPlans(planIds: readonly string[], scope: string): Promise<void> {
    if (planIds.length === 0) {
      return;
    }
    if (scope === 'TITLES') {
      throw new BadRequestException('A code for single titles cannot be limited to plans');
    }
    const found = await this.prisma.plan.count({ where: { id: { in: [...planIds] } } });
    if (found !== new Set(planIds).size) {
      throw new BadRequestException('One of the plans does not exist');
    }
  }

  private taken(error: unknown, code: string): unknown {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
      ? refuse('coupon_code_taken', `There is a coupon with the code ${code} already.`)
      : error;
  }

  private async usage(
    ids: readonly string[],
  ): Promise<Map<string, { used: number; discountTotal: number; lastUsedAt: Date | null }>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.couponRedemption.groupBy({
      by: ['couponId'],
      where: { couponId: { in: [...ids] } },
      _count: { _all: true },
      _sum: { discountAmount: true },
      _max: { createdAt: true },
    });
    return new Map(
      rows.map((row) => [
        row.couponId,
        {
          used: row._count._all,
          discountTotal: row._sum.discountAmount ?? 0,
          lastUsedAt: row._max.createdAt,
        },
      ]),
    );
  }

  private toView(
    coupon: CouponRecord,
    usage: { used: number; discountTotal: number; lastUsedAt: Date | null } | undefined,
    now: Date,
  ): CouponView {
    const used = usage?.used ?? 0;
    return {
      id: coupon.id,
      code: coupon.code,
      note: coupon.note,
      kind: coupon.kind,
      percentOff: coupon.percentOff,
      amountOff: coupon.amountOff,
      scope: coupon.scope,
      duration: coupon.duration,
      durationMonths: coupon.durationMonths,
      plans: coupon.plans.map((entry) => entry.plan).sort((a, b) => a.name.localeCompare(b.name)),
      startsAt: coupon.startsAt,
      endsAt: coupon.endsAt,
      maxRedemptions: coupon.maxRedemptions,
      oncePerViewer: coupon.oncePerViewer,
      newCustomersOnly: coupon.newCustomersOnly,
      isActive: coupon.isActive,
      state: couponState(coupon, used, now),
      used,
      discountTotal: usage?.discountTotal ?? 0,
      lastUsedAt: usage?.lastUsedAt ?? null,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    };
  }
}
