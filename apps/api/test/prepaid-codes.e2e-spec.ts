// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of prepaid codes: batches made by an admin, and a viewer
// who starts a plan with a code or adds days to it.
//
// Skipped unless TEST_DATABASE_URL is set.
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { ApiKeysModule } from '../src/api-keys/api-keys.module.js';
import { BillingModule } from '../src/billing/billing.module.js';
import { MaintenanceModule } from '../src/maintenance/maintenance.module.js';
import { MaintenanceService } from '../src/maintenance/maintenance.service.js';
import { PrepaidModule } from '../src/prepaid/prepaid.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [
  AdminsModule,
  ApiKeysModule,
  ViewersModule,
  BillingModule,
  MaintenanceModule,
  PrepaidModule,
];
const ANNA = { email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' };
const BEN = { email: 'ben@example.com', displayName: 'Ben', password: 'battery-staple' };
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();
/** How many days from now a moment lies, to the nearest hundredth. */
const daysAway = (moment: string) =>
  Math.round(((Date.parse(moment) - Date.now()) / DAY) * 100) / 100;

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Prepaid codes (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function register(viewer = ANNA) {
    const response = await http().post('/v1/viewer/register').send(viewer).expect(201);
    return { id: response.body.viewer.id as string, cookie: cookieOf(response) };
  }

  const createPlan = async (name = 'Standard') =>
    (await http().post('/v1/plans').set(admin()).send({ name, monthlyAmount: 799 }).expect(201))
      .body as { id: string; name: string };

  const createBatch = (body: Record<string, unknown>) =>
    http()
      .post('/v1/prepaid/batches')
      .set(admin())
      .send({ name: 'Kiosk cards', days: 30, count: 3, ...body });

  /** The codes of a batch that can still be used, from its export. */
  async function codesOf(batchId: string, all = false): Promise<string[]> {
    const file = await http()
      .get(`/v1/prepaid/batches/${batchId}/export${all ? '?all=true' : ''}`)
      .set(admin())
      .expect(200);
    return (file.text as string)
      .trim()
      .split('\r\n')
      .slice(1)
      .map((line) => line.split(',')[0] as string);
  }

  const check = (cookie: string, code: string) =>
    http().post('/v1/viewer/codes/check').set('Cookie', cookie).send({ code });
  const redeem = (cookie: string, code: string) =>
    http().post('/v1/viewer/codes/redeem').set('Cookie', cookie).send({ code });
  const own = async (cookie: string) =>
    (await http().get('/v1/viewer/subscription').set('Cookie', cookie).expect(200)).body;

  beforeAll(async () => {
    testApp = await createTestApp(MODULES, {});
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp?.close();
  });

  describe('batches', () => {
    it('makes a batch of codes that are kept unreadable', async () => {
      const plan = await createPlan();
      const created = await createBatch({
        planId: plan.id,
        count: 25,
        note: 'For the kiosk',
      }).expect(201);
      expect(created.body).toMatchObject({
        name: 'Kiosk cards',
        plan: { id: plan.id, name: 'Standard' },
        days: 30,
        state: 'open',
        total: 25,
        redeemed: 0,
        withdrawn: 0,
        left: 25,
        note: 'For the kiosk',
      });
      // No code is in the answer: codes are had from the export.
      expect(JSON.stringify(created.body)).not.toMatch(/[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}/);

      const codes = await codesOf(created.body.id);
      expect(codes).toHaveLength(25);
      expect(new Set(codes).size).toBe(25);
      for (const code of codes) {
        expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{4}(-[2-9A-HJKMNP-TV-Z]{4}){3}$/);
      }
      // The database alone gives no code away.
      const rows = await testApp.prisma.prepaidCode.findMany();
      const plain = new Set(codes.map((code) => code.replaceAll('-', '')));
      for (const row of rows) {
        expect(plain.has(row.codeHash)).toBe(false);
        expect([...plain].some((code) => row.codeBox.includes(code))).toBe(false);
        expect(row.ending).toHaveLength(4);
      }

      const listed = await http().get('/v1/prepaid/batches').set(admin()).expect(200);
      expect(listed.body.total).toBe(1);
      expect(listed.body.items[0]).toMatchObject({ id: created.body.id, total: 25, left: 25 });
    });

    it('refuses a batch that makes no sense', async () => {
      const plan = await createPlan();
      await createBatch({ planId: plan.id, count: 0 }).expect(400);
      await createBatch({ planId: plan.id, count: 5001 }).expect(400);
      await createBatch({ planId: plan.id, days: 0 }).expect(400);
      await createBatch({ planId: plan.id, name: ' ' }).expect(400);
      await createBatch({ planId: plan.id, expiresAt: inDays(-1) }).expect(400);
      await createBatch({ planId: '00000000-0000-4000-8000-000000000000' }).expect(400);
      expect(await testApp.prisma.prepaidBatch.count()).toBe(0);
    });

    it('lists the codes hidden, and shows one in full on request', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const codes = await codesOf(batch.id);

      const listed = await http()
        .get(`/v1/prepaid/batches/${batch.id}/codes`)
        .set(admin())
        .expect(200);
      expect(listed.body.total).toBe(3);
      for (const item of listed.body.items) {
        expect(item.masked).toMatch(/^••••-••••-••••-[2-9A-Z]{4}$/);
        expect(item).toMatchObject({ state: 'unused', redeemedAt: null, redeemedBy: null });
        expect(item.code).toBeUndefined();
      }
      const shown = await http()
        .post(`/v1/prepaid/codes/${listed.body.items[0].id}/reveal`)
        .set(admin())
        .expect(200);
      expect(codes).toContain(shown.body.code);
      expect(shown.body.code.endsWith(listed.body.items[0].masked.slice(-4))).toBe(true);
    });

    it('writes making, exporting and showing codes to the audit log', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      await codesOf(batch.id);
      const listed = await http().get(`/v1/prepaid/batches/${batch.id}/codes`).set(admin());
      await http().post(`/v1/prepaid/codes/${listed.body.items[0].id}/reveal`).set(admin());

      const entries = await testApp.prisma.auditLog.findMany({
        where: { action: { startsWith: 'prepaid.' } },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries.map((entry) => entry.action)).toEqual([
        'prepaid.batch.create',
        'prepaid.batch.export',
        'prepaid.code.reveal',
      ]);
      expect(entries[1]?.metadata).toMatchObject({ name: 'Kiosk cards', codes: 3 });
      // The log names a shown code by its ending, never in full.
      expect(JSON.stringify(entries[2]?.metadata)).not.toMatch(/-[2-9A-Z]{4}-/);
    });

    it('changes a batch, and deletes it while no code was used', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const until = inDays(10);
      const changed = await http()
        .patch(`/v1/prepaid/batches/${batch.id}`)
        .set(admin())
        .send({ name: 'Spring cards', expiresAt: until })
        .expect(200);
      expect(changed.body).toMatchObject({ name: 'Spring cards', expiresAt: until, state: 'open' });

      await http().delete(`/v1/prepaid/batches/${batch.id}`).set(admin()).expect(204);
      expect(await testApp.prisma.prepaidCode.count()).toBe(0);
      await http().get(`/v1/prepaid/batches/${batch.id}`).set(admin()).expect(404);
    });

    it('keeps a plan that codes were made for', async () => {
      const plan = await createPlan();
      await createBatch({ planId: plan.id }).expect(201);
      const refused = await http().delete(`/v1/plans/${plan.id}`).set(admin());
      expect(refused.status).toBe(409);
      expect(await testApp.prisma.plan.count()).toBe(1);
    });

    it('is for admins who may handle billing', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      await http().get('/v1/prepaid/batches').expect(401);
      await http().get(`/v1/prepaid/batches/${batch.id}/export`).expect(401);
      const anna = await register();
      await http().get('/v1/prepaid/batches').set('Cookie', anna.cookie).expect(401);
    });
  });

  describe('using a code', () => {
    it('starts the plan for the days of the code', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const [code] = await codesOf(batch.id);
      const anna = await register();

      const preview = await check(anna.cookie, code as string).expect(200);
      expect(preview.body).toMatchObject({
        plan: { id: plan.id, name: 'Standard' },
        days: 30,
        action: 'start',
      });
      expect(daysAway(preview.body.endsAt)).toBeCloseTo(30, 1);
      // Asking spends nothing.
      expect((await own(anna.cookie)).subscription).toBeNull();

      const used = await redeem(anna.cookie, code as string).expect(200);
      expect(used.body).toMatchObject({ action: 'start', days: 30, plan: { name: 'Standard' } });

      const mine = await own(anna.cookie);
      expect(mine.entitled).toBe(true);
      expect(mine.subscription).toMatchObject({
        plan: { name: 'Standard' },
        status: 'ACTIVE',
        online: false,
        prepaid: true,
        renewsAt: null,
      });
      expect(daysAway(mine.subscription.endsAt)).toBeCloseTo(30, 1);

      const stored = await testApp.prisma.subscription.findFirstOrThrow({
        where: { viewerId: anna.id },
      });
      expect(stored.source).toBe('PREPAID');
      expect(stored.note).toMatch(/^Prepaid code ••••-••••-••••-[2-9A-Z]{4} \(Kiosk cards\)$/);

      const after = (await http().get(`/v1/prepaid/batches/${batch.id}`).set(admin())).body;
      expect(after).toMatchObject({ total: 3, redeemed: 1, left: 2 });
      expect(after.lastRedeemedAt).not.toBeNull();
      const codes = await http()
        .get(`/v1/prepaid/batches/${batch.id}/codes?state=redeemed`)
        .set(admin())
        .expect(200);
      expect(codes.body.items).toHaveLength(1);
      expect(codes.body.items[0]).toMatchObject({
        state: 'redeemed',
        redeemedBy: { id: anna.id, email: ANNA.email },
      });
    });

    it('takes a code however it is typed', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const [code] = await codesOf(batch.id);
      const anna = await register();
      const typed = ` ${(code as string).toLowerCase().replaceAll('-', ' ')} `;
      await check(anna.cookie, typed).expect(200);
      await redeem(anna.cookie, typed).expect(200);
    });

    it('works once', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const [code] = await codesOf(batch.id);
      const anna = await register();
      const ben = await register(BEN);
      await redeem(anna.cookie, code as string).expect(200);

      const again = await redeem(ben.cookie, code as string).expect(409);
      expect(again.body).toMatchObject({ code: 'used' });
      expect((await check(ben.cookie, code as string).expect(409)).body.code).toBe('used');
      expect((await own(ben.cookie)).subscription).toBeNull();
    });

    it('gives one account the code when two ask in the same moment', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id, count: 1 }).expect(201)).body;
      const [code] = await codesOf(batch.id);
      const anna = await register();
      const ben = await register(BEN);

      const answers = await Promise.all([
        redeem(anna.cookie, code as string),
        redeem(ben.cookie, code as string),
        redeem(anna.cookie, code as string),
        redeem(ben.cookie, code as string),
      ]);
      expect(answers.filter((answer) => answer.status === 200)).toHaveLength(1);
      expect(await testApp.prisma.subscription.count()).toBe(1);
      expect(await testApp.prisma.prepaidCode.count({ where: { redeemedAt: { not: null } } })).toBe(
        1,
      );
    });

    it('adds the days of a second code to the same plan', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const [first, second, third] = await codesOf(batch.id);
      const anna = await register();
      await redeem(anna.cookie, first as string).expect(200);

      const preview = await check(anna.cookie, second as string).expect(200);
      expect(preview.body.action).toBe('extend');
      expect(daysAway(preview.body.endsAt)).toBeCloseTo(60, 1);

      // Two at once add up: none is lost and none counts twice.
      const both = await Promise.all([
        redeem(anna.cookie, second as string),
        redeem(anna.cookie, third as string),
      ]);
      expect(both.map((answer) => answer.status)).toEqual([200, 200]);
      const mine = await own(anna.cookie);
      expect(daysAway(mine.subscription.endsAt)).toBeCloseTo(90, 1);
      expect(await testApp.prisma.subscription.count({ where: { viewerId: anna.id } })).toBe(1);
    });

    it('adds days to access an admin granted with an end', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const [code] = await codesOf(batch.id);
      const anna = await register();
      await http()
        .post(`/v1/viewers/${anna.id}/subscriptions`)
        .set(admin())
        .send({ planId: plan.id, endsAt: inDays(10) })
        .expect(201);

      const used = await redeem(anna.cookie, code as string).expect(200);
      expect(used.body.action).toBe('extend');
      expect(daysAway(used.body.endsAt)).toBeCloseTo(40, 1);
    });

    it('refuses a code while it could not add anything, and leaves it good', async () => {
      const standard = await createPlan();
      const premium = await createPlan('Premium');
      const batch = (await createBatch({ planId: premium.id }).expect(201)).body;
      const [code] = await codesOf(batch.id);
      const anna = await register();
      const grant = (body: Record<string, unknown>) =>
        http().post(`/v1/viewers/${anna.id}/subscriptions`).set(admin()).send(body).expect(201);

      // Another plan is running.
      const other = await grant({ planId: standard.id, endsAt: inDays(10) });
      const wrongPlan = await redeem(anna.cookie, code as string).expect(409);
      expect(wrongPlan.body.code).toBe('other_plan');
      expect(wrongPlan.body.message).toMatch(/Standard/);
      await http().post(`/v1/subscriptions/${other.body.id}/end`).set(admin()).expect(200);

      // The same plan without an end.
      const open = await grant({ planId: premium.id, endsAt: null });
      expect((await redeem(anna.cookie, code as string).expect(409)).body.code).toBe(
        'subscription_open',
      );
      await http().post(`/v1/subscriptions/${open.body.id}/end`).set(admin()).expect(200);

      // The code was never spent.
      expect((await http().get(`/v1/prepaid/batches/${batch.id}`).set(admin())).body.left).toBe(3);
      await redeem(anna.cookie, code as string).expect(200);
    });

    it('refuses a code while a subscription paid online is running', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const [code] = await codesOf(batch.id);
      const anna = await register();
      await testApp.prisma.subscription.create({
        data: {
          viewerId: anna.id,
          planId: plan.id,
          status: 'ACTIVE',
          source: 'STRIPE',
          externalId: 'sub_test_1',
          interval: 'MONTH',
          endsAt: new Date(Date.now() + 20 * DAY),
          renewsAt: new Date(Date.now() + 20 * DAY),
        },
      });
      const refused = await redeem(anna.cookie, code as string).expect(409);
      expect(refused.body.code).toBe('subscription_renews');
    });

    it('does not say whether an unknown code is close to a real one', async () => {
      const anna = await register();
      const unknown = await check(anna.cookie, '2222-3333-4444-5555').expect(404);
      expect(unknown.body.code).toBe('not_found');
      const nonsense = await redeem(anna.cookie, 'hello').expect(404);
      expect(nonsense.body.code).toBe('not_found');
      expect(nonsense.body.message).toBe(unknown.body.message);
    });

    it('needs a signed-in viewer', async () => {
      await http().post('/v1/viewer/codes/check').send({ code: '2222-3333-4444-5555' }).expect(401);
      await http()
        .post('/v1/viewer/codes/redeem')
        .send({ code: '2222-3333-4444-5555' })
        .expect(401);
    });

    it('stops somebody who tries codes', async () => {
      const anna = await register();
      let last = 0;
      for (let attempt = 0; attempt < 21; attempt += 1) {
        last = (await check(anna.cookie, '2222-3333-4444-5555')).status;
      }
      expect(last).toBe(429);
    });

    it('ends when the days are over', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id, days: 1 }).expect(201)).body;
      const [code] = await codesOf(batch.id);
      const anna = await register();
      await redeem(anna.cookie, code as string).expect(200);
      await testApp.prisma.subscription.updateMany({
        data: { endsAt: new Date(Date.now() - 1000) },
      });
      expect((await own(anna.cookie)).entitled).toBe(false);
      await testApp.app.get(MaintenanceService).expireSubscriptions();
      const stored = await testApp.prisma.subscription.findFirstOrThrow();
      expect(stored.status).toBe('EXPIRED');

      // And the next code starts it anew.
      const [, next] = await codesOf(batch.id, true);
      const fresh = (await codesOf(batch.id))[0] as string;
      expect(next).toBeDefined();
      const used = await redeem(anna.cookie, fresh).expect(200);
      expect(used.body.action).toBe('start');
    });
  });

  describe('taking codes back', () => {
    it('stops the unused codes of a withdrawn batch, and keeps what was used', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const [first, second] = await codesOf(batch.id);
      const anna = await register();
      const ben = await register(BEN);
      await redeem(anna.cookie, first as string).expect(200);

      const withdrawn = await http()
        .post(`/v1/prepaid/batches/${batch.id}/withdraw`)
        .set(admin())
        .expect(200);
      expect(withdrawn.body).toMatchObject({
        state: 'withdrawn',
        redeemed: 1,
        withdrawn: 2,
        left: 0,
      });
      await http().post(`/v1/prepaid/batches/${batch.id}/withdraw`).set(admin()).expect(409);

      expect((await redeem(ben.cookie, second as string).expect(410)).body.code).toBe('withdrawn');
      expect((await own(anna.cookie)).entitled).toBe(true);
      // A batch with used codes stays as the record.
      await http().delete(`/v1/prepaid/batches/${batch.id}`).set(admin()).expect(409);
      expect(await codesOf(batch.id)).toHaveLength(2);
    });

    it('withdraws one code', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const [first] = await codesOf(batch.id);
      const anna = await register();
      const found = await http()
        .post('/v1/prepaid/codes/lookup')
        .set(admin())
        .send({ code: first })
        .expect(200);
      expect(found.body).toMatchObject({
        code: first,
        state: 'unused',
        batch: { id: batch.id, name: 'Kiosk cards', plan: 'Standard', days: 30 },
      });

      await http().post(`/v1/prepaid/codes/${found.body.id}/withdraw`).set(admin()).expect(204);
      expect((await redeem(anna.cookie, first as string).expect(410)).body.code).toBe('withdrawn');
      const after = (await http().get(`/v1/prepaid/batches/${batch.id}`).set(admin())).body;
      expect(after).toMatchObject({ withdrawn: 1, left: 2, state: 'open' });
      expect(await codesOf(batch.id)).toHaveLength(2);
      expect(await codesOf(batch.id, true)).toHaveLength(3);
    });

    it('does not withdraw a code that was used', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const [first] = await codesOf(batch.id);
      const anna = await register();
      await redeem(anna.cookie, first as string).expect(200);
      const found = await http()
        .post('/v1/prepaid/codes/lookup')
        .set(admin())
        .send({ code: first })
        .expect(200);
      expect(found.body).toMatchObject({ state: 'redeemed', redeemedBy: { email: ANNA.email } });
      await http().post(`/v1/prepaid/codes/${found.body.id}/withdraw`).set(admin()).expect(409);
      await http().post('/v1/prepaid/codes/lookup').set(admin()).send({ code: 'nope' }).expect(404);
    });

    it('stops codes whose time ran out', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id, expiresAt: inDays(5) }).expect(201)).body;
      const [first] = await codesOf(batch.id);
      const anna = await register();
      await testApp.prisma.prepaidBatch.update({
        where: { id: batch.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await redeem(anna.cookie, first as string).expect(410)).body.code).toBe('expired');
      const after = (await http().get(`/v1/prepaid/batches/${batch.id}`).set(admin())).body;
      expect(after).toMatchObject({ state: 'expired', left: 0 });

      // Giving the batch more time makes them good again.
      await http()
        .patch(`/v1/prepaid/batches/${batch.id}`)
        .set(admin())
        .send({ expiresAt: null })
        .expect(200);
      await redeem(anna.cookie, first as string).expect(200);
    });

    it('lets an admin end access that came from a code', async () => {
      const plan = await createPlan();
      const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
      const [first] = await codesOf(batch.id);
      const anna = await register();
      const used = await redeem(anna.cookie, first as string).expect(200);
      await http()
        .post(`/v1/subscriptions/${used.body.subscriptionId}/end`)
        .set(admin())
        .expect(200);
      expect((await own(anna.cookie)).entitled).toBe(false);
    });
  });

  it('counts prepaid subscribers in the overview', async () => {
    const plan = await createPlan();
    const batch = (await createBatch({ planId: plan.id }).expect(201)).body;
    const [first] = await codesOf(batch.id);
    const anna = await register();
    await redeem(anna.cookie, first as string).expect(200);
    const overview = await http().get('/v1/billing').set(admin()).expect(200);
    expect(overview.body).toMatchObject({ subscribers: 1, prepaid: 1, grantedByHand: 0 });

    const summary = await http().get('/v1/prepaid/summary').set(admin()).expect(200);
    expect(summary.body).toMatchObject({
      batches: 1,
      codes: 3,
      redeemed: 1,
      left: 2,
      subscribers: 1,
    });
    expect(summary.body.days).toHaveLength(30);
    expect(summary.body.days.at(-1)).toEqual({
      day: new Date().toISOString().slice(0, 10),
      redeemed: 1,
    });
  });
});
