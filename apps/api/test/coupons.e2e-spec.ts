// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of coupons: codes admins make, what they take off a plan
// or a title at checkout, who may use them, and the record of their use.
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
];
const ANNA = { email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' };
const BEN = { email: 'ben@example.com', displayName: 'Ben', password: 'battery-staple' };
const WEBHOOK = '/v1/billing/stripe/webhook';
const UNKNOWN = '00000000-0000-7000-8000-000000000000';

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Coupons (e2e)', () => {
  let testApp: TestApp;
  let stripe: FakeStripe;
  let workDirectory: string;
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

  async function createMovie(name = 'Night Train') {
    const created = await http()
      .post('/v1/titles')
      .set(admin())
      .send({ type: 'MOVIE', name })
      .expect(201);
    const id = created.body.id as string;
    const asset = await http().post('/v1/assets').set(admin()).send({ title: name }).expect(201);
    const assetId = asset.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id: assetId },
      data: { status: 'READY', manifestPath: `assets/${assetId}/hls/master.m3u8` },
    });
    await http()
      .patch(`/v1/titles/${id}`)
      .set(admin())
      .send({ assetId, access: 'PAID', rentAmount: 399, buyAmount: 999 })
      .expect(200);
    await http()
      .put(`/v1/titles/${id}/status`)
      .set(admin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return { id };
  }

  const createCoupon = (body: Record<string, unknown>) =>
    http().post('/v1/coupons').set(admin()).send(body);
  const coupon = async (body: Record<string, unknown> = {}) =>
    (
      await createCoupon({ code: 'WELCOME20', kind: 'PERCENT', percentOff: 20, ...body }).expect(
        201,
      )
    ).body as { id: string; code: string; state: string; used: number };
  const patch = (id: string, body: Record<string, unknown>) =>
    http().patch(`/v1/coupons/${id}`).set(admin()).send(body);
  const listed = async () =>
    (await http().get('/v1/coupons').set(admin()).expect(200)).body as {
      id: string;
      code: string;
      state: string;
      used: number;
      discountTotal: number;
    }[];

  const check = (cookie: string, body: Record<string, unknown>) =>
    http().post('/v1/viewer/coupons/check').set('Cookie', cookie).send(body);
  const checkout = (cookie: string, body: Record<string, unknown>) =>
    http().post('/v1/viewer/checkout').set('Cookie', cookie).send(body);
  const purchase = (cookie: string, body: Record<string, unknown>) =>
    http().post('/v1/viewer/purchases/checkout').set('Cookie', cookie).send(body);
  const confirm = (cookie: string, sessionId: string) =>
    http().post('/v1/viewer/checkout/confirm').set('Cookie', cookie).send({ sessionId });
  const sessionIdOf = (url: string) => url.split('/').pop() as string;
  const lastSession = () => {
    const calls = stripe.calls('POST', '/v1/checkout/sessions');
    return calls[calls.length - 1]?.form ?? {};
  };

  /** A viewer subscribes with a code and returns from the payment page. */
  async function subscribeWith(cookie: string, planId: string, code: string) {
    const started = await checkout(cookie, { planId, interval: 'MONTH', code }).expect(200);
    const sessionId = sessionIdOf(started.body.url as string);
    stripe.pay(sessionId);
    await confirm(cookie, sessionId).expect(200);
    return sessionId;
  }

  beforeAll(async () => {
    stripe = await startFakeStripe();
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-coupons-'));
    testApp = await createTestApp(MODULES, {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      BILLING_CURRENCY: 'EUR',
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

  describe('made by admins', () => {
    it('are stored in capitals, with what they take off', async () => {
      const created = await createCoupon({
        code: ' welcome-20 ',
        kind: 'PERCENT',
        percentOff: 20,
        note: 'Newsletter of November',
      }).expect(201);
      expect(created.body).toMatchObject({
        code: 'WELCOME-20',
        kind: 'PERCENT',
        percentOff: 20,
        amountOff: null,
        scope: 'EVERYTHING',
        duration: 'ONCE',
        oncePerViewer: true,
        newCustomersOnly: false,
        isActive: true,
        state: 'ACTIVE',
        used: 0,
        discountTotal: 0,
        plans: [],
        note: 'Newsletter of November',
      });
      expect((await listed()).map((entry) => entry.code)).toEqual(['WELCOME-20']);
      await http().get(`/v1/coupons/${created.body.id}`).set(admin()).expect(200);
    });

    it('refuse a code that is taken, however it is written', async () => {
      await coupon();
      const again = await createCoupon({
        code: 'welcome20',
        kind: 'AMOUNT',
        amountOff: 100,
      }).expect(409);
      expect(again.body.code).toBe('coupon_code_taken');
    });

    it('refuse terms that do not fit together', async () => {
      const refused = async (body: Record<string, unknown>, message: RegExp) => {
        const response = await createCoupon({ code: 'X-1', ...body }).expect(400);
        expect(JSON.stringify(response.body)).toMatch(message);
      };
      await refused({ kind: 'PERCENT' }, /how many percent/);
      await refused({ kind: 'AMOUNT' }, /how much/);
      await refused({ kind: 'PERCENT', percentOff: 101 }, /percentOff/);
      await refused({ kind: 'PERCENT', percentOff: 10, duration: 'REPEATING' }, /how many months/);
      await refused(
        {
          kind: 'PERCENT',
          percentOff: 10,
          startsAt: '2026-12-02T00:00:00Z',
          endsAt: '2026-12-01T00:00:00Z',
        },
        /after their start/,
      );
      await refused({ kind: 'PERCENT', percentOff: 10, planIds: [UNKNOWN] }, /does not exist/);
      await createCoupon({ code: 'no spaces', kind: 'PERCENT', percentOff: 10 }).expect(400);
      await createCoupon({ code: 'AB', kind: 'PERCENT', percentOff: 10 }).expect(400);
    });

    it('keep only what their kind uses', async () => {
      const titles = await createCoupon({
        code: 'FILM-1',
        kind: 'AMOUNT',
        amountOff: 100,
        percentOff: 50,
        scope: 'TITLES',
        duration: 'FOREVER',
      }).expect(201);
      expect(titles.body).toMatchObject({ percentOff: null, amountOff: 100, duration: 'ONCE' });
      const plan = await createPlan();
      await createCoupon({
        code: 'FILM-2',
        kind: 'AMOUNT',
        amountOff: 100,
        scope: 'TITLES',
        planIds: [plan.id],
      }).expect(400);
    });

    it('can be changed, switched off, and deleted while unused', async () => {
      const plan = await createPlan();
      const made = await coupon();
      const changed = await patch(made.id, {
        percentOff: 30,
        planIds: [plan.id],
        maxRedemptions: 100,
        isActive: false,
      }).expect(200);
      expect(changed.body).toMatchObject({
        percentOff: 30,
        plans: [{ id: plan.id, name: 'Standard' }],
        maxRedemptions: 100,
        state: 'OFF',
      });
      await patch(made.id, {}).expect(400);
      await patch(UNKNOWN, { isActive: true }).expect(404);

      await http().delete(`/v1/coupons/${made.id}`).set(admin()).expect(204);
      expect(await listed()).toEqual([]);
      await http().delete(`/v1/coupons/${made.id}`).set(admin()).expect(404);
    });

    it('say where they stand by their dates', async () => {
      const day = 86_400_000;
      await coupon({ code: 'LATER', startsAt: new Date(Date.now() + day).toISOString() });
      await coupon({ code: 'OVER', endsAt: new Date(Date.now() - day).toISOString() });
      const states = Object.fromEntries((await listed()).map((entry) => [entry.code, entry.state]));
      expect(states).toEqual({ LATER: 'SCHEDULED', OVER: 'ENDED' });
    });

    it('are for those with billing rights, and leave a trace', async () => {
      const made = await coupon();
      const key = await http()
        .post('/v1/api-keys')
        .set(admin())
        .send({ name: 'Reports', scopes: ['billing:read'] })
        .expect(201);
      const reader = testApp.bearer(key.body.key as string);
      await http().get('/v1/coupons').set(reader).expect(200);
      await http().get(`/v1/coupons/${made.id}/redemptions`).set(reader).expect(200);
      await http()
        .post('/v1/coupons')
        .set(reader)
        .send({ code: 'NOPE', kind: 'PERCENT', percentOff: 5 })
        .expect(403);
      await http().delete(`/v1/coupons/${made.id}`).set(reader).expect(403);
      await http().get('/v1/coupons').expect(401);

      const trace = await testApp.prisma.auditLog.findMany({ where: { entityType: 'Coupon' } });
      expect(trace.map((entry) => entry.action)).toEqual(['coupon.create']);
    });
  });

  describe('checked before paying', () => {
    it('say what a plan costs with the code, and for how long', async () => {
      const anna = await register();
      const plan = await createPlan();
      await coupon({ duration: 'REPEATING', durationMonths: 3 });

      const quote = await check(anna.cookie, {
        code: 'welcome20',
        planId: plan.id,
        interval: 'MONTH',
      }).expect(200);
      expect(quote.headers['cache-control']).toBe('no-store');
      expect(quote.body).toEqual({
        code: 'WELCOME20',
        kind: 'PERCENT',
        percentOff: 20,
        amountOff: null,
        currency: 'EUR',
        listAmount: 799,
        discountAmount: 160,
        finalAmount: 639,
        duration: 'REPEATING',
        durationMonths: 3,
        lasts: 'for the first 3 months',
      });
      const yearly = await check(anna.cookie, {
        code: 'WELCOME20',
        planId: plan.id,
        interval: 'YEAR',
      }).expect(200);
      expect(yearly.body).toMatchObject({ listAmount: 7990, discountAmount: 1598 });
      // Asking uses nothing up.
      expect((await listed())[0]?.used).toBe(0);
    });

    it('say what renting or buying a title costs with the code', async () => {
      const anna = await register();
      const movie = await createMovie();
      await coupon({ code: 'FILM', kind: 'AMOUNT', amountOff: 150, percentOff: null });

      const rent = await check(anna.cookie, { code: 'FILM', titleId: movie.id, kind: 'RENT' });
      expect(rent.body).toMatchObject({
        listAmount: 399,
        discountAmount: 150,
        finalAmount: 249,
        duration: null,
        lasts: null,
      });
      const buy = await check(anna.cookie, { code: 'FILM', titleId: movie.id, kind: 'BUY' });
      expect(buy.body.finalAmount).toBe(849);
    });

    it('give one answer for a code that is unknown, switched off or not begun', async () => {
      const anna = await register();
      const plan = await createPlan();
      await coupon({ code: 'OFF-1', isActive: false });
      await coupon({ code: 'LATER', startsAt: new Date(Date.now() + 86_400_000).toISOString() });
      for (const code of ['NO-SUCH', 'OFF-1', 'LATER']) {
        const answer = await check(anna.cookie, { code, planId: plan.id, interval: 'MONTH' });
        expect(answer.status).toBe(404);
        expect(answer.body).toMatchObject({
          code: 'coupon_unknown',
          message: 'This code is not valid. Check the spelling.',
        });
      }
    });

    it('say why a code that exists cannot be used here', async () => {
      const anna = await register();
      const plan = await createPlan();
      const other = await createPlan({ name: 'Premium', monthlyAmount: 1299 });
      const movie = await createMovie();
      await coupon({ code: 'OVER', endsAt: new Date(Date.now() - 1000).toISOString() });
      await coupon({ code: 'PLANS', scope: 'SUBSCRIPTIONS' });
      await coupon({ code: 'FILMS', scope: 'TITLES' });
      await coupon({ code: 'PREMIUM', planIds: [other.id] });
      await coupon({ code: 'TINY', kind: 'AMOUNT', amountOff: 380, percentOff: null });
      await coupon({ code: 'FREE', percentOff: 100 });

      const onPlan = (code: string, planId = plan.id) =>
        check(anna.cookie, { code, planId, interval: 'MONTH' });
      const onRent = (code: string) =>
        check(anna.cookie, { code, titleId: movie.id, kind: 'RENT' });

      expect((await onPlan('OVER').expect(409)).body.code).toBe('coupon_ended');
      expect((await onRent('PLANS').expect(409)).body.code).toBe('coupon_not_for_this');
      expect((await onPlan('FILMS').expect(409)).body.code).toBe('coupon_not_for_this');
      expect((await onPlan('PREMIUM').expect(409)).body.message).toBe(
        'This code is not for this plan.',
      );
      await onPlan('PREMIUM', other.id).expect(200);
      // 3.99 less 3.80 leaves 19 cents, which no card payment can be over.
      expect((await onRent('TINY').expect(409)).body.code).toBe('coupon_too_much');
      // Nothing left to pay is fine.
      expect((await onRent('FREE').expect(200)).body.finalAmount).toBe(0);
    });

    it('say what every plan on offer costs with the code, in one answer', async () => {
      const anna = await register();
      const standard = await createPlan();
      const premium = await createPlan({
        name: 'Premium',
        monthlyAmount: 1299,
        yearlyAmount: null,
      });
      await createPlan({ name: 'Old', isOffered: false });
      await coupon({ code: 'PREMIUM', planIds: [premium.id] });
      await coupon({ code: 'FILMS', scope: 'TITLES' });

      const all = await check(anna.cookie, { code: 'welcome20', plans: true });
      expect(all.status).toBe(404);
      await coupon({ duration: 'FOREVER' });
      const quote = await check(anna.cookie, { code: 'welcome20', plans: true }).expect(200);
      expect(quote.body).toMatchObject({
        code: 'WELCOME20',
        percentOff: 20,
        duration: 'FOREVER',
        lasts: 'on every payment',
        plans: [
          {
            planId: standard.id,
            month: { listAmount: 799, discountAmount: 160, finalAmount: 639 },
            year: { listAmount: 7990, discountAmount: 1598, finalAmount: 6392 },
          },
          {
            planId: premium.id,
            month: { listAmount: 1299, discountAmount: 260, finalAmount: 1039 },
            year: null,
          },
        ],
      });

      const limited = await check(anna.cookie, { code: 'PREMIUM', plans: true }).expect(200);
      expect(limited.body.plans.map((plan: { month: unknown }) => plan.month !== null)).toEqual([
        false,
        true,
      ]);
      const none = await check(anna.cookie, { code: 'FILMS', plans: true }).expect(409);
      expect(none.body.code).toBe('coupon_not_for_this');
    });

    it('need a signed-in viewer, and something that is on offer', async () => {
      const anna = await register();
      const plan = await createPlan({ yearlyAmount: null });
      await coupon();
      const body = { code: 'WELCOME20', planId: plan.id, interval: 'MONTH' };
      await http().post('/v1/viewer/coupons/check').send(body).expect(401);
      await http().post('/v1/viewer/coupons/check').set(admin()).send(body).expect(401);
      await check(anna.cookie, { ...body, planId: UNKNOWN }).expect(404);
      await check(anna.cookie, { ...body, interval: 'YEAR' }).expect(400);
      await check(anna.cookie, { code: 'WELCOME20' }).expect(400);
      await check(anna.cookie, { code: 'WELCOME20', titleId: UNKNOWN, kind: 'RENT' }).expect(404);
    });

    it('cannot be found by trying codes out', async () => {
      const anna = await register();
      const plan = await createPlan();
      const attempt = (index: number) =>
        check(anna.cookie, { code: `GUESS-${index}`, planId: plan.id, interval: 'MONTH' });
      for (let index = 0; index < 10; index += 1) {
        await attempt(index).expect(404);
      }
      await attempt(10).expect(429);
    });
  });

  describe('used for a plan', () => {
    it('open the payment page with the lower price, and without the field for other codes', async () => {
      const anna = await register();
      const plan = await createPlan();
      const made = await coupon({ duration: 'REPEATING', durationMonths: 3 });

      await checkout(anna.cookie, { planId: plan.id, interval: 'MONTH', code: 'welcome20' }).expect(
        200,
      );
      const [stripeCoupon] = [...stripe.coupons.values()];
      expect(stripeCoupon).toMatchObject({
        name: 'WELCOME20',
        percent_off: 20,
        amount_off: null,
        duration: 'repeating',
        duration_in_months: 3,
      });
      const form = lastSession();
      expect(form['discounts[0][coupon]']).toBe(stripeCoupon?.id);
      expect(form.allow_promotion_codes).toBeUndefined();
      // The plan keeps its price: the code lowers it at Stripe.
      expect(form['line_items[0][price_data][unit_amount]']).toBe('799');
      expect(form['metadata[couponId]']).toBe(made.id);
      expect(form['metadata[couponDiscount]']).toBe('160');

      // Without a code the payment page offers its own field, as before.
      await checkout(anna.cookie, { planId: plan.id, interval: 'MONTH' }).expect(200);
      expect(lastSession().allow_promotion_codes).toBe('true');
      expect(lastSession()['discounts[0][coupon]']).toBeUndefined();
    });

    it('make one coupon at Stripe for the same terms, and another when they change', async () => {
      const anna = await register();
      const ben = await register(BEN);
      const plan = await createPlan();
      const made = await coupon();
      const body = { planId: plan.id, interval: 'MONTH', code: 'WELCOME20' };

      await checkout(anna.cookie, body).expect(200);
      await checkout(ben.cookie, body).expect(200);
      expect(stripe.coupons.size).toBe(1);
      expect(stripe.calls('POST', '/v1/coupons')).toHaveLength(1);

      await patch(made.id, { percentOff: 25 }).expect(200);
      await checkout(anna.cookie, body).expect(200);
      expect([...stripe.coupons.values()].map((entry) => entry.percent_off)).toEqual([20, 25]);
    });

    it('are written down once when the checkout is completed', async () => {
      const anna = await register();
      const plan = await createPlan();
      const made = await coupon();

      const started = await checkout(anna.cookie, {
        planId: plan.id,
        interval: 'MONTH',
        code: 'WELCOME20',
      }).expect(200);
      const sessionId = sessionIdOf(started.body.url as string);
      // Opening the payment page is not a use.
      expect((await listed())[0]?.used).toBe(0);
      await confirm(anna.cookie, sessionId).expect(200);
      expect((await listed())[0]?.used).toBe(0);

      stripe.pay(sessionId);
      await confirm(anna.cookie, sessionId).expect(200);
      await confirm(anna.cookie, sessionId).expect(200);
      const message = stripe.event('checkout.session.completed', stripe.sessions.get(sessionId)!);
      await http()
        .post(WEBHOOK)
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', message.signature)
        .send(message.body)
        .expect(200);

      expect(await listed()).toMatchObject([{ code: 'WELCOME20', used: 1, discountTotal: 160 }]);
      const uses = await http().get(`/v1/coupons/${made.id}/redemptions`).set(admin()).expect(200);
      expect(uses.body).toMatchObject({
        total: 1,
        items: [
          {
            viewer: { id: anna.id, email: 'anna@example.com' },
            kind: 'SUBSCRIPTION',
            subject: 'Standard',
            listAmount: 799,
            discountAmount: 160,
            currency: 'EUR',
          },
        ],
      });
      // The invoice is over what was really paid, and that is what the books get.
      const [invoice] = [...stripe.invoices.values()];
      expect(invoice?.amount_paid).toBe(639);
      const billed = stripe.event('invoice.paid', invoice!);
      await http()
        .post(WEBHOOK)
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', billed.signature)
        .send(billed.body)
        .expect(200);
      const payment = await testApp.prisma.payment.findFirstOrThrow({
        where: { viewerId: anna.id },
      });
      expect(payment.amount).toBe(639);
    });

    it('are written down from the message of Stripe alone', async () => {
      const anna = await register();
      const plan = await createPlan();
      await coupon();
      const started = await checkout(anna.cookie, {
        planId: plan.id,
        interval: 'MONTH',
        code: 'WELCOME20',
      }).expect(200);
      const sessionId = sessionIdOf(started.body.url as string);
      stripe.pay(sessionId);
      const message = stripe.event('checkout.session.completed', stripe.sessions.get(sessionId)!);
      await http()
        .post(WEBHOOK)
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', message.signature)
        .send(message.body)
        .expect(200);
      expect((await listed())[0]?.used).toBe(1);
    });

    it('count once per viewer unless told otherwise', async () => {
      const anna = await register();
      const plan = await createPlan();
      const movie = await createMovie();
      await coupon();
      await coupon({ code: 'ALWAYS', oncePerViewer: false });
      await subscribeWith(anna.cookie, plan.id, 'WELCOME20');

      const again = await check(anna.cookie, {
        code: 'WELCOME20',
        titleId: movie.id,
        kind: 'RENT',
      });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('coupon_already_used');
      await purchase(anna.cookie, { titleId: movie.id, kind: 'RENT', code: 'WELCOME20' }).expect(
        409,
      );

      for (const kind of ['RENT', 'BUY']) {
        const started = await purchase(anna.cookie, {
          titleId: movie.id,
          kind,
          code: 'ALWAYS',
        }).expect(200);
        const sessionId = sessionIdOf(started.body.url as string);
        stripe.payOnce(sessionId);
        await confirm(anna.cookie, sessionId).expect(200);
      }
      const uses = Object.fromEntries((await listed()).map((entry) => [entry.code, entry.used]));
      expect(uses).toEqual({ WELCOME20: 1, ALWAYS: 2 });
    });

    it('end when they were used as often as they may be', async () => {
      const anna = await register();
      const ben = await register(BEN);
      const plan = await createPlan();
      await coupon({ maxRedemptions: 1 });
      await subscribeWith(anna.cookie, plan.id, 'WELCOME20');

      expect((await listed())[0]?.state).toBe('USED_UP');
      const late = await checkout(ben.cookie, {
        planId: plan.id,
        interval: 'MONTH',
        code: 'WELCOME20',
      }).expect(409);
      expect(late.body.code).toBe('coupon_used_up');
      expect(stripe.calls('POST', '/v1/checkout/sessions')).toHaveLength(1);
    });

    it('can be kept for a first payment on the site', async () => {
      const anna = await register();
      const ben = await register(BEN);
      const plan = await createPlan();
      const movie = await createMovie();
      await coupon({ code: 'FIRST', newCustomersOnly: true });
      await coupon({ code: 'ANY', oncePerViewer: false });
      await subscribeWith(anna.cookie, plan.id, 'ANY');

      const refused = await check(anna.cookie, { code: 'FIRST', titleId: movie.id, kind: 'BUY' });
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('coupon_new_customers');
      await check(ben.cookie, { code: 'FIRST', titleId: movie.id, kind: 'BUY' }).expect(200);
    });

    it('stay in the books once used, and can still be switched off', async () => {
      const anna = await register();
      const plan = await createPlan();
      const made = await coupon();
      await subscribeWith(anna.cookie, plan.id, 'WELCOME20');

      const kept = await http().delete(`/v1/coupons/${made.id}`).set(admin()).expect(409);
      expect(kept.body.code).toBe('coupon_used');
      await patch(made.id, { isActive: false }).expect(200);
      expect(await listed()).toMatchObject([{ state: 'OFF', used: 1 }]);

      // The use outlives the account, without the account.
      await testApp.prisma.viewer.delete({ where: { id: anna.id } });
      const uses = await http().get(`/v1/coupons/${made.id}/redemptions`).set(admin()).expect(200);
      expect(uses.body.items[0].viewer).toEqual({ id: null, email: 'anna@example.com' });
    });
  });

  describe('used for a title', () => {
    it('lower one payment, and open the title when nothing is left to pay', async () => {
      const anna = await register();
      const movie = await createMovie();
      await coupon({ code: 'HALF', percentOff: 50, duration: 'FOREVER' });
      await coupon({ code: 'GIFT', percentOff: 100 });

      const half = await purchase(anna.cookie, {
        titleId: movie.id,
        kind: 'RENT',
        code: 'HALF',
      }).expect(200);
      // A single payment has no duration at Stripe.
      expect([...stripe.coupons.values()][0]).toMatchObject({ percent_off: 50, duration: 'once' });
      const halfId = sessionIdOf(half.body.url as string);
      expect(stripe.sessions.get(halfId)).toMatchObject({
        amount_total: 199,
        total_details: { amount_discount: 200 },
      });
      stripe.payOnce(halfId);
      await confirm(anna.cookie, halfId).expect(200);
      const rental = await testApp.prisma.payment.findFirstOrThrow({ where: { kind: 'RENTAL' } });
      expect(rental.amount).toBe(199);

      const gift = await purchase(anna.cookie, {
        titleId: movie.id,
        kind: 'BUY',
        code: 'GIFT',
      }).expect(200);
      const giftId = sessionIdOf(gift.body.url as string);
      stripe.payOnce(giftId);
      await confirm(anna.cookie, giftId).expect(200);
      // Owned, and no payment over nothing in the books.
      expect(
        await testApp.prisma.purchase.count({ where: { viewerId: anna.id, kind: 'BUY' } }),
      ).toBe(1);
      expect(await testApp.prisma.payment.count({ where: { kind: 'PURCHASE' } })).toBe(0);

      const totals = Object.fromEntries(
        (await listed()).map((entry) => [entry.code, entry.discountTotal]),
      );
      expect(totals).toEqual({ HALF: 200, GIFT: 999 });
    });
  });
});
