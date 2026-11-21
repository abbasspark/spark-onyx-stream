// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of paying online: the payment page, the return from it,
// what Stripe reports afterwards, and what admins see and can do.
// Stripe itself is a stand-in that runs inside the test.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { ApiKeysModule } from '../src/api-keys/api-keys.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { BillingModule } from '../src/billing/billing.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { MaintenanceModule } from '../src/maintenance/maintenance.module.js';
import { STRIPE_API_VERSION } from '../src/stripe/stripe.client.js';
import { RENEWAL_GRACE_MS } from '../src/stripe/stripe.mapper.js';
import { StripeSyncService } from '../src/stripe/stripe-sync.service.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { type FakeStripe, startFakeStripe } from './support/fake-stripe.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [
  AssetsModule,
  AdminsModule,
  ApiKeysModule,
  CatalogModule,
  ViewersModule,
  BillingModule,
  MaintenanceModule,
];
const ANNA = { email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' };
const BEN = { email: 'ben@example.com', displayName: 'Ben', password: 'battery-staple' };
const WEBHOOK = '/v1/billing/stripe/webhook';
const DAY_MS = 24 * 60 * 60 * 1000;

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Billing with Stripe (e2e)', () => {
  let testApp: TestApp;
  let stripe: FakeStripe;
  let workDirectory: string;
  let env: Record<string, string>;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function register(viewer = ANNA) {
    const response = await http().post('/v1/viewer/register').send(viewer).expect(201);
    return { id: response.body.viewer.id as string, cookie: cookieOf(response) };
  }

  const createPlan = async (body: Record<string, unknown> = {}) =>
    (
      await http()
        .post('/v1/plans')
        .set(admin())
        .send({ name: 'Standard', monthlyAmount: 799, yearlyAmount: 7990, ...body })
        .expect(201)
    ).body as { id: string; name: string };

  async function createPaidMovie(name = 'Paid film') {
    const created = await http()
      .post('/v1/titles')
      .set(admin())
      .send({ type: 'MOVIE', name })
      .expect(201);
    const id = created.body.id as string;
    const asset = await http()
      .post('/v1/assets')
      .set(admin())
      .send({ title: `${name} master` })
      .expect(201);
    const assetId = asset.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id: assetId },
      data: { status: 'READY', manifestPath: `assets/${assetId}/hls/master.m3u8` },
    });
    await http()
      .patch(`/v1/titles/${id}`)
      .set(admin())
      .send({ assetId, access: 'PAID' })
      .expect(200);
    await http()
      .put(`/v1/titles/${id}/status`)
      .set(admin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return { id, slug: created.body.slug as string };
  }

  const play = (slug: string, cookie: string) =>
    http().post(`/v1/catalog/titles/${slug}/playback`).set('Cookie', cookie);

  const checkout = (cookie: string, body: Record<string, unknown>) =>
    http().post('/v1/viewer/checkout').set('Cookie', cookie).send(body);

  const own = async (cookie: string) =>
    (await http().get('/v1/viewer/subscription').set('Cookie', cookie).expect(200)).body as {
      entitled: boolean;
      subscription: Record<string, unknown> | null;
    };

  /** Sends a message the way Stripe does: the exact bytes, and the signature of them. */
  const deliver = (message: { body: string; signature: string | null }) => {
    const request = http().post(WEBHOOK).set('Content-Type', 'application/json');
    return (
      message.signature === null ? request : request.set('Stripe-Signature', message.signature)
    ).send(message.body);
  };

  const sessionIdOf = (url: string) => url.split('/').pop() as string;

  /** A viewer who went through the payment page and returned. */
  async function subscribe(viewer = ANNA, planBody: Record<string, unknown> = {}) {
    const account = await register(viewer);
    const plan = await createPlan(planBody);
    const started = await checkout(account.cookie, { planId: plan.id, interval: 'MONTH' }).expect(
      200,
    );
    const sessionId = sessionIdOf(started.body.url as string);
    const remote = stripe.pay(sessionId);
    await http()
      .post('/v1/viewer/checkout/confirm')
      .set('Cookie', account.cookie)
      .send({ sessionId })
      .expect(200);
    return { ...account, plan, sessionId, remote };
  }

  beforeAll(async () => {
    stripe = await startFakeStripe();
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-stripe-'));
    env = {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      BILLING_CURRENCY: 'EUR',
    };
    testApp = await createTestApp(MODULES, {
      ...env,
      SITE_URL: 'https://watch.example.com',
      STRIPE_SECRET_KEY: stripe.secretKey,
      STRIPE_WEBHOOK_SECRET: stripe.webhookSecret,
      STRIPE_API_URL: stripe.apiUrl,
    });
  });

  beforeEach(async () => {
    stripe.reset();
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp.resetDatabase();
    await testApp.close();
    await stripe.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  describe('the payment page', () => {
    it('tells the website that viewers can pay online', async () => {
      await createPlan();
      const plans = await http().get('/v1/catalog/plans').expect(200);
      expect(plans.body.checkout).toBe(true);
    });

    it('needs a signed-in viewer', async () => {
      const plan = await createPlan();
      await http()
        .post('/v1/viewer/checkout')
        .send({ planId: plan.id, interval: 'MONTH' })
        .expect(401);
      expect(stripe.requests).toHaveLength(0);
    });

    it('opens Stripe for the chosen plan and price', async () => {
      const anna = await register();
      const plan = await createPlan({ trialDays: 7 });

      const started = await checkout(anna.cookie, { planId: plan.id, interval: 'YEAR' }).expect(
        200,
      );
      expect(started.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\/c\/pay\/cs_test_/);
      expect(started.headers['cache-control']).toBe('no-store');

      const [request] = stripe.calls('POST', '/v1/checkout/sessions');
      expect(request?.headers.authorization).toBe(`Bearer ${stripe.secretKey}`);
      expect(request?.headers['stripe-version']).toBe(STRIPE_API_VERSION);
      const [customer] = [...stripe.customers.values()];
      expect(customer).toMatchObject({ email: ANNA.email, name: ANNA.displayName });
      expect(request?.form).toMatchObject({
        mode: 'subscription',
        customer: customer?.id,
        client_reference_id: anna.id,
        allow_promotion_codes: 'true',
        success_url: 'https://watch.example.com/plans/thanks?session={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://watch.example.com/plans',
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': '7990',
        'line_items[0][price_data][recurring][interval]': 'year',
        'line_items[0][price_data][product]': `onyx_${plan.id.replace(/-/g, '')}`,
        'subscription_data[metadata][viewerId]': anna.id,
        'subscription_data[metadata][planId]': plan.id,
        'subscription_data[trial_period_days]': '7',
      });
      // Tax is left to the account unless the installation asks for Stripe Tax.
      expect(request?.form).not.toHaveProperty('automatic_tax[enabled]');
      expect([...stripe.products.values()]).toEqual([
        { id: `onyx_${plan.id.replace(/-/g, '')}`, name: 'Standard' },
      ]);
    });

    it('makes one customer and one product, however often the page is opened', async () => {
      const anna = await register();
      const plan = await createPlan();
      await checkout(anna.cookie, { planId: plan.id, interval: 'MONTH' }).expect(200);
      await http().patch(`/v1/plans/${plan.id}`).set(admin()).send({ name: 'Premium' }).expect(200);
      await checkout(anna.cookie, { planId: plan.id, interval: 'MONTH' }).expect(200);

      expect(stripe.customers.size).toBe(1);
      expect(stripe.calls('POST', '/v1/customers')).toHaveLength(1);
      // The product at Stripe follows the name of the plan.
      expect([...stripe.products.values()]).toEqual([
        { id: `onyx_${plan.id.replace(/-/g, '')}`, name: 'Premium' },
      ]);
    });

    it('makes a new customer when Stripe no longer knows the old one', async () => {
      const anna = await register();
      const plan = await createPlan();
      await checkout(anna.cookie, { planId: plan.id, interval: 'MONTH' }).expect(200);
      const [first] = [...stripe.customers.keys()];
      stripe.customers.clear();

      await checkout(anna.cookie, { planId: plan.id, interval: 'MONTH' }).expect(200);
      const viewer = await testApp.prisma.viewer.findUniqueOrThrow({ where: { id: anna.id } });
      expect(viewer.stripeCustomerId).not.toBe(first);
      expect(stripe.customers.has(viewer.stripeCustomerId as string)).toBe(true);
    });

    it('refuses a plan that is not on offer, and an interval it is not sold for', async () => {
      const anna = await register();
      const monthly = await createPlan({ yearlyAmount: null });
      const hidden = await createPlan({ name: 'Old', isOffered: false });

      await checkout(anna.cookie, { planId: monthly.id, interval: 'YEAR' }).expect(400);
      await checkout(anna.cookie, { planId: hidden.id, interval: 'MONTH' }).expect(404);
      await checkout(anna.cookie, {
        planId: '0190a0a0-0000-7000-8000-000000000000',
        interval: 'MONTH',
      }).expect(404);
      const invalid = await checkout(anna.cookie, { planId: 'nope', interval: 'WEEK' }).expect(400);
      expect(invalid.body.issues.map((issue: { field: string }) => issue.field).sort()).toEqual([
        'interval',
        'planId',
      ]);
      expect(stripe.calls('POST', '/v1/checkout/sessions')).toHaveLength(0);
    });

    it('answers plainly when Stripe is down, and keeps its words out of the answer', async () => {
      const anna = await register();
      const plan = await createPlan();
      stripe.failWith = 500;
      const failed = await checkout(anna.cookie, { planId: plan.id, interval: 'MONTH' }).expect(
        502,
      );
      expect(failed.body.code).toBe('payment_provider_error');
      expect(failed.body.message).not.toContain('bad day');
    });
  });

  describe('returning from the payment page', () => {
    it('gives access at once, before Stripe reports anything', async () => {
      const movie = await createPaidMovie();
      const anna = await register();
      const plan = await createPlan();
      await play(movie.slug, anna.cookie).expect(402);

      const started = await checkout(anna.cookie, { planId: plan.id, interval: 'MONTH' }).expect(
        200,
      );
      const sessionId = sessionIdOf(started.body.url as string);
      // Back on the site without having paid: nothing changes.
      const early = await http()
        .post('/v1/viewer/checkout/confirm')
        .set('Cookie', anna.cookie)
        .send({ sessionId })
        .expect(200);
      expect(early.body).toEqual({
        subscription: null,
        entitled: false,
        access: null,
        trialUsed: false,
      });

      const remote = stripe.pay(sessionId);
      const confirmed = await http()
        .post('/v1/viewer/checkout/confirm')
        .set('Cookie', anna.cookie)
        .send({ sessionId })
        .expect(200);
      const periodEnd = (remote.items.data[0]?.current_period_end as number) * 1000;
      expect(confirmed.body).toEqual({
        entitled: true,
        access: { all: true, packageIds: [] },
        trialUsed: true,
        subscription: {
          plan: { id: plan.id, name: 'Standard' },
          status: 'ACTIVE',
          interval: 'MONTH',
          startedAt: new Date(remote.start_date * 1000).toISOString(),
          renewsAt: new Date(periodEnd).toISOString(),
          endsAt: new Date(periodEnd + RENEWAL_GRACE_MS).toISOString(),
          cancelAtPeriodEnd: false,
          online: true,
        },
      });
      await play(movie.slug, anna.cookie).expect(200);
      const session = await http().get('/v1/viewer/session').set('Cookie', anna.cookie).expect(200);
      expect(session.body.entitled).toBe(true);
    });

    it('does not let one viewer claim the payment of another', async () => {
      const anna = await subscribe();
      const ben = await register(BEN);
      await http()
        .post('/v1/viewer/checkout/confirm')
        .set('Cookie', ben.cookie)
        .send({ sessionId: anna.sessionId })
        .expect(404);
      expect((await own(ben.cookie)).entitled).toBe(false);

      await http()
        .post('/v1/viewer/checkout/confirm')
        .set('Cookie', ben.cookie)
        .send({ sessionId: 'cs_test_unknown00' })
        .expect(404);
      await http()
        .post('/v1/viewer/checkout/confirm')
        .set('Cookie', ben.cookie)
        .send({ sessionId: '../v1/customers' })
        .expect(400);
    });

    it('starts with a trial once, and not again after it', async () => {
      const anna = await subscribe(ANNA, { trialDays: 14 });
      expect(anna.remote.status).toBe('trialing');
      expect((await own(anna.cookie)).subscription).toMatchObject({ status: 'TRIALING' });

      // The trial ends without a payment; the viewer comes back later.
      stripe.change(anna.remote.id, {
        status: 'canceled',
        ended_at: Math.floor(Date.now() / 1000),
      });
      await deliver(stripe.event('customer.subscription.deleted', anna.remote)).expect(200);
      expect((await own(anna.cookie)).entitled).toBe(false);

      await checkout(anna.cookie, { planId: anna.plan.id, interval: 'MONTH' }).expect(200);
      const second = stripe.calls('POST', '/v1/checkout/sessions')[1];
      expect(second?.form).not.toHaveProperty('subscription_data[trial_period_days]');
    });

    it('refuses a second subscription beside a running one', async () => {
      const anna = await subscribe();
      const again = await checkout(anna.cookie, { planId: anna.plan.id, interval: 'YEAR' }).expect(
        409,
      );
      expect(again.body.code).toBe('already_subscribed');

      // Access an admin granted counts the same.
      const ben = await register(BEN);
      await http()
        .post(`/v1/viewers/${ben.id}/subscriptions`)
        .set(admin())
        .send({ planId: anna.plan.id, endsAt: null })
        .expect(201);
      await checkout(ben.cookie, { planId: anna.plan.id, interval: 'MONTH' }).expect(409);
    });
  });

  describe('what Stripe reports', () => {
    it('trusts only messages signed with the secret of the endpoint', async () => {
      const message = stripe.event('customer.subscription.updated', { id: 'sub_none' });

      await deliver({ body: message.body, signature: null }).expect(400);
      await deliver({ body: message.body, signature: 't=1,v1=abc' }).expect(400);
      await deliver(
        stripe.event('customer.subscription.updated', { id: 'sub_x' }, { secret: 'whsec_other' }),
      ).expect(400);
      // A good signature of other bytes.
      await deliver({ body: `${message.body} `, signature: message.signature }).expect(400);
      // A message from ten minutes ago, sent again by someone who caught it.
      const old = stripe.event(
        'customer.subscription.updated',
        { id: 'sub_x' },
        { timestamp: Math.floor(Date.now() / 1000) - 600 },
      );
      const refused = await deliver(old).expect(400);
      expect(refused.body.message).toBe('The message is too old');

      expect(await testApp.prisma.stripeEvent.count()).toBe(0);
      expect(stripe.requests).toHaveLength(0);
    });

    it('records a new subscription from the message alone, when the viewer never returns', async () => {
      const movie = await createPaidMovie();
      const anna = await register();
      const plan = await createPlan();
      const started = await checkout(anna.cookie, { planId: plan.id, interval: 'MONTH' }).expect(
        200,
      );
      const sessionId = sessionIdOf(started.body.url as string);
      const remote = stripe.pay(sessionId);

      const answer = await deliver(
        stripe.event('checkout.session.completed', {
          id: sessionId,
          mode: 'subscription',
          subscription: remote.id,
        }),
      ).expect(200);
      expect(answer.body).toEqual({ received: true, outcome: 'handled' });
      await play(movie.slug, anna.cookie).expect(200);

      // The other messages about the same payment change nothing and make no second record.
      await deliver(stripe.event('customer.subscription.created', remote)).expect(200);
      expect(await testApp.prisma.subscription.count()).toBe(1);
    });

    it('handles a message once, however often Stripe sends it', async () => {
      const anna = await subscribe();
      const message = stripe.event('customer.subscription.updated', anna.remote);
      const first = await deliver(message).expect(200);
      expect(first.body.outcome).toBe('handled');
      const before = stripe.requests.length;

      const second = await deliver(message).expect(200);
      expect(second.body.outcome).toBe('duplicate');
      expect(stripe.requests).toHaveLength(before);
    });

    it('follows a renewal', async () => {
      const anna = await subscribe();
      const before = (await own(anna.cookie)).subscription?.renewsAt as string;
      stripe.renew(anna.remote.id);
      await deliver(stripe.event('customer.subscription.updated', anna.remote)).expect(200);

      const after = (await own(anna.cookie)).subscription?.renewsAt as string;
      expect(new Date(after).getTime() - new Date(before).getTime()).toBe(30 * DAY_MS);
    });

    it('lets a viewer who cancelled watch until the end of what is paid', async () => {
      const movie = await createPaidMovie();
      const anna = await subscribe();
      const periodEnd = anna.remote.items.data[0]?.current_period_end as number;
      stripe.change(anna.remote.id, {
        cancel_at_period_end: true,
        canceled_at: Math.floor(Date.now() / 1000),
      });
      await deliver(stripe.event('customer.subscription.updated', anna.remote)).expect(200);

      expect((await own(anna.cookie)).subscription).toMatchObject({
        status: 'ACTIVE',
        cancelAtPeriodEnd: true,
        renewsAt: null,
        endsAt: new Date(periodEnd * 1000).toISOString(),
      });
      await play(movie.slug, anna.cookie).expect(200);

      // The viewer changes their mind in Stripe's portal.
      stripe.change(anna.remote.id, { cancel_at_period_end: false, canceled_at: null });
      await deliver(stripe.event('customer.subscription.updated', anna.remote)).expect(200);
      expect((await own(anna.cookie)).subscription).toMatchObject({
        cancelAtPeriodEnd: false,
        renewsAt: new Date(periodEnd * 1000).toISOString(),
      });
    });

    it('keeps access while a failed payment is retried, and ends it when Stripe gives up', async () => {
      const movie = await createPaidMovie();
      const anna = await subscribe();

      stripe.change(anna.remote.id, { status: 'past_due' });
      await deliver(stripe.event('customer.subscription.updated', anna.remote)).expect(200);
      expect((await own(anna.cookie)).subscription).toMatchObject({ status: 'PAST_DUE' });
      await play(movie.slug, anna.cookie).expect(200);

      stripe.change(anna.remote.id, { status: 'unpaid' });
      await deliver(stripe.event('customer.subscription.updated', anna.remote)).expect(200);
      expect(await own(anna.cookie)).toEqual({
        subscription: null,
        entitled: false,
        access: null,
        trialUsed: true,
      });
      const refused = await play(movie.slug, anna.cookie).expect(402);
      expect(refused.body.code).toBe('subscription_required');

      // The viewer pays the open invoice after all.
      stripe.renew(anna.remote.id);
      await deliver(stripe.event('customer.subscription.updated', anna.remote)).expect(200);
      await play(movie.slug, anna.cookie).expect(200);
    });

    it('ends access when the subscription is over', async () => {
      const movie = await createPaidMovie();
      const anna = await subscribe();
      const now = Math.floor(Date.now() / 1000);
      stripe.change(anna.remote.id, { status: 'canceled', canceled_at: now, ended_at: now });
      await deliver(stripe.event('customer.subscription.deleted', anna.remote)).expect(200);

      expect((await own(anna.cookie)).entitled).toBe(false);
      await play(movie.slug, anna.cookie).expect(402);
      // And the viewer may subscribe again.
      await checkout(anna.cookie, { planId: anna.plan.id, interval: 'MONTH' }).expect(200);
    });

    it('is not led astray by an old message that arrives late', async () => {
      const anna = await subscribe();
      // The message says "active", but in the meantime the subscription ended.
      const stale = stripe.event('customer.subscription.updated', { ...anna.remote });
      const now = Math.floor(Date.now() / 1000);
      stripe.change(anna.remote.id, { status: 'canceled', canceled_at: now, ended_at: now });

      await deliver(stale).expect(200);
      expect((await own(anna.cookie)).entitled).toBe(false);
    });

    it('asks Stripe to send a message again when handling it failed', async () => {
      const anna = await subscribe();
      stripe.change(anna.remote.id, { cancel_at_period_end: true });
      const message = stripe.event('customer.subscription.updated', anna.remote);

      stripe.failWith = 503;
      await deliver(message).expect(502);
      expect((await own(anna.cookie)).subscription).toMatchObject({ cancelAtPeriodEnd: false });
      const failed = await testApp.prisma.stripeEvent.findUniqueOrThrow({
        where: { id: message.id },
      });
      expect(failed.processedAt).toBeNull();
      expect(failed.error).toContain('bad day');

      stripe.failWith = null;
      const retried = await deliver(message).expect(200);
      expect(retried.body.outcome).toBe('handled');
      expect((await own(anna.cookie)).subscription).toMatchObject({ cancelAtPeriodEnd: true });
    });

    it('ignores what it has no use for', async () => {
      const anna = await subscribe();
      const invoice = await deliver(stripe.event('invoice.paid', { id: 'in_1' })).expect(200);
      expect(invoice.body.outcome).toBe('ignored');
      // A live message at a site that runs on test keys.
      const live = await deliver(
        stripe.event('customer.subscription.deleted', anna.remote, { livemode: true }),
      ).expect(200);
      expect(live.body.outcome).toBe('ignored');
      // A subscription made at Stripe for somebody this site does not know.
      stripe.subscriptions.set('sub_foreign', {
        ...anna.remote,
        id: 'sub_foreign',
        customer: 'cus_foreign',
        metadata: {},
      });
      await deliver(stripe.event('customer.subscription.created', { id: 'sub_foreign' })).expect(
        200,
      );
      await deliver({ body: 'not json', signature: stripe.event('x', {}).signature }).expect(400);

      expect(await testApp.prisma.subscription.count()).toBe(1);
      expect((await own(anna.cookie)).entitled).toBe(true);
    });
  });

  describe('managing a subscription', () => {
    it("opens Stripe's page for the viewer who pays online", async () => {
      const anna = await subscribe();
      const opened = await http()
        .post('/v1/viewer/billing-portal')
        .set('Cookie', anna.cookie)
        .expect(200);
      expect(opened.body.url).toMatch(/^https:\/\/billing\.stripe\.test\/p\/session\/cus_/);
      const [request] = stripe.calls('POST', '/v1/billing_portal/sessions');
      expect(request?.form.return_url).toBe('https://watch.example.com/account');
    });

    it('has nothing to open for a viewer who never paid online', async () => {
      const ben = await register(BEN);
      await http().post('/v1/viewer/billing-portal').expect(401);
      const refused = await http()
        .post('/v1/viewer/billing-portal')
        .set('Cookie', ben.cookie)
        .expect(409);
      expect(refused.body.code).toBe('no_online_subscription');
    });

    it('does not delete an account that is still being charged', async () => {
      const anna = await subscribe();
      const refused = await http()
        .post('/v1/viewer/delete')
        .set('Cookie', anna.cookie)
        .send({ password: ANNA.password })
        .expect(409);
      expect(refused.body.code).toBe('subscription_running');
      await http().delete(`/v1/viewers/${anna.id}`).set(admin()).expect(409);

      // Once cancelled, nothing more is charged and the account may go.
      stripe.change(anna.remote.id, { cancel_at_period_end: true });
      await deliver(stripe.event('customer.subscription.updated', anna.remote)).expect(200);
      await http()
        .post('/v1/viewer/delete')
        .set('Cookie', anna.cookie)
        .send({ password: ANNA.password })
        .expect(204);
    });
  });

  describe('for admins', () => {
    it('shows how online payment is set up and how it is doing', async () => {
      const anna = await subscribe();
      const ben = await register(BEN);
      await http()
        .post(`/v1/viewers/${ben.id}/subscriptions`)
        .set(admin())
        .send({ planId: anna.plan.id, endsAt: null })
        .expect(201);
      stripe.change(anna.remote.id, { status: 'past_due' });
      const message = stripe.event('customer.subscription.updated', anna.remote);
      await deliver(message).expect(200);

      const overview = await http().get('/v1/billing').set(admin()).expect(200);
      expect(overview.body).toMatchObject({
        checkout: true,
        subscribers: 2,
        grantedByHand: 1,
        paidOnline: 1,
        pastDue: 1,
        stripe: {
          livemode: false,
          webhookPath: WEBHOOK,
          siteUrl: 'https://watch.example.com',
          automaticTax: false,
          failedEvents: 0,
          lastEvent: { id: message.id, type: 'customer.subscription.updated', state: 'handled' },
        },
      });
      expect(overview.body.stripe.webhookEvents).toContain('customer.subscription.deleted');

      const events = await http().get('/v1/billing/stripe/events').set(admin()).expect(200);
      expect(events.body).toHaveLength(1);
      await http().get('/v1/billing/stripe/events').expect(401);
    });

    it('proves that the key works', async () => {
      const account = await http().post('/v1/billing/stripe/check').set(admin()).expect(200);
      expect(account.body).toEqual({
        id: 'acct_fake',
        name: 'Fake Films',
        country: 'DE',
        defaultCurrency: 'EUR',
        chargesEnabled: true,
        livemode: false,
        currencyMismatch: false,
      });

      stripe.secretKey = 'sk_test_another';
      const refused = await http().post('/v1/billing/stripe/check').set(admin()).expect(502);
      expect(refused.body.message).toBe('Stripe said: Invalid API Key provided');
      stripe.secretKey = 'sk_test_fakeSecretKey123';
    });

    it('shows a subscription paid online with its place at Stripe', async () => {
      const anna = await subscribe();
      const list = await http()
        .get(`/v1/viewers/${anna.id}/subscriptions`)
        .set(admin())
        .expect(200);
      expect(list.body.current).toMatchObject({
        source: 'STRIPE',
        running: true,
        online: true,
        externalId: anna.remote.id,
        externalUrl: `https://dashboard.stripe.com/test/subscriptions/${anna.remote.id}`,
        grantedBy: null,
      });

      // Its plan and its end belong to Stripe.
      await http()
        .patch(`/v1/subscriptions/${list.body.current.id}`)
        .set(admin())
        .send({ note: 'mine now' })
        .expect(409);
    });

    it('ends a subscription paid online at Stripe, so nothing more is charged', async () => {
      const movie = await createPaidMovie();
      const anna = await subscribe();
      const list = await http()
        .get(`/v1/viewers/${anna.id}/subscriptions`)
        .set(admin())
        .expect(200);
      const id = list.body.current.id as string;

      const ended = await http().post(`/v1/subscriptions/${id}/end`).set(admin()).expect(200);
      expect(ended.body).toMatchObject({ status: 'CANCELED', running: false });
      expect(stripe.subscriptions.get(anna.remote.id)?.status).toBe('canceled');
      await play(movie.slug, anna.cookie).expect(402);

      await http().post(`/v1/subscriptions/${id}/end`).set(admin()).expect(409);
      const log = await http().get('/v1/audit-logs').set(admin()).expect(200);
      expect(
        log.body.items.some((entry: { action: string }) => entry.action === 'subscription.end'),
      ).toBe(true);
    });

    it('reads a subscription from Stripe again on request', async () => {
      const anna = await subscribe();
      const list = await http()
        .get(`/v1/viewers/${anna.id}/subscriptions`)
        .set(admin())
        .expect(200);
      stripe.change(anna.remote.id, { cancel_at_period_end: true });

      const refreshed = await http()
        .post(`/v1/subscriptions/${list.body.current.id}/refresh`)
        .set(admin())
        .expect(200);
      expect(refreshed.body.cancelAtPeriodEnd).toBe(true);

      const ben = await register(BEN);
      const granted = await http()
        .post(`/v1/viewers/${ben.id}/subscriptions`)
        .set(admin())
        .send({ planId: anna.plan.id, endsAt: null })
        .expect(201);
      await http().post(`/v1/subscriptions/${granted.body.id}/refresh`).set(admin()).expect(409);
    });
  });

  describe('the check with Stripe', () => {
    it('finds a renewal Stripe never reported', async () => {
      const anna = await subscribe();
      const sync = testApp.app.get(StripeSyncService);
      expect(await sync.reconcile()).toBe(0);

      // Two hours after the payment was due, nothing has been heard.
      const record = await testApp.prisma.subscription.findFirstOrThrow({
        where: { externalId: anna.remote.id },
      });
      const later = new Date((record.renewsAt as Date).getTime() + 2 * 60 * 60 * 1000);
      const item = anna.remote.items.data[0];
      if (item) {
        item.current_period_end += 30 * 24 * 60 * 60;
      }
      expect(await sync.reconcile(later)).toBe(1);

      const after = await testApp.prisma.subscription.findUniqueOrThrow({
        where: { id: record.id },
      });
      expect((after.renewsAt as Date).getTime() - (record.renewsAt as Date).getTime()).toBe(
        30 * DAY_MS,
      );
      expect(await sync.reconcile(later)).toBe(0);
    });

    it('finds an end Stripe never reported', async () => {
      const anna = await subscribe();
      stripe.change(anna.remote.id, { cancel_at_period_end: true });
      await deliver(stripe.event('customer.subscription.updated', anna.remote)).expect(200);
      const record = await testApp.prisma.subscription.findFirstOrThrow({
        where: { externalId: anna.remote.id },
      });
      const ended = Math.floor((record.endsAt as Date).getTime() / 1000);
      stripe.change(anna.remote.id, { status: 'canceled', ended_at: ended, canceled_at: ended });

      const sync = testApp.app.get(StripeSyncService);
      expect(await sync.reconcile(new Date(ended * 1000 + 1000))).toBe(1);
      const after = await testApp.prisma.subscription.findUniqueOrThrow({
        where: { id: record.id },
      });
      expect(after.status).toBe('CANCELED');
    });

    it('closes the record of a subscription Stripe does not know', async () => {
      const anna = await subscribe();
      const record = await testApp.prisma.subscription.findFirstOrThrow({
        where: { externalId: anna.remote.id },
      });
      stripe.subscriptions.clear();
      const sync = testApp.app.get(StripeSyncService);
      await sync.reconcile(new Date((record.renewsAt as Date).getTime() + 2 * 60 * 60 * 1000));

      const after = await testApp.prisma.subscription.findUniqueOrThrow({
        where: { id: record.id },
      });
      expect(after.status).toBe('EXPIRED');
    });

    it('forgets messages after a month', async () => {
      await testApp.prisma.stripeEvent.createMany({
        data: [
          {
            id: 'evt_old',
            type: 'x',
            livemode: false,
            receivedAt: new Date(Date.now() - 31 * DAY_MS),
          },
          { id: 'evt_new', type: 'x', livemode: false },
        ],
      });
      expect(await testApp.app.get(StripeSyncService).purgeEvents()).toBe(1);
      expect(await testApp.prisma.stripeEvent.count()).toBe(1);
    });
  });

  describe('with Stripe Tax', () => {
    it('asks Stripe to work out the tax, with prices that include it', async () => {
      const taxed = await createTestApp(MODULES, {
        ...env,
        SITE_URL: 'https://watch.example.com',
        STRIPE_SECRET_KEY: stripe.secretKey,
        STRIPE_WEBHOOK_SECRET: stripe.webhookSecret,
        STRIPE_API_URL: stripe.apiUrl,
        STRIPE_AUTOMATIC_TAX: 'true',
      });
      try {
        const anna = await register();
        const plan = await createPlan();
        await taxed
          .http()
          .post('/v1/viewer/checkout')
          .set('Cookie', anna.cookie)
          .send({ planId: plan.id, interval: 'MONTH' })
          .expect(200);
        const [request] = stripe.calls('POST', '/v1/checkout/sessions');
        expect(request?.form).toMatchObject({
          'automatic_tax[enabled]': 'true',
          'customer_update[address]': 'auto',
          'line_items[0][price_data][tax_behavior]': 'inclusive',
        });
      } finally {
        await taxed.close();
      }
    });
  });

  describe('without Stripe', () => {
    it('offers no online payment and has no endpoint for Stripe', async () => {
      const plain = await createTestApp(MODULES, env);
      try {
        const anna = await register();
        const plan = await createPlan();
        const plans = await plain.http().get('/v1/catalog/plans').expect(200);
        expect(plans.body.checkout).toBe(false);

        const refused = await plain
          .http()
          .post('/v1/viewer/checkout')
          .set('Cookie', anna.cookie)
          .send({ planId: plan.id, interval: 'MONTH' })
          .expect(503);
        expect(refused.body.code).toBe('checkout_unavailable');
        await plain.http().post('/v1/viewer/billing-portal').set('Cookie', anna.cookie).expect(409);
        await plain
          .http()
          .post(WEBHOOK)
          .set('Content-Type', 'application/json')
          .set('Stripe-Signature', 't=1,v1=abc')
          .send('{}')
          .expect(404);
        const overview = await plain.http().get('/v1/billing').set(admin()).expect(200);
        expect(overview.body).toMatchObject({ checkout: false, stripe: null, paidOnline: 0 });
        await plain.http().post('/v1/billing/stripe/check').set(admin()).expect(503);
      } finally {
        await plain.close();
      }
    });
  });
});
