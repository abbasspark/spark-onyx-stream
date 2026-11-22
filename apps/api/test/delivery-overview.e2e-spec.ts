// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the delivery overview: what the gateway, the edges and
// the viewers each delivered, brought together. A small HTTP server stands in
// for the gateway and its count.
//
// Skipped unless TEST_DATABASE_URL is set.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AdminsModule } from '../src/admins/admins.module.js';
import { DeliveryModule, DeliverySchedulerModule } from '../src/delivery/delivery.module.js';
import { ORIGIN_POLL_LOCK, OriginTrafficService } from '../src/delivery/origin-traffic.service.js';
import { LiveModule } from '../src/live/live.module.js';
import { verifyPlaybackToken } from '../src/playback/playback-token.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const SIGNING_SECRET = 'b'.repeat(64);

describe.skipIf(!TEST_DATABASE_URL)('Delivery overview (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let gateway: Server;
  let gatewayUrl: string;
  let counted: unknown;
  let status: number;
  let bearers: string[];

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);
  const count = (since: number, video: number, live: number) => ({
    since,
    video: { bytes: video, requests: Math.round(video / 1000) },
    live: { bytes: live, requests: Math.round(live / 1000) },
  });
  /** Asks the gateway as the scheduler does, without waiting half a minute. */
  const poll = async () => {
    await testApp.redis.del(ORIGIN_POLL_LOCK);
    await testApp.app.get(OriginTrafficService).poll();
  };
  const overview = async (range = '24h') =>
    (await http().get('/v1/edges/overview').query({ range }).set(admin()).expect(200)).body as {
      gatewayCounted: boolean;
      hours: number;
      points: number[][];
    };
  const sum = (points: number[][], at: number) =>
    points.reduce((total, point) => total + (point[at] as number), 0);

  beforeAll(async () => {
    gateway = createServer((request, response) => {
      bearers.push(request.headers.authorization ?? '');
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(counted));
    });
    await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
    gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
    testApp = await createTestApp(
      [AdminsModule, LiveModule, DeliveryModule, DeliverySchedulerModule],
      { GATEWAY_INTERNAL_URL: gatewayUrl, INGEST_API_URL: 'http://127.0.0.1:1' },
    );
  });
  afterAll(async () => {
    await testApp.close();
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    testApp.redis.clear();
    ownerToken = await testApp.setupOwner();
    status = 200;
    bearers = [];
  });

  it('stores what the gateway sent since it was last asked', async () => {
    counted = count(1, 50_000, 8000);
    await poll();
    // The first answer is where counting starts: what came before could be from any hour.
    expect(sum((await overview()).points, 1)).toBe(0);

    counted = count(1, 80_000, 9000);
    await poll();
    counted = count(1, 80_000, 12_000);
    await poll();
    expect(sum((await overview()).points, 1)).toBe(30_000 + 1000 + 3000);

    // The gateway started again and counts from nothing.
    counted = count(2, 700, 0);
    await poll();
    expect(sum((await overview()).points, 1)).toBe(34_000 + 700);

    // Asked with a short-lived token, never with the secret itself.
    const sent = (bearers[0] ?? '').replace('Bearer ', '');
    expect(verifyPlaybackToken(sent, 'gateway-stats', SIGNING_SECRET).valid).toBe(true);
    const rows = await testApp.prisma.originTrafficHour.findMany();
    expect(rows.map((row) => row.kind).sort()).toEqual(['live', 'video']);
  });

  it('counts nothing twice when two schedulers ask at once', async () => {
    counted = count(1, 0, 0);
    await poll();
    counted = count(1, 5000, 0);
    await poll();
    // The second one finds the first still holding the turn.
    await testApp.app.get(OriginTrafficService).poll();
    expect(sum((await overview()).points, 1)).toBe(5000);
  });

  it('carries on when the gateway is away or talks nonsense', async () => {
    counted = count(1, 0, 0);
    await poll();
    status = 502;
    await poll();
    status = 200;
    counted = { hello: 'world' };
    await poll();
    counted = count(1, 2000, 0);
    await poll();
    expect(sum((await overview()).points, 1)).toBe(2000);
  });

  it('brings the main server, the edges and the viewers together, hour by hour', async () => {
    const edge = await http()
      .post('/v1/edges')
      .set(admin())
      .send({ name: 'Frankfurt 1', publicUrl: 'https://edge1.example.com' })
      .expect(201);
    const hour = (ago: number) => new Date((Math.floor(Date.now() / 3_600_000) - ago) * 3_600_000);
    await testApp.prisma.originTrafficHour.createMany({
      data: [
        { hour: hour(1), kind: 'video', bytes: 1000n },
        { hour: hour(1), kind: 'live', bytes: 500n },
        { hour: hour(30), kind: 'video', bytes: 7n },
      ],
    });
    await testApp.prisma.edgeTrafficHour.createMany({
      data: [{ edgeId: edge.body.edge.id, hour: hour(1), bytes: 8000n, fetchedBytes: 900n }],
    });
    await testApp.prisma.sharingHour.createMany({
      data: [
        { hour: hour(1), kind: 'live', fromServers: 3000n, fromViewers: 6000n },
        { hour: hour(0), kind: 'video', fromServers: 100n, fromViewers: 400n },
      ],
    });

    const day = await overview();
    expect(day).toMatchObject({ gatewayCounted: true, hours: 24 });
    const seconds = (ago: number) => Math.round(hour(ago).getTime() / 1000);
    expect(day.points).toEqual([
      [seconds(1), 1500, 8000, 900, 6000],
      [seconds(0), 0, 0, 0, 400],
    ]);
    expect(sum((await overview('7d')).points, 1)).toBe(1507);

    await http().get('/v1/edges/overview').query({ range: '1y' }).set(admin()).expect(400);
    await http().get('/v1/edges/overview').expect(401);
  });
});
