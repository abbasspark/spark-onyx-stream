// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, type Viewer } from '@onyx/database';
import { visibleTitle } from '../catalog/playable.js';
import { AppConfig } from '../config/app-config.js';
import { PurchasesService } from '../purchases/purchases.service.js';
import type { StartPurchaseInput } from '../purchases/purchases.schemas.js';
import { type CheckoutDiscount, StripeClient, StripeError } from '../stripe/stripe.client.js';
import { StripeSyncService } from '../stripe/stripe-sync.service.js';
import { idOf } from '../stripe/stripe.types.js';
import type { StartCheckoutInput } from './billing.schemas.js';
import type { CheckCouponInput } from './coupons.schemas.js';
import { type AcceptedCoupon, CouponsService, type CouponTarget } from './coupons.service.js';
import type { CouponPlansQuote, CouponPrice, CouponQuote } from './coupons.views.js';
import { describeDuration, stripeCouponId } from './coupon-rules.js';
import type { StripeAccountView } from './billing.views.js';
import { runningAt } from './entitlement.js';

/**
 * Paying online: sends a viewer to Stripe's payment page and to Stripe's page
 * for managing a subscription. Card details never pass through this application.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(StripeClient) private readonly stripe: StripeClient,
    @Inject(StripeSyncService) private readonly sync: StripeSyncService,
    @Inject(PurchasesService) private readonly purchases: PurchasesService,
    @Inject(CouponsService) private readonly coupons: CouponsService,
  ) {}

  /**
   * Opens the payment page for renting or buying one title.
   *
   * @returns The address to send the viewer to.
   * @throws NotFoundException when the title is not on the site.
   * @throws BadRequestException when the title is not rented or not sold.
   * @throws ConflictException when the viewer has the title already.
   * @throws BadGatewayException when Stripe refuses or cannot be reached.
   */
  async startPurchase(viewer: Viewer, input: StartPurchaseInput): Promise<{ url: string }> {
    const title = await this.prisma.title.findFirst({
      where: { id: input.titleId, ...visibleTitle() },
      select: { id: true, slug: true, name: true, access: true, rentAmount: true, buyAmount: true },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    const amount = input.kind === 'RENT' ? title.rentAmount : title.buyAmount;
    if (title.access !== 'PAID' || amount === null) {
      throw new BadRequestException(
        input.kind === 'RENT' ? 'This title is not for rent' : 'This title is not for sale',
      );
    }
    await this.purchases.assertNotOwned(viewer.id, title.id, input.kind);
    const accepted = input.code
      ? await this.coupons.accept(viewer.id, input.code, {
          kind: input.kind === 'RENT' ? 'RENTAL' : 'PURCHASE',
          amount,
        })
      : null;

    const page = `${this.config.siteUrl}/title/${title.slug}`;
    const hours = this.config.rental.watchHours;
    return this.withStripe('open the payment page', async () => {
      const [customerId, productId] = await Promise.all([
        this.customerOf(viewer),
        // Named for what is sold, as the payment page and the receipt show it.
        this.stripe.ensureProduct(
          {
            id: title.id,
            name:
              input.kind === 'RENT' ? `${title.name} (rental, ${hours} hours)` : `${title.name}`,
          },
          input.kind === 'RENT' ? 'r_' : 'b_',
        ),
      ]);
      const session = await this.stripe.createPaymentCheckout({
        customerId,
        viewerId: viewer.id,
        titleId: title.id,
        kind: input.kind,
        productId,
        currency: this.config.billingCurrency,
        amount,
        successUrl: `${page}?paid={CHECKOUT_SESSION_ID}`,
        cancelUrl: page,
        discount: accepted ? await this.discountOf(accepted, false) : undefined,
      });
      if (!session.url) {
        throw new StripeError('Stripe returned no address for the payment page', 502, null, null);
      }
      return { url: session.url };
    });
  }

  /**
   * Opens the payment page for a plan.
   *
   * @param paidBefore Whether the viewer paid online before. A free trial is offered once.
   * @returns The address to send the viewer to.
   * @throws NotFoundException when the plan does not exist or is not offered.
   * @throws BadRequestException when the plan is not sold for the interval.
   * @throws ConflictException when the viewer has a running subscription.
   * @throws BadGatewayException when Stripe refuses or cannot be reached.
   */
  async start(
    viewer: Viewer,
    input: StartCheckoutInput,
    paidBefore: boolean,
  ): Promise<{ url: string }> {
    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan || !plan.isOffered) {
      throw new NotFoundException('This plan is not on offer');
    }
    const amount = input.interval === 'MONTH' ? plan.monthlyAmount : plan.yearlyAmount;
    if (amount === null) {
      throw new BadRequestException(
        `This plan is not sold per ${input.interval === 'MONTH' ? 'month' : 'year'}`,
      );
    }
    const running = await this.prisma.subscription.findFirst({
      where: { viewerId: viewer.id, ...runningAt() },
      select: { id: true },
    });
    if (running) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'already_subscribed',
        message: 'You have a subscription already. You can manage it on your account page.',
      });
    }

    const accepted = input.code
      ? await this.coupons.accept(viewer.id, input.code, {
          kind: 'SUBSCRIPTION',
          planId: plan.id,
          amount,
        })
      : null;

    const siteUrl = this.config.siteUrl;
    return this.withStripe('open the payment page', async () => {
      const [customerId, productId] = await Promise.all([
        this.customerOf(viewer),
        this.stripe.ensureProduct(plan),
      ]);
      const session = await this.stripe.createCheckoutSession({
        customerId,
        viewerId: viewer.id,
        planId: plan.id,
        productId,
        currency: this.config.billingCurrency,
        amount,
        interval: input.interval === 'MONTH' ? 'month' : 'year',
        // A free trial is for getting to know the site, once.
        trialDays: paidBefore ? 0 : plan.trialDays,
        // Stripe replaces the placeholder with the id of the payment.
        successUrl: `${siteUrl}/plans/thanks?session={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${siteUrl}/plans`,
        discount: accepted ? await this.discountOf(accepted, true) : undefined,
      });
      if (!session.url) {
        throw new StripeError('Stripe returned no address for the payment page', 502, null, null);
      }
      return { url: session.url };
    });
  }

  /**
   * Records what a payment the viewer just returned from bought, a
   * subscription or a title, in case Stripe's own message has not arrived yet.
   *
   * @throws NotFoundException when the payment is not this viewer's.
   */
  async confirm(viewer: Viewer, sessionId: string): Promise<void> {
    await this.withStripe('look up the payment', async () => {
      const session = await this.stripe
        .retrieveCheckoutSession(sessionId)
        .catch((error: unknown) => {
          if (error instanceof StripeError && error.missing) {
            return null;
          }
          throw error;
        });
      if (!session || session.client_reference_id !== viewer.id) {
        throw new NotFoundException('This payment was not found');
      }
      await this.coupons.recordRedemption(session);
      if (session.mode === 'payment') {
        // A title was rented or bought.
        await this.sync.recordPurchase(session);
        return;
      }
      const subscriptionId = idOf(session.subscription);
      if (session.status === 'complete' && subscriptionId) {
        await this.sync.syncById(subscriptionId);
      }
    });
  }

  /**
   * Says what a code does to the price of a plan or of a title, before the
   * viewer goes to pay. Nothing is used up by asking.
   *
   * @throws NotFoundException when the plan, the title or the code is not there.
   * @throws BadRequestException when the plan or the title is not sold this way.
   * @throws ConflictException when the code is not for this viewer or this purchase.
   */
  async quote(viewer: Viewer, input: CheckCouponInput): Promise<CouponQuote | CouponPlansQuote> {
    let target: CouponTarget;
    if ('plans' in input) {
      return this.quotePlans(viewer, input.code);
    }
    if ('planId' in input) {
      const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
      const amount = input.interval === 'MONTH' ? plan?.monthlyAmount : plan?.yearlyAmount;
      if (!plan || !plan.isOffered) {
        throw new NotFoundException('This plan is not on offer');
      }
      if (amount === null || amount === undefined) {
        throw new BadRequestException(
          `This plan is not sold per ${input.interval === 'MONTH' ? 'month' : 'year'}`,
        );
      }
      target = { kind: 'SUBSCRIPTION', planId: plan.id, amount };
    } else {
      const title = await this.prisma.title.findFirst({
        where: { id: input.titleId, ...visibleTitle() },
        select: { access: true, rentAmount: true, buyAmount: true },
      });
      if (!title) {
        throw new NotFoundException('Title not found');
      }
      const amount = input.kind === 'RENT' ? title.rentAmount : title.buyAmount;
      if (title.access !== 'PAID' || amount === null) {
        throw new BadRequestException(
          input.kind === 'RENT' ? 'This title is not for rent' : 'This title is not for sale',
        );
      }
      target = { kind: input.kind === 'RENT' ? 'RENTAL' : 'PURCHASE', amount };
    }
    return (await this.coupons.accept(viewer.id, input.code, target)).quote;
  }

  /**
   * Opens Stripe's page where the viewer changes the card, reads invoices and cancels.
   *
   * @throws ConflictException when the viewer never paid online.
   */
  async portal(viewer: Viewer): Promise<{ url: string }> {
    const customerId = viewer.stripeCustomerId;
    const paidOnline =
      customerId === null
        ? 0
        : await this.prisma.subscription.count({
            where: { viewerId: viewer.id, source: 'STRIPE' },
          });
    if (customerId === null || paidOnline === 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'no_online_subscription',
        message: 'There is no subscription paid online on this account.',
      });
    }
    return this.withStripe('open the subscription page', async () => {
      const session = await this.stripe.createPortalSession(
        customerId,
        `${this.config.siteUrl}/account`,
      );
      return { url: session.url };
    });
  }

  /** Asks Stripe which account the key belongs to. For the panel's connection check. */
  async account(): Promise<StripeAccountView> {
    return this.withStripe(
      'reach the account',
      async () => {
        const account = await this.stripe.account();
        const currency = account.default_currency?.toUpperCase() ?? null;
        return {
          id: account.id,
          name:
            account.settings?.dashboard?.display_name ||
            account.business_profile?.name ||
            account.email ||
            null,
          country: account.country ?? null,
          defaultCurrency: currency,
          chargesEnabled: account.charges_enabled ?? false,
          livemode: this.stripe.livemode,
          currencyMismatch: currency !== null && currency !== this.config.billingCurrency,
        };
      },
      true,
    );
  }

  /**
   * What a code does to every plan on offer.
   *
   * @throws ConflictException when it fits none of them.
   */
  private async quotePlans(viewer: Viewer, code: string): Promise<CouponPlansQuote> {
    const [coupon, plans] = await Promise.all([
      this.coupons.usable(viewer.id, code),
      this.prisma.plan.findMany({ where: { isOffered: true }, orderBy: { position: 'asc' } }),
    ]);
    const price = (planId: string, amount: number | null): CouponPrice | null => {
      if (amount === null) {
        return null;
      }
      try {
        const { quote } = this.coupons.applyTo(coupon, { kind: 'SUBSCRIPTION', planId, amount });
        return {
          listAmount: quote.listAmount,
          discountAmount: quote.discountAmount,
          finalAmount: quote.finalAmount,
        };
      } catch (error) {
        // Not for this plan, or too much for this price: the plan keeps its price.
        if (error instanceof ConflictException) {
          return null;
        }
        throw error;
      }
    };
    const quoted = plans.map((plan) => ({
      planId: plan.id,
      month: price(plan.id, plan.monthlyAmount),
      year: price(plan.id, plan.yearlyAmount),
    }));
    if (!quoted.some((plan) => plan.month || plan.year)) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'coupon_not_for_this',
        message:
          coupon.scope === 'TITLES'
            ? 'This code is for renting or buying a title, not for subscriptions.'
            : 'This code is not for any of these plans.',
      });
    }
    return {
      code: coupon.code,
      kind: coupon.kind,
      percentOff: coupon.percentOff,
      amountOff: coupon.amountOff,
      currency: this.config.billingCurrency,
      duration: coupon.duration,
      durationMonths: coupon.durationMonths,
      lasts: describeDuration(coupon),
      plans: quoted,
    };
  }

  /** The accepted code as the checkout carries it: the coupon at Stripe, and what to write down. */
  private async discountOf(
    { coupon, quote }: AcceptedCoupon,
    recurring: boolean,
  ): Promise<CheckoutDiscount> {
    const currency = this.config.billingCurrency;
    const duration = recurring ? coupon.duration : 'ONCE';
    return {
      stripeCouponId: await this.stripe.ensureCoupon({
        id: stripeCouponId(coupon, currency, recurring),
        name: coupon.code,
        percentOff: coupon.kind === 'PERCENT' ? coupon.percentOff : null,
        amountOff: coupon.kind === 'AMOUNT' ? coupon.amountOff : null,
        currency,
        duration: duration.toLowerCase() as 'once' | 'repeating' | 'forever',
        durationMonths: duration === 'REPEATING' ? coupon.durationMonths : null,
      }),
      metadata: {
        couponId: coupon.id,
        couponCode: coupon.code,
        couponListAmount: String(quote.listAmount),
        couponDiscount: String(quote.discountAmount),
      },
    };
  }

  /** The viewer as a customer at Stripe, made on the first checkout. */
  private async customerOf(viewer: Viewer): Promise<string> {
    if (viewer.stripeCustomerId) {
      const known = await this.stripe
        .retrieveCustomer(viewer.stripeCustomerId)
        .catch((error: unknown) => {
          if (error instanceof StripeError && error.missing) {
            return null;
          }
          throw error;
        });
      if (known && !known.deleted) {
        return known.id;
      }
      // Deleted at Stripe, or the key now belongs to another account or mode.
    }
    const customer = await this.stripe.createCustomer(viewer, viewer.stripeCustomerId);
    await this.prisma.viewer.update({
      where: { id: viewer.id },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  /**
   * Runs calls to Stripe and turns its errors into one a viewer can read.
   * What Stripe said goes to the log, or to the admin when asked for.
   */
  private async withStripe<T>(
    doing: string,
    work: () => Promise<T>,
    tellReason = false,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof StripeError)) {
        throw error;
      }
      this.logger.error(
        `Stripe: could not ${doing}: ${error.message} (${error.code ?? error.status})`,
      );
      throw new BadGatewayException({
        statusCode: 502,
        error: 'Bad Gateway',
        code: 'payment_provider_error',
        message: tellReason
          ? `Stripe said: ${error.message}`
          : 'The payment provider could not be reached. Please try again in a moment.',
      });
    }
  }
}
