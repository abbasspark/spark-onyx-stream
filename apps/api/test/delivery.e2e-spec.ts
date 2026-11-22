// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of delivery through edge servers: managing them, what an
// agent says and fetches, and which viewers are sent to an edge.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { DeliveryModule } from '../src/delivery/delivery.module.js';
import { edgeSigningKey, hashEdgeSecret } from '../src/delivery/edge-credentials.js';
import { LiveModule } from '../src/live/live.module.js';
import { verifyPlaybackToken } from '../src/playback/playback-token.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const SIGNING_SECRET = 'b'.repeat(64);
const EDITOR = {
  email: 'editor@example.com',
  displayName: 'Eddie Editor',
  password: 'editor-password-123',
  role: 'EDITOR',
};

/** A heartbeat as an agent sends it. */
function report(more: Record<string, unknown> = {}) {
  return {
    protocol: 1,
    version: '0.1.0',
    hostname: 'edge-fra-1',
    startedAt: '2026-11-22T10:00:00.000Z',
    counters: { requests: 0, bytesSent: 0, hits: 0, misses: 0, refused: 0, originErrors: 0 },
    activeRequests: 0,
    cache: { bytes: 0, files: 0, limitBytes: 50 * 1024 ** 3 },
    system: { cpus: 4, load1: 0.5, diskFreeBytes: 80 * 1024 ** 3, diskTotalBytes: 100 * 1024 ** 3 },
    ...more,
  };
}

