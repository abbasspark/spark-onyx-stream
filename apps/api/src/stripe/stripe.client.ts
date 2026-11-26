// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { encodeForm, type FormValue } from './stripe.form.js';
import type {
  StripeAccount,
  StripeCheckoutSession,
  StripeCustomer,
  StripeInvoice,
  StripeList,
  StripePortalSession,
  StripeSubscription,
} from './stripe.types.js';

/**
 * The version of Stripe's API every request asks for, so that an upgrade of
 * the Stripe account cannot change the answers under this code. From this
 * version on, the billing period is on the items of a subscription.
 */
export const STRIPE_API_VERSION = '2025-03-31.basil';

/** How long Stripe gets to answer one request. */
const TIMEOUT_MS = 20_000;

/** An answer from Stripe that says no, or no answer at all. */
export class StripeError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when Stripe was not reached. */
    readonly status: number,
    /** Stripe's code, such as "resource_missing". */
    readonly code: string | null,
    readonly type: string | null,
  ) {
    super(message);
    this.name = 'StripeError';
  }

  /** Whether Stripe does not know the object that was asked for. */
  get missing(): boolean {
    return this.code === 'resource_missing' || this.status === 404;
  }
}

/** A coupon of this site as Stripe is to know it. */
export interface StripeCouponTerms {
  /** Names the coupon and its terms: see `stripeCouponId`. */
  id: string;
  /** What the payment page and the invoice call it: the code. */
  name: string;
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
  duration: 'once' | 'repeating' | 'forever';
  durationMonths: number | null;
}

/** A code of this site that a checkout is opened with. */
export interface CheckoutDiscount {
  stripeCouponId: string;
  /** Carried on the checkout, so the use can be written down when it is paid. */
  metadata: Record<string, string>;
}

export interface CheckoutParams {
  customerId: string;
  viewerId: string;
  planId: string;
  productId: string;
  currency: string;
  amount: number;
  interval: 'month' | 'year';
  trialDays: number;
  successUrl: string;
  cancelUrl: string;
  discount?: CheckoutDiscount;
}

export interface PaymentCheckoutParams {
  customerId: string;
  viewerId: string;
  titleId: string;
  kind: 'RENT' | 'BUY';
  productId: string;
  currency: string;
  amount: number;
  successUrl: string;
  cancelUrl: string;
  discount?: CheckoutDiscount;
}

/** Talks to Stripe. Knows its addresses and its errors, nothing of viewers or plans. */
export interface ChangePlanParams {
  subscriptionId: string;
  /** The line of the subscription that holds the price. */
  itemId: string;
  planId: string;
  productId: string;
  currency: string;
  amount: number;
  interval: 'month' | 'year';
}

@Injectable()
export class StripeClient {
  constructor(@Inject(AppConfig) private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.stripe !== null;
  }

  /** False while the key is one for testing. */
  get livemode(): boolean {
    return this.config.stripe?.livemode ?? false;
  }

  /** The account the key belongs to. Proves that the key works. */
  account(): Promise<StripeAccount> {
    return this.request<StripeAccount>('GET', '/v1/account');
  }

  /**
   * @param replaces The customer this one takes the place of, when the viewer had one that is gone.
   */
  createCustomer(
    viewer: { id: string; email: string; displayName: string },
    replaces: string | null = null,
  ): Promise<StripeCustomer> {
    return this.request<StripeCustomer>(
      'POST',
      '/v1/customers',
      { email: viewer.email, name: viewer.displayName, metadata: { viewerId: viewer.id } },
      // Two clicks at once still make one customer.
      `onyx-customer-${viewer.id}-${replaces ?? 'first'}`,
    );
  }

  /** Tells Stripe the viewer's new address, so receipts and reminders go to it. */
  updateCustomerEmail(id: string, email: string): Promise<StripeCustomer> {
    return this.request<StripeCustomer>('POST', `/v1/customers/${encodeURIComponent(id)}`, {
      email,
    });
  }

  retrieveCustomer(id: string): Promise<StripeCustomer> {
    return this.request<StripeCustomer>('GET', `/v1/customers/${encodeURIComponent(id)}`);
  }

