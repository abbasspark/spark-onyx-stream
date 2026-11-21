// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Payment, PrismaClient, type Purchase, type Subscription } from '@onyx/database';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { AppConfig } from '../config/app-config.js';
import { rentalDeadline } from '../purchases/purchase-rules.js';
import { StripeClient, StripeError } from './stripe.client.js';
import { mapInvoice, mapSubscription, refundState } from './stripe.mapper.js';
import {
  idOf,
  type StripeCharge,
  type StripeCheckoutSession,
  type StripeInvoice,
  type StripeSubscription,
} from './stripe.types.js';

/** A renewal Stripe has not reported this long after it was due is asked for. */
const OVERDUE_MS = 60 * 60 * 1000;
/** How many subscriptions one check asks Stripe about, so a run stays short. */
const RECONCILE_BATCH = 25;
/** How many pages of a hundred invoices one import reads. */
const IMPORT_PAGES = 20;
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
    @Inject(AppConfig) private readonly config: AppConfig,
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
      amount: state.amount,
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
   * Reads an invoice from Stripe and writes its payment into the books.
   *
   * @returns The payment, or null when the invoice is not paid, is over
   *   nothing, or belongs to nobody known here.
   * @throws StripeError
   */
  async recordInvoiceById(invoiceId: string): Promise<Payment | null> {
    return this.recordInvoice(await this.stripe.retrieveInvoice(invoiceId));
  }

  /** Writes the payment of an invoice into the books, once. */
  async recordInvoice(invoice: StripeInvoice): Promise<Payment | null> {
    const paid = mapInvoice(invoice);
    // An invoice for no subscription is none of this site's: a title that is
    // rented or bought is recorded from its checkout, and would be counted twice.
    if (!paid || !paid.subscriptionExternalId) {
      return null;
    }
    let subscription = paid.subscriptionExternalId
      ? await this.prisma.subscription.findUnique({
          where: { externalId: paid.subscriptionExternalId },
          include: { plan: { select: { id: true, name: true } } },
        })
      : null;
    if (!subscription && paid.subscriptionExternalId) {
      // The invoice can be heard of before its subscription.
      await this.syncById(paid.subscriptionExternalId).catch(() => null);
      subscription = await this.prisma.subscription.findUnique({
        where: { externalId: paid.subscriptionExternalId },
        include: { plan: { select: { id: true, name: true } } },
      });
    }
    const viewer = subscription
      ? await this.prisma.viewer.findUnique({ where: { id: subscription.viewerId } })
      : paid.customerId
        ? await this.prisma.viewer.findUnique({ where: { stripeCustomerId: paid.customerId } })
        : null;
    if (!viewer) {
      this.logger.warn(`Stripe invoice ${paid.externalId} is from no viewer of this site`);
      return null;
    }

    const facts = {
      amount: paid.amount,
      taxAmount: paid.taxAmount,
      currency: paid.currency,
      paidAt: paid.paidAt,
      periodStart: paid.periodStart,
      periodEnd: paid.periodEnd,
      invoiceNumber: paid.invoiceNumber,
      invoiceUrl: paid.invoiceUrl,
      ...(paid.paymentId ? { externalPaymentId: paid.paymentId } : {}),
    };
    const write = () =>
      this.prisma.payment.upsert({
        where: { externalId: paid.externalId },
        // What was returned is kept: a refund is not part of the invoice.
        update: facts,
        create: {
          ...facts,
          externalId: paid.externalId,
          source: 'STRIPE',
          viewerId: viewer.id,
          viewerEmail: viewer.email,
          subscriptionId: subscription?.id ?? null,
          planId: subscription?.plan.id ?? null,
          planName: subscription?.plan.name ?? null,
        },
      });
    return write().catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        return write();
      }
      throw error;
    });
  }

  /**
   * Notes money that was returned, from what Stripe says about the charge.
   *
   * @returns The payment, or null when the charge was for nothing in the books.
   * @throws StripeError
   */
  async recordRefund(charge: StripeCharge): Promise<Payment | null> {
    const paymentId = idOf(charge.payment_intent);
    if (!paymentId) {
      return null;
    }
    let payment = await this.prisma.payment.findFirst({
      where: { externalPaymentId: paymentId, source: 'STRIPE' },
    });
    if (!payment) {
      const invoiceId = await this.stripe.invoiceOfPayment(paymentId);
      if (!invoiceId) {
        return null;
      }
      payment =
        (await this.prisma.payment.findUnique({ where: { externalId: invoiceId } })) ??
        (await this.recordInvoiceById(invoiceId));
      if (!payment) {
        return null;
      }
    }
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        ...refundState(payment.amount, charge.amount_refunded),
        externalPaymentId: paymentId,
      },
    });
    if (updated.status === 'REFUNDED' && updated.kind !== 'SUBSCRIPTION') {
      // All the money for a title went back, so the title goes back too.
      await this.prisma.purchase.updateMany({
        where: { paymentId: updated.id, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      });
    }
    return updated;
  }

  /**
   * Reads a checkout from Stripe and records what it bought: a title, rented or bought.
   *
   * @returns The purchase, or null when the checkout is not paid or is not for a title.
   * @throws StripeError
   */
  async recordPurchaseById(sessionId: string): Promise<Purchase | null> {
    return this.recordPurchase(await this.stripe.retrieveCheckoutSession(sessionId));
  }

  /** Records the title a paid checkout rented or bought, once, with its payment. */
  async recordPurchase(session: StripeCheckoutSession): Promise<Purchase | null> {
    const kind = session.metadata?.kind;
    const titleId = session.metadata?.titleId;
    const viewerId = session.metadata?.viewerId ?? session.client_reference_id;
    if (
      session.mode !== 'payment' ||
      session.payment_status !== 'paid' ||
      (kind !== 'RENT' && kind !== 'BUY') ||
      !titleId ||
      !viewerId ||
      !UUID.test(titleId) ||
      !UUID.test(viewerId)
    ) {
      return null;
    }
    const known = await this.prisma.purchase.findUnique({ where: { externalId: session.id } });
    if (known) {
      return known;
    }
    const [viewer, title] = await Promise.all([
      this.prisma.viewer.findUnique({ where: { id: viewerId } }),
      this.prisma.title.findUnique({ where: { id: titleId }, select: { id: true, name: true } }),
    ]);
    if (!viewer || !title) {
      this.logger.warn(`Stripe checkout ${session.id} is for a viewer or a title that is gone`);
      return null;
    }

    const paidAt = session.created ? new Date(session.created * 1000) : new Date();
    const amount = session.amount_total ?? 0;
    const tax = session.total_details?.amount_tax ?? 0;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const payment =
          amount > 0
            ? await tx.payment.create({
                data: {
                  viewerId: viewer.id,
                  viewerEmail: viewer.email,
                  kind: kind === 'RENT' ? 'RENTAL' : 'PURCHASE',
                  titleId: title.id,
                  titleName: title.name,
                  source: 'STRIPE',
                  amount,
                  taxAmount: Math.max(0, Math.min(tax, amount)),
                  currency: (session.currency ?? this.config.billingCurrency).toUpperCase(),
                  paidAt,
                  // A checkout that sells something once has no invoice. Its own id stands in.
                  externalId: session.id,
                  externalPaymentId: idOf(session.payment_intent),
                },
              })
            : null;
        return tx.purchase.create({
          data: {
            viewerId: viewer.id,
            titleId: title.id,
            kind,
            source: 'STRIPE',
            createdAt: paidAt,
            expiresAt:
              kind === 'RENT' ? rentalDeadline(paidAt, this.config.rental.startDays) : null,
            paymentId: payment?.id ?? null,
            externalId: session.id,
          },
        });
      });
    } catch (error) {
      // The message from Stripe and the viewer's return can record it at the same moment.
      if (isUniqueViolation(error)) {
        return this.prisma.purchase.findUnique({ where: { externalId: session.id } });
      }
      throw error;
    }
  }

  /**
   * Writes the paid invoices Stripe has into the books: for payments made
   * before this version, or while messages did not arrive.
   *
   * @returns How many invoices were read, and how many payments are new.
   * @throws StripeError
   */
  async importPayments(): Promise<{ checked: number; added: number; complete: boolean }> {
    let checked = 0;
    let added = 0;
    let after: string | undefined;
    for (let page = 0; page < IMPORT_PAGES; page += 1) {
      const list = await this.stripe.listPaidInvoices(after);
      for (const invoice of list.data) {
        checked += 1;
        const known = await this.prisma.payment.findUnique({
          where: { externalId: invoice.id },
          select: { id: true },
        });
        if (!known && (await this.recordInvoice(invoice))) {
          added += 1;
        }
      }
      after = list.data.at(-1)?.id;
      if (!list.has_more || !after) {
        return { checked, added, complete: true };
      }
    }
    return { checked, added, complete: false };
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
