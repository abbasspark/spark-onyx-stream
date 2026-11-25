// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of billing: plans, access granted by an admin, paid
// titles, and the rule that decides who may watch them.
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
import { MaintenanceService } from '../src/maintenance/maintenance.service.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
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
const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Billing (e2e)', () => {
  let testApp: TestApp;
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
        .send({ name: 'Standard', monthlyAmount: 799, ...body })
        .expect(201)
    ).body as { id: string; name: string; position: number };

  const grant = (viewerId: string, body: Record<string, unknown>) =>
    http().post(`/v1/viewers/${viewerId}/subscriptions`).set(admin()).send(body);

  async function createMovie(name: string, access: 'FREE' | 'PAID') {
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
      .send({ assetId, trailerAssetId: assetId, access })
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

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-billing-'));
    env = {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
    };
    testApp = await createTestApp(MODULES, {
      ...env,
      BILLING_CURRENCY: 'EUR',
      BILLING_CONTACT_URL: 'mailto:billing@example.com',
    });
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp.resetDatabase();
    await testApp.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  describe('plans', () => {
    it('creates a plan and shows it to viewers', async () => {
      const created = await http()
        .post('/v1/plans')
        .set(admin())
        .send({
          name: '  Standard  ',
          description: 'Everything, on every device.',
          features: ['Full HD', '', '  Watch on any device '],
          monthlyAmount: 799,
          yearlyAmount: 7990,
          trialDays: 7,
        })
        .expect(201);
      expect(created.body).toEqual({
        id: expect.any(String),
        name: 'Standard',
        description: 'Everything, on every device.',
        features: ['Full HD', 'Watch on any device'],
        monthlyAmount: 799,
        yearlyAmount: 7990,
        trialDays: 7,
        isRecommended: false,
        includesAll: true,
        maxStreams: null,
        packages: [],
        isOffered: true,
        removesAds: true,
        position: 0,
        subscribers: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      const offered = await http().get('/v1/catalog/plans').expect(200);
      expect(offered.headers['cache-control']).toBe('public, max-age=30');
      expect(offered.body).toEqual({
        currency: 'EUR',
        checkout: false,
        contactUrl: 'mailto:billing@example.com',
        rental: { startDays: 30, watchHours: 48 },
        plans: [
          {
            id: created.body.id,
            name: 'Standard',
            description: 'Everything, on every device.',
            features: ['Full HD', 'Watch on any device'],
            monthlyAmount: 799,
            yearlyAmount: 7990,
            trialDays: 7,
            isRecommended: false,
            includesAll: true,
            maxStreams: null,
            packages: [],
            removesAds: true,
          },
        ],
      });
    });

    it('needs a name and a price, per month or per year', async () => {
      const bad = async (body: Record<string, unknown>) =>
        (await http().post('/v1/plans').set(admin()).send(body).expect(400)).body;

      expect((await bad({ name: 'Free?' })).issues).toEqual([
        { field: 'monthlyAmount', message: 'Set a price per month, per year, or both' },
      ]);
      await bad({ monthlyAmount: 799 });
      await bad({ name: 'X', monthlyAmount: 0 });
      await bad({ name: 'X', monthlyAmount: 7.99 });
      await bad({ name: 'X', monthlyAmount: 799, trialDays: 400 });
      await bad({ name: 'X', monthlyAmount: 799, features: Array.from({ length: 13 }, () => 'a') });

      // A plan sold per year only is fine.
      await createPlan({ name: 'Yearly', monthlyAmount: null, yearlyAmount: 7990 });

      // A change must not take the last price away.
      const plan = await createPlan();
      const refused = await http()
        .patch(`/v1/plans/${plan.id}`)
        .set(admin())
        .send({ monthlyAmount: null })
        .expect(400);
      expect(refused.body.issues[0].field).toBe('monthlyAmount');
      await http().patch(`/v1/plans/${plan.id}`).set(admin()).send({}).expect(400);
    });

    it('changes a plan, recommends one at a time, and hides one that is not offered', async () => {
      const standard = await createPlan({ isRecommended: true });
      const premium = await createPlan({ name: 'Premium', monthlyAmount: 1299 });

      const changed = await http()
        .patch(`/v1/plans/${premium.id}`)
        .set(admin())
        .send({ isRecommended: true, yearlyAmount: 12990 })
        .expect(200);
      expect(changed.body).toMatchObject({ isRecommended: true, yearlyAmount: 12990 });
      const list = await http().get('/v1/plans').set(admin()).expect(200);
      expect(
        list.body.map((plan: { name: string; isRecommended: boolean }) => [
          plan.name,
          plan.isRecommended,
        ]),
      ).toEqual([
        ['Standard', false],
        ['Premium', true],
      ]);

      await http()
        .patch(`/v1/plans/${standard.id}`)
        .set(admin())
        .send({ isOffered: false })
        .expect(200);
      const offered = await http().get('/v1/catalog/plans').expect(200);
      expect(offered.body.plans.map((plan: { name: string }) => plan.name)).toEqual(['Premium']);

      const audit = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'plan.update', entityId: premium.id },
      });
      expect((audit.metadata as { changed: string[] }).changed.sort()).toEqual([
        'isRecommended',
        'yearlyAmount',
      ]);
    });

    it('orders the page of plans', async () => {
      const a = await createPlan({ name: 'A' });
      const b = await createPlan({ name: 'B' });
      const c = await createPlan({ name: 'C' });
      const names = async () =>
        (await http().get('/v1/catalog/plans').expect(200)).body.plans.map(
          (plan: { name: string }) => plan.name,
        );
      expect(await names()).toEqual(['A', 'B', 'C']);

      const order = (ids: string[]) => http().put('/v1/plans/order').set(admin()).send({ ids });
      await order([c.id, a.id, b.id]).expect(200);
      expect(await names()).toEqual(['C', 'A', 'B']);

      // Every plan, once.
      await order([c.id, a.id]).expect(400);
      await order([c.id, a.id, a.id]).expect(400);
      await order([c.id, a.id, '00000000-0000-7000-8000-000000000000']).expect(400);
    });

    it('deletes a plan nobody had, and keeps one that is part of a history', async () => {
      const unused = await createPlan({ name: 'Unused' });
      const used = await createPlan({ name: 'Used' });
      const { id } = await register();
      const granted = await grant(id, { planId: used.id, endsAt: null }).expect(201);
      await http().post(`/v1/subscriptions/${granted.body.id}/end`).set(admin()).expect(200);

      await http().delete(`/v1/plans/${unused.id}`).set(admin()).expect(204);
      const refused = await http().delete(`/v1/plans/${used.id}`).set(admin()).expect(409);
      expect(refused.body.message).toBe(
        'Viewers have or had this plan, so it is part of their history. Stop offering it instead.',
      );
      await http().delete(`/v1/plans/${unused.id}`).set(admin()).expect(404);
    });

    it('lets owners and admins manage billing, and nobody else', async () => {
      const plan = await createPlan();
      await http().get('/v1/plans').expect(401);
      await http().post('/v1/plans').send({ name: 'X', monthlyAmount: 1 }).expect(401);

      const editor = await http()
        .post('/v1/admins')
        .set(admin())
        .send({
          email: 'ed@example.com',
          displayName: 'Ed',
          password: 'a-long-password-2',
          role: 'EDITOR',
        })
        .expect(201);
      expect(editor.body.role).toBe('EDITOR');
      const signedIn = await http()
        .post('/v1/auth/login')
        .send({ email: 'ed@example.com', password: 'a-long-password-2' })
        .expect(200);
      const ed = testApp.bearer(signedIn.body.token as string);
      await http().get('/v1/plans').set(ed).expect(403);
      await http().get('/v1/billing').set(ed).expect(403);
      await http().patch(`/v1/plans/${plan.id}`).set(ed).send({ name: 'Mine' }).expect(403);

      const key = await http()
        .post('/v1/api-keys')
        .set(admin())
        .send({ name: 'Reports', scopes: ['billing:read'] })
        .expect(201);
      const reader = testApp.bearer(key.body.key as string);
      await http().get('/v1/plans').set(reader).expect(200);
      await http().post('/v1/plans').set(reader).send({ name: 'X', monthlyAmount: 1 }).expect(403);
    });
  });

  describe('access granted by an admin', () => {
    it('gives a viewer a subscription they can see', async () => {
      const plan = await createPlan();
      const { id, cookie } = await register();
      const before = await http().get('/v1/viewer/subscription').set('Cookie', cookie).expect(200);
      expect(before.body).toEqual({
        subscription: null,
        entitled: false,
        access: null,
        trialUsed: false,
        purchases: [],
      });
      expect(before.headers['cache-control']).toBe('no-store');

      const endsAt = inDays(30);
      const granted = await grant(id, { planId: plan.id, endsAt, note: ' Paid in cash ' }).expect(
        201,
      );
      expect(granted.body).toEqual({
        id: expect.any(String),
        plan: { id: plan.id, name: 'Standard' },
        status: 'ACTIVE',
        source: 'MANUAL',
        interval: null,
        running: true,
        startedAt: expect.any(String),
        endsAt,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        note: 'Paid in cash',
        grantedBy: { id: expect.any(String), displayName: expect.any(String) },
        renewsAt: null,
        online: false,
        prepaid: false,
        externalId: null,
        externalUrl: null,
        createdAt: expect.any(String),
      });

      const own = await http().get('/v1/viewer/subscription').set('Cookie', cookie).expect(200);
      expect(own.body).toEqual({
        entitled: true,
        access: { all: true, packageIds: [] },
        trialUsed: false,
        purchases: [],
        subscription: {
          plan: { id: plan.id, name: 'Standard' },
          status: 'ACTIVE',
          interval: null,
          startedAt: expect.any(String),
          endsAt,
          cancelAtPeriodEnd: false,
          renewsAt: null,
          online: false,
          prepaid: false,
        },
      });
      // Notes of admins and who granted it are not for the viewer.
      expect(JSON.stringify(own.body)).not.toContain('cash');

      const audit = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'subscription.grant' },
      });
      expect(audit).toMatchObject({ entityType: 'Viewer', entityId: id });
    });

    it('allows one running subscription per viewer', async () => {
      const plan = await createPlan();
      const { id } = await register();
      await grant(id, { planId: plan.id, endsAt: null }).expect(201);
      const refused = await grant(id, { planId: plan.id, endsAt: inDays(5) }).expect(409);
      expect(refused.body.message).toBe(
        'This viewer has a running subscription. Change it, or end it first.',
      );
    });

    it('checks what is granted', async () => {
      const plan = await createPlan();
      const { id } = await register();
      await grant(id, {}).expect(400);
      await grant(id, { planId: plan.id, endsAt: inDays(-1) }).expect(400);
      await grant(id, { planId: plan.id, endsAt: 'soon' }).expect(400);
      await grant(id, { planId: '00000000-0000-7000-8000-000000000000', endsAt: null }).expect(404);
      await grant('00000000-0000-7000-8000-000000000000', { planId: plan.id, endsAt: null }).expect(
        404,
      );
    });

    it('changes the plan and the end, and ends access at once', async () => {
      const standard = await createPlan();
      const premium = await createPlan({ name: 'Premium', monthlyAmount: 1299 });
      const { id, cookie } = await register();
      const granted = await grant(id, { planId: standard.id, endsAt: inDays(10) }).expect(201);
      const subscriptionId = granted.body.id as string;

      const later = inDays(40);
      const changed = await http()
        .patch(`/v1/subscriptions/${subscriptionId}`)
        .set(admin())
        .send({ planId: premium.id, endsAt: later })
        .expect(200);
      expect(changed.body).toMatchObject({ plan: { name: 'Premium' }, endsAt: later });
      // No end at all.
      const open = await http()
        .patch(`/v1/subscriptions/${subscriptionId}`)
        .set(admin())
        .send({ endsAt: null })
        .expect(200);
      expect(open.body.endsAt).toBeNull();

      const ended = await http()
        .post(`/v1/subscriptions/${subscriptionId}/end`)
        .set(admin())
        .expect(200);
      expect(ended.body).toMatchObject({ status: 'CANCELED', running: false });
      expect(ended.body.canceledAt).toEqual(expect.any(String));
      const own = await http().get('/v1/viewer/subscription').set('Cookie', cookie).expect(200);
      expect(own.body).toEqual({
        subscription: null,
        entitled: false,
        access: null,
        trialUsed: false,
        purchases: [],
      });

      // What is over cannot be changed or ended again. A new grant can follow.
      await http().post(`/v1/subscriptions/${subscriptionId}/end`).set(admin()).expect(409);
      await http()
        .patch(`/v1/subscriptions/${subscriptionId}`)
        .set(admin())
        .send({ endsAt: inDays(5) })
        .expect(409);
      await grant(id, { planId: standard.id, endsAt: null }).expect(201);

      const all = await http().get(`/v1/viewers/${id}/subscriptions`).set(admin()).expect(200);
      expect(all.body.current).toMatchObject({ plan: { name: 'Standard' }, running: true });
      expect(
        all.body.history.map((item: { plan: { name: string }; status: string }) => [
          item.plan.name,
          item.status,
        ]),
      ).toEqual([
        ['Standard', 'ACTIVE'],
        ['Premium', 'CANCELED'],
      ]);
    });

    it('ends by itself when its time runs out', async () => {
      const plan = await createPlan();
      const { id, cookie } = await register();
      const granted = await grant(id, { planId: plan.id, endsAt: inDays(1) }).expect(201);
      // The time passes.
      await testApp.prisma.subscription.update({
        where: { id: granted.body.id },
        data: { endsAt: new Date(Date.now() - 1000) },
      });

      // The end time decides at once, before anything tidies up.
      const own = await http().get('/v1/viewer/subscription').set('Cookie', cookie).expect(200);
      expect(own.body.entitled).toBe(false);
      const stale = await http().get(`/v1/viewers/${id}/subscriptions`).set(admin()).expect(200);
      expect(stale.body.current).toBeNull();
      expect(stale.body.history[0]).toMatchObject({ status: 'ACTIVE', running: false });

      expect(await testApp.app.get(MaintenanceService).expireSubscriptions()).toBe(1);
      const tidy = await http().get(`/v1/viewers/${id}/subscriptions`).set(admin()).expect(200);
      expect(tidy.body.history[0].status).toBe('EXPIRED');
      // And the viewer can be given access again.
      await grant(id, { planId: plan.id, endsAt: null }).expect(201);
    });

    it('shows the plan in the list of viewers, and filters by it', async () => {
      const plan = await createPlan();
      const anna = await register();
      await register(BEN);
      await grant(anna.id, { planId: plan.id, endsAt: null }).expect(201);
      const list = async (query = '') =>
        (await http().get(`/v1/viewers?sort=email&order=asc${query}`).set(admin()).expect(200)).body
          .items as { email: string; plan: { name: string } | null }[];

      expect((await list()).map((viewer) => [viewer.email, viewer.plan?.name ?? null])).toEqual([
        ['anna@example.com', 'Standard'],
        ['ben@example.com', null],
      ]);
      expect((await list('&subscribed=yes')).map((viewer) => viewer.email)).toEqual([
        'anna@example.com',
      ]);
      expect((await list('&subscribed=no')).map((viewer) => viewer.email)).toEqual([
        'ben@example.com',
      ]);
      const detail = await http().get(`/v1/viewers/${anna.id}`).set(admin()).expect(200);
      expect(detail.body.plan).toEqual({ id: plan.id, name: 'Standard', endsAt: null });

      const counted = await http().get('/v1/plans').set(admin()).expect(200);
      expect(counted.body[0].subscribers).toBe(1);
    });

    it('goes with the account', async () => {
      const plan = await createPlan();
      const { id, cookie } = await register();
      await grant(id, { planId: plan.id, endsAt: null }).expect(201);
      await http()
        .post('/v1/viewer/delete')
        .set('Cookie', cookie)
        .send({ password: ANNA.password })
        .expect(204);
      expect(await testApp.prisma.subscription.count()).toBe(0);
      // The plan is free to delete again.
      await http().delete(`/v1/plans/${plan.id}`).set(admin()).expect(204);
    });
  });

  describe('paid titles', () => {
    it('marks a title as paid, for admins and for viewers', async () => {
      const free = await createMovie('Open House', 'FREE');
      const paid = await createMovie('Night Train', 'PAID');

      const detail = await http().get(`/v1/titles/${paid.id}`).set(admin()).expect(200);
      expect(detail.body.access).toBe('PAID');
      const filtered = await http().get('/v1/titles?access=PAID').set(admin()).expect(200);
      expect(filtered.body.items.map((title: { id: string }) => title.id)).toEqual([paid.id]);
      await http().patch(`/v1/titles/${paid.id}`).set(admin()).send({ access: 'GOLD' }).expect(400);

      const listed = await http().get('/v1/catalog/titles').expect(200);
      expect(
        Object.fromEntries(
          listed.body.items.map((title: { slug: string; access: string }) => [
            title.slug,
            title.access,
          ]),
        ),
      ).toEqual({ [free.slug]: 'FREE', [paid.slug]: 'PAID' });
      const shown = await http().get(`/v1/catalog/titles/${paid.slug}`).expect(200);
      expect(shown.body.access).toBe('PAID');
    });

    it('plays a paid title only for a signed-in viewer with a running subscription', async () => {
      const plan = await createPlan();
      const free = await createMovie('Open House', 'FREE');
      const paid = await createMovie('Night Train', 'PAID');
      const { id, cookie } = await register();

      // Free titles are as open as the installation: here, to everyone.
      await play(free.slug).expect(200);
      await play(free.slug, cookie).expect(200);

      const visitor = await play(paid.slug).expect(401);
      expect(visitor.body.message).toBe('Sign in to watch');
      const refused = await play(paid.slug, cookie).expect(402);
      expect(refused.body).toMatchObject({
        message: 'Subscribe to watch',
        code: 'subscription_required',
      });
      // The trailer is an invitation and stays open.
      await http().post(`/v1/catalog/titles/${paid.slug}/trailer/playback`).expect(200);

      const session = () => http().get('/v1/viewer/session').set('Cookie', cookie).expect(200);
      expect((await session()).body.entitled).toBe(false);

      const granted = await grant(id, { planId: plan.id, endsAt: inDays(30) }).expect(201);
      await play(paid.slug, cookie).expect(200);
      // A page learns it together with who is signed in.
      expect((await session()).body.entitled).toBe(true);

      await http().post(`/v1/subscriptions/${granted.body.id}/end`).set(admin()).expect(200);
      await play(paid.slug, cookie).expect(402);
    });

    it('opens the episodes of a paid series the same way', async () => {
      const plan = await createPlan();
      const created = await http()
        .post('/v1/titles')
        .set(admin())
        .send({ type: 'SERIES', name: 'Deep Water' })
        .expect(201);
      const titleId = created.body.id as string;
      const season = await http()
        .post(`/v1/titles/${titleId}/seasons`)
        .set(admin())
        .send({})
        .expect(201);
      const asset = await http()
        .post('/v1/assets')
        .set(admin())
        .send({ title: 'Pilot' })
        .expect(201);
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
      await http().patch(`/v1/titles/${titleId}`).set(admin()).send({ access: 'PAID' }).expect(200);
      await http()
        .put(`/v1/titles/${titleId}/status`)
        .set(admin())
        .send({ status: 'PUBLISHED' })
        .expect(200);
      const playEpisode = (cookie?: string) => {
        const request = http().post(`/v1/catalog/episodes/${episode.body.id}/playback`);
        return cookie ? request.set('Cookie', cookie) : request;
      };

      const { id, cookie } = await register();
      await playEpisode().expect(401);
      await playEpisode(cookie).expect(402);
      await grant(id, { planId: plan.id, endsAt: null }).expect(201);
      await playEpisode(cookie).expect(200);
    });

    it('sums up billing for the panel', async () => {
      const plan = await createPlan();
      await createMovie('Open House', 'FREE');
      await createMovie('Night Train', 'PAID');
      const anna = await register();
      const ben = await register(BEN);
      await grant(anna.id, { planId: plan.id, endsAt: inDays(3) }).expect(201);
      await grant(ben.id, { planId: plan.id, endsAt: null }).expect(201);

      const overview = await http().get('/v1/billing').set(admin()).expect(200);
      expect(overview.body).toEqual({
        streamLimit: 0,
        currency: 'EUR',
        checkout: false,
        contactUrl: 'mailto:billing@example.com',
        plans: 1,
        subscribers: 2,
        grantedByHand: 2,
        paidOnline: 0,
        prepaid: 0,
        pastDue: 0,
        stripe: null,
        endingSoon: 1,
        paidTitles: 1,
        publishedTitles: 2,
        packages: 0,
        limitedPlans: 0,
        unpackagedPaidTitles: 1,
      });
    });
  });

  describe('when playback is off', () => {
    let offApp: TestApp;

    beforeAll(async () => {
      offApp = await createTestApp(MODULES, { ...env, CATALOG_PLAYBACK: 'off' });
    });

    afterAll(async () => {
      await offApp.close();
    });

    it('plays nothing, also for a subscriber', async () => {
      const plan = await createPlan();
      const paid = await createMovie('Night Train', 'PAID');
      const { id, cookie } = await register();
      await grant(id, { planId: plan.id, endsAt: null }).expect(201);
      await offApp
        .http()
        .post(`/v1/catalog/titles/${paid.slug}/playback`)
        .set('Cookie', cookie)
        .expect(403);
    });
  });
});