  /**
   * Makes sure a plan exists at Stripe as a product with the plan's name, and
   * returns the product's id. The id is derived from the plan, so nothing has
   * to be stored and a product is never made twice.
   */
  async ensureProduct(
    plan: { id: string; name: string },
    /** Tells products of other kinds apart: "r_" for renting a title, "b_" for buying it. */
    prefix = '',
  ): Promise<string> {
    const id = `onyx_${prefix}${plan.id.replace(/-/g, '')}`;
    const fields = {
      name: plan.name,
      metadata: prefix ? { titleId: plan.id } : { planId: plan.id },
    };
    try {
      await this.request('POST', `/v1/products/${id}`, fields);
    } catch (error) {
      if (!(error instanceof StripeError) || !error.missing) {
        throw error;
      }
      try {
        await this.request('POST', '/v1/products', { id, ...fields });
      } catch (created) {
        // Another request made it in the meantime.
        if (!(created instanceof StripeError) || created.code !== 'resource_already_exists') {
          throw created;
        }
      }
    }
    return id;
  }

  /**
   * Makes sure a coupon with these terms exists at Stripe. The id names the
   * terms, so nothing is stored here and a coupon is never made twice.
   */
  async ensureCoupon(terms: StripeCouponTerms): Promise<string> {
    try {
      await this.request('GET', `/v1/coupons/${encodeURIComponent(terms.id)}`);
      return terms.id;
    } catch (error) {
      if (!(error instanceof StripeError) || !error.missing) {
        throw error;
      }
    }
    try {
      await this.request('POST', '/v1/coupons', {
        id: terms.id,
        name: terms.name,
        ...(terms.percentOff !== null
          ? { percent_off: terms.percentOff }
          : { amount_off: terms.amountOff, currency: terms.currency.toLowerCase() }),
        duration: terms.duration,
        ...(terms.duration === 'repeating' ? { duration_in_months: terms.durationMonths } : {}),
      });
    } catch (created) {
      // Another request made it in the meantime.
      if (!(created instanceof StripeError) || created.code !== 'resource_already_exists') {
        throw created;
      }
    }
    return terms.id;
  }

