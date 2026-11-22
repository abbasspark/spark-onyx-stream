// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of P2P between viewers, as far as the main server is
// concerned: who is told about the tracker, and what the panel learns of it.
// A small HTTP server stands in for the tracker.
//
// Skipped unless TEST_DATABASE_URL is set.
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
      p2p: { trackerUrl: string; swarmId: string; stunUrls: string[] } | null;
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
      expect(first.p2p).toMatchObject({
        stunUrls: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'],
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
      }),
    );
    afterAll(() => testApp.close());

    it('still lets viewers watch, and tells the panel', async () => {
      const channel = await channelOnAir('News 24');
      // Players are told about the tracker anyway: they play without it when it is away.
      expect((await watch(channel.slug)).p2p).not.toBeNull();
      const shown = (await http().get('/v1/p2p').set(admin()).expect(200)).body;
      expect(shown.state).toBe('unreachable');
      expect(shown.message).toMatch(/cannot be reached/);
    });
  });
});