describe.skipIf(!TEST_DATABASE_URL)('Delivery through edges (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);
  const asEdge = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createEdge(body: Record<string, unknown> = {}) {
    const created = await http()
      .post('/v1/edges')
      .set(admin())
      .send({ name: 'Frankfurt 1', publicUrl: 'https://edge1.example.com', ...body })
      .expect(201);
    return created.body as { edge: { id: string }; token: string };
  }
  const beat = (token: string, more: Record<string, unknown> = {}) =>
    http().post('/v1/edge-agent/heartbeat').set(asEdge(token)).send(report(more));

  /** Creates a published channel and puts it on air as a live process would. */
  async function channelOnAir() {
    const created = await http()
      .post('/v1/channels')
      .set(admin())
      .send({ name: 'News 24', source: 'https://cdn.example.com/live.m3u8', published: true })
      .expect(201);
    await testApp.prisma.channel.update({
      where: { id: created.body.id },
      data: { enabled: true, status: 'RUNNING', startedAt: new Date() },
    });
    return created.body as { id: string; slug: string };
  }
  const watch = async (slug: string) =>
    (await http().post(`/v1/catalog/channels/${slug}/playback`).expect(200)).body.url as string;

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-delivery-'));
    testApp = await createTestApp([AdminsModule, AssetsModule, LiveModule, DeliveryModule], {
      CATALOG_PLAYBACK: 'open',
      LIVE_PATH: path.join(workDirectory, 'live'),
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      INGEST_API_URL: 'http://127.0.0.1:1',
    });
  });
  afterAll(async () => {
    await testApp.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    testApp.redis.clear();
    ownerToken = await testApp.setupOwner();
  });

  describe('managing edges', () => {
    it('adds an edge and shows its token once', async () => {
      const created = await http()
        .post('/v1/edges')
        .set(admin())
        .send({
          name: '  Frankfurt 1 ',
          publicUrl: 'HTTPS://Edge1.Example.com/',
          location: 'Frankfurt',
        })
        .expect(201);

      expect(created.body.token).toMatch(/^onyx-edge\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
      expect(created.body.edge).toMatchObject({
        name: 'Frankfurt 1',
        publicUrl: 'https://edge1.example.com',
        location: 'Frankfurt',
        enabled: true,
        weight: 10,
        serveVideo: true,
        serveLive: true,
        status: 'NEVER_CONNECTED',
        lastSeenAt: null,
        bytesServed: '0',
        requestsServed: '0',
        now: null,
        samples: [],
      });

      const listed = await http().get('/v1/edges').set(admin()).expect(200);
      expect(listed.body).toHaveLength(1);
      expect(JSON.stringify(listed.body)).not.toContain(created.body.token.split('.')[2]);
      expect(listed.body[0].secretHash).toBeUndefined();

      const stored = await testApp.prisma.edgeServer.findFirstOrThrow();
      expect(stored.secretHash).toBe(hashEdgeSecret(created.body.token.split('.')[2]));
    });

    it('refuses addresses that are not an origin, and twins', async () => {
      for (const publicUrl of [
        'edge1.example.com',
        'ftp://edge1.example.com',
        'https://edge1.example.com/video',
        '',
      ]) {
        const refused = await http()
          .post('/v1/edges')
          .set(admin())
          .send({ name: 'Edge', publicUrl })
          .expect(400);
        expect(refused.body.issues[0].field).toBe('publicUrl');
      }
      await http()
        .post('/v1/edges')
        .set(admin())
        .send({ name: 'Edge', publicUrl: 'https://e.example.com', weight: 0 })
        .expect(400);

      await createEdge();
      const twinName = await http()
        .post('/v1/edges')
        .set(admin())
        .send({ name: 'Frankfurt 1', publicUrl: 'https://edge2.example.com' })
        .expect(409);
      expect(twinName.body.message).toBe('Another edge server has this name or this address');
      await http()
        .post('/v1/edges')
        .set(admin())
        .send({ name: 'Frankfurt 2', publicUrl: 'https://edge1.example.com' })
        .expect(409);
    });

    it('changes and removes an edge, and writes both to the audit log', async () => {
      const { edge, token } = await createEdge();
      await beat(token).expect(200);

      const changed = await http()
        .patch(`/v1/edges/${edge.id}`)
        .set(admin())
        .send({ weight: 40, enabled: false, location: '' })
        .expect(200);
      expect(changed.body).toMatchObject({
        weight: 40,
        enabled: false,
        location: null,
        status: 'DISABLED',
      });
      await http().patch(`/v1/edges/${edge.id}`).set(admin()).send({}).expect(400);

      await http().delete(`/v1/edges/${edge.id}`).set(admin()).expect(204);
      await http().get(`/v1/edges/${edge.id}`).set(admin()).expect(404);
      // Its agent is locked out with it.
      await beat(token).expect(401);

      const actions = (await testApp.prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } }))
        .map((entry) => entry.action)
        .filter((action) => action.startsWith('edge.'));
      expect(actions).toEqual(['edge.create', 'edge.update', 'edge.delete']);
    });

    it('is closed to editors, who have nothing to do with servers', async () => {
      await http().post('/v1/admins').set(admin()).send(EDITOR).expect(201);
      const login = await http()
        .post('/v1/auth/login')
        .send({ email: EDITOR.email, password: EDITOR.password })
        .expect(200);
      const editor = testApp.bearer(login.body.token as string);

      await http().get('/v1/edges').set(editor).expect(403);
      await http()
        .post('/v1/edges')
        .set(editor)
        .send({ name: 'E', publicUrl: 'https://e.example.com' })
        .expect(403);
      await http().get('/v1/edges').expect(401);
    });
  });

  describe('the agent', () => {
    it('signs in with its token and gets the key for its viewers', async () => {
      const { edge, token } = await createEdge();

      const answer = await beat(token).expect(200);
      const stored = await testApp.prisma.edgeServer.findUniqueOrThrow({ where: { id: edge.id } });
      expect(answer.body).toEqual({
        edge: { id: edge.id, name: 'Frankfurt 1', enabled: true },
        signingKey: edgeSigningKey(SIGNING_SECRET, edge.id, stored.secretHash),
        heartbeatSeconds: 10,
        protocol: 1,
      });
      // Not the secret of the platform, and not that of another edge.
      expect(answer.body.signingKey).not.toBe(SIGNING_SECRET);
      const other = await createEdge({ name: 'Paris', publicUrl: 'https://edge2.example.com' });
      expect((await beat(other.token).expect(200)).body.signingKey).not.toBe(
        answer.body.signingKey,
      );
    });

    it('is refused without a token, with a wrong one and with that of an admin', async () => {
      const { token } = await createEdge();
      const [prefix, id] = token.split('.');

      await http().post('/v1/edge-agent/heartbeat').send(report()).expect(401);
      await beat(`${prefix}.${id}.${'A'.repeat(43)}`).expect(401);
      await beat('not-a-token').expect(401);
      await beat(ownerToken).expect(401);
      await http().get(`/v1/edge-agent/assets/${id}`).expect(401);
      // And the token of an edge opens nothing else.
      await http().get('/v1/edges').set(asEdge(token)).expect(401);
    });

    it('shows as online with what it reports', async () => {
      const { edge, token } = await createEdge();
      await beat(token).expect(200);
      await beat(token, {
        counters: {
          requests: 120,
          bytesSent: 50_000_000,
          hits: 90,
          misses: 30,
          refused: 2,
          originErrors: 1,
        },
        activeRequests: 7,
        cache: { bytes: 4_000_000_000, files: 900, limitBytes: 50 * 1024 ** 3 },
      }).expect(200);

      const shown = (await http().get(`/v1/edges/${edge.id}`).set(admin()).expect(200)).body;
      expect(shown).toMatchObject({
        status: 'ONLINE',
        version: '0.1.0',
        hostname: 'edge-fra-1',
        bytesServed: '50000000',
        requestsServed: '120',
        now: {
          activeRequests: 7,
          hitRatio: 0.75,
          refused: 2,
          originErrors: 1,
          cache: { bytes: 4_000_000_000, files: 900 },
          system: { cpus: 4, load1: 0.5 },
        },
      });
      expect(shown.lastSeenAt).not.toBeNull();
      expect(shown.now.bitsPerSecond).toBeGreaterThan(0);
      expect(shown.samples).toHaveLength(2);
      expect(shown.samples[1][1]).toBe(shown.now.bitsPerSecond);
    });

    it('adds up what was delivered across a restart of the agent', async () => {
      const { edge, token } = await createEdge();
      const counters = (bytesSent: number, requests: number) => ({
        counters: { requests, bytesSent, hits: 0, misses: 0, refused: 0, originErrors: 0 },
      });
      await beat(token, counters(1000, 10)).expect(200);
      await beat(token, counters(5000, 50)).expect(200);
      // Started again: its counters begin at nothing.
      await beat(token, { ...counters(300, 3), startedAt: '2026-11-22T11:00:00.000Z' }).expect(200);

      const shown = (await http().get(`/v1/edges/${edge.id}`).set(admin()).expect(200)).body;
      expect(shown).toMatchObject({ bytesServed: '5300', requestsServed: '53' });
    });

    it('refuses an agent that is too old, and reports that say nothing', async () => {
      const { edge, token } = await createEdge();
      const old = await beat(token, { protocol: 0 });
      expect(old.status).toBe(400);
      await beat(token, { version: '' }).expect(400);
      await beat(token, { counters: { requests: -1 } }).expect(400);

      const shown = (await http().get(`/v1/edges/${edge.id}`).set(admin()).expect(200)).body;
      expect(shown.status).toBe('NEVER_CONNECTED');
    });

    it('is locked out when its token is replaced', async () => {
      const { edge, token } = await createEdge();
      const before = (await beat(token).expect(200)).body.signingKey as string;

      const replaced = await http().post(`/v1/edges/${edge.id}/token`).set(admin()).expect(200);
      expect(replaced.body.token).not.toBe(token);
      // Until an agent connects with the new token, the edge gets no viewers.
      expect(replaced.body.edge.status).toBe('NEVER_CONNECTED');
      await beat(token).expect(401);
      const after = (await beat(replaced.body.token).expect(200)).body.signingKey as string;
      // Addresses signed for the old agent are worth nothing to the new one.
      expect(after).not.toBe(before);
    });

    it('fetches the files of a running channel', async () => {
      const { token } = await createEdge();
      const channel = await channelOnAir();
      const directory = path.join(workDirectory, 'live', channel.id);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'index.m3u8'), '#EXTM3U\nseg-1.m4s\n');
      await writeFile(path.join(directory, 'seg-1.m4s'), 'segment');

      const playlist = await http()
        .get(`/v1/edge-agent/live/${channel.id}/index.m3u8`)
        .set(asEdge(token))
        .expect(200);
      expect(playlist.headers['content-type']).toContain('application/vnd.apple.mpegurl');
      expect(playlist.text).toContain('seg-1.m4s');
      const segment = await http()
        .get(`/v1/edge-agent/live/${channel.id}/seg-1.m4s`)
        .set(asEdge(token))
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect((segment.body as Buffer).toString()).toBe('segment');

      await http()
        .get(`/v1/edge-agent/live/${channel.id}/seg-2.m4s`)
        .set(asEdge(token))
        .expect(404);
      await http()
        .get(`/v1/edge-agent/live/${channel.id}/ffmpeg.pid`)
        .set(asEdge(token))
        .expect(404);
      await http().get(`/v1/edge-agent/live/${channel.id}/index.m3u8`).expect(401);
    });

    it('fetches the files of a video and learns its version', async () => {
      const { token } = await createEdge();
      const created = await http()
        .post('/v1/assets')
        .set(admin())
        .send({ title: 'Film' })
        .expect(201);
      const assetId = created.body.asset.id as string;
      const readyAt = new Date('2026-11-22T09:00:00.000Z');

      // Not processed yet: there is nothing to deliver.
      await http().get(`/v1/edge-agent/assets/${assetId}`).set(asEdge(token)).expect(404);

      await testApp.prisma.asset.update({
        where: { id: assetId },
        data: { status: 'READY', manifestPath: `assets/${assetId}/hls/master.m3u8`, readyAt },
      });
      const folder = path.join(workDirectory, 'storage', 'assets', assetId, 'hls');
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, 'master.m3u8'), '#EXTM3U\nv0/index.m3u8\n');

      const version = await http()
        .get(`/v1/edge-agent/assets/${assetId}`)
        .set(asEdge(token))
        .expect(200);
      expect(version.body).toEqual({ version: String(readyAt.getTime()) });

      const manifest = await http()
        .get(`/v1/edge-agent/media/${assetId}/hls/master.m3u8`)
        .set(asEdge(token))
        .expect(200);
      expect(manifest.text).toContain('v0/index.m3u8');
      // Only generated files, never the source or anything outside.
      await http()
        .get(`/v1/edge-agent/media/${assetId}/sources/film.mkv`)
        .set(asEdge(token))
        .expect(404);
      await http()
        .get(`/v1/edge-agent/media/${assetId}/hls/missing.m4s`)
        .set(asEdge(token))
        .expect(404);
      await http().get(`/v1/edge-agent/assets/not-an-id`).set(asEdge(token)).expect(404);
    });
  });

  describe('sending viewers to an edge', () => {
    it('gives a viewer the address of an edge that is online, signed for that edge', async () => {
      const channel = await channelOnAir();
      // No edge yet: the main server delivers.
      expect(await watch(channel.slug)).toMatch(new RegExp(`^/v1/live/${channel.id}/`));

      const { edge, token } = await createEdge();
      // Added, but its agent has not connected.
      expect(await watch(channel.slug)).toMatch(/^\/v1\/live\//);

      const key = (await beat(token).expect(200)).body.signingKey as string;
      const url = await watch(channel.slug);
      expect(url).toMatch(
        new RegExp(`^https://edge1\\.example\\.com/v1/live/${channel.id}/[^/]+/index\\.m3u8$`),
      );
      const playbackToken = url.split('/')[6] as string;
      expect(verifyPlaybackToken(playbackToken, channel.id, key).valid).toBe(true);
      // The main server would not accept it, and neither would another edge.
      expect(verifyPlaybackToken(playbackToken, channel.id, SIGNING_SECRET).valid).toBe(false);
      await http().get(`/v1/live/${channel.id}/${playbackToken}/index.m3u8`).expect(404);
      expect(edge.id).toBeTruthy();
    });

    it('keeps admins on the main server', async () => {
      const channel = await channelOnAir();
      const { token } = await createEdge();
      await beat(token).expect(200);

      const preview = await http()
        .post(`/v1/channels/${channel.id}/playback`)
        .set(admin())
        .expect(200);
      expect(preview.body.url).toMatch(/^\/v1\/live\//);
    });

    it('stops using an edge that is switched off, went silent or does not carry live', async () => {
      const channel = await channelOnAir();
      const { edge, token } = await createEdge();
      await beat(token).expect(200);
      const viaEdge = /^https:\/\/edge1\.example\.com\//;
      const change = (body: Record<string, unknown>) =>
        http().patch(`/v1/edges/${edge.id}`).set(admin()).send(body).expect(200);
      expect(await watch(channel.slug)).toMatch(viaEdge);

      await change({ enabled: false });
      expect(await watch(channel.slug)).not.toMatch(viaEdge);
      await change({ enabled: true });
      expect(await watch(channel.slug)).toMatch(viaEdge);

      await change({ serveLive: false });
      expect(await watch(channel.slug)).not.toMatch(viaEdge);
      await change({ serveLive: true });

      // Silent for a minute.
      await testApp.prisma.edgeServer.update({
        where: { id: edge.id },
        data: { lastSeenAt: new Date(Date.now() - 60_000) },
      });
      await change({ weight: 11 });
      expect(await watch(channel.slug)).not.toMatch(viaEdge);
      const shown = (await http().get(`/v1/edges/${edge.id}`).set(admin()).expect(200)).body;
      expect(shown).toMatchObject({ status: 'OFFLINE', now: null });
    });

    it('tells the website which addresses video may come from', async () => {
      expect((await http().get('/v1/catalog/delivery').expect(200)).body).toEqual({ origins: [] });
      await createEdge();
      await createEdge({ name: 'Paris', publicUrl: 'https://edge2.example.com', enabled: false });

      const told = await http().get('/v1/catalog/delivery').expect(200);
      // The paused one too: it may take viewers before a page is loaded again.
      expect(told.body).toEqual({
        origins: ['https://edge1.example.com', 'https://edge2.example.com'],
      });
    });
  });
});
