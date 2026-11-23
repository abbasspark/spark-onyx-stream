// SPDX-License-Identifier: AGPL-3.0-only
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { signatureHeader } from '../../src/stripe/stripe.signature.js';

const DAY = 24 * 60 * 60;
const nowSeconds = () => Math.floor(Date.now() / 1000);

export interface FakeStripeRequest {
  method: string;
  path: string;
  /** The form as flat names, such as "line_items[0][quantity]". */
  form: Record<string, string>;
  headers: IncomingMessage['headers'];
}

export interface FakeSubscription {
  id: string;
  object: 'subscription';
  status: string;
  livemode: boolean;
  customer: string;
  metadata: Record<string, string>;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  canceled_at: number | null;
  ended_at: number | null;
  start_date: number;
  items: {
    data: {
      current_period_end: number;
      price: { unit_amount: number; recurring: { interval: string } };
    }[];
  };
}

export interface FakeInvoice {
  id: string;
  object: 'invoice';
  status: string;
  currency: string;
  amount_paid: number;
  customer: string;
  number: string;
  hosted_invoice_url: string;
  created: number;
  status_transitions: { paid_at: number | null };
  parent: { type: string; subscription_details: { subscription: string } };
  total_taxes: { amount: number }[];
  lines: { data: { period: { start: number; end: number } }[] };
  /** Id of the payment. Handed out only when the request asks for the payments. */
  paymentIntent: string;
}

interface FakeSession {
  id: string;
  object: 'checkout.session';
  url: string;
  mode: string;
  status: string;
  client_reference_id: string | null;
  customer: string | null;
  subscription: string | null;
  payment_status: string;
  payment_intent: string | null;
  amount_total: number | null;
  currency: string | null;
  total_details: { amount_tax: number; amount_discount: number };
  metadata: Record<string, string>;
  created: number;
  form: Record<string, string>;
}

export interface FakeCoupon {
  id: string;
  object: 'coupon';
  name: string;
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  duration: string;
  duration_in_months: number | null;
}

/**
 * A stand-in for Stripe's API that runs inside the test process. It knows the
 * few calls this application makes and answers in the shape of the API
 * version the application asks for.
 */
