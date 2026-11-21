// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma, PrismaClient } from '@onyx/database';
import { type Page, type PaginationInput, toPage, toSkipTake } from '../common/pagination.js';
import { AppConfig } from '../config/app-config.js';
import { StripeError } from '../stripe/stripe.client.js';
import { StripeSyncService } from '../stripe/stripe-sync.service.js';
import { runningAt } from './entitlement.js';
import type { PaymentFilters, RecordPaymentInput, RevenueInput } from './payments.schemas.js';
import {
  type PaymentAdminView,
  type RevenueMonth,
  type RevenueReport,
  toPaymentAdminView,
  toViewerPaymentView,
  type ViewerPaymentView,
} from './payments.views.js';
import { csvLine, decimalAmount, monthlyValue, monthOf, monthsUpTo } from './revenue.js';

const FOR_ADMIN = {
  viewer: { select: { id: true, displayName: true } },
  recordedBy: { select: { id: true, displayName: true } },
} as const;

/** The most rows one export holds. A year of a large site fits. */
const EXPORT_LIMIT = 50_000;
/** How many payments a viewer sees of their own. */
const OWN_LIMIT = 36;

interface MonthRow {
  month: string;
  source: 'MANUAL' | 'STRIPE';
  payments: number;
  gross: number;
  refunded: number;
  tax: number;
}

