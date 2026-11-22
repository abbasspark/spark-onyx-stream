// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of P2P between viewers, as far as the main server is
// concerned: who is told about the tracker, and what the panel learns of it.
// A small HTTP server stands in for the tracker.
//
// Skipped unless TEST_DATABASE_URL is set.
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AdminsModule } from '../src/admins/admins.module.js';
import { DeliveryModule } from '../src/delivery/delivery.module.js';
import { LiveModule } from '../src/live/live.module.js';
import { verifyPlaybackToken } from '../src/playback/playback-token.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const SECRET = 't'.repeat(48);
const STATS = {
  version: '0.1.0',
  connections: 12,
  refusedConnections: 1,
  peers: 14,
  swarms: 3,
  largestSwarms: [9, 3, 2],
  announces: 240,
  offersRelayed: 80,
  answersRelayed: 61,
  refused: 0,
  startedAt: '2026-11-22T10:00:00.000Z',
};

describe.skipIf(!TEST_DATABASE_URL)('P2P between viewers (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let tracker: Server;
  let trackerUrl: string;
  /** What the stand-in tracker answers, and what it was asked with. */
  let answer: { status: number; body: unknown };
  let bearers: string[];

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function channelOnAir(name: string) {
    const created = await http()
      .post('/v1/channels')
      .set(admin())
      .send({ name, source: 'https://cdn.example.com/live.m3u8', published: true })
      .expect(201);
    await testApp.prisma.channel.update({
      where: { id: created.body.id },
      data: { enabled: true, status: 'RUNNING', startedAt: new Date() },
    });
    return created.body as { id: string; slug: string };
  }
  const watch = async (slug: string) =>
    (await http().post(`/v1/catalog/channels/${slug}/playback`).expect(200)).body as {
      url: string;
      p2p: {
        trackerUrl: string;
        swarmId: string;
        iceServers: { urls: string[]; username?: string; credential?: string }[];
      } | null;
    };

  beforeAll(async () => {
    tracker = createServer((request, response) => {
      bearers.push(request.headers.authorization ?? '');
      response.writeHead(answer.status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(answer.body));
    });
    await new Promise<void>((resolve) => tracker.listen(0, '127.0.0.1', resolve));
    trackerUrl = `http://127.0.0.1:${(tracker.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => tracker.close(() => resolve())));

  const start = async (overrides: Record<string, string>) => {
    testApp = await createTestApp([AdminsModule, LiveModule, DeliveryModule], {
      CATALOG_PLAYBACK: 'open',
      INGEST_API_URL: 'http://127.0.0.1:1',
      ...overrides,
    });
  };
  beforeEach(async () => {
    await testApp.resetDatabase();
    testApp.redis.clear();
    ownerToken = await testApp.setupOwner();
    answer = { status: 200, body: STATS };
    bearers = [];
  });

  describe('switched off', () => {
    beforeAll(() => start({}));
    afterAll(() => testApp.close());

    it('tells players nothing and the panel that it is off', async () => {
      const channel = await channelOnAir('News 24');
      expect((await watch(channel.slug)).p2p).toBeNull();
      expect((await http().get('/v1/p2p').set(admin()).expect(200)).body).toEqual({ state: 'off' });
      expect(bearers).toEqual([]);
      // And there is nobody whose reports would count.
      await http()
        .post('/v1/catalog/delivery/report')
        .send({ token: 'x', kind: 'live', fromServers: 1, fromViewers: 1, toViewers: 0 })
        .expect(403);
    });
  });

  describe('with a tracker', () => {
    beforeAll(() =>
      start({
        P2P_TRACKER_URL: 'wss://stream.example.com/tracker/',
        P2P_TRACKER_INTERNAL_URL: trackerUrl,
        P2P_TRACKER_SECRET: SECRET,
      }),
    );
    afterAll(() => testApp.close());

    it('gives a viewer the tracker with a token, and a swarm for what is watched', async () => {
      const news = await channelOnAir('News 24');
      const sport = await channelOnAir('Sport 1');

      const first = await watch(news.slug);
      const [address, token] = (first.p2p?.trackerUrl ?? '').split('?token=') as [string, string];
      expect(address).toBe('wss://stream.example.com/tracker');
      // The token lets into the tracker, for as long as the address of the video works.
      expect(verifyPlaybackToken(token, 'tracker', SECRET).valid).toBe(true);
      expect(verifyPlaybackToken(token, 'tracker-stats', SECRET).valid).toBe(false);
      expect(token.split('.')[0]).toBe(first.url.split('/')[4]?.split('.')[0]);

      // Everyone who watches the same channel is in the same swarm.
      expect(first.p2p?.swarmId).toMatch(/^[0-9a-f]{40}$/);
      // Help for connecting: public STUN servers unless told otherwise, and no relay.
      expect(first.p2p).toMatchObject({
        iceServers: [
          { urls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'] },
        ],
      });
      // And the website learns where its pages have to be allowed to connect to.
      expect((await http().get('/v1/catalog/delivery').expect(200)).body.tracker).toBe(
        'wss://stream.example.com',
      );
      expect((await watch(news.slug)).p2p?.swarmId).toBe(first.p2p?.swarmId);
      expect((await watch(sport.slug)).p2p?.swarmId).not.toBe(first.p2p?.swarmId);
      // And nobody can tell the swarm from the channel.
      expect(first.p2p?.swarmId).not.toContain(news.id.replaceAll('-', '').slice(0, 12));
    });

    it('leaves admins out of it: a preview shares nothing', async () => {
      const channel = await channelOnAir('News 24');
      const preview = await http()
        .post(`/v1/channels/${channel.id}/playback`)
        .set(admin())
        .expect(200);
      expect(preview.body.p2p).toBeNull();
    });

    it('shows the panel how the tracker is doing', async () => {
      const shown = await http().get('/v1/p2p').set(admin()).expect(200);
      expect(shown.body).toEqual({
        state: 'running',
        trackerUrl: 'wss://stream.example.com/tracker',
        stats: STATS,
      });
      // Asked with a short-lived token, never with the secret itself.
      const sent = (bearers[0] ?? '').replace('Bearer ', '');
      expect(sent).not.toContain(SECRET);
      expect(verifyPlaybackToken(sent, 'tracker-stats', SECRET).valid).toBe(true);
    });

    it('says what is wrong when the tracker refuses or is away', async () => {
      answer = { status: 401, body: {} };
      const refused = (await http().get('/v1/p2p').set(admin()).expect(200)).body;
      expect(refused.state).toBe('unreachable');
      expect(refused.message).toMatch(/ONYX_TRACKER_SECRET differs/);

      answer = { status: 500, body: {} };
      const broken = (await http().get('/v1/p2p').set(admin()).expect(200)).body;
      expect(broken).toMatchObject({ state: 'unreachable' });
      expect(broken.message).toMatch(/it answered 500/);
    });

    it('adds up what players report, for those who were let watch', async () => {
      const channel = await channelOnAir('News 24');
      const token = ((await watch(channel.slug)).p2p?.trackerUrl ?? '').split('?token=')[1];
      const report = (body: Record<string, unknown>) =>
        http()
          .post('/v1/catalog/delivery/report')
          .send({ token, kind: 'live', fromServers: 0, fromViewers: 0, toViewers: 0, ...body });

      await report({ fromServers: 6000, fromViewers: 4000, toViewers: 1500 }).expect(204);
      await report({ fromServers: 1000, fromViewers: 3000 }).expect(204);
      await report({ kind: 'video', fromServers: 500 }).expect(204);
      // A report of nothing is not counted.
      await report({}).expect(204);

      const traffic = (await http().get('/v1/p2p/traffic').set(admin()).expect(200)).body;
      expect(traffic).toMatchObject({ range: '24h', hours: 24 });
      const sum = (points: number[][], at: number) =>
        points.reduce((total, point) => total + (point[at] as number), 0);
      expect([1, 2, 3, 4].map((at) => sum(traffic.live, at))).toEqual([7000, 7000, 1500, 2]);
      expect([1, 2, 3, 4].map((at) => sum(traffic.video, at))).toEqual([500, 0, 0, 1]);
      expect((await testApp.prisma.sharingHour.findMany()).length).toBeGreaterThanOrEqual(2);
    });

    it('takes no reports from strangers, and none that cannot be true', async () => {
      const channel = await channelOnAir('News 24');
      const token = ((await watch(channel.slug)).p2p?.trackerUrl ?? '').split('?token=')[1];
      const body = { token, kind: 'live', fromServers: 1, fromViewers: 1, toViewers: 1 };
      const post = (change: Record<string, unknown>) =>
        http()
          .post('/v1/catalog/delivery/report')
          .send({ ...body, ...change });

      await post({ token: '4102444800.' + 'A'.repeat(43) }).expect(403);
      await post({ token: 'nonsense' }).expect(403);
      await post({ fromViewers: 5 * 1024 ** 3 }).expect(400);
      await post({ fromServers: -1 }).expect(400);
      await post({ kind: 'radio' }).expect(400);
      await http().post('/v1/catalog/delivery/report').send({}).expect(400);

      const traffic = (await http().get('/v1/p2p/traffic').set(admin()).expect(200)).body;
      expect(traffic.live).toEqual([]);
      await http().get('/v1/p2p/traffic').expect(401);
    });

    it('lets players share until the viewer says otherwise', async () => {
      const channel = await channelOnAir('News 24');
      expect((await watch(channel.slug)).p2p).toMatchObject({ sharingDefault: true });
    });

    it('is closed to those who have nothing to do with delivery', async () => {
      await http().get('/v1/p2p').expect(401);
    });
  });

  describe('with a tracker that is not there', () => {
    beforeAll(() =>
      start({
        P2P_TRACKER_URL: 'wss://stream.example.com/tracker',
        P2P_TRACKER_INTERNAL_URL: 'http://127.0.0.1:1',
        P2P_TRACKER_SECRET: SECRET,
        P2P_VIEWER_DEFAULT: 'off',
        P2P_STUN_URLS: '',
        P2P_TURN_URLS: 'turn:turn.example.com:3478, turns:turn.example.com:5349?transport=tcp',
        P2P_TURN_SECRET: 'the-secret-of-the-turn-server',
      }),
    );
    afterAll(() => testApp.close());

    it('gives players a relay with a password that runs out with the video', async () => {
      const channel = await channelOnAir('Sport 1');
      const playback = await watch(channel.slug);
      const expiry = playback.url.split('/')[4]?.split('.')[0] as string;
      expect(playback.p2p?.iceServers).toEqual([
        {
          urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349?transport=tcp'],
          username: expiry,
          credential: createHmac('sha1', 'the-secret-of-the-turn-server')
            .update(expiry)
            .digest('base64'),
        },
      ]);
    });

    it('still lets viewers watch, and tells the panel', async () => {
      const channel = await channelOnAir('News 24');
      // Players are told about the tracker anyway: they play without it when it is away.
      // Here the operator decided that viewers switch sharing on themselves.
      expect((await watch(channel.slug)).p2p).toMatchObject({ sharingDefault: false });
      const shown = (await http().get('/v1/p2p').set(admin()).expect(200)).body;
      expect(shown.state).toBe('unreachable');
      expect(shown.message).toMatch(/cannot be reached/);
    });
  });
});
