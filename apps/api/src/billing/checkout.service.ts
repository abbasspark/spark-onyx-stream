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
import { AppConfig } from '../config/app-config.js';
import { StripeClient, StripeError } from '../stripe/stripe.client.js';
import { StripeSyncService } from '../stripe/stripe-sync.service.js';
import { idOf } from '../stripe/stripe.types.js';
import type { StartCheckoutInput } from './billing.schemas.js';
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
  ) {}

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
      });
      if (!session.url) {
        throw new StripeError('Stripe returned no address for the payment page', 502, null, null);
      }
      return { url: session.url };
    });
  }

  /**
   * Records the subscription of a payment the viewer just returned from, in
   * case Stripe's own message about it has not arrived yet.
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
      const subscriptionId = idOf(session.subscription);
      if (session.status === 'complete' && subscriptionId) {
        await this.sync.syncById(subscriptionId);
      }
    });
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