/**
 * The books of the site: every payment for a subscription, collected by
 * Stripe or written down by an admin, and what they add up to.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(StripeSyncService) private readonly sync: StripeSyncService,
  ) {}

  async list(filters: PaymentFilters & PaginationInput): Promise<Page<PaymentAdminView>> {
    const where = this.where(filters);
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        include: FOR_ADMIN,
        ...toSkipTake(filters),
      }),
      this.prisma.payment.count({ where }),
    ]);
    return toPage(
      payments.map((payment) => this.view(payment)),
      total,
      filters,
    );
  }

  /**
   * The payments as a CSV file for a spreadsheet or an accountant: one line
   * per payment, amounts with a decimal point, times in UTC.
   */
  async exportCsv(filters: PaymentFilters): Promise<string> {
    const payments = await this.prisma.payment.findMany({
      where: this.where(filters),
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      include: FOR_ADMIN,
      take: EXPORT_LIMIT,
    });
    const lines = [
      csvLine([
        'Paid at (UTC)',
        'Email',
        'Name',
        'Plan',
        'Source',
        'Status',
        'Currency',
        'Amount',
        'Tax',
        'Refunded',
        'Net',
        'Period start',
        'Period end',
        'Invoice',
        'Note',
        'Recorded by',
      ]),
      ...payments.map((payment) =>
        csvLine([
          payment.paidAt.toISOString(),
          payment.viewerEmail,
          payment.viewer?.displayName ?? '',
          payment.planName ?? '',
          payment.source === 'STRIPE' ? 'Stripe' : 'By hand',
          payment.status === 'PAID'
            ? 'Paid'
            : payment.status === 'REFUNDED'
              ? 'Refunded'
              : 'Partly refunded',
          payment.currency,
          decimalAmount(payment.amount, payment.currency),
          decimalAmount(payment.taxAmount, payment.currency),
          decimalAmount(payment.refundedAmount, payment.currency),
          decimalAmount(payment.amount - payment.refundedAmount, payment.currency),
          payment.periodStart?.toISOString().slice(0, 10) ?? '',
          payment.periodEnd?.toISOString().slice(0, 10) ?? '',
          payment.invoiceNumber ?? '',
          payment.note ?? '',
          payment.recordedBy?.displayName ?? '',
        ]),
      ),
    ];
    // The mark at the start tells spreadsheets that the file is UTF-8.
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  /** @throws NotFoundException when there is no such viewer. */
  async forViewer(viewerId: string): Promise<PaymentAdminView[]> {
    await this.findViewer(viewerId);
    const payments = await this.prisma.payment.findMany({
      where: { viewerId },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      include: FOR_ADMIN,
      take: 100,
    });
    return payments.map((payment) => this.view(payment));
  }

  /** A viewer's own payments, newest first. */
  async ownOf(viewerId: string): Promise<ViewerPaymentView[]> {
    const payments = await this.prisma.payment.findMany({
      where: { viewerId },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: OWN_LIMIT,
    });
    return payments.map(toViewerPaymentView);
  }

  /**
   * Writes down money received outside the site: cash, a bank transfer.
   *
   * @throws NotFoundException when the viewer or the plan does not exist.
   */
  async record(
    viewerId: string,
    input: RecordPaymentInput,
    adminId: string | null,
  ): Promise<PaymentAdminView> {
    const viewer = await this.findViewer(viewerId);
    const running = await this.prisma.subscription.findFirst({
      where: { viewerId, ...runningAt() },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { id: true, name: true } } },
    });
    const plan = input.planId
      ? await this.prisma.plan.findUnique({
          where: { id: input.planId },
          select: { id: true, name: true },
        })
      : (running?.plan ?? null);
    if (input.planId && !plan) {
      throw new NotFoundException('Plan not found');
    }
    const created = await this.prisma.payment.create({
      data: {
        viewerId,
        viewerEmail: viewer.email,
        // Tied to the subscription only when it is for the same plan.
        subscriptionId: running && running.plan.id === plan?.id ? running.id : null,
        planId: plan?.id ?? null,
        planName: plan?.name ?? null,
        source: 'MANUAL',
        amount: input.amount,
        currency: this.config.billingCurrency,
        paidAt: input.paidAt ?? new Date(),
        note: input.note,
        recordedById: adminId,
      },
      include: FOR_ADMIN,
    });
    return this.view(created);
  }

  /**
   * Takes a payment an admin wrote down out of the books again.
   *
   * @throws NotFoundException
   * @throws ConflictException for a payment Stripe collected: that one happened.
   */
  async remove(id: string): Promise<PaymentAdminView> {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: FOR_ADMIN });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.source !== 'MANUAL') {
      throw new ConflictException(
        'This payment was collected by Stripe and stays in the books. To give money back, refund it in Stripe.',
      );
    }
    await this.prisma.payment.delete({ where: { id } });
    return this.view(payment);
  }

  /**
   * Reads the paid invoices from Stripe into the books.
   *
   * @throws BadGatewayException when Stripe refuses or cannot be reached.
   */
  async importFromStripe(): Promise<{ checked: number; added: number; complete: boolean }> {
    try {
      return await this.sync.importPayments();
    } catch (error) {
      if (error instanceof StripeError) {
        throw new BadGatewayException({
          statusCode: 502,
          error: 'Bad Gateway',
          code: 'payment_provider_error',
          message: `Stripe said: ${error.message}`,
        });
      }
      throw error;
    }
  }

  /** What came in over the last months, and what the subscriptions are worth now. */
  async revenue(input: RevenueInput, now: Date = new Date()): Promise<RevenueReport> {
    const currency = this.config.billingCurrency;
    const { timeZone } = input;
    const keys = monthsUpTo(monthOf(now, timeZone), input.months);
    const first = keys[0] as string;

    // Months are cut where people in the time zone see them change. The
    // database stores UTC, so each moment is moved before it is cut.
    const [rows, started, ended, byPlan, recurring, trialing, others] = await Promise.all([
      this.prisma.$queryRaw<MonthRow[]>`
        SELECT to_char(date_trunc('month', "paidAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}), 'YYYY-MM') AS month,
               source::text AS source,
               COUNT(*)::int AS payments,
               COALESCE(SUM(amount), 0)::int AS gross,
               COALESCE(SUM("refundedAmount"), 0)::int AS refunded,
               COALESCE(SUM("taxAmount"), 0)::int AS tax
          FROM payments
         WHERE currency = ${currency}
           AND to_char("paidAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}, 'YYYY-MM') >= ${first}
         GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ month: string; count: number }[]>`
        SELECT to_char("startedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}, 'YYYY-MM') AS month,
               COUNT(*)::int AS count
          FROM subscriptions
         WHERE source = 'STRIPE'
           AND to_char("startedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}, 'YYYY-MM') >= ${first}
         GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; count: number }[]>`
        SELECT to_char("endsAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}, 'YYYY-MM') AS month,
               COUNT(*)::int AS count
          FROM subscriptions
         WHERE source = 'STRIPE'
           AND status IN ('CANCELED', 'EXPIRED')
           AND "endsAt" IS NOT NULL
           AND "endsAt" <= ${now}
           AND to_char("endsAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}, 'YYYY-MM') >= ${first}
         GROUP BY 1`,
      this.prisma.$queryRaw<
        { planId: string | null; planName: string | null; net: number; payments: number }[]
      >`
        SELECT "planId"::text AS "planId",
               MAX("planName") AS "planName",
               COALESCE(SUM(amount - "refundedAmount"), 0)::int AS net,
               COUNT(*)::int AS payments
          FROM payments
         WHERE currency = ${currency}
           AND to_char("paidAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}, 'YYYY-MM') >= ${first}
         GROUP BY "planId"
         ORDER BY net DESC`,
      this.prisma.subscription.findMany({
        where: {
          source: 'STRIPE',
          status: { in: ['ACTIVE', 'PAST_DUE'] },
          amount: { not: null },
          cancelAtPeriodEnd: false,
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        select: { amount: true, interval: true },
      }),
      this.prisma.subscription.count({
        where: { status: 'TRIALING', OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: { currency: { not: currency } },
        _count: { _all: true },
      }),
    ]);

    const months = new Map<string, RevenueMonth>(
      keys.map((month) => [
        month,
        {
          month,
          gross: 0,
          refunded: 0,
          net: 0,
          tax: 0,
          payments: 0,
          online: 0,
          byHand: 0,
          started: 0,
          ended: 0,
        },
      ]),
    );
    for (const row of rows) {
      const month = months.get(row.month);
      if (!month) {
        continue;
      }
      const net = row.gross - row.refunded;
      month.gross += row.gross;
      month.refunded += row.refunded;
      month.net += net;
      month.tax += row.tax;
      month.payments += row.payments;
      if (row.source === 'STRIPE') {
        month.online += net;
      } else {
        month.byHand += net;
      }
    }
    for (const row of started) {
      const month = months.get(row.month);
      if (month) {
        month.started = row.count;
      }
    }
    for (const row of ended) {
      const month = months.get(row.month);
      if (month) {
        month.ended = row.count;
      }
    }

    const list = [...months.values()];
    const sum = (pick: (month: RevenueMonth) => number) =>
      list.reduce((total, month) => total + pick(month), 0);
    return {
      currency,
      timeZone,
      months: list,
      totals: {
        gross: sum((month) => month.gross),
        refunded: sum((month) => month.refunded),
        net: sum((month) => month.net),
        tax: sum((month) => month.tax),
        payments: sum((month) => month.payments),
      },
      byPlan: byPlan.map((row) => ({
        planId: row.planId,
        planName: row.planName ?? 'No plan',
        net: row.net,
        payments: row.payments,
      })),
      monthlyRecurring: recurring.reduce(
        (total, subscription) =>
          total + monthlyValue(subscription.amount as number, subscription.interval),
        0,
      ),
      payingSubscribers: recurring.length,
      trialing,
      otherCurrencies: others.map((row) => ({
        currency: row.currency,
        payments: row._count._all,
      })),
    };
  }

  private where(filters: PaymentFilters): Prisma.PaymentWhereInput {
    return {
      source: filters.source,
      status: filters.status,
      planId: filters.planId,
      ...(filters.from || filters.to ? { paidAt: { gte: filters.from, lt: filters.to } } : {}),
      ...(filters.q
        ? {
            OR: [
              { viewerEmail: { contains: filters.q, mode: 'insensitive' } },
              { invoiceNumber: { contains: filters.q, mode: 'insensitive' } },
              { note: { contains: filters.q, mode: 'insensitive' } },
              { viewer: { displayName: { contains: filters.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  private view(payment: Parameters<typeof toPaymentAdminView>[0]): PaymentAdminView {
    return toPaymentAdminView(payment, this.config.stripe?.livemode ?? false);
  }

  private async findViewer(viewerId: string) {
    const viewer = await this.prisma.viewer.findUnique({
      where: { id: viewerId },
      select: { id: true, email: true },
    });
    if (!viewer) {
      throw new NotFoundException('Viewer not found');
    }
    return viewer;
  }
}
