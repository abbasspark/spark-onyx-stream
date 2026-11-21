// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of renting and buying a single title: prices on titles,
// paying through Stripe, the time a rental lasts, titles given by an admin,
// refunds, and the books.
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
const UNKNOWN = '0190a0a0-0000-7000-8000-000000000000';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Renting and buying (e2e)', () => {
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

  async function createMovie(name: string, fields: Record<string, unknown> = {}) {
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
      .send({
        assetId,
        trailerAssetId: assetId,
        access: 'PAID',
        rentAmount: 399,
        buyAmount: 999,
        ...fields,
      })
      .expect(200);
    await http()
      .put(`/v1/titles/${id}/status`)
      .set(admin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return { id, slug: created.body.slug as string };
  }

  const play = (slug: string, cookie?: string) => {
    const request = http().post(`/v1/catalog/titles/${slug}/playback`);
    return cookie ? request.set('Cookie', cookie) : request;
  };

  const startPurchase = (cookie: string, titleId: string, kind: 'RENT' | 'BUY') =>
    http().post('/v1/viewer/purchases/checkout').set('Cookie', cookie).send({ titleId, kind });

  const confirm = (cookie: string, sessionId: string) =>
    http().post('/v1/viewer/checkout/confirm').set('Cookie', cookie).send({ sessionId });

  const deliver = (message: { body: string; signature: string }) =>
    http()
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', message.signature)
      .send(message.body);

  /** A viewer pays for a title on Stripe's page and returns. */
  async function purchase(cookie: string, titleId: string, kind: 'RENT' | 'BUY') {
    const started = await startPurchase(cookie, titleId, kind).expect(200);
    const sessionId = (started.body.url as string).split('/').pop() as string;
    stripe.payOnce(sessionId);
    await confirm(cookie, sessionId).expect(200);
    return sessionId;
  }

  const session = async (cookie: string) =>
    (await http().get('/v1/viewer/session').set('Cookie', cookie).expect(200)).body;

  beforeAll(async () => {
    stripe = await startFakeStripe();
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-purchases-'));
    testApp = await createTestApp(MODULES, {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      BILLING_CURRENCY: 'EUR',
      SITE_URL: 'https://watch.example.com',
      STRIPE_SECRET_KEY: stripe.secretKey,
      STRIPE_WEBHOOK_SECRET: stripe.webhookSecret,
      STRIPE_API_URL: stripe.apiUrl,
      RENTAL_START_DAYS: '30',
      RENTAL_WATCH_HOURS: '48',
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

  describe('prices of a title', () => {
    it('are set on the title and shown to viewers of a paid title', async () => {
      const film = await createMovie('Night Train');
      const detail = await http().get(`/v1/titles/${film.id}`).set(admin()).expect(200);
      expect(detail.body).toMatchObject({ rentAmount: 399, buyAmount: 999, purchaseOnly: false });

      const shown = await http().get(`/v1/catalog/titles/${film.slug}`).expect(200);
      expect(shown.body).toMatchObject({ rentAmount: 399, buyAmount: 999, purchaseOnly: false });

      // A free title has nothing to sell, whatever prices are stored.
      await http().patch(`/v1/titles/${film.id}`).set(admin()).send({ access: 'FREE' }).expect(200);
      const free = await http().get(`/v1/catalog/titles/${film.slug}`).expect(200);
      expect(free.body).toMatchObject({ rentAmount: null, buyAmount: null, purchaseOnly: false });
    });

    it('must be whole and above nothing', async () => {
      const film = await createMovie('Night Train');
      const patch = (body: Record<string, unknown>) =>
        http().patch(`/v1/titles/${film.id}`).set(admin()).send(body);
      await patch({ rentAmount: 0 }).expect(400);
      await patch({ buyAmount: 9.99 }).expect(400);
      await patch({ rentAmount: null, buyAmount: 1499 }).expect(200);
    });

    it('are needed for a title that no subscription opens', async () => {
      const film = await createMovie('Night Train', { rentAmount: null, buyAmount: null });
      const refused = await http()
        .patch(`/v1/titles/${film.id}`)
        .set(admin())
        .send({ purchaseOnly: true })
        .expect(400);
      expect(refused.body.issues[0]).toEqual({
        field: 'purchaseOnly',
        message: 'Set a price for renting or buying, or nobody could watch the title',
      });
      await http()
        .patch(`/v1/titles/${film.id}`)
        .set(admin())
        .send({ purchaseOnly: true, rentAmount: 499 })
        .expect(200);
      // And the last price cannot be taken away from under it.
      await http()
        .patch(`/v1/titles/${film.id}`)
        .set(admin())
        .send({ rentAmount: null })
        .expect(400);
    });
  });

  describe('the payment page', () => {
    it('opens Stripe for one payment, named for what is sold', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();

      const started = await startPurchase(anna.cookie, film.id, 'RENT').expect(200);
      expect(started.body.url).toMatch(/^https:\/\/checkout\.stripe\.test\/c\/pay\/cs_test_/);
      const [request] = stripe.calls('POST', '/v1/checkout/sessions');
      expect(request?.form).toMatchObject({
        mode: 'payment',
        client_reference_id: anna.id,
        allow_promotion_codes: 'true',
        success_url: `https://watch.example.com/title/${film.slug}?paid={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://watch.example.com/title/${film.slug}`,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': '399',
        'line_items[0][price_data][product]': `onyx_r_${film.id.replace(/-/g, '')}`,
        'metadata[viewerId]': anna.id,
        'metadata[titleId]': film.id,
        'metadata[kind]': 'RENT',
        'payment_intent_data[metadata][titleId]': film.id,
      });
      // A single payment renews nothing.
      expect(request?.form).not.toHaveProperty('line_items[0][price_data][recurring][interval]');
      expect(request?.form).not.toHaveProperty('subscription_data[metadata][viewerId]');
      expect(stripe.products.get(`onyx_r_${film.id.replace(/-/g, '')}`)?.name).toBe(
        'Night Train (rental, 48 hours)',
      );

      await startPurchase(anna.cookie, film.id, 'BUY').expect(200);
      expect(stripe.calls('POST', '/v1/checkout/sessions')[1]?.form).toMatchObject({
        'line_items[0][price_data][unit_amount]': '999',
        'metadata[kind]': 'BUY',
      });
      expect(stripe.products.get(`onyx_b_${film.id.replace(/-/g, '')}`)?.name).toBe('Night Train');
    });

    it('needs a viewer, a title on the site, and a price for the way asked', async () => {
      const film = await createMovie('Night Train', { buyAmount: null });
      const free = await createMovie('Open House', { access: 'FREE' });
      const draft = await http()
        .post('/v1/titles')
        .set(admin())
        .send({ type: 'MOVIE', name: 'Draft' })
        .expect(201);
      const anna = await register();

      await http()
        .post('/v1/viewer/purchases/checkout')
        .send({ titleId: film.id, kind: 'RENT' })
        .expect(401);
      const notSold = await startPurchase(anna.cookie, film.id, 'BUY').expect(400);
      expect(notSold.body.message).toBe('This title is not for sale');
      await startPurchase(anna.cookie, free.id, 'RENT').expect(400);
      await startPurchase(anna.cookie, draft.body.id as string, 'RENT').expect(404);
      await startPurchase(anna.cookie, UNKNOWN, 'RENT').expect(404);
      await http()
        .post('/v1/viewer/purchases/checkout')
        .set('Cookie', anna.cookie)
        .send({ titleId: film.id, kind: 'LEASE' })
        .expect(400);
      expect(stripe.calls('POST', '/v1/checkout/sessions')).toHaveLength(0);
    });
  });

  describe('renting', () => {
    it('opens the title after paying, whatever plan the viewer has not', async () => {
      const film = await createMovie('Night Train');
      const other = await createMovie('Wild Coast');
      const anna = await register();
      const refused = await play(film.slug, anna.cookie).expect(402);
      expect(refused.body.code).toBe('subscription_required');

      const started = await startPurchase(anna.cookie, film.id, 'RENT').expect(200);
      const sessionId = (started.body.url as string).split('/').pop() as string;
      // Back on the site without having paid: nothing changes.
      await confirm(anna.cookie, sessionId).expect(200);
      await play(film.slug, anna.cookie).expect(402);

      stripe.payOnce(sessionId);
      const confirmed = await confirm(anna.cookie, sessionId).expect(200);
      expect(confirmed.body.purchases).toEqual([
        { titleId: film.id, kind: 'RENT', expiresAt: expect.any(String), started: false },
      ]);
      // Thirty days to start.
      const deadline = new Date(confirmed.body.purchases[0].expiresAt as string).getTime();
      expect(Math.abs(deadline - (Date.now() + 30 * DAY))).toBeLessThan(60_000);

      await play(film.slug, anna.cookie).expect(200);
      await play(other.slug, anna.cookie).expect(402);
      expect((await session(anna.cookie)).entitled).toBe(false);
    });

    it('starts the hours to finish with the first play, and not again with the second', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();
      await purchase(anna.cookie, film.id, 'RENT');

      await play(film.slug, anna.cookie).expect(200);
      const [first] = (await session(anna.cookie)).purchases;
      expect(first.started).toBe(true);
      const end = new Date(first.expiresAt as string).getTime();
      expect(Math.abs(end - (Date.now() + 48 * HOUR))).toBeLessThan(60_000);

      await play(film.slug, anna.cookie).expect(200);
      const [second] = (await session(anna.cookie)).purchases;
      expect(second.expiresAt).toBe(first.expiresAt);
    });

    it('never runs past the day it had to be started by', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();
      await purchase(anna.cookie, film.id, 'RENT');
      // Twenty-nine and a half days went by before the first play.
      const soon = new Date(Date.now() + 12 * HOUR);
      await testApp.prisma.purchase.updateMany({ data: { expiresAt: soon } });

      await play(film.slug, anna.cookie).expect(200);
      const [rental] = (await session(anna.cookie)).purchases;
      expect(rental.expiresAt).toBe(soon.toISOString());
    });

    it('ends when its time is up, and can be rented again', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();
      await purchase(anna.cookie, film.id, 'RENT');
      const again = await startPurchase(anna.cookie, film.id, 'RENT').expect(409);
      expect(again.body.code).toBe('already_owned');

      await testApp.prisma.purchase.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await play(film.slug, anna.cookie).expect(402);
      expect((await session(anna.cookie)).purchases).toEqual([]);
      await startPurchase(anna.cookie, film.id, 'RENT').expect(200);
    });

    it('opens every episode of a rented series', async () => {
      const series = await http()
        .post('/v1/titles')
        .set(admin())
        .send({ type: 'SERIES', name: 'Deep Ocean' })
        .expect(201);
      const season = await http()
        .post(`/v1/titles/${series.body.id}/seasons`)
        .set(admin())
        .send({})
        .expect(201);
      const asset = await http().post('/v1/assets').set(admin()).send({ title: 'E1' }).expect(201);
      const assetId = asset.body.asset.id as string;
      await testApp.prisma.asset.update({
        where: { id: assetId },
        data: { status: 'READY', manifestPath: `assets/${assetId}/hls/master.m3u8` },
      });
      const episode = await http()
        .post(`/v1/seasons/${season.body.seasons[0].id}/episodes`)
        .set(admin())
        .send({ name: 'Pilot', assetId })
        .expect(201);
      await http()
        .patch(`/v1/episodes/${episode.body.id}`)
        .set(admin())
        .send({ status: 'PUBLISHED' })
        .expect(200);
      await http()
        .patch(`/v1/titles/${series.body.id}`)
        .set(admin())
        .send({ access: 'PAID', rentAmount: 599 })
        .expect(200);
      await http()
        .put(`/v1/titles/${series.body.id}/status`)
        .set(admin())
        .send({ status: 'PUBLISHED' })
        .expect(200);

      const anna = await register();
      const playEpisode = () =>
        http().post(`/v1/catalog/episodes/${episode.body.id}/playback`).set('Cookie', anna.cookie);
      await playEpisode().expect(402);
      await purchase(anna.cookie, series.body.id as string, 'RENT');
      await playEpisode().expect(200);
      expect((await session(anna.cookie)).purchases[0].started).toBe(true);
    });
  });

  describe('buying', () => {
    it('opens the title for good', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();
      await purchase(anna.cookie, film.id, 'BUY');

      expect((await session(anna.cookie)).purchases).toEqual([
        { titleId: film.id, kind: 'BUY', expiresAt: null, started: false },
      ]);
      await play(film.slug, anna.cookie).expect(200);
      // Playing a bought title starts no clock.
      expect((await session(anna.cookie)).purchases[0].expiresAt).toBeNull();
      await startPurchase(anna.cookie, film.id, 'BUY').expect(409);
      await startPurchase(anna.cookie, film.id, 'RENT').expect(409);
    });

    it('can follow a rental that is still running', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();
      await purchase(anna.cookie, film.id, 'RENT');
      await purchase(anna.cookie, film.id, 'BUY');
      // The session names the stronger of the two.
      expect((await session(anna.cookie)).purchases).toEqual([
        { titleId: film.id, kind: 'BUY', expiresAt: null, started: false },
      ]);
    });
  });

  describe('with subscriptions', () => {
    it('lets a subscriber watch without buying, and keeps a title for buyers only when told', async () => {
      const film = await createMovie('Night Train');
      const premiere = await createMovie('The Premiere', { purchaseOnly: true });
      const plan = await http()
        .post('/v1/plans')
        .set(admin())
        .send({ name: 'Everything', monthlyAmount: 799 })
        .expect(201);
      const anna = await register();
      await http()
        .post(`/v1/viewers/${anna.id}/subscriptions`)
        .set(admin())
        .send({ planId: plan.body.id, endsAt: null })
        .expect(201);

      await play(film.slug, anna.cookie).expect(200);
      const refused = await play(premiere.slug, anna.cookie).expect(402);
      expect(refused.body).toMatchObject({
        code: 'purchase_required',
        message: 'Rent or buy this title to watch',
      });
      // The trailer stays an invitation.
      await http()
        .post(`/v1/catalog/titles/${premiere.slug}/trailer/playback`)
        .set('Cookie', anna.cookie)
        .expect(200);

      await purchase(anna.cookie, premiere.id, 'RENT');
      await play(premiere.slug, anna.cookie).expect(200);
    });

    it('does not start a rental that the plan makes unnecessary', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();
      await purchase(anna.cookie, film.id, 'RENT');
      const plan = await http()
        .post('/v1/plans')
        .set(admin())
        .send({ name: 'Everything', monthlyAmount: 799 })
        .expect(201);
      await http()
        .post(`/v1/viewers/${anna.id}/subscriptions`)
        .set(admin())
        .send({ planId: plan.body.id, endsAt: null })
        .expect(201);

      await play(film.slug, anna.cookie).expect(200);
      expect((await session(anna.cookie)).purchases[0].started).toBe(false);
    });
  });

  describe('what Stripe reports', () => {
    it('records a purchase from the message alone, once', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();
      const started = await startPurchase(anna.cookie, film.id, 'BUY').expect(200);
      const sessionId = (started.body.url as string).split('/').pop() as string;
      const paid = stripe.payOnce(sessionId);

      const message = stripe.event('checkout.session.completed', { id: paid.id, mode: 'payment' });
      const answer = await deliver(message).expect(200);
      expect(answer.body.outcome).toBe('handled');
      await play(film.slug, anna.cookie).expect(200);

      // The viewer's return finds it done.
      await confirm(anna.cookie, sessionId).expect(200);
      expect(await testApp.prisma.purchase.count()).toBe(1);
      expect(await testApp.prisma.payment.count()).toBe(1);
    });

    it('does not let one viewer claim the payment of another', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();
      const ben = await register(BEN);
      const sessionId = await purchase(anna.cookie, film.id, 'BUY');
      await confirm(ben.cookie, sessionId).expect(404);
      await play(film.slug, ben.cookie).expect(402);
    });

    it('takes the title back when all the money went back, and not for a part of it', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();
      const sessionId = await purchase(anna.cookie, film.id, 'BUY');

      await deliver(stripe.event('charge.refunded', stripe.refundOnce(sessionId, 400))).expect(200);
      await play(film.slug, anna.cookie).expect(200);

      await deliver(stripe.event('charge.refunded', stripe.refundOnce(sessionId, 599))).expect(200);
      await play(film.slug, anna.cookie).expect(402);
      expect((await session(anna.cookie)).purchases).toEqual([]);
      // And it can be bought again.
      await startPurchase(anna.cookie, film.id, 'BUY').expect(200);
    });
  });

  describe('the books', () => {
    it('hold a rental and a purchase beside the subscriptions', async () => {
      const film = await createMovie('Night Train');
      const other = await createMovie('Wild Coast');
      const anna = await register();
      await purchase(anna.cookie, film.id, 'RENT');
      const bought = await purchase(anna.cookie, other.id, 'BUY');

      const list = await http().get('/v1/payments').set(admin()).expect(200);
      expect(list.body.total).toBe(2);
      const rental = list.body.items.find((item: { kind: string }) => item.kind === 'RENTAL');
      expect(rental).toMatchObject({
        kind: 'RENTAL',
        titleName: 'Night Train',
        planName: null,
        amount: 399,
        source: 'STRIPE',
        status: 'PAID',
        viewerEmail: ANNA.email,
        invoiceUrl: null,
      });
      expect(rental.externalUrl).toMatch(/^https:\/\/dashboard\.stripe\.com\/test\/payments\/pi_/);
      expect(
        (await http().get('/v1/payments?kind=PURCHASE').set(admin()).expect(200)).body.total,
      ).toBe(1);
      expect((await http().get('/v1/payments?q=wild').set(admin()).expect(200)).body.total).toBe(1);

      const report = await http().get('/v1/billing/revenue?months=1').set(admin()).expect(200);
      expect(report.body.totals).toMatchObject({ gross: 1398, payments: 2 });
      expect(report.body.byPlan).toEqual([
        { planId: null, planName: 'Purchases', net: 999, payments: 1 },
        { planId: null, planName: 'Rentals', net: 399, payments: 1 },
      ]);
      // A single title is no subscription, so nothing recurs.
      expect(report.body.monthlyRecurring).toBe(0);

      const file = await http().get('/v1/payments/export').set(admin()).expect(200);
      expect(file.text).toContain(',Anna,Rental,,Night Train,Stripe,Paid,EUR,3.99,');
      expect(file.text).toContain(',Anna,Purchase,,Wild Coast,Stripe,Paid,EUR,9.99,');

      const own = await http().get('/v1/viewer/payments').set('Cookie', anna.cookie).expect(200);
      expect(
        own.body.items
          .map((item: { kind: string; titleName: string }) => [item.kind, item.titleName])
          .sort(),
      ).toEqual([
        ['PURCHASE', 'Wild Coast'],
        ['RENTAL', 'Night Train'],
      ]);
      expect(bought).toMatch(/^cs_test_/);
    });

    it('do not count an invoice that belongs to no subscription', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();
      await purchase(anna.cookie, film.id, 'BUY');
      // An account set to make an invoice for every payment reports it as well.
      const viewer = await testApp.prisma.viewer.findUniqueOrThrow({ where: { id: anna.id } });
      stripe.subscriptions.set('sub_x', {
        id: 'sub_x',
        object: 'subscription',
        status: 'active',
        livemode: false,
        customer: viewer.stripeCustomerId as string,
        metadata: {},
        cancel_at_period_end: false,
        cancel_at: null,
        canceled_at: null,
        ended_at: null,
        start_date: 0,
        items: { data: [] },
      });
      const invoice = stripe.bill('sub_x', { amount: 999 });
      (invoice.parent as unknown as { subscription_details: null }).subscription_details = null;
      stripe.subscriptions.delete('sub_x');
      await deliver(stripe.event('invoice.paid', { id: invoice.id })).expect(200);
      expect(await testApp.prisma.payment.count()).toBe(1);
    });
  });

  describe("the viewer's own list", () => {
    it('shows what was rented and bought, with what is left of it', async () => {
      const film = await createMovie('Night Train');
      const other = await createMovie('Wild Coast');
      const anna = await register();
      await purchase(anna.cookie, film.id, 'RENT');
      await purchase(anna.cookie, other.id, 'BUY');
      await testApp.prisma.purchase.updateMany({
        where: { titleId: film.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const own = await http().get('/v1/viewer/purchases').set('Cookie', anna.cookie).expect(200);
      expect(own.headers['cache-control']).toBe('no-store');
      expect(own.body.items).toHaveLength(2);
      expect(own.body.items.find((item: { kind: string }) => item.kind === 'BUY')).toMatchObject({
        titleId: other.id,
        valid: true,
        expiresAt: null,
        title: { slug: other.slug, name: 'Wild Coast', type: 'MOVIE', poster: null },
      });
      expect(own.body.items.find((item: { kind: string }) => item.kind === 'RENT')).toMatchObject({
        valid: false,
      });
      await http().get('/v1/viewer/purchases').expect(401);
    });
  });

  describe('titles given by an admin', () => {
    it('gives a title as a gift, or for money received by hand', async () => {
      const film = await createMovie('Night Train');
      const other = await createMovie('Wild Coast');
      const anna = await register();

      const gift = await http()
        .post(`/v1/viewers/${anna.id}/purchases`)
        .set(admin())
        .send({ titleId: film.id, kind: 'BUY', note: ' Prize of the raffle ' })
        .expect(201);
      expect(gift.body).toMatchObject({
        title: { id: film.id, name: 'Night Train', slug: film.slug },
        kind: 'BUY',
        status: 'ACTIVE',
        source: 'MANUAL',
        valid: true,
        expiresAt: null,
        amount: null,
        note: 'Prize of the raffle',
        grantedBy: { displayName: 'Olivia Owner' },
      });
      await play(film.slug, anna.cookie).expect(200);
      expect(await testApp.prisma.payment.count()).toBe(0);

      const sold = await http()
        .post(`/v1/viewers/${anna.id}/purchases`)
        .set(admin())
        .send({ titleId: other.id, kind: 'RENT', amount: 350 })
        .expect(201);
      expect(sold.body).toMatchObject({ kind: 'RENT', amount: 350, currency: 'EUR' });
      const books = await http().get('/v1/payments').set(admin()).expect(200);
      expect(books.body.items[0]).toMatchObject({
        kind: 'RENTAL',
        titleName: 'Wild Coast',
        source: 'MANUAL',
        amount: 350,
      });

      const list = await http().get(`/v1/viewers/${anna.id}/purchases`).set(admin()).expect(200);
      expect(list.body.items).toHaveLength(2);

      await http()
        .post(`/v1/viewers/${anna.id}/purchases`)
        .set(admin())
        .send({ titleId: film.id, kind: 'BUY' })
        .expect(409);
      await http()
        .post(`/v1/viewers/${anna.id}/purchases`)
        .set(admin())
        .send({ titleId: UNKNOWN, kind: 'BUY' })
        .expect(404);
      await http()
        .post(`/v1/viewers/${UNKNOWN}/purchases`)
        .set(admin())
        .send({ titleId: film.id, kind: 'BUY' })
        .expect(404);
    });

    it('takes a title back at once', async () => {
      const film = await createMovie('Night Train');
      const anna = await register();
      const gift = await http()
        .post(`/v1/viewers/${anna.id}/purchases`)
        .set(admin())
        .send({ titleId: film.id, kind: 'BUY' })
        .expect(201);

      const revoked = await http()
        .post(`/v1/purchases/${gift.body.id}/revoke`)
        .set(admin())
        .expect(200);
      expect(revoked.body).toMatchObject({ status: 'REVOKED', valid: false });
      await play(film.slug, anna.cookie).expect(402);
      await http().post(`/v1/purchases/${gift.body.id}/revoke`).set(admin()).expect(409);
      await http().post(`/v1/purchases/${UNKNOWN}/revoke`).set(admin()).expect(404);

      const log = await http().get('/v1/audit-logs').set(admin()).expect(200);
      const actions = log.body.items.map((entry: { action: string }) => entry.action);
      expect(actions).toEqual(expect.arrayContaining(['purchase.grant', 'purchase.revoke']));
    });

    it('is for those with billing rights', async () => {
      const anna = await register();
      const key = await http()
        .post('/v1/api-keys')
        .set(admin())
        .send({ name: 'Reports', scopes: ['billing:read'] })
        .expect(201);
      const reader = testApp.bearer(key.body.key as string);
      await http().get(`/v1/viewers/${anna.id}/purchases`).set(reader).expect(200);
      await http()
        .post(`/v1/viewers/${anna.id}/purchases`)
        .set(reader)
        .send({ titleId: UNKNOWN, kind: 'BUY' })
        .expect(403);
      await http().get(`/v1/viewers/${anna.id}/purchases`).expect(401);
    });
  });
});
