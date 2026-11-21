// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the books: payments collected by Stripe, payments an
// admin writes down, refunds, the revenue report and the export.
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
import { monthOf } from '../src/billing/revenue.js';
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

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Payments and revenue (e2e)', () => {
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

  const deliver = (message: { body: string; signature: string }) =>
    http()
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', message.signature)
      .send(message.body);

  /** A viewer who paid for a plan online. The first invoice is not reported yet. */
  async function subscribe(
    viewer = ANNA,
    options: { planId?: string; interval?: 'MONTH' | 'YEAR'; plan?: Record<string, unknown> } = {},
  ) {
    const account = await register(viewer);
    const planId = options.planId ?? (await createPlan(options.plan)).id;
    const started = await http()
      .post('/v1/viewer/checkout')
      .set('Cookie', account.cookie)
      .send({ planId, interval: options.interval ?? 'MONTH' })
      .expect(200);
    const sessionId = (started.body.url as string).split('/').pop() as string;
    const remote = stripe.pay(sessionId);
    await http()
      .post('/v1/viewer/checkout/confirm')
      .set('Cookie', account.cookie)
      .send({ sessionId })
      .expect(200);
    const invoice = [...stripe.invoices.values()].find(
      (item) => item.parent.subscription_details.subscription === remote.id,
    );
    if (!invoice) {
      throw new Error('The payment made no invoice');
    }
    return { ...account, planId, remote, invoice };
  }

  const paid = (invoice: { id: string }) =>
    deliver(stripe.event('invoice.paid', { id: invoice.id }));

  const payments = async (query = '') =>
    (await http().get(`/v1/payments${query}`).set(admin()).expect(200)).body as {
      total: number;
      items: Record<string, unknown>[];
    };

  const revenue = async (query = '') =>
    (await http().get(`/v1/billing/revenue${query}`).set(admin()).expect(200)).body;

  beforeAll(async () => {
    stripe = await startFakeStripe();
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-payments-'));
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

  describe('payments collected by Stripe', () => {
    it('writes a paid invoice into the books', async () => {
      const anna = await subscribe();
      const answer = await paid(anna.invoice).expect(200);
      expect(answer.body.outcome).toBe('handled');

      const list = await payments();
      expect(list.total).toBe(1);
      expect(list.items[0]).toEqual({
        id: expect.any(String),
        viewer: { id: anna.id, displayName: 'Anna' },
        viewerEmail: ANNA.email,
        planId: anna.planId,
        planName: 'Standard',
        source: 'STRIPE',
        status: 'PAID',
        amount: 799,
        taxAmount: 0,
        refundedAmount: 0,
        netAmount: 799,
        currency: 'EUR',
        paidAt: new Date(anna.invoice.created * 1000).toISOString(),
        periodStart: expect.any(String),
        periodEnd: expect.any(String),
        invoiceNumber: 'FAKE-0001',
        invoiceUrl: `https://invoice.stripe.test/i/${anna.invoice.id}`,
        note: null,
        recordedBy: null,
        externalUrl: `https://dashboard.stripe.com/test/invoices/${anna.invoice.id}`,
        createdAt: expect.any(String),
      });
    });

    it('counts an invoice once, however often it is reported', async () => {
      const anna = await subscribe();
      await paid(anna.invoice).expect(200);
      await paid(anna.invoice).expect(200);
      expect((await payments()).total).toBe(1);
    });

    it('does not count the invoice over nothing that starts a trial', async () => {
      const anna = await subscribe(ANNA, { plan: { trialDays: 7 } });
      expect(anna.invoice.amount_paid).toBe(0);
      await paid(anna.invoice).expect(200);
      expect((await payments()).total).toBe(0);

      // The trial ends and the first money arrives.
      const first = stripe.bill(anna.remote.id, { tax: 128 });
      await paid(first).expect(200);
      const list = await payments();
      expect(list.items[0]).toMatchObject({ amount: 799, taxAmount: 128 });
    });

    it('records a renewal, and the invoice that is heard of before its subscription', async () => {
      const anna = await subscribe();
      await paid(anna.invoice).expect(200);
      stripe.renew(anna.remote.id);
      const renewal = [...stripe.invoices.values()].at(-1);
      await paid(renewal as { id: string }).expect(200);
      expect((await payments()).total).toBe(2);

      // Ben pays, closes the tab, and the invoice is the first thing reported.
      const ben = await register(BEN);
      const started = await http()
        .post('/v1/viewer/checkout')
        .set('Cookie', ben.cookie)
        .send({ planId: anna.planId, interval: 'YEAR' })
        .expect(200);
      const remote = stripe.pay((started.body.url as string).split('/').pop() as string);
      const invoice = [...stripe.invoices.values()].at(-1) as { id: string };
      await paid(invoice).expect(200);

      const bens = await http().get(`/v1/viewers/${ben.id}/payments`).set(admin()).expect(200);
      expect(bens.body.items).toHaveLength(1);
      expect(bens.body.items[0]).toMatchObject({ amount: 7990, planName: 'Standard' });
      const own = await http().get('/v1/viewer/subscription').set('Cookie', ben.cookie).expect(200);
      expect(own.body.entitled).toBe(true);
      expect(remote.status).toBe('active');
    });

    it('ignores an invoice of somebody this site does not know', async () => {
      const anna = await subscribe();
      const foreign = stripe.bill(anna.remote.id);
      foreign.customer = 'cus_foreign';
      foreign.parent.subscription_details.subscription = 'sub_foreign';
      await paid(foreign).expect(200);
      expect((await payments()).total).toBe(0);
    });

    it('notes money that was returned, part of it and all of it', async () => {
      const anna = await subscribe();
      await paid(anna.invoice).expect(200);

      await deliver(stripe.event('charge.refunded', stripe.refund(anna.invoice.id, 300))).expect(
        200,
      );
      expect((await payments()).items[0]).toMatchObject({
        status: 'PARTIALLY_REFUNDED',
        refundedAmount: 300,
        netAmount: 499,
      });

      await deliver(stripe.event('charge.refunded', stripe.refund(anna.invoice.id, 499))).expect(
        200,
      );
      expect((await payments()).items[0]).toMatchObject({
        status: 'REFUNDED',
        refundedAmount: 799,
        netAmount: 0,
      });
      // The invoice reported once more does not bring the money back.
      await deliver(stripe.event('invoice.paid', { id: anna.invoice.id })).expect(200);
      expect((await payments()).items[0]).toMatchObject({
        status: 'REFUNDED',
        refundedAmount: 799,
      });
    });

    it('finds the invoice of a refund it never heard of as a payment', async () => {
      const anna = await subscribe();
      await deliver(stripe.event('charge.refunded', stripe.refund(anna.invoice.id, 799))).expect(
        200,
      );
      const list = await payments();
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({ status: 'REFUNDED', amount: 799, netAmount: 0 });

      // A refund of something that is no invoice changes nothing.
      const stray = { id: 'ch_x', amount: 500, amount_refunded: 500, payment_intent: 'pi_unknown' };
      await deliver(stripe.event('charge.refunded', stray)).expect(200);
      expect((await payments()).total).toBe(1);
    });

    it('keeps a payment in the books when the account is deleted', async () => {
      const anna = await subscribe();
      await paid(anna.invoice).expect(200);
      const list = await http()
        .get(`/v1/viewers/${anna.id}/subscriptions`)
        .set(admin())
        .expect(200);
      await http().post(`/v1/subscriptions/${list.body.current.id}/end`).set(admin()).expect(200);
      await http().delete(`/v1/viewers/${anna.id}`).set(admin()).expect(204);

      const after = await payments();
      expect(after.items[0]).toMatchObject({ viewer: null, viewerEmail: ANNA.email, amount: 799 });
    });

    it('reads the invoices of the past from Stripe', async () => {
      const anna = await subscribe();
      stripe.renew(anna.remote.id);
      stripe.renew(anna.remote.id);
      const foreign = stripe.bill(anna.remote.id);
      foreign.customer = 'cus_foreign';
      foreign.parent.subscription_details.subscription = 'sub_foreign';
      stripe.pageSize = 2;

      const first = await http()
        .post('/v1/billing/stripe/import-payments')
        .set(admin())
        .expect(200);
      expect(first.body).toEqual({ checked: 4, added: 3, complete: true });
      expect(stripe.calls('GET', '/v1/invoices')).toHaveLength(2);
      const again = await http()
        .post('/v1/billing/stripe/import-payments')
        .set(admin())
        .expect(200);
      expect(again.body).toEqual({ checked: 4, added: 0, complete: true });
      expect((await payments()).total).toBe(3);

      // A refund finds an imported payment, which came without the id of its payment.
      await deliver(stripe.event('charge.refunded', stripe.refund(anna.invoice.id, 799))).expect(
        200,
      );
      expect((await payments('?status=REFUNDED')).total).toBe(1);

      stripe.failWith = 500;
      await http().post('/v1/billing/stripe/import-payments').set(admin()).expect(502);
    });
  });

  describe('payments written down by an admin', () => {
    it('records money received by hand for the plan the viewer has', async () => {
      const plan = await createPlan();
      const anna = await register();
      await http()
        .post(`/v1/viewers/${anna.id}/subscriptions`)
        .set(admin())
        .send({ planId: plan.id, endsAt: null })
        .expect(201);

      const recorded = await http()
        .post(`/v1/viewers/${anna.id}/payments`)
        .set(admin())
        .send({ amount: 2500, paidAt: '2026-10-03T10:00:00.000Z', note: '  Cash, receipt 114 ' })
        .expect(201);
      expect(recorded.body).toMatchObject({
        source: 'MANUAL',
        status: 'PAID',
        amount: 2500,
        currency: 'EUR',
        planId: plan.id,
        planName: 'Standard',
        paidAt: '2026-10-03T10:00:00.000Z',
        note: 'Cash, receipt 114',
        recordedBy: { displayName: 'Olivia Owner' },
        invoiceUrl: null,
        externalUrl: null,
      });

      const log = await http().get('/v1/audit-logs').set(admin()).expect(200);
      expect(
        log.body.items.some((entry: { action: string }) => entry.action === 'payment.record'),
      ).toBe(true);
    });

    it('refuses what is not an amount, a day that has not come, and unknown viewers and plans', async () => {
      const anna = await register();
      const record = (body: Record<string, unknown>, id = anna.id) =>
        http().post(`/v1/viewers/${id}/payments`).set(admin()).send(body);

      await record({ amount: 0 }).expect(400);
      await record({ amount: 7.99 }).expect(400);
      await record({ amount: 500, paidAt: '2999-01-01T00:00:00.000Z' }).expect(400);
      await record({ amount: 500, planId: '0190a0a0-0000-7000-8000-000000000000' }).expect(404);
      await record({ amount: 500 }, '0190a0a0-0000-7000-8000-000000000000').expect(404);
      // Without a plan it is still money received.
      const loose = await record({ amount: 500 }).expect(201);
      expect(loose.body).toMatchObject({ planId: null, planName: null });
    });

    it('takes a payment written down by mistake out again, and no payment of Stripe', async () => {
      const anna = await subscribe();
      await paid(anna.invoice).expect(200);
      const byHand = await http()
        .post(`/v1/viewers/${anna.id}/payments`)
        .set(admin())
        .send({ amount: 1000 })
        .expect(201);
      const online = (await payments('?source=STRIPE')).items[0] as { id: string };

      await http().delete(`/v1/payments/${byHand.body.id}`).set(admin()).expect(204);
      await http().delete(`/v1/payments/${byHand.body.id}`).set(admin()).expect(404);
      const refused = await http().delete(`/v1/payments/${online.id}`).set(admin()).expect(409);
      expect(refused.body.message).toContain('refund it in Stripe');
      expect((await payments()).total).toBe(1);
    });

    it('is closed to keys that may only read, and to everyone without billing rights', async () => {
      const anna = await register();
      const key = await http()
        .post('/v1/api-keys')
        .set(admin())
        .send({ name: 'Reports', scopes: ['billing:read'] })
        .expect(201);
      const reader = testApp.bearer(key.body.key as string);
      await http().get('/v1/payments').set(reader).expect(200);
      await http().get('/v1/billing/revenue').set(reader).expect(200);
      await http()
        .post(`/v1/viewers/${anna.id}/payments`)
        .set(reader)
        .send({ amount: 1 })
        .expect(403);
      await http().post('/v1/billing/stripe/import-payments').set(reader).expect(403);
      await http().get('/v1/payments').expect(401);
      await http().get('/v1/payments/export').expect(401);
      await http().get('/v1/payments').set('Cookie', anna.cookie).expect(401);
    });
  });

  describe('the list and the export', () => {
    async function seed() {
      const anna = await subscribe();
      await paid(anna.invoice).expect(200);
      const ben = await register(BEN);
      await http()
        .post(`/v1/viewers/${ben.id}/payments`)
        .set(admin())
        .send({ amount: 5000, paidAt: '2026-09-15T12:00:00.000Z', note: '=SUM(A1:A9)' })
        .expect(201);
      return { anna, ben };
    }

    it('filters by source, state, time and words', async () => {
      const { anna } = await seed();
      expect((await payments()).total).toBe(2);
      expect((await payments('?source=MANUAL')).items[0]).toMatchObject({ amount: 5000 });
      expect((await payments('?source=STRIPE')).total).toBe(1);
      expect((await payments('?status=REFUNDED')).total).toBe(0);
      expect((await payments('?q=BEN@example')).total).toBe(1);
      expect((await payments('?q=fake-0001')).items[0]).toMatchObject({ viewerEmail: ANNA.email });
      expect((await payments('?q=anna')).total).toBe(1);
      expect((await payments(`?planId=${anna.planId}`)).total).toBe(1);
      expect((await payments('?from=2026-09-01&to=2026-10-01')).total).toBe(1);
      expect((await payments('?to=2026-09-01')).total).toBe(0);
      expect((await payments('?pageSize=1&page=2')).items).toHaveLength(1);
      await http().get('/v1/payments?source=PAYPAL').set(admin()).expect(400);
    });

    it('exports the payments as a file a spreadsheet opens safely', async () => {
      await seed();
      const file = await http().get('/v1/payments/export').set(admin()).expect(200);
      expect(file.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(file.headers['content-disposition']).toMatch(
        /^attachment; filename="payments-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      expect(file.headers['cache-control']).toBe('no-store');
      const lines = file.text.replace(/^﻿/, '').trim().split('\r\n');
      expect(lines[0]).toBe(
        'Paid at (UTC),Email,Name,Plan,Source,Status,Currency,Amount,Tax,Refunded,Net,Period start,Period end,Invoice,Note,Recorded by',
      );
      // Oldest first. The note that looks like a formula is defused.
      expect(lines[1]).toBe(
        "2026-09-15T12:00:00.000Z,ben@example.com,Ben,,By hand,Paid,EUR,50.00,0.00,0.00,50.00,,,,'=SUM(A1:A9),Olivia Owner",
      );
      expect(lines[2]).toContain(
        ',anna@example.com,Anna,Standard,Stripe,Paid,EUR,7.99,0.00,0.00,7.99,',
      );
      expect(lines).toHaveLength(3);

      const filtered = await http()
        .get('/v1/payments/export?source=STRIPE')
        .set(admin())
        .expect(200);
      expect(filtered.text.trim().split('\r\n')).toHaveLength(2);
      const log = await http().get('/v1/audit-logs').set(admin()).expect(200);
      expect(
        log.body.items.some((entry: { action: string }) => entry.action === 'payments.export'),
      ).toBe(true);
    });
  });

  describe('the viewer', () => {
    it("sees their own payments with the way to the invoice, and nobody else's", async () => {
      const anna = await subscribe();
      await paid(anna.invoice).expect(200);
      const ben = await register(BEN);
      await http()
        .post(`/v1/viewers/${ben.id}/payments`)
        .set(admin())
        .send({ amount: 5000, note: 'cash' })
        .expect(201);

      const own = await http().get('/v1/viewer/payments').set('Cookie', anna.cookie).expect(200);
      expect(own.headers['cache-control']).toBe('no-store');
      expect(own.body.items).toEqual([
        {
          id: expect.any(String),
          planName: 'Standard',
          status: 'PAID',
          amount: 799,
          refundedAmount: 0,
          currency: 'EUR',
          paidAt: expect.any(String),
          periodStart: expect.any(String),
          periodEnd: expect.any(String),
          invoiceNumber: 'FAKE-0001',
          invoiceUrl: `https://invoice.stripe.test/i/${anna.invoice.id}`,
        },
      ]);
      // The note of an admin is not for the viewer.
      const bens = await http().get('/v1/viewer/payments').set('Cookie', ben.cookie).expect(200);
      expect(bens.body.items).toHaveLength(1);
      expect(bens.body.items[0]).not.toHaveProperty('note');
      await http().get('/v1/viewer/payments').expect(401);
    });
  });

  describe('revenue', () => {
    it('adds up the months, online and by hand, less what was returned', async () => {
      const anna = await subscribe();
      await paid(anna.invoice).expect(200);
      const ben = await register(BEN);
      const record = (amount: number, paidAt: string) =>
        http()
          .post(`/v1/viewers/${ben.id}/payments`)
          .set(admin())
          .send({ amount, paidAt })
          .expect(201);
      const now = new Date();
      const thisMonth = monthOf(now, 'UTC');
      const [year, month] = thisMonth.split('-').map(Number) as [number, number];
      const lastMonth = monthOf(new Date(Date.UTC(year, month - 2, 15)), 'UTC');
      await record(5000, new Date(Date.UTC(year, month - 2, 15)).toISOString());
      await record(1000, new Date(Date.UTC(year, month - 2, 20)).toISOString());
      // Too long ago for a report over three months.
      await record(9999, new Date(Date.UTC(year, month - 7, 1)).toISOString());
      await deliver(stripe.event('charge.refunded', stripe.refund(anna.invoice.id, 300))).expect(
        200,
      );

      const report = await revenue('?months=3');
      expect(report.currency).toBe('EUR');
      expect(report.timeZone).toBe('UTC');
      expect(report.months).toHaveLength(3);
      expect(report.months[2]).toEqual({
        month: thisMonth,
        gross: 799,
        refunded: 300,
        net: 499,
        tax: 0,
        payments: 1,
        online: 499,
        byHand: 0,
        started: 1,
        ended: 0,
      });
      expect(report.months[1]).toMatchObject({
        month: lastMonth,
        gross: 6000,
        net: 6000,
        payments: 2,
        online: 0,
        byHand: 6000,
      });
      expect(report.months[0]).toMatchObject({ gross: 0, payments: 0 });
      expect(report.totals).toEqual({ gross: 6799, refunded: 300, net: 6499, tax: 0, payments: 3 });
      expect(report.byPlan).toEqual([
        { planId: null, planName: 'No plan', net: 6000, payments: 2 },
        { planId: anna.planId, planName: 'Standard', net: 499, payments: 1 },
      ]);

      const year12 = await revenue();
      expect(year12.months).toHaveLength(12);
      expect(year12.totals.gross).toBe(6799 + 9999);
    });

    it('says what the subscriptions bring in per month as they stand', async () => {
      const anna = await subscribe();
      const ben = await subscribe(BEN, { planId: anna.planId, interval: 'YEAR' });
      const cleo = await subscribe(
        { email: 'cleo@example.com', displayName: 'Cleo', password: 'paper-plane-9' },
        { plan: { name: 'Trial', trialDays: 7 } },
      );
      let report = await revenue();
      // 7.99 a month, a twelfth of 79.90 a year, and nothing yet from the trial.
      expect(report).toMatchObject({
        monthlyRecurring: 799 + 666,
        payingSubscribers: 2,
        trialing: 1,
      });

      // Ben cancels: he watches on, and brings in nothing more.
      stripe.change(ben.remote.id, { cancel_at_period_end: true });
      await deliver(stripe.event('customer.subscription.updated', ben.remote)).expect(200);
      report = await revenue();
      expect(report).toMatchObject({ monthlyRecurring: 799, payingSubscribers: 1 });

      const now = Math.floor(Date.now() / 1000);
      stripe.change(anna.remote.id, { status: 'canceled', canceled_at: now, ended_at: now - 5 });
      await deliver(stripe.event('customer.subscription.deleted', anna.remote)).expect(200);
      report = await revenue('?months=1');
      expect(report).toMatchObject({ monthlyRecurring: 0, payingSubscribers: 0 });
      expect(report.months[0]).toMatchObject({ started: 3, ended: 1 });
      expect(cleo.remote.status).toBe('trialing');
    });

    it('cuts the months where people in a time zone see them change', async () => {
      const ben = await register(BEN);
      // Half past eleven at night in UTC on the last of January is February in Tokyo.
      await http()
        .post(`/v1/viewers/${ben.id}/payments`)
        .set(admin())
        .send({ amount: 1234, paidAt: '2026-01-31T23:30:00.000Z' })
        .expect(201);

      const find = (report: { months: { month: string; gross: number }[] }, month: string) =>
        report.months.find((entry) => entry.month === month)?.gross;
      const utc = await revenue('?months=36');
      expect(find(utc, '2026-01')).toBe(1234);
      expect(find(utc, '2026-02')).toBe(0);
      const tokyo = await revenue('?months=36&timeZone=Asia%2FTokyo');
      expect(tokyo.timeZone).toBe('Asia/Tokyo');
      expect(find(tokyo, '2026-01')).toBe(0);
      expect(find(tokyo, '2026-02')).toBe(1234);

      await http().get('/v1/billing/revenue?timeZone=Mars%2FOlympus').set(admin()).expect(400);
      await http().get('/v1/billing/revenue?months=99').set(admin()).expect(400);
    });

    it('leaves payments in another currency out of the sums, and says so', async () => {
      const ben = await register(BEN);
      await http()
        .post(`/v1/viewers/${ben.id}/payments`)
        .set(admin())
        .send({ amount: 1000 })
        .expect(201);
      await testApp.prisma.payment.create({
        data: {
          viewerId: ben.id,
          viewerEmail: BEN.email,
          source: 'MANUAL',
          amount: 77700,
          currency: 'USD',
          paidAt: new Date(),
        },
      });
      const report = await revenue('?months=1');
      expect(report.totals.gross).toBe(1000);
      expect(report.otherCurrencies).toEqual([{ currency: 'USD', payments: 1 }]);
    });
  });
});