export interface FakeStripe {
  /** Value for STRIPE_API_URL. */
  apiUrl: string;
  secretKey: string;
  webhookSecret: string;
  requests: FakeStripeRequest[];
  customers: Map<string, { id: string; email: string; name: string; deleted?: boolean }>;
  products: Map<string, { id: string; name: string }>;
  coupons: Map<string, FakeCoupon>;
  sessions: Map<string, FakeSession>;
  subscriptions: Map<string, FakeSubscription>;
  invoices: Map<string, FakeInvoice>;
  /** Makes every request answer with this status. */
  failWith: number | null;
  /** The most invoices one page of a list holds. Lowered by tests of paging. */
  pageSize: number;
  /** The viewer pays: the session completes and its subscription starts. */
  pay: (sessionId: string) => FakeSubscription;
  /** The viewer pays for a single title: the session completes and is paid. */
  payOnce: (sessionId: string) => FakeSession;
  /** Returns money of a single payment. Answers with the charge, as the message about it carries it. */
  refundOnce: (
    sessionId: string,
    amount: number,
  ) => { id: string; amount: number; amount_refunded: number; payment_intent: string };
  /** Changes a subscription, as Stripe or its customer portal would. */
  change: (id: string, fields: Partial<FakeSubscription>) => FakeSubscription;
  /** Moves a subscription into its next period, as a renewal does, and bills it. */
  renew: (id: string) => FakeSubscription;
  /** A paid invoice for a subscription, over its price unless told otherwise. */
  bill: (
    subscriptionId: string,
    fields?: { amount?: number; tax?: number; paidAt?: number },
  ) => FakeInvoice;
  /** Returns money of an invoice. Answers with the charge, as the message about it carries it. */
  refund: (
    invoiceId: string,
    amount: number,
  ) => { id: string; amount: number; amount_refunded: number; payment_intent: string };
  /** A message as Stripe would send it: the body and the signature header. */
  event: (
    type: string,
    object: object,
    options?: { id?: string; livemode?: boolean; secret?: string; timestamp?: number },
  ) => { body: string; signature: string; id: string };
  /** Requests received for a path, such as "/v1/customers". */
  calls: (method: string, path: string) => FakeStripeRequest[];
  reset: () => void;
  close: () => Promise<void>;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export async function startFakeStripe(): Promise<FakeStripe> {
  let counter = 0;
  const next = (prefix: string) => `${prefix}_${String((counter += 1)).padStart(6, '0')}fake`;
  const idempotent = new Map<string, unknown>();
  const refunded = new Map<string, number>();
  /** An invoice as the API hands it out: the payments only when asked for. */
  const shown = (invoice: FakeInvoice, withPayments: boolean) => {
    const { paymentIntent, ...rest } = invoice;
    return withPayments
      ? { ...rest, payments: { data: [{ payment: { payment_intent: paymentIntent } }] } }
      : rest;
  };

  const fake: FakeStripe = {
    apiUrl: '',
    secretKey: 'sk_test_fakeSecretKey123',
    webhookSecret: 'whsec_fakeWebhookSecret123',
    requests: [],
    customers: new Map(),
    products: new Map(),
    coupons: new Map(),
    sessions: new Map(),
    subscriptions: new Map(),
    invoices: new Map(),
    failWith: null,
    pageSize: 100,
    pay(sessionId) {
      const session = fake.sessions.get(sessionId);
      if (!session) {
        throw new Error(`No such session: ${sessionId}`);
      }
      const trialDays = Number(session.form['subscription_data[trial_period_days]'] ?? 0);
      const interval = session.form['line_items[0][price_data][recurring][interval]'] ?? 'month';
      const start = nowSeconds();
      const periodEnd = start + (trialDays > 0 ? trialDays : interval === 'year' ? 365 : 30) * DAY;
      const metadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(session.form)) {
        const match = /^subscription_data\[metadata\]\[(.+)\]$/.exec(key);
        if (match?.[1]) {
          metadata[match[1]] = value;
        }
      }
      const subscription: FakeSubscription = {
        id: next('sub'),
        object: 'subscription',
        status: trialDays > 0 ? 'trialing' : 'active',
        livemode: false,
        customer: session.customer as string,
        metadata,
        cancel_at_period_end: false,
        cancel_at: null,
        canceled_at: null,
        ended_at: null,
        start_date: start,
        items: {
          data: [
            {
              current_period_end: periodEnd,
              price: {
                unit_amount: Number(session.form['line_items[0][price_data][unit_amount]'] ?? 0),
                recurring: { interval },
              },
            },
          ],
        },
      };
      fake.subscriptions.set(subscription.id, subscription);
      session.status = 'complete';
      session.subscription = subscription.id;
      // A trial starts with an invoice over nothing, which is no payment. A code
      // lowers the first invoice.
      fake.bill(
        subscription.id,
        trialDays > 0
          ? { amount: 0 }
          : session.total_details.amount_discount > 0
            ? { amount: session.amount_total ?? 0 }
            : {},
      );
      return subscription;
    },
    payOnce(sessionId) {
      const session = fake.sessions.get(sessionId);
      if (!session || session.mode !== 'payment') {
        throw new Error(`No such payment session: ${sessionId}`);
      }
      session.status = 'complete';
      session.payment_status = 'paid';
      session.payment_intent = next('pi');
      return session;
    },
    refundOnce(sessionId, amount) {
      const session = fake.sessions.get(sessionId);
      if (!session?.payment_intent) {
        throw new Error(`Not paid: ${sessionId}`);
      }
      const total = (refunded.get(sessionId) ?? 0) + amount;
      refunded.set(sessionId, total);
      return {
        id: `ch_${sessionId}`,
        amount: session.amount_total ?? 0,
        amount_refunded: total,
        payment_intent: session.payment_intent,
      };
    },
    change(id, fields) {
      const subscription = fake.subscriptions.get(id);
      if (!subscription) {
        throw new Error(`No such subscription: ${id}`);
      }
      Object.assign(subscription, fields);
      return subscription;
    },
    renew(id) {
      const subscription = fake.change(id, { status: 'active' });
      const item = subscription.items.data[0];
      if (item) {
        const days = item.price.recurring.interval === 'year' ? 365 : 30;
        item.current_period_end = Math.max(item.current_period_end, nowSeconds()) + days * DAY;
      }
      fake.bill(id);
      return subscription;
    },
    bill(subscriptionId, fields = {}) {
      const subscription = fake.subscriptions.get(subscriptionId);
      if (!subscription) {
        throw new Error(`No such subscription: ${subscriptionId}`);
      }
      const item = subscription.items.data[0];
      const paidAt = fields.paidAt ?? nowSeconds();
      const end = item?.current_period_end ?? paidAt + 30 * DAY;
      const days = item?.price.recurring.interval === 'year' ? 365 : 30;
      const id = next('in');
      refunded.set(id, 0);
      const invoice: FakeInvoice = {
        id,
        object: 'invoice',
        status: 'paid',
        currency: 'eur',
        amount_paid: fields.amount ?? item?.price.unit_amount ?? 0,
        customer: subscription.customer,
        number: `FAKE-${String(fake.invoices.size + 1).padStart(4, '0')}`,
        hosted_invoice_url: `https://invoice.stripe.test/i/${id}`,
        created: paidAt,
        status_transitions: { paid_at: paidAt },
        parent: {
          type: 'subscription_details',
          subscription_details: { subscription: subscriptionId },
        },
        total_taxes: fields.tax ? [{ amount: fields.tax }] : [],
        lines: { data: [{ period: { start: end - days * DAY, end } }] },
        paymentIntent: next('pi'),
      };
      fake.invoices.set(id, invoice);
      return invoice;
    },
    refund(invoiceId, amount) {
      const invoice = fake.invoices.get(invoiceId);
      if (!invoice) {
        throw new Error(`No such invoice: ${invoiceId}`);
      }
      const total = (refunded.get(invoiceId) ?? 0) + amount;
      refunded.set(invoiceId, total);
      return {
        id: `ch_${invoiceId}`,
        amount: invoice.amount_paid,
        amount_refunded: total,
        payment_intent: invoice.paymentIntent,
      };
    },
    event(type, object, options = {}) {
      const id = options.id ?? next('evt');
      const body = JSON.stringify({
        id,
        object: 'event',
        type,
        livemode: options.livemode ?? false,
        created: nowSeconds(),
        data: { object },
      });
      return {
        id,
        body,
        signature: signatureHeader(
          body,
          options.secret ?? fake.webhookSecret,
          options.timestamp ?? nowSeconds(),
        ),
      };
    },
    calls: (method, path) =>
      fake.requests.filter((request) => request.method === method && request.path === path),
    reset() {
      fake.requests.length = 0;
      fake.customers.clear();
      fake.products.clear();
      fake.coupons.clear();
      fake.sessions.clear();
      fake.subscriptions.clear();
      fake.invoices.clear();
      refunded.clear();
      idempotent.clear();
      fake.failWith = null;
      fake.pageSize = 100;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };

  const missing = (what: string) => ({
    status: 404,
    body: {
      error: {
        type: 'invalid_request_error',
        code: 'resource_missing',
        message: `No such ${what}`,
      },
    },
  });

  function answer(
    method: string,
    path: string,
    form: Record<string, string>,
  ): { status: number; body: unknown } {
    const [, , resource, id, action] = path.split('/');

    if (resource === 'account' && method === 'GET') {
      return {
        status: 200,
        body: {
          id: 'acct_fake',
          country: 'DE',
          default_currency: 'eur',
          charges_enabled: true,
          settings: { dashboard: { display_name: 'Fake Films' } },
        },
      };
    }
    if (resource === 'customers') {
      if (method === 'POST' && !id) {
        const customer = { id: next('cus'), email: form.email ?? '', name: form.name ?? '' };
        fake.customers.set(customer.id, customer);
        return { status: 200, body: customer };
      }
      const customer = id ? fake.customers.get(id) : undefined;
      return customer ? { status: 200, body: customer } : missing(`customer: '${id}'`);
    }
    if (resource === 'products' && method === 'POST') {
      if (id) {
        const product = fake.products.get(id);
        if (!product) {
          return missing(`product: '${id}'`);
        }
        product.name = form.name ?? product.name;
        return { status: 200, body: product };
      }
      const wanted = form.id ?? next('prod');
      if (fake.products.has(wanted)) {
        return {
          status: 400,
          body: {
            error: {
              type: 'invalid_request_error',
              code: 'resource_already_exists',
              message: `Product already exists.`,
            },
          },
        };
      }
      const product = { id: wanted, name: form.name ?? '' };
      fake.products.set(wanted, product);
      return { status: 200, body: product };
    }
    if (resource === 'coupons') {
      if (method === 'GET' && id) {
        const coupon = fake.coupons.get(id);
        return coupon ? { status: 200, body: coupon } : missing(`coupon: '${id}'`);
      }
      if (method === 'POST' && !id) {
        const wanted = form.id ?? next('coupon');
        if (fake.coupons.has(wanted)) {
          return {
            status: 400,
            body: {
              error: {
                type: 'invalid_request_error',
                code: 'resource_already_exists',
                message: 'Coupon already exists.',
              },
            },
          };
        }
        const coupon: FakeCoupon = {
          id: wanted,
          object: 'coupon',
          name: form.name ?? '',
          percent_off: form.percent_off ? Number(form.percent_off) : null,
          amount_off: form.amount_off ? Number(form.amount_off) : null,
          currency: form.currency ?? null,
          duration: form.duration ?? 'once',
          duration_in_months: form.duration_in_months ? Number(form.duration_in_months) : null,
        };
        fake.coupons.set(wanted, coupon);
        return { status: 200, body: coupon };
      }
    }
    if (resource === 'checkout' && id === 'sessions') {
      if (method === 'POST') {
        if (!form.customer || !fake.customers.has(form.customer)) {
          return missing(`customer: '${form.customer}'`);
        }
        const wantedCoupon = form['discounts[0][coupon]'];
        const coupon = wantedCoupon ? fake.coupons.get(wantedCoupon) : undefined;
        if (wantedCoupon && !coupon) {
          return missing(`coupon: '${wantedCoupon}'`);
        }
        if (wantedCoupon && form.allow_promotion_codes) {
          return {
            status: 400,
            body: {
              error: {
                type: 'invalid_request_error',
                message:
                  'You may only specify one of these parameters: allow_promotion_codes, discounts.',
              },
            },
          };
        }
        const unit = Number(form['line_items[0][price_data][unit_amount]'] ?? 0);
        const discount = coupon
          ? Math.min(
              unit,
              coupon.percent_off !== null
                ? Math.round((unit * coupon.percent_off) / 100)
                : (coupon.amount_off ?? 0),
            )
          : 0;
        const sessionId = next('cs_test');
        const session: FakeSession = {
          id: sessionId,
          object: 'checkout.session',
          url: `https://checkout.stripe.test/c/pay/${sessionId}`,
          mode: form.mode ?? '',
          status: 'open',
          client_reference_id: form.client_reference_id ?? null,
          customer: form.customer,
          subscription: null,
          payment_status: 'unpaid',
          payment_intent: null,
          // Without a code, a subscription's total is left out, as before.
          amount_total: form.mode === 'payment' || coupon ? unit - discount : null,
          total_details: { amount_tax: 0, amount_discount: discount },
          currency: form['line_items[0][price_data][currency]'] ?? null,
          metadata: Object.fromEntries(
            Object.entries(form)
              .map(([key, value]) => [/^metadata\[(.+)\]$/.exec(key)?.[1], value] as const)
              .filter((entry): entry is readonly [string, string] => entry[0] !== undefined),
          ),
          created: nowSeconds(),
          form,
        };
        fake.sessions.set(sessionId, session);
        return { status: 200, body: session };
      }
      const session = action ? fake.sessions.get(action) : undefined;
      return session ? { status: 200, body: session } : missing(`checkout.session: '${action}'`);
    }
    if (resource === 'billing_portal' && id === 'sessions' && method === 'POST') {
      if (!form.customer || !fake.customers.has(form.customer)) {
        return missing(`customer: '${form.customer}'`);
      }
      return {
        status: 200,
        body: { id: next('bps'), url: `https://billing.stripe.test/p/session/${form.customer}` },
      };
    }
    if (resource === 'invoices' && method === 'GET') {
      if (id) {
        const invoice = fake.invoices.get(id);
        return invoice
          ? { status: 200, body: shown(invoice, form['expand[0]'] === 'payments') }
          : missing(`invoice: '${id}'`);
      }
      // Newest first, a page at a time, as Stripe lists.
      const all = [...fake.invoices.values()]
        .filter((invoice) => invoice.status === 'paid')
        .reverse();
      const start = form.starting_after
        ? all.findIndex((invoice) => invoice.id === form.starting_after) + 1
        : 0;
      const size = Math.min(Number(form.limit ?? 10), fake.pageSize);
      return {
        status: 200,
        body: {
          object: 'list',
          data: all.slice(start, start + size).map((invoice) => shown(invoice, false)),
          has_more: start + size < all.length,
        },
      };
    }
    if (resource === 'invoice_payments' && method === 'GET') {
      const wanted = form['payment[payment_intent]'];
      const invoice = [...fake.invoices.values()].find((item) => item.paymentIntent === wanted);
      return {
        status: 200,
        body: { object: 'list', data: invoice ? [{ invoice: invoice.id }] : [], has_more: false },
      };
    }
    if (resource === 'subscriptions' && id) {
      const subscription = fake.subscriptions.get(id);
      if (!subscription) {
        return missing(`subscription: '${id}'`);
      }
      if (method === 'DELETE') {
        const now = nowSeconds();
        Object.assign(subscription, { status: 'canceled', canceled_at: now, ended_at: now });
      }
      return { status: 200, body: subscription };
    }
    return { status: 404, body: { error: { type: 'invalid_request_error', message: 'Unknown' } } };
  }

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://stripe.test');
      const raw = await readBody(request);
      const form = Object.fromEntries(
        new URLSearchParams(request.method === 'GET' ? url.search : raw),
      );
      const method = request.method ?? 'GET';
      fake.requests.push({ method, path: url.pathname, form, headers: request.headers });

      const send = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body));
      };
      if (fake.failWith !== null) {
        send(fake.failWith, {
          error: { type: 'api_error', message: 'Stripe is having a bad day' },
        });
        return;
      }
      if (request.headers.authorization !== `Bearer ${fake.secretKey}`) {
        send(401, {
          error: { type: 'invalid_request_error', message: 'Invalid API Key provided' },
        });
        return;
      }
      const key = request.headers['idempotency-key'];
      if (typeof key === 'string' && idempotent.has(key)) {
        send(200, idempotent.get(key));
        return;
      }
      const result = answer(method, url.pathname, form);
      if (typeof key === 'string' && result.status === 200) {
        idempotent.set(key, result.body);
      }
      send(result.status, result.body);
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  fake.apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return fake;
}
