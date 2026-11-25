// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of ads in front of, in the middle of and after videos:
// the settings and sources in the panel, who sees ads in playback, and how
// the ads that were shown are counted.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AdsModule } from '../src/ads/ads.module.js';
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
  AdsModule,
];
const ANNA = { email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' };
const TAG = 'https://ads.example.com/vast?slot=1';
const UNKNOWN = '0190a0a0-0000-7000-8000-000000000000';

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Ads (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function register() {
    const response = await http().post('/v1/viewer/register').send(ANNA).expect(201);
    return { id: response.body.viewer.id as string, cookie: cookieOf(response) };
  }

  async function readyAsset(name: string, durationMs = 90 * 60_000) {
    const asset = await http().post('/v1/assets').set(admin()).send({ title: name }).expect(201);
    const assetId = asset.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id: assetId },
      data: { status: 'READY', manifestPath: `assets/${assetId}/hls/master.m3u8`, durationMs },
    });
    return assetId;
  }

  async function createMovie(name: string, fields: Record<string, unknown> = {}) {
    const created = await http()
      .post('/v1/titles')
      .set(admin())
      .send({ type: 'MOVIE', name })
      .expect(201);
    const id = created.body.id as string;
    const assetId = await readyAsset(`${name} master`);
    const trailerAssetId = await readyAsset(`${name} trailer`, 120_000);
    await http()
      .patch(`/v1/titles/${id}`)
      .set(admin())
      .send({ assetId, trailerAssetId, access: 'FREE', ...fields })
      .expect(200);
    await http()
      .put(`/v1/titles/${id}/status`)
      .set(admin())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return { id, slug: created.body.slug as string };
  }

  const settings = (body: Record<string, unknown> = {}) =>
    http()
      .put('/v1/ads/settings')
      .set(admin())
      .send({
        enabled: true,
        preRoll: true,
        postRoll: false,
        midRollEveryMinutes: 0,
        minDurationMinutes: 10,
        ...body,
      });

  const vastSource = (body: Record<string, unknown> = {}) =>
    http()
      .post('/v1/ads/sources')
      .set(admin())
      .send({ name: 'Main tag', kind: 'VAST_TAG', vastUrl: TAG, ...body });

  const play = (slug: string, cookie: string) =>
    http().post(`/v1/catalog/titles/${slug}/playback`).set('Cookie', cookie);

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-ads-'));
    testApp = await createTestApp(MODULES, {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      BILLING_CURRENCY: 'EUR',
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

  describe('settings', () => {
    it('start switched off, and are saved and read back', async () => {
      const start = await http().get('/v1/ads/settings').set(admin()).expect(200);
      expect(start.body).toEqual({
        enabled: false,
        preRoll: true,
        postRoll: false,
        midRollEveryMinutes: 0,
        minDurationMinutes: 10,
        hasActiveSource: false,
      });
      const saved = await settings({ midRollEveryMinutes: 20, postRoll: true }).expect(200);
      expect(saved.body).toMatchObject({ enabled: true, midRollEveryMinutes: 20, postRoll: true });
    });

    it('refuse values out of range', async () => {
      await settings({ midRollEveryMinutes: 500 }).expect(400);
      await settings({ minDurationMinutes: -1 }).expect(400);
    });

    it('are for people who may change settings', async () => {
      await http().put('/v1/ads/settings').send({}).expect(401);
    });
  });

  describe('sources', () => {
    it('are added, changed and removed, and leave a trace in the audit log', async () => {
      const created = await vastSource().expect(201);
      expect(created.body).toMatchObject({ kind: 'VAST_TAG', vastUrl: TAG, weight: 1 });
      const changed = await http()
        .patch(`/v1/ads/sources/${created.body.id}`)
        .set(admin())
        .send({ weight: 3, isActive: false })
        .expect(200);
      expect(changed.body).toMatchObject({ weight: 3, isActive: false });
      expect((await http().get('/v1/ads/sources').set(admin()).expect(200)).body).toHaveLength(1);
      await http().delete(`/v1/ads/sources/${created.body.id}`).set(admin()).expect(204);
      await http().delete(`/v1/ads/sources/${created.body.id}`).set(admin()).expect(404);
      const actions = (await testApp.prisma.auditLog.findMany()).map((entry) => entry.action);
      expect(actions).toEqual(
        expect.arrayContaining(['ads.source.create', 'ads.source.update', 'ads.source.delete']),
      );
    });

    it('take web addresses only', async () => {
      await vastSource({ vastUrl: 'javascript:alert(1)' }).expect(400);
      await vastSource({ vastUrl: 'not an address' }).expect(400);
    });

    it('can be a video of the library that is ready to play', async () => {
      const assetId = await readyAsset('Sponsor');
      const house = await http()
        .post('/v1/ads/sources')
        .set(admin())
        .send({
          name: 'Sponsor',
          kind: 'HOUSE',
          assetId,
          clickUrl: 'https://sponsor.example.com',
          skipAfterSeconds: 5,
        })
        .expect(201);
      expect(house.body).toMatchObject({ kind: 'HOUSE', asset: { id: assetId, title: 'Sponsor' } });
      await http()
        .post('/v1/ads/sources')
        .set(admin())
        .send({ name: 'Missing', kind: 'HOUSE', assetId: UNKNOWN })
        .expect(400);
      const raw = await http().post('/v1/assets').set(admin()).send({ title: 'Raw' }).expect(201);
      await http()
        .post('/v1/ads/sources')
        .set(admin())
        .send({ name: 'Raw', kind: 'HOUSE', assetId: raw.body.asset.id })
        .expect(409);
    });

    it('keep their kind: a VAST tag takes no video', async () => {
      const created = await vastSource().expect(201);
      await http()
        .patch(`/v1/ads/sources/${created.body.id}`)
        .set(admin())
        .send({ assetId: await readyAsset('Other') })
        .expect(400);
    });
  });

  describe('in playback', () => {
    it('plays none while ads are off', async () => {
      await vastSource().expect(201);
      const film = await createMovie('Night Train');
      const { cookie } = await register();
      const answer = await play(film.slug, cookie).expect(200);
      expect(answer.body.ads).toBeNull();
    });

    it('plays none when there is nothing to play them from', async () => {
      await settings().expect(200);
      const film = await createMovie('Night Train');
      const { cookie } = await register();
      expect((await play(film.slug, cookie).expect(200)).body.ads).toBeNull();
    });

    it('plans a pre-roll, mid-rolls and a post-roll from a VAST tag', async () => {
      const source = await vastSource().expect(201);
      await settings({ midRollEveryMinutes: 30, postRoll: true }).expect(200);
      const film = await createMovie('Night Train');
      const { cookie } = await register();
      const answer = await play(film.slug, cookie).expect(200);
      const sourceId = source.body.id as string;
      expect(answer.body.ads.breaks).toEqual([
        { id: 'pre-0', position: 'PRE', atMs: null, sourceId },
        { id: 'mid-1800000', position: 'MID', atMs: 1_800_000, sourceId },
        { id: 'mid-3600000', position: 'MID', atMs: 3_600_000, sourceId },
        { id: 'post-0', position: 'POST', atMs: null, sourceId },
      ]);
      // The tag itself stays on the server: some carry keys of the account.
      expect(JSON.stringify(answer.body)).not.toContain(TAG);
    });

    it('leaves short videos alone', async () => {
      await vastSource().expect(201);
      await settings({ minDurationMinutes: 120 }).expect(200);
      const film = await createMovie('Night Train');
      const { cookie } = await register();
      expect((await play(film.slug, cookie).expect(200)).body.ads).toBeNull();
    });

    it('never plays in front of a trailer', async () => {
      await vastSource().expect(201);
      await settings().expect(200);
      const film = await createMovie('Night Train');
      const { cookie } = await register();
      const answer = await http()
        .post(`/v1/catalog/titles/${film.slug}/trailer/playback`)
        .set('Cookie', cookie)
        .expect(200);
      expect(answer.body.ads).toBeNull();
    });

    it('is left out for a viewer whose plan comes without ads, and kept for one whose does not', async () => {
      await vastSource().expect(201);
      await settings().expect(200);
      const film = await createMovie('Night Train');
      const { id, cookie } = await register();
      const plan = async (body: Record<string, unknown>) =>
        (
          await http()
            .post('/v1/plans')
            .set(admin())
            .send({ name: 'Plan', monthlyAmount: 799, ...body })
            .expect(201)
        ).body as { id: string; removesAds: boolean };

      const supported = await plan({ name: 'With ads', monthlyAmount: 399, removesAds: false });
      expect(supported.removesAds).toBe(false);
      const grant = await http()
        .post(`/v1/viewers/${id}/subscriptions`)
        .set(admin())
        .send({ planId: supported.id, endsAt: null })
        .expect(201);
      expect((await play(film.slug, cookie).expect(200)).body.ads.breaks).toHaveLength(1);

      await http().post(`/v1/subscriptions/${grant.body.id}/end`).set(admin()).expect(200);
      const free = await plan({ name: 'Ad-free' });
      expect(free.removesAds).toBe(true);
      await http()
        .post(`/v1/viewers/${id}/subscriptions`)
        .set(admin())
        .send({ planId: free.id, endsAt: null })
        .expect(201);
      expect((await play(film.slug, cookie).expect(200)).body.ads).toBeNull();
    });

    it('is left out for a viewer who owns the title', async () => {
      await vastSource().expect(201);
      await settings().expect(200);
      const film = await createMovie('Night Train', {
        access: 'PAID',
        rentAmount: 399,
        buyAmount: 999,
      });
      const { id, cookie } = await register();
      await play(film.slug, cookie).expect(402);
      await http()
        .post(`/v1/viewers/${id}/purchases`)
        .set(admin())
        .send({ titleId: film.id, kind: 'BUY' })
        .expect(201);
      expect((await play(film.slug, cookie).expect(200)).body.ads).toBeNull();
    });
  });

  describe('resolving an ad', () => {
    let adServer: Server;
    let adServerUrl: string;
    let answer: { status: number; body: string } = { status: 200, body: '' };

    beforeAll(async () => {
      adServer = createServer((_request, response) => {
        response.statusCode = answer.status;
        response.setHeader('Content-Type', 'application/xml');
        response.end(answer.body);
      });
      await new Promise<void>((resolve) => adServer.listen(0, '127.0.0.1', resolve));
      adServerUrl = `http://127.0.0.1:${(adServer.address() as AddressInfo).port}/vast`;
    });

    afterAll(() => new Promise<void>((resolve) => adServer.close(() => resolve())));

    const resolveAd = (sourceId: string) =>
      http().post('/v1/catalog/ads/resolve').send({ sourceId }).expect(200);

    it('reads the VAST answer of an ad server', async () => {
      answer = {
        status: 200,
        body: `<VAST version="3.0"><Ad><InLine><Impression>https://t.example.com/imp</Impression><Creatives><Creative><Linear skipoffset="00:00:05"><Duration>00:00:20</Duration><MediaFiles><MediaFile type="video/mp4" width="1280">https://cdn.example.com/ad.mp4</MediaFile></MediaFiles></Linear></Creative></Creatives></InLine></Ad></VAST>`,
      };
      const source = await vastSource({ vastUrl: adServerUrl }).expect(201);
      const resolved = await resolveAd(source.body.id);
      expect(resolved.body.ad).toMatchObject({
        mediaUrl: 'https://cdn.example.com/ad.mp4',
        mimeType: 'video/mp4',
        durationMs: 20_000,
        skipOffsetMs: 5000,
        impressions: ['https://t.example.com/imp'],
      });
    });

    it('answers with no ad when the ad server has none or fails', async () => {
      const source = await vastSource({ vastUrl: adServerUrl }).expect(201);
      answer = { status: 200, body: '<VAST version="3.0"></VAST>' };
      expect((await resolveAd(source.body.id)).body.ad).toBeNull();
      answer = { status: 500, body: 'oops' };
      expect((await resolveAd(source.body.id)).body.ad).toBeNull();
    });

    it('does not follow a wrapper into the private network', async () => {
      answer = {
        status: 200,
        body: `<VAST version="3.0"><Ad><Wrapper><VASTAdTagURI>${adServerUrl}</VASTAdTagURI></Wrapper></Ad></VAST>`,
      };
      const source = await vastSource({ vastUrl: adServerUrl }).expect(201);
      expect((await resolveAd(source.body.id)).body.ad).toBeNull();
    });

    it('plays a video of the library as a house ad, with a fresh signed address', async () => {
      const assetId = await readyAsset('Sponsor', 30_000);
      const house = await http()
        .post('/v1/ads/sources')
        .set(admin())
        .send({
          name: 'Sponsor',
          kind: 'HOUSE',
          assetId,
          clickUrl: 'https://sponsor.example.com',
          skipAfterSeconds: 5,
        })
        .expect(201);
      const resolved = await resolveAd(house.body.id);
      expect(resolved.body.ad).toMatchObject({
        mimeType: 'application/x-mpegURL',
        durationMs: 30_000,
        skipOffsetMs: 5000,
        clickThrough: 'https://sponsor.example.com',
      });
      expect(resolved.body.ad.mediaUrl).toContain('master.m3u8');
    });

    it('has no ad for a source that is switched off or gone', async () => {
      const source = await vastSource({ vastUrl: adServerUrl, isActive: false }).expect(201);
      expect((await resolveAd(source.body.id)).body.ad).toBeNull();
      expect((await resolveAd(UNKNOWN)).body.ad).toBeNull();
    });
  });

  describe('events', () => {
    it('are counted by day and source, and add up in the report', async () => {
      const source = await vastSource().expect(201);
      const report = (days = 7) =>
        http().get(`/v1/ads/report?days=${days}`).set(admin()).expect(200);
      const event = (name: string) =>
        http()
          .post('/v1/catalog/ads/events')
          .send({ sourceId: source.body.id, event: name })
          .expect(204);

      await event('IMPRESSION');
      await event('IMPRESSION');
      await event('FIRST_QUARTILE');
      await event('COMPLETE');
      await event('SKIP');
      await event('CLICK');
      await event('ERROR');

      const body = (await report()).body;
      expect(body.totals).toEqual({
        impressions: 2,
        firstQuartile: 1,
        midpoint: 0,
        thirdQuartile: 0,
        completes: 1,
        skips: 1,
        clicks: 1,
        errors: 1,
      });
      expect(body.perDay).toHaveLength(7);
      expect(body.perDay.at(-1)).toMatchObject({ impressions: 2, completes: 1 });
      expect(body.perSource).toEqual([
        expect.objectContaining({ sourceId: source.body.id, name: 'Main tag', impressions: 2 }),
      ]);
    });

    it('from a source that is gone are ignored, and a made-up event is refused', async () => {
      await http()
        .post('/v1/catalog/ads/events')
        .send({ sourceId: UNKNOWN, event: 'IMPRESSION' })
        .expect(204);
      const source = await vastSource().expect(201);
      await http()
        .post('/v1/catalog/ads/events')
        .send({ sourceId: source.body.id, event: 'EXPLODE' })
        .expect(400);
      expect(
        (await http().get('/v1/ads/report').set(admin()).expect(200)).body.totals,
      ).toMatchObject({ impressions: 0 });
    });

    it('go away with their source', async () => {
      const source = await vastSource().expect(201);
      await http()
        .post('/v1/catalog/ads/events')
        .send({ sourceId: source.body.id, event: 'IMPRESSION' })
        .expect(204);
      await http().delete(`/v1/ads/sources/${source.body.id}`).set(admin()).expect(204);
      expect(await testApp.prisma.adStat.count()).toBe(0);
    });
  });
});
