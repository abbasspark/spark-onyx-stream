// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of live channels as viewers meet them: which channels the
// public catalog shows, and who may watch them.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { BillingModule } from '../src/billing/billing.module.js';
import { LiveModule } from '../src/live/live.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const ANNA = { email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' };
const SOURCE = 'https://user:secret@cdn.example.com/account/live.m3u8';

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Live channels for viewers (e2e)', () => {
  let testApp: TestApp;
  let livePath: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  /** Creates a channel and, unless told otherwise, puts it on air as a live process would. */
  async function createChannel(body: Record<string, unknown> = {}, onAir = true) {
    const created = await http()
      .post('/v1/channels')
      .set(admin())
      .send({ name: 'News 24', source: SOURCE, published: true, start: onAir, ...body })
      .expect(201);
    if (onAir) {
      await testApp.prisma.channel.update({
        where: { id: created.body.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
    }
    return created.body as { id: string; slug: string };
  }

  const createPackage = async (name: string) =>
    (await http().post('/v1/packages').set(admin()).send({ name }).expect(201)).body as {
      id: string;
    };
  const createPlan = async (body: Record<string, unknown>) =>
    (
      await http()
        .post('/v1/plans')
        .set(admin())
        .send({ monthlyAmount: 799, ...body })
        .expect(201)
    ).body as { id: string };
  async function register(viewer = ANNA) {
    const response = await http().post('/v1/viewer/register').send(viewer).expect(201);
    return { id: response.body.viewer.id as string, cookie: cookieOf(response) };
  }
  const grant = (viewerId: string, planId: string) =>
    http()
      .post(`/v1/viewers/${viewerId}/subscriptions`)
      .set(admin())
      .send({ planId, endsAt: null })
      .expect(201);
  const play = (slug: string, cookie?: string) => {
    const request = http().post(`/v1/catalog/channels/${slug}/playback`);
    return cookie ? request.set('Cookie', cookie) : request;
  };

  async function start(env: Record<string, string> = {}) {
    livePath = await mkdtemp(path.join(tmpdir(), 'onyx-live-public-'));
    testApp = await createTestApp([AdminsModule, ViewersModule, BillingModule, LiveModule], {
      LIVE_PATH: livePath,
      INGEST_API_URL: 'http://127.0.0.1:1',
      ...env,
    });
  }
  async function reset() {
    await testApp.resetDatabase();
    testApp.redis.clear();
    ownerToken = await testApp.setupOwner();
  }
  async function stop() {
    await testApp.close();
    await rm(livePath, { recursive: true, force: true });
  }

  describe('on a site that is open to everyone', () => {
    beforeAll(() => start());
    afterAll(stop);
    beforeEach(reset);

    it('lists published channels by number, with nothing about their sources', async () => {
      const kids = await createPackage('Kids');
      await createChannel({ name: 'Sports', number: 20 }, false);
      await createChannel({ name: 'News 24', number: 3, description: 'Around the clock' });
      await createChannel({ name: 'Cartoons', access: 'PAID', packageIds: [kids.id] });
      await createChannel({ name: 'Internal', published: false });

      const list = await http().get('/v1/catalog/channels').expect(200);
      expect(list.headers['cache-control']).toBe('public, max-age=10');
      expect(list.body).toEqual([
        {
          slug: 'news-24',
          name: 'News 24',
          number: 3,
          description: 'Around the clock',
          access: 'FREE',
          packageIds: [],
          onAir: true,
          now: null,
          next: null,
        },
        {
          slug: 'sports',
          name: 'Sports',
          number: 20,
          description: null,
          access: 'FREE',
          packageIds: [],
          onAir: false,
          now: null,
          next: null,
        },
        {
          slug: 'cartoons',
          name: 'Cartoons',
          number: null,
          description: null,
          access: 'PAID',
          packageIds: [kids.id],
          onAir: true,
          now: null,
          next: null,
        },
      ]);
      expect(JSON.stringify(list.body)).not.toContain('cdn.example.com');

      const one = await http().get('/v1/catalog/channels/news-24').expect(200);
      expect(one.body).toEqual(list.body[0]);
    });

    it('hides a channel that is not published, also from those who know its name', async () => {
      const hidden = await createChannel({ name: 'Internal', published: false });
      await http().get(`/v1/catalog/channels/${hidden.slug}`).expect(404);
      await play(hidden.slug).expect(404);
      await http().get('/v1/catalog/channels/no-such-channel').expect(404);
      await http().get('/v1/catalog/channels/Not%20A%20Slug').expect(400);

      await http()
        .patch(`/v1/channels/${hidden.id}`)
        .set(admin())
        .send({ published: true })
        .expect(200);
      await http().get(`/v1/catalog/channels/${hidden.slug}`).expect(200);
    });

    it('plays a free channel for anyone, with a signed address', async () => {
      const channel = await createChannel();
      const playback = await play(channel.slug).expect(200);
      expect(playback.headers['cache-control']).toBe('no-store');
      expect(playback.body.protocol).toBe('hls');
      expect(playback.body.url).toMatch(new RegExp(`/v1/live/${channel.id}/[^/]+/index\\.m3u8$`));
    });

    it('says so when a channel is not on air, after checking who asks', async () => {
      const kids = await createPackage('Kids');
      const free = await createChannel({ name: 'Free' }, false);
      const paid = await createChannel(
        { name: 'Paid', access: 'PAID', packageIds: [kids.id] },
        false,
      );

      const offAir = await play(free.slug).expect(409);
      expect(offAir.body).toMatchObject({ code: 'off_air' });
      // Whether a paid channel is on air is not told to those who may not watch it.
      await play(paid.slug).expect(401);

      // Reconnecting is not on air either.
      await testApp.prisma.channel.update({
        where: { id: free.id },
        data: { enabled: true, status: 'RECONNECTING' },
      });
      await play(free.slug).expect(409);
      expect((await http().get(`/v1/catalog/channels/${free.slug}`)).body.onAir).toBe(false);
    });

    it('opens a paid channel through a plan that includes one of its packages', async () => {
      const kids = await createPackage('Kids');
      const sports = await createPackage('Sports');
      const cartoons = await createChannel({
        name: 'Cartoons',
        access: 'PAID',
        packageIds: [kids.id],
      });
      const arena = await createChannel({
        name: 'Arena',
        access: 'PAID',
        packageIds: [sports.id],
      });
      const unsorted = await createChannel({ name: 'Unsorted', access: 'PAID' });
      const kidsPlan = await createPlan({
        name: 'Kids plan',
        includesAll: false,
        packageIds: [kids.id],
      });
      const everything = await createPlan({ name: 'Everything' });

      await play(cartoons.slug).expect(401);

      const anna = await register();
      const none = await play(cartoons.slug, anna.cookie).expect(402);
      expect(none.body).toMatchObject({ code: 'subscription_required' });

      await grant(anna.id, kidsPlan.id);
      await play(cartoons.slug, anna.cookie).expect(200);
      const other = await play(arena.slug, anna.cookie).expect(402);
      expect(other.body).toMatchObject({
        code: 'plan_required',
        message: 'Your plan does not include this channel',
      });
      // A paid channel in no package is opened only by a plan that opens everything.
      await play(unsorted.slug, anna.cookie).expect(402);

      const ben = await register({
        email: 'ben@example.com',
        displayName: 'Ben',
        password: 'battery-staple',
      });
      await grant(ben.id, everything.id);
      for (const channel of [cartoons, arena, unsorted]) {
        await play(channel.slug, ben.cookie).expect(200);
      }
    });
  });

  describe('on a site for signed-in viewers', () => {
    beforeAll(() => start({ CATALOG_PLAYBACK: 'viewers' }));
    afterAll(stop);
    beforeEach(reset);

    it('lists channels to everyone and plays them for viewers', async () => {
      const channel = await createChannel();
      await http().get('/v1/catalog/channels').expect(200);
      await play(channel.slug).expect(401);
      const anna = await register();
      await play(channel.slug, anna.cookie).expect(200);
    });
  });

  describe('on a site where playback is off', () => {
    beforeAll(() => start({ CATALOG_PLAYBACK: 'off' }));
    afterAll(stop);
    beforeEach(reset);

    it('plays nothing', async () => {
      const channel = await createChannel();
      await play(channel.slug).expect(403);
    });
  });

  describe('in the admin panel', () => {
    beforeAll(() => start());
    afterAll(stop);
    beforeEach(reset);

    it('keeps a new channel off the site until it is published', async () => {
      const created = await http()
        .post('/v1/channels')
        .set(admin())
        .send({ name: 'Draft', source: SOURCE })
        .expect(201);
      expect(created.body).toMatchObject({ published: false, access: 'FREE', packages: [] });
      expect((await http().get('/v1/catalog/channels')).body).toEqual([]);
    });

    it('sorts a channel into packages, which count it', async () => {
      const kids = await createPackage('Kids');
      const sports = await createPackage('Sports');
      const channel = await createChannel({
        access: 'PAID',
        packageIds: [sports.id, kids.id, kids.id],
      });

      const shown = await http().get(`/v1/channels/${channel.id}`).set(admin()).expect(200);
      expect(shown.body).toMatchObject({
        access: 'PAID',
        packages: [
          { id: kids.id, name: 'Kids' },
          { id: sports.id, name: 'Sports' },
        ],
      });
      const packages = await http().get('/v1/packages').set(admin()).expect(200);
      expect(packages.body.map((item: { channels: number }) => item.channels)).toEqual([1, 1]);

      // Other changes leave the packages alone.
      const renamed = await http()
        .patch(`/v1/channels/${channel.id}`)
        .set(admin())
        .send({ name: 'World News' })
        .expect(200);
      expect(renamed.body.packages).toHaveLength(2);

      const moved = await http()
        .patch(`/v1/channels/${channel.id}`)
        .set(admin())
        .send({ packageIds: [kids.id] })
        .expect(200);
      expect(moved.body.packages).toEqual([{ id: kids.id, name: 'Kids' }]);

      // Deleting a package takes the channel out of it and leaves the channel.
      await http().delete(`/v1/packages/${kids.id}`).set(admin()).expect(204);
      const after = await http().get(`/v1/channels/${channel.id}`).set(admin()).expect(200);
      expect(after.body.packages).toEqual([]);
    });

    it('refuses a package that does not exist', async () => {
      const response = await http()
        .post('/v1/channels')
        .set(admin())
        .send({
          name: 'News',
          source: SOURCE,
          packageIds: ['0190a0a0-0000-7000-8000-000000000000'],
        })
        .expect(400);
      expect(response.body.message).toBe('One of the packages does not exist');
    });
  });
});
