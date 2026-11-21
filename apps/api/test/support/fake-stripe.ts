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
    data: { current_period_end: number; price: { recurring: { interval: string } } }[];
  };
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
  form: Record<string, string>;
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
  sessions: Map<string, FakeSession>;
  subscriptions: Map<string, FakeSubscription>;
  /** Makes every request answer with this status. */
  failWith: number | null;
  /** The viewer pays: the session completes and its subscription starts. */
  pay: (sessionId: string) => FakeSubscription;
  /** Changes a subscription, as Stripe or its customer portal would. */
  change: (id: string, fields: Partial<FakeSubscription>) => FakeSubscription;
  /** Moves a subscription into its next period, as a renewal does. */
  renew: (id: string) => FakeSubscription;
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

  const fake: FakeStripe = {
    apiUrl: '',
    secretKey: 'sk_test_fakeSecretKey123',
    webhookSecret: 'whsec_fakeWebhookSecret123',
    requests: [],
    customers: new Map(),
    products: new Map(),
    sessions: new Map(),
    subscriptions: new Map(),
    failWith: null,
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
        items: { data: [{ current_period_end: periodEnd, price: { recurring: { interval } } }] },
      };
      fake.subscriptions.set(subscription.id, subscription);
      session.status = 'complete';
      session.subscription = subscription.id;
      return subscription;
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
      return subscription;
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
      fake.sessions.clear();
      fake.subscriptions.clear();
      idempotent.clear();
      fake.failWith = null;
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
    if (resource === 'checkout' && id === 'sessions') {
      if (method === 'POST') {
        if (!form.customer || !fake.customers.has(form.customer)) {
          return missing(`customer: '${form.customer}'`);
        }
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
