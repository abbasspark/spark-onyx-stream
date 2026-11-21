// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of packages: groups of paid titles, the plans that open
// them, and what a viewer may watch through such a plan.
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
const UNKNOWN = '0190a0a0-0000-7000-8000-000000000000';

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Packages (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function register(viewer = ANNA) {
    const response = await http().post('/v1/viewer/register').send(viewer).expect(201);
    return { id: response.body.viewer.id as string, cookie: cookieOf(response) };
  }

  const createPackage = async (name: string, description: string | null = null) =>
    (await http().post('/v1/packages').set(admin()).send({ name, description }).expect(201))
      .body as { id: string; name: string };

  const createPlan = (body: Record<string, unknown> = {}) =>
    http()
      .post('/v1/plans')
      .set(admin())
      .send({ name: 'Standard', monthlyAmount: 799, ...body });

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
      .send({ assetId, trailerAssetId: assetId, access: 'PAID', ...fields })
      .expect(200);
    await http()
      .put(`/v1/titles/${id}/status`)
      .set(admin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return { id, slug: created.body.slug as string };
  }

  const grant = (viewerId: string, planId: string) =>
    http()
      .post(`/v1/viewers/${viewerId}/subscriptions`)
      .set(admin())
      .send({ planId, endsAt: null })
      .expect(201);

  const play = (slug: string, cookie?: string) => {
    const request = http().post(`/v1/catalog/titles/${slug}/playback`);
    return cookie ? request.set('Cookie', cookie) : request;
  };

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-packages-'));
    testApp = await createTestApp(MODULES, {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
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

  describe('managing packages', () => {
    it('creates, lists, renames and orders packages', async () => {
      const kids = await http()
        .post('/v1/packages')
        .set(admin())
        .send({ name: '  Kids   corner ', description: ' For the small ones. ' })
        .expect(201);
      expect(kids.body).toEqual({
        id: expect.any(String),
        name: 'Kids corner',
        description: 'For the small ones.',
        position: 0,
        titles: 0,
        sellableTitles: 0,
        channels: 0,
        plans: [],
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      const sports = await createPackage('Sports');

      await http().post('/v1/packages').set(admin()).send({ name: 'Sports' }).expect(409);
      await http().post('/v1/packages').set(admin()).send({ name: '   ' }).expect(400);
      const renamed = await http()
        .patch(`/v1/packages/${kids.body.id}`)
        .set(admin())
        .send({ name: 'Kids' })
        .expect(200);
      expect(renamed.body.name).toBe('Kids');
      await http()
        .patch(`/v1/packages/${kids.body.id}`)
        .set(admin())
        .send({ name: 'Sports' })
        .expect(409);
      await http().patch(`/v1/packages/${UNKNOWN}`).set(admin()).send({ name: 'X' }).expect(404);

      const ordered = await http()
        .put('/v1/packages/order')
        .set(admin())
        .send({ ids: [sports.id, kids.body.id] })
        .expect(200);
      expect(ordered.body.map((item: { name: string }) => item.name)).toEqual(['Sports', 'Kids']);
      await http()
        .put('/v1/packages/order')
        .set(admin())
        .send({ ids: [sports.id] })
        .expect(400);
    });

    it('puts titles in and takes them out, and counts what can be sold', async () => {
      const kids = await createPackage('Kids');
      const film = await createMovie('Night Train');
      const free = await createMovie('Open House', { access: 'FREE' });
      const draft = await http()
        .post('/v1/titles')
        .set(admin())
        .send({ type: 'MOVIE', name: 'Draft' })
        .expect(201);

      const changed = await http()
        .put(`/v1/packages/${kids.id}/titles`)
        .set(admin())
        .send({ add: [film.id, free.id, draft.body.id, film.id] })
        .expect(200);
      // Three titles are in it. One of them is published and paid.
      expect(changed.body).toMatchObject({ titles: 3, sellableTitles: 1 });

      const inPackage = await http()
        .get(`/v1/titles?packageId=${kids.id}`)
        .set(admin())
        .expect(200);
      expect(inPackage.body.total).toBe(3);
      expect(inPackage.body.items[0].packages).toEqual([{ id: kids.id, name: 'Kids' }]);

      await http()
        .put(`/v1/packages/${kids.id}/titles`)
        .set(admin())
        .send({ remove: [free.id, draft.body.id] })
        .expect(200);
      const after = await http().get('/v1/packages').set(admin()).expect(200);
      expect(after.body[0]).toMatchObject({ titles: 1, sellableTitles: 1 });

      await http()
        .put(`/v1/packages/${kids.id}/titles`)
        .set(admin())
        .send({ add: [UNKNOWN] })
        .expect(400);
      await http().put(`/v1/packages/${kids.id}/titles`).set(admin()).send({}).expect(400);
      await http()
        .put(`/v1/packages/${UNKNOWN}/titles`)
        .set(admin())
        .send({ add: [film.id] })
        .expect(404);
    });

    it('sets the packages of a title from the title itself', async () => {
      const kids = await createPackage('Kids');
      const sports = await createPackage('Sports');
      const film = await createMovie('Night Train', { packageIds: [] });

      const updated = await http()
        .patch(`/v1/titles/${film.id}`)
        .set(admin())
        .send({ packageIds: [sports.id, kids.id, kids.id] })
        .expect(200);
      expect(updated.body.packages).toEqual([
        { id: kids.id, name: 'Kids' },
        { id: sports.id, name: 'Sports' },
      ]);
      await http()
        .patch(`/v1/titles/${film.id}`)
        .set(admin())
        .send({ packageIds: [UNKNOWN] })
        .expect(400);
      const cleared = await http()
        .patch(`/v1/titles/${film.id}`)
        .set(admin())
        .send({ packageIds: [] })
        .expect(200);
      expect(cleared.body.packages).toEqual([]);

      const loose = await http().get('/v1/titles?packaged=none').set(admin()).expect(200);
      expect(loose.body.items.map((item: { id: string }) => item.id)).toEqual([film.id]);
    });

    it('keeps a package that a plan is built on', async () => {
      const kids = await createPackage('Kids');
      const plan = await createPlan({
        name: 'Kids plan',
        includesAll: false,
        packageIds: [kids.id],
      }).expect(201);

      const refused = await http().delete(`/v1/packages/${kids.id}`).set(admin()).expect(409);
      expect(refused.body.message).toBe(
        'This package is part of the plan Kids plan. Take it out of that plan first.',
      );
      const list = await http().get('/v1/packages').set(admin()).expect(200);
      expect(list.body[0].plans).toEqual([{ id: plan.body.id, name: 'Kids plan' }]);

      await http()
        .patch(`/v1/plans/${plan.body.id}`)
        .set(admin())
        .send({ includesAll: true, packageIds: [] })
        .expect(200);
      await http().delete(`/v1/packages/${kids.id}`).set(admin()).expect(204);
      await http().delete(`/v1/packages/${kids.id}`).set(admin()).expect(404);
    });

    it('lets editors of the catalog read packages, and only billing change them', async () => {
      const kids = await createPackage('Kids');
      const key = await http()
        .post('/v1/api-keys')
        .set(admin())
        .send({ name: 'Editor', scopes: ['catalog:read', 'catalog:write'] })
        .expect(201);
      const editor = testApp.bearer(key.body.key as string);
      await http().get('/v1/packages').set(editor).expect(200);
      await http().post('/v1/packages').set(editor).send({ name: 'Mine' }).expect(403);
      await http().delete(`/v1/packages/${kids.id}`).set(editor).expect(403);
      await http()
        .put(`/v1/packages/${kids.id}/titles`)
        .set(editor)
        .send({ add: [UNKNOWN] })
        .expect(403);
      await http().get('/v1/packages').expect(401);
    });
  });

  describe('plans', () => {
    it('open everything unless told otherwise', async () => {
      const plan = await createPlan().expect(201);
      expect(plan.body).toMatchObject({ includesAll: true, packages: [] });
    });

    it('name their packages, and must open something', async () => {
      const kids = await createPackage('Kids');
      const sports = await createPackage('Sports');

      const empty = await createPlan({ includesAll: false }).expect(400);
      expect(empty.body.issues).toEqual([
        {
          field: 'packageIds',
          message: 'Choose at least one package, or let the plan open everything',
        },
      ]);
      await createPlan({ includesAll: false, packageIds: [UNKNOWN] }).expect(400);

      const plan = await createPlan({
        includesAll: false,
        packageIds: [sports.id, kids.id],
      }).expect(201);
      expect(plan.body).toMatchObject({
        includesAll: false,
        packages: [
          { id: kids.id, name: 'Kids' },
          { id: sports.id, name: 'Sports' },
        ],
      });

      const narrowed = await http()
        .patch(`/v1/plans/${plan.body.id}`)
        .set(admin())
        .send({ packageIds: [kids.id] })
        .expect(200);
      expect(narrowed.body.packages).toEqual([{ id: kids.id, name: 'Kids' }]);
      const emptied = await http()
        .patch(`/v1/plans/${plan.body.id}`)
        .set(admin())
        .send({ packageIds: [] })
        .expect(400);
      expect(emptied.body.issues[0].field).toBe('packageIds');

      const log = await http().get('/v1/audit-logs').set(admin()).expect(200);
      const change = log.body.items.find(
        (entry: { action: string }) => entry.action === 'plan.update',
      );
      expect(change.metadata.changed).toEqual(['packageIds']);
    });

    it('show viewers what they open', async () => {
      const kids = await createPackage('Kids');
      await createPlan({ name: 'Kids plan', includesAll: false, packageIds: [kids.id] }).expect(
        201,
      );
      await createPlan({ name: 'Everything' }).expect(201);

      const offered = await http().get('/v1/catalog/plans').expect(200);
      expect(
        offered.body.plans.map(
          (plan: { name: string; includesAll: boolean; packages: unknown[] }) => [
            plan.name,
            plan.includesAll,
            plan.packages,
          ],
        ),
      ).toEqual([
        ['Kids plan', false, [{ id: kids.id, name: 'Kids' }]],
        ['Everything', true, []],
      ]);
    });
  });

  describe('who may watch', () => {
    async function seed() {
      const kids = await createPackage('Kids');
      const sports = await createPackage('Sports');
      const cartoon = await createMovie('Cartoon', { packageIds: [kids.id] });
      const match = await createMovie('The Match', { packageIds: [sports.id] });
      const both = await createMovie('Kids Cup', { packageIds: [kids.id, sports.id] });
      const loose = await createMovie('Unsorted');
      const free = await createMovie('Open House', { access: 'FREE', packageIds: [kids.id] });
      const kidsPlan = (
        await createPlan({ name: 'Kids plan', includesAll: false, packageIds: [kids.id] }).expect(
          201,
        )
      ).body;
      const all = (await createPlan({ name: 'Everything' }).expect(201)).body;
      return { kids, sports, cartoon, match, both, loose, free, kidsPlan, all };
    }

    it('opens the titles of the packages of the plan, and no others', async () => {
      const world = await seed();
      const anna = await register();
      await grant(anna.id, world.kidsPlan.id);

      await play(world.cartoon.slug, anna.cookie).expect(200);
      await play(world.both.slug, anna.cookie).expect(200);
      await play(world.free.slug, anna.cookie).expect(200);
      const refused = await play(world.match.slug, anna.cookie).expect(402);
      expect(refused.body).toMatchObject({
        code: 'plan_required',
        message: 'Your plan does not include this title',
      });
      // A paid title that was not sorted yet is not given away.
      const unsorted = await play(world.loose.slug, anna.cookie).expect(402);
      expect(unsorted.body.code).toBe('plan_required');
      // The trailer stays an invitation.
      await http()
        .post(`/v1/catalog/titles/${world.match.slug}/trailer/playback`)
        .set('Cookie', anna.cookie)
        .expect(200);
    });

    it('opens every paid title through a plan that opens everything', async () => {
      const world = await seed();
      const ben = await register(BEN);
      await grant(ben.id, world.all.id);
      for (const title of [world.cartoon, world.match, world.both, world.loose]) {
        await play(title.slug, ben.cookie).expect(200);
      }
    });

    it('tells a viewer without any subscription to subscribe, and a visitor to sign in', async () => {
      const world = await seed();
      const anna = await register();
      const refused = await play(world.cartoon.slug, anna.cookie).expect(402);
      expect(refused.body.code).toBe('subscription_required');
      await play(world.cartoon.slug).expect(401);
    });

    it('follows a change of the package or of the plan at once', async () => {
      const world = await seed();
      const anna = await register();
      await grant(anna.id, world.kidsPlan.id);
      await play(world.match.slug, anna.cookie).expect(402);

      await http()
        .put(`/v1/packages/${world.kids.id}/titles`)
        .set(admin())
        .send({ add: [world.match.id], remove: [world.cartoon.id] })
        .expect(200);
      await play(world.match.slug, anna.cookie).expect(200);
      await play(world.cartoon.slug, anna.cookie).expect(402);

      await http()
        .patch(`/v1/plans/${world.kidsPlan.id}`)
        .set(admin())
        .send({ includesAll: true })
        .expect(200);
      await play(world.cartoon.slug, anna.cookie).expect(200);
      await play(world.loose.slug, anna.cookie).expect(200);
    });

    it('opens an episode as its series is opened', async () => {
      const world = await seed();
      const series = await http()
        .post('/v1/titles')
        .set(admin())
        .send({ type: 'SERIES', name: 'Kids Show' })
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
        .send({ access: 'PAID', packageIds: [world.sports.id] })
        .expect(200);
      await http()
        .put(`/v1/titles/${series.body.id}/status`)
        .set(admin())
        .send({ status: 'PUBLISHED' })
        .expect(200);

      const anna = await register();
      await grant(anna.id, world.kidsPlan.id);
      const playEpisode = () =>
        http().post(`/v1/catalog/episodes/${episode.body.id}/playback`).set('Cookie', anna.cookie);
      const refused = await playEpisode().expect(402);
      expect(refused.body.code).toBe('plan_required');
      await http()
        .patch(`/v1/titles/${series.body.id}`)
        .set(admin())
        .send({ packageIds: [world.kids.id] })
        .expect(200);
      await playEpisode().expect(200);
    });

    it('tells the website what a viewer may watch, and which packages a title is in', async () => {
      const world = await seed();
      const anna = await register();
      const before = await http().get('/v1/viewer/session').set('Cookie', anna.cookie).expect(200);
      expect(before.body).toMatchObject({ entitled: false, access: null, purchases: [] });
      const visitor = await http().get('/v1/viewer/session').expect(200);
      expect(visitor.body).toEqual({
        viewer: null,
        profile: null,
        entitled: false,
        access: null,
        purchases: [],
      });

      await grant(anna.id, world.kidsPlan.id);
      const session = await http().get('/v1/viewer/session').set('Cookie', anna.cookie).expect(200);
      expect(session.body).toMatchObject({
        entitled: true,
        access: { all: false, packageIds: [world.kids.id] },
      });
      const own = await http()
        .get('/v1/viewer/subscription')
        .set('Cookie', anna.cookie)
        .expect(200);
      expect(own.body.access).toEqual({ all: false, packageIds: [world.kids.id] });

      const ben = await register(BEN);
      await grant(ben.id, world.all.id);
      const bens = await http().get('/v1/viewer/session').set('Cookie', ben.cookie).expect(200);
      expect(bens.body.access).toEqual({ all: true, packageIds: [] });

      const both = await http().get(`/v1/catalog/titles/${world.both.slug}`).expect(200);
      expect(both.body.packageIds).toEqual([world.kids.id, world.sports.id].sort());
      // A free title needs no plan, so its packages are nobody's business.
      const free = await http().get(`/v1/catalog/titles/${world.free.slug}`).expect(200);
      expect(free.body.packageIds).toEqual([]);
      const list = await http().get('/v1/catalog/titles').expect(200);
      expect(
        list.body.items.every((item: { packageIds?: unknown }) => Array.isArray(item.packageIds)),
      ).toBe(true);
    });

    it('counts for the panel what is not sorted yet', async () => {
      await seed();
      const overview = await http().get('/v1/billing').set(admin()).expect(200);
      expect(overview.body).toMatchObject({
        packages: 2,
        limitedPlans: 1,
        paidTitles: 4,
        unpackagedPaidTitles: 1,
      });
    });
  });
});