  /** Opens Stripe's payment page for one plan. */
  createCheckoutSession(params: CheckoutParams): Promise<StripeCheckoutSession> {
    const tax = this.setup().automaticTax;
    return this.request<StripeCheckoutSession>('POST', '/v1/checkout/sessions', {
      mode: 'subscription',
      customer: params.customerId,
      client_reference_id: params.viewerId,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      // With a code of this site the price is lowered here. Without one, the
      // payment page lets a viewer enter a code made in Stripe under "Coupons".
      // Stripe takes one or the other.
      ...(params.discount
        ? { discounts: [{ coupon: params.discount.stripeCouponId }] }
        : { allow_promotion_codes: true }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: params.currency.toLowerCase(),
            product: params.productId,
            unit_amount: params.amount,
            recurring: { interval: params.interval },
            ...(tax ? { tax_behavior: 'inclusive' } : {}),
          },
        },
      ],
      subscription_data: {
        metadata: { viewerId: params.viewerId, planId: params.planId },
        ...(params.trialDays > 0 ? { trial_period_days: params.trialDays } : {}),
      },
      metadata: {
        viewerId: params.viewerId,
        planId: params.planId,
        ...params.discount?.metadata,
      },
      ...(tax ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' } } : {}),
    });
  }

  /** Opens Stripe's payment page for renting or buying one title: a single payment. */
  createPaymentCheckout(params: PaymentCheckoutParams): Promise<StripeCheckoutSession> {
    const tax = this.setup().automaticTax;
    const metadata = {
      viewerId: params.viewerId,
      titleId: params.titleId,
      kind: params.kind,
      ...params.discount?.metadata,
    };
    return this.request<StripeCheckoutSession>('POST', '/v1/checkout/sessions', {
      mode: 'payment',
      customer: params.customerId,
      client_reference_id: params.viewerId,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      ...(params.discount
        ? { discounts: [{ coupon: params.discount.stripeCouponId }] }
        : { allow_promotion_codes: true }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: params.currency.toLowerCase(),
            product: params.productId,
            unit_amount: params.amount,
            ...(tax ? { tax_behavior: 'inclusive' } : {}),
          },
        },
      ],
      metadata,
      // On the payment too, so it can be told in Stripe what a charge was for.
      payment_intent_data: { metadata },
      ...(tax ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' } } : {}),
    });
  }

  retrieveCheckoutSession(id: string): Promise<StripeCheckoutSession> {
    return this.request<StripeCheckoutSession>(
      'GET',
      `/v1/checkout/sessions/${encodeURIComponent(id)}`,
    );
  }

  /** Opens Stripe's page where a customer changes the card, reads invoices and cancels. */
  createPortalSession(customerId: string, returnUrl: string): Promise<StripePortalSession> {
    return this.request<StripePortalSession>('POST', '/v1/billing_portal/sessions', {
      customer: customerId,
      return_url: returnUrl,
    });
  }

  retrieveSubscription(id: string): Promise<StripeSubscription> {
    return this.request<StripeSubscription>('GET', `/v1/subscriptions/${encodeURIComponent(id)}`);
  }

  /**
   * Moves a running subscription to another plan or interval, now. The time left
   * on the old price is credited and the new price is charged for what is left of
   * the period, in one invoice that is paid at once. If the payment fails nothing
   * changes: a viewer is never left half on one plan and half on the other.
   */
  changeSubscriptionPlan(params: ChangePlanParams): Promise<StripeSubscription> {
    const tax = this.setup().automaticTax;
    return this.request<StripeSubscription>(
      'POST',
      `/v1/subscriptions/${encodeURIComponent(params.subscriptionId)}`,
      {
        items: [
          {
            id: params.itemId,
            price_data: {
              currency: params.currency.toLowerCase(),
              product: params.productId,
              unit_amount: params.amount,
              recurring: { interval: params.interval },
              ...(tax ? { tax_behavior: 'inclusive' } : {}),
            },
          },
        ],
        proration_behavior: 'always_invoice',
        payment_behavior: 'error_if_incomplete',
        metadata: { planId: params.planId },
      },
    );
  }

  /** Ends a subscription now. Money already paid is not returned by this. */
  cancelSubscription(id: string): Promise<StripeSubscription> {
    return this.request<StripeSubscription>(
      'DELETE',
      `/v1/subscriptions/${encodeURIComponent(id)}`,
    );
  }

  /**
   * An invoice with the payments that settled it. The payments are asked for
   * as an extra; an account that does not hand them out still gets the invoice.
   */
  async retrieveInvoice(id: string): Promise<StripeInvoice> {
    const path = `/v1/invoices/${encodeURIComponent(id)}`;
    try {
      return await this.request<StripeInvoice>('GET', path, { expand: ['payments'] });
    } catch (error) {
      if (error instanceof StripeError && error.status === 400) {
        return this.request<StripeInvoice>('GET', path);
      }
      throw error;
    }
  }

  /** Paid invoices, newest first, a hundred at a time. */
  listPaidInvoices(startingAfter?: string): Promise<StripeList<StripeInvoice>> {
    return this.request<StripeList<StripeInvoice>>('GET', '/v1/invoices', {
      status: 'paid',
      limit: 100,
      starting_after: startingAfter,
    });
  }

  /**
   * The invoice a payment settled.
   *
   * @returns null when the payment was for no invoice.
   */
  async invoiceOfPayment(paymentIntentId: string): Promise<string | null> {
    const list = await this.request<StripeList<{ invoice?: string | { id: string } | null }>>(
      'GET',
      '/v1/invoice_payments',
      { payment: { type: 'payment_intent', payment_intent: paymentIntentId }, limit: 1 },
    );
    const invoice = list.data[0]?.invoice;
    return typeof invoice === 'string' ? invoice : (invoice?.id ?? null);
  }

  private setup(): NonNullable<AppConfig['stripe']> {
    if (!this.config.stripe) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'checkout_unavailable',
        message: 'Online payment is not set up on this site.',
      });
    }
    return this.config.stripe;
  }

  /**
   * @throws StripeError when Stripe refuses or cannot be reached.
   * @throws ServiceUnavailableException when no key is configured.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, FormValue> = {},
    idempotencyKey?: string,
  ): Promise<T> {
    const setup = this.setup();
    const form = encodeForm(params);
    const url = `${setup.apiUrl}${path}${method === 'GET' && form ? `?${form}` : ''}`;
    // Reading is safe to repeat once when Stripe stumbles. Writing is not.
    const attempts = method === 'GET' ? 2 : 1;

    let last: StripeError | null = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${setup.secretKey}`,
            'Stripe-Version': STRIPE_API_VERSION,
            ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          },
          ...(method === 'POST' ? { body: form } : {}),
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: 'error',
        });
      } catch (error) {
        last = new StripeError(
          `Stripe was not reached: ${error instanceof Error ? error.message : String(error)}`,
          0,
          null,
          null,
        );
        continue;
      }

      const body = (await response.json().catch(() => null)) as
        (T & { error?: { message?: string; code?: string; type?: string } }) | null;
      if (response.ok && body) {
        return body;
      }
      last = new StripeError(
        body?.error?.message ?? `Stripe answered ${response.status}`,
        response.status,
        body?.error?.code ?? null,
        body?.error?.type ?? null,
      );
      if (response.status < 500) {
        break;
      }
    }
    throw last ?? new StripeError('Stripe was not reached', 0, null, null);
  }
}
