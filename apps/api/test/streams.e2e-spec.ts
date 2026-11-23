// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of stream limits: on how many devices one account plays
// at the same time, where that limit comes from, how a device takes a place,
// keeps it and gives it up, and what an admin sees and can stop.
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
import { LiveModule } from '../src/live/live.module.js';
import { STREAM_TTL_SECONDS } from '../src/streams/stream-rules.js';
import { StreamsModule } from '../src/streams/streams.module.js';
import { StreamsService } from '../src/streams/streams.service.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [
  AssetsModule,
  AdminsModule,
  ApiKeysModule,
  CatalogModule,
  ViewersModule,
  BillingModule,
  LiveModule,
  StreamsModule,
];
const ANNA = { email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' };
const BEN = { email: 'ben@example.com', displayName: 'Ben', password: 'battery-staple' };
const UNKNOWN = '00000000-0000-7000-8000-000000000000';
const PHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const TV = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/537.36';

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

interface Stream {
  id: string;
  kind: string;
  subject: string;
  device: string;
  here?: boolean;
}

describe.skipIf(!TEST_DATABASE_URL)('Stream limits (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function register(viewer = ANNA) {
    const response = await http().post('/v1/viewer/register').send(viewer).expect(201);
    return { id: response.body.viewer.id as string, cookie: cookieOf(response) };
  }

  /** The same account on one more device. */
  async function signIn(viewer = ANNA, userAgent?: string): Promise<string> {
    const request = http().post('/v1/viewer/login');
    const response = await (userAgent ? request.set('User-Agent', userAgent) : request)
      .send({ email: viewer.email, password: viewer.password })
      .expect(200);
    return cookieOf(response);
  }

  async function createAsset(title: string): Promise<string> {
    const response = await http().post('/v1/assets').set(admin()).send({ title }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: { status: 'READY', manifestPath: `assets/${id}/hls/master.m3u8`, durationMs: 90_000 },
    });
    return id;
  }

  async function createMovie(name: string, withTrailer = false) {
    const created = await http()
      .post('/v1/titles')
      .set(admin())
      .send({ type: 'MOVIE', name })
      .expect(201);
    const id = created.body.id as string;
    const assetId = await createAsset(name);
    await http()
      .patch(`/v1/titles/${id}`)
      .set(admin())
      .send({ assetId, ...(withTrailer ? { trailerAssetId: assetId } : {}) })
      .expect(200);
    await http()
      .put(`/v1/titles/${id}/status`)
      .set(admin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return { id, slug: created.body.slug as string };
  }

  async function createEpisode() {
    const created = await http()
      .post('/v1/titles')
      .set(admin())
      .send({ type: 'SERIES', name: 'Deep Ocean' })
      .expect(201);
    const id = created.body.id as string;
    const season = await http().post(`/v1/titles/${id}/seasons`).set(admin()).send({}).expect(201);
    const episode = await http()
      .post(`/v1/seasons/${season.body.seasons[0].id}/episodes`)
      .set(admin())
      .send({ name: 'Pilot', assetId: await createAsset('Pilot') })
      .expect(201);
    await http()
      .patch(`/v1/episodes/${episode.body.id}`)
      .set(admin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    await http()
      .put(`/v1/titles/${id}/status`)
      .set(admin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return episode.body.id as string;
  }

  const createPlan = async (body: Record<string, unknown> = {}) =>
    (
      await http()
        .post('/v1/plans')
        .set(admin())
        .send({ name: 'Standard', monthlyAmount: 799, ...body })
        .expect(201)
    ).body as { id: string; maxStreams: number | null };
  const grant = (viewerId: string, planId: string) =>
    http()
      .post(`/v1/viewers/${viewerId}/subscriptions`)
      .set(admin())
      .send({ planId, endsAt: null })
      .expect(201);

  const play = (slug: string, cookie?: string, userAgent?: string) => {
    let request = http().post(`/v1/catalog/titles/${slug}/playback`);
    request = cookie ? request.set('Cookie', cookie) : request;
    return userAgent ? request.set('User-Agent', userAgent) : request;
  };
  /** Plays and answers with the id of the place the device got. */
  const playing = async (slug: string, cookie: string, userAgent?: string) =>
    (await play(slug, cookie, userAgent).expect(200)).body.stream.id as string;
  const beat = (cookie: string, id: string) =>
    http().post(`/v1/viewer/streams/${id}/beat`).set('Cookie', cookie);
  const end = (cookie: string, id: string) =>
    http().delete(`/v1/viewer/streams/${id}`).set('Cookie', cookie);
  const own = async (cookie: string) =>
    (await http().get('/v1/viewer/streams').set('Cookie', cookie).expect(200)).body as {
      limit: number | null;
      streams: Stream[];
    };
  const seen = async (viewerId: string) =>
    (await http().get(`/v1/viewers/${viewerId}/streams`).set(admin()).expect(200)).body as {
      limit: number | null;
      source: string;
      streams: Stream[];
    };

  async function start(env: Record<string, string> = {}) {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-streams-'));
    testApp = await createTestApp(MODULES, {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      LIVE_PATH: path.join(workDirectory, 'live'),
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
    await testApp.resetDatabase();
    await testApp.close();
    await rm(workDirectory, { recursive: true, force: true });
  }

  describe('on a site without a limit', () => {
    beforeAll(() => start());
    beforeEach(reset);
    afterAll(stop);

    it('gives every device of a viewer a place, and a visitor none', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');

      const visitor = await play(movie.slug).expect(200);
      expect(visitor.body.stream).toBeNull();

      const first = await play(movie.slug, anna.cookie, PHONE).expect(200);
      expect(first.body.stream).toEqual({ id: expect.any(String), beatSeconds: 30 });
      for (let device = 0; device < 4; device += 1) {
        await play(movie.slug, await signIn()).expect(200);
      }
      const now = await own(anna.cookie);
      expect(now.limit).toBeNull();
      expect(now.streams).toHaveLength(5);
      expect(now.streams[0]).toMatchObject({
        id: first.body.stream.id,
        kind: 'VIDEO',
        subject: 'Night Train',
        device: 'MOBILE',
        here: true,
      });
      expect(now.streams.filter((stream) => stream.here)).toHaveLength(1);
    });

    it('names an episode by its series, season and number', async () => {
      const anna = await register();
      const episodeId = await createEpisode();
      await http()
        .post(`/v1/catalog/episodes/${episodeId}/playback`)
        .set('Cookie', anna.cookie)
        .expect(200);
      expect((await own(anna.cookie)).streams[0]?.subject).toBe('Deep Ocean S1 E1');
    });

    it('takes no place for a trailer', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train', true);
      const trailer = await http()
        .post(`/v1/catalog/titles/${movie.slug}/trailer/playback`)
        .set('Cookie', anna.cookie)
        .expect(200);
      expect(trailer.body.stream).toBeNull();
      expect((await own(anna.cookie)).streams).toEqual([]);
    });

    it('is only for signed-in viewers, and admin credentials do not open it', async () => {
      await http().get('/v1/viewer/streams').expect(401);
      await http().get('/v1/viewer/streams').set(admin()).expect(401);
      await http().post(`/v1/viewer/streams/${UNKNOWN}/beat`).expect(401);
      await http().delete(`/v1/viewer/streams/${UNKNOWN}`).expect(401);
    });
  });

  describe('on a site that plays on two devices at once', () => {
    beforeAll(() => start({ STREAM_LIMIT: '2' }));
    beforeEach(reset);
    afterAll(stop);

    it('refuses a third device, and says what the other two are playing', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');
      const other = await createMovie('Glass Tide');
      const phone = await playing(movie.slug, anna.cookie, PHONE);
      const tv = await playing(other.slug, await signIn(ANNA, TV), TV);

      const third = await signIn();
      const refused = await play(movie.slug, third).expect(409);
      expect(refused.body).toMatchObject({
        code: 'stream_limit',
        limit: 2,
        message: expect.stringContaining('on 2 devices'),
      });
      expect(
        refused.body.streams.map((stream: Stream) => [stream.id, stream.subject, stream.device]),
      ).toEqual([
        [phone, 'Night Train', 'MOBILE'],
        [tv, 'Glass Tide', 'TV'],
      ]);
      // Nothing was handed out, and nobody lost their place.
      expect((await own(third)).streams.map((stream) => stream.id)).toEqual([phone, tv]);
    });

    it('lets a device change what it plays without taking a second place', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');
      const other = await createMovie('Glass Tide');
      const first = await playing(movie.slug, anna.cookie);
      const second = await playing(other.slug, anna.cookie);
      expect(second).not.toBe(first);
      expect((await own(anna.cookie)).streams.map((stream) => stream.subject)).toEqual([
        'Glass Tide',
      ]);
      // The place it left is gone for good.
      await beat(anna.cookie, first).expect(410);
    });

    it('lets a viewer stop another device to watch here, and tells that device to stop', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');
      const phone = await playing(movie.slug, anna.cookie, PHONE);
      const tvCookie = await signIn(ANNA, TV);
      await playing(movie.slug, tvCookie, TV);
      const laptop = await signIn();
      await play(movie.slug, laptop).expect(409);

      await end(laptop, phone).expect(204);
      await play(movie.slug, laptop).expect(200);

      await beat(tvCookie, (await own(tvCookie)).streams[0]?.id as string).expect(204);
      const stopped = await beat(anna.cookie, phone).expect(410);
      expect(stopped.body.code).toBe('stream_stopped');
      // The phone can ask again, and is refused while the others play.
      await play(movie.slug, anna.cookie, PHONE).expect(409);
    });

    it('frees a place when a device leaves the video', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');
      const first = await playing(movie.slug, anna.cookie);
      await playing(movie.slug, await signIn());
      const third = await signIn();
      await play(movie.slug, third).expect(409);

      await end(anna.cookie, first).expect(204);
      // Leaving twice is fine.
      await end(anna.cookie, first).expect(204);
      await play(movie.slug, third).expect(200);
    });

    it('frees the place of a device that went silent', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');
      const first = await playing(movie.slug, anna.cookie);
      const second = await playing(movie.slug, await signIn());
      const third = await signIn();

      // Reporting keeps a place.
      await beat(anna.cookie, first).expect(204);
      const silent = new Date(Date.now() - (STREAM_TTL_SECONDS + 5) * 1000);
      await testApp.prisma.viewerStream.update({
        where: { id: second },
        data: { lastSeenAt: silent },
      });
      expect((await own(third)).streams.map((stream) => stream.id)).toEqual([first]);

      await play(movie.slug, third).expect(200);
      // The silent one has lost its place to the third device.
      expect(await testApp.prisma.viewerStream.count({ where: { id: second } })).toBe(0);
    });

    it('lets a device that was only asleep go on while nobody took its place', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');
      const first = await playing(movie.slug, anna.cookie);
      await testApp.prisma.viewerStream.update({
        where: { id: first },
        data: { lastSeenAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
      expect((await own(anna.cookie)).streams).toEqual([]);
      await beat(anna.cookie, first).expect(204);
      expect((await own(anna.cookie)).streams).toHaveLength(1);
    });

    it('counts a live channel like a video', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');
      const channel = await http()
        .post('/v1/channels')
        .set(admin())
        .send({
          name: 'News 24',
          source: 'https://cdn.example.com/live.m3u8',
          published: true,
          start: true,
        })
        .expect(201);
      await testApp.prisma.channel.update({
        where: { id: channel.body.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
      const live = (cookie?: string) => {
        const request = http().post(`/v1/catalog/channels/${channel.body.slug}/playback`);
        return cookie ? request.set('Cookie', cookie) : request;
      };

      expect((await live().expect(200)).body.stream).toBeNull();
      const watching = await live(anna.cookie).expect(200);
      expect(watching.body.stream.beatSeconds).toBe(30);
      await playing(movie.slug, await signIn());
      expect(
        (await own(anna.cookie)).streams.map((stream) => [stream.kind, stream.subject]),
      ).toEqual([
        ['LIVE', 'News 24'],
        ['VIDEO', 'Night Train'],
      ]);
      expect((await live(await signIn()).expect(409)).body.code).toBe('stream_limit');
    });

    it('keeps the streams of one account apart from those of another', async () => {
      const anna = await register();
      const ben = await register(BEN);
      const movie = await createMovie('Night Train');
      const hers = await playing(movie.slug, anna.cookie);
      await playing(movie.slug, await signIn());

      // Her two places do not count against him, and he can do nothing to them.
      await play(movie.slug, ben.cookie).expect(200);
      await beat(ben.cookie, hers).expect(410);
      await end(ben.cookie, hers).expect(204);
      await beat(anna.cookie, hers).expect(204);
      expect((await own(ben.cookie)).streams).toHaveLength(1);
    });

    it('never lets two devices take the last place together', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');
      await playing(movie.slug, anna.cookie);
      const devices = await Promise.all([signIn(), signIn(), signIn(), signIn()]);
      const answers = await Promise.all(devices.map((cookie) => play(movie.slug, cookie)));
      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409, 409, 409]);
      expect(await testApp.prisma.viewerStream.count()).toBe(2);
    });

    it('takes the limit of the plan, and that of the viewer above it', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');
      expect(await seen(anna.id)).toMatchObject({ limit: 2, source: 'SITE' });

      const single = await createPlan({ name: 'Single', maxStreams: 1 });
      await grant(anna.id, single.id);
      expect(await seen(anna.id)).toMatchObject({ limit: 1, source: 'PLAN' });
      await playing(movie.slug, anna.cookie);
      const second = await signIn();
      expect((await play(movie.slug, second).expect(409)).body.limit).toBe(1);

      await http().patch(`/v1/viewers/${anna.id}`).set(admin()).send({ maxStreams: 3 }).expect(200);
      expect(await seen(anna.id)).toMatchObject({ limit: 3, source: 'VIEWER' });
      await play(movie.slug, second).expect(200);
      await play(movie.slug, await signIn()).expect(200);
      await play(movie.slug, await signIn()).expect(409);

      const cleared = await http()
        .patch(`/v1/viewers/${anna.id}`)
        .set(admin())
        .send({ maxStreams: null })
        .expect(200);
      expect(cleared.body.maxStreams).toBeNull();
      expect((await seen(anna.id)).source).toBe('PLAN');
      await http().patch(`/v1/viewers/${anna.id}`).set(admin()).send({ maxStreams: 0 }).expect(400);
    });

    it('tells viewers on how many devices each plan plays', async () => {
      const follows = await createPlan({ name: 'Standard' });
      const family = await createPlan({ name: 'Family', maxStreams: 4 });
      expect(follows.maxStreams).toBeNull();
      expect(family.maxStreams).toBe(4);
      await createPlan({ name: 'Too many', maxStreams: 21 }).catch(() => undefined);

      const offered = await http().get('/v1/catalog/plans').expect(200);
      expect(
        offered.body.plans.map((plan: { name: string; maxStreams: number | null }) => [
          plan.name,
          plan.maxStreams,
        ]),
      ).toEqual([
        ['Standard', 2],
        ['Family', 4],
      ]);
      const changed = await http()
        .patch(`/v1/plans/${family.id}`)
        .set(admin())
        .send({ maxStreams: null })
        .expect(200);
      expect(changed.body.maxStreams).toBeNull();
      expect((await http().get('/v1/billing').set(admin()).expect(200)).body.streamLimit).toBe(2);
    });

    it('shows an admin what a viewer plays, and lets them stop a device', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');
      const phone = await playing(movie.slug, anna.cookie, PHONE);
      await playing(movie.slug, await signIn(ANNA, TV), TV);

      const view = await seen(anna.id);
      expect(view.streams.map((stream) => [stream.subject, stream.device])).toEqual([
        ['Night Train', 'MOBILE'],
        ['Night Train', 'TV'],
      ]);

      await http().delete(`/v1/viewers/${anna.id}/streams/${phone}`).set(admin()).expect(204);
      await beat(anna.cookie, phone).expect(410);
      expect((await seen(anna.id)).streams).toHaveLength(1);
      await http().delete(`/v1/viewers/${anna.id}/streams/${phone}`).set(admin()).expect(404);
      await http().get(`/v1/viewers/${UNKNOWN}/streams`).set(admin()).expect(200);

      const trace = await testApp.prisma.auditLog.findMany({
        where: { action: 'viewer.stream_stop' },
      });
      expect(trace).toHaveLength(1);
      expect(trace[0]?.metadata).toMatchObject({ subject: 'Night Train', device: 'MOBILE' });

      const key = await http()
        .post('/v1/api-keys')
        .set(admin())
        .send({ name: 'Support', scopes: ['viewers:read'] })
        .expect(201);
      const reader = testApp.bearer(key.body.key as string);
      await http().get(`/v1/viewers/${anna.id}/streams`).set(reader).expect(200);
      await http().delete(`/v1/viewers/${anna.id}/streams/${UNKNOWN}`).set(reader).expect(403);
      await http().get(`/v1/viewers/${anna.id}/streams`).expect(401);
    });

    it('ends the streams of a device with its sign-in, and clears away old ones', async () => {
      const anna = await register();
      const movie = await createMovie('Night Train');
      const first = await playing(movie.slug, anna.cookie);
      await testApp.prisma.viewerSession.deleteMany({ where: { viewerId: anna.id } });
      expect(await testApp.prisma.viewerStream.count({ where: { id: first } })).toBe(0);

      const again = await playing(movie.slug, await signIn());
      await testApp.prisma.viewerStream.update({
        where: { id: again },
        data: { lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      });
      expect(await testApp.app.get(StreamsService).purge()).toBe(1);
    });
  });
});
