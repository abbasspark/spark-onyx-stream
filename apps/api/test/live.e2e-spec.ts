// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of live channels: managing them, the signed delivery of
// their files, and a real FFmpeg process pulled from a local test stream.
//
// Skipped unless TEST_DATABASE_URL is set. The last part needs FFmpeg as well.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { ingestPassword } from '../src/live/ingest.js';
import { LiveModule, LiveSupervisorModule } from '../src/live/live.module.js';
import { LiveSupervisorService } from '../src/live/live-supervisor.service.js';
import { createPlaybackToken } from '../src/playback/playback-token.js';
import { hasFfmpeg } from './support/processing-helpers.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const EDITOR = {
  email: 'editor@example.com',
  displayName: 'Eddie Editor',
  password: 'editor-password-123',
  role: 'EDITOR',
};
const UNKNOWN = '0190a0a0-0000-7000-8000-000000000000';
const SOURCE = 'https://user:secret@cdn.example.com/account/live.m3u8?token=abc';

describe.skipIf(!TEST_DATABASE_URL)('Live channels (e2e)', () => {
  let testApp: TestApp;
  let livePath: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);
  const create = (body: Record<string, unknown> = {}) =>
    http()
      .post('/v1/channels')
      .set(admin())
      .send({ name: 'News 24', source: SOURCE, ...body });

  beforeAll(async () => {
    livePath = await mkdtemp(path.join(tmpdir(), 'onyx-live-e2e-'));
    testApp = await createTestApp([AdminsModule, LiveModule], {
      LIVE_PATH: livePath,
      // Nothing listens there: tests must not depend on an ingest server on this machine.
      INGEST_API_URL: 'http://127.0.0.1:1',
    });
  });

  afterAll(async () => {
    await testApp.close();
    await rm(livePath, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    testApp.redis.clear();
    ownerToken = await testApp.setupOwner();
  });

  describe('managing channels', () => {
    it('creates a channel that is stopped, with a slug made from its name', async () => {
      const response = await create({ number: 7, description: ' Around the clock ' }).expect(201);
      expect(response.body).toMatchObject({
        name: 'News 24',
        slug: 'news-24',
        number: 7,
        description: 'Around the clock',
        enabled: false,
        status: 'STOPPED',
        statusMessage: null,
        startedAt: null,
        streams: null,
        health: null,
      });
    });

    it('never shows the secret parts of a source, and stores it encrypted', async () => {
      const created = await create().expect(201);
      expect(created.body.source).toBe('https://cdn.example.com/…/live.m3u8');

      const list = await http().get('/v1/channels').set(admin()).expect(200);
      expect(JSON.stringify(list.body)).not.toContain('secret');

      const stored = await testApp.prisma.channel.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.sourceEncrypted).not.toContain('secret');
      expect(stored.sourceEncrypted).not.toContain('cdn.example.com');

      const audit = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'channel.create' },
      });
      expect(JSON.stringify(audit.metadata)).not.toContain('secret');
    });

    it('gives the full source to those who may change channels', async () => {
      const created = await create().expect(201);
      const response = await http()
        .get(`/v1/channels/${created.body.id}/source`)
        .set(admin())
        .expect(200);
      expect(response.body).toEqual({ source: SOURCE });
    });

    it.each([
      ['a file of the server', 'file:///etc/passwd'],
      ['a plain path', '/etc/passwd'],
      ['several files joined', 'concat:/etc/passwd|/etc/hosts'],
      ['another protocol', 'ftp://example.com/a.ts'],
    ])('refuses %s as a source', async (_name, source) => {
      const response = await create({ source }).expect(400);
      expect(response.body.issues[0].field).toBe('source');
    });

    it('lists channels by number, those without one last', async () => {
      await create({ name: 'Sports', number: 20 }).expect(201);
      await create({ name: 'Zebra' }).expect(201);
      await create({ name: 'Movies', number: 3 }).expect(201);
      await create({ name: 'Arts' }).expect(201);

      const list = await http().get('/v1/channels').set(admin()).expect(200);
      expect(list.body.map((channel: { name: string }) => channel.name)).toEqual([
        'Movies',
        'Sports',
        'Arts',
        'Zebra',
      ]);
    });

    it('keeps the names the website uses for its own pages free', async () => {
      const named = await create({ name: 'Guide' }).expect(201);
      expect(named.body.slug).toBe('guide-2');
      const asked = await create({ name: 'Other', slug: 'guide' }).expect(400);
      expect(asked.body.issues[0].field).toBe('slug');
    });

    it('gives two channels of the same name different slugs', async () => {
      await create().expect(201);
      const second = await create().expect(201);
      expect(second.body.slug).toBe('news-24-2');
    });

    it('refuses a number or a slug that is taken, and says which', async () => {
      const first = await create({ number: 5 }).expect(201);
      const other = await create({ name: 'Other' }).expect(201);

      const number = await create({ name: 'Sports', number: 5 }).expect(409);
      expect(number.body.message).toBe('Channel number 5 belongs to "News 24"');

      const slug = await http()
        .patch(`/v1/channels/${other.body.id}`)
        .set(admin())
        .send({ slug: 'news-24' })
        .expect(409);
      expect(slug.body.message).toBe('Another channel has this address name');

      // Saving a channel with its own number is no conflict.
      await http()
        .patch(`/v1/channels/${first.body.id}`)
        .set(admin())
        .send({ number: 5, name: 'News' })
        .expect(200);
    });

    it('changes a channel, and its source only when one is sent', async () => {
      const created = await create({ number: 1 }).expect(201);
      const before = await testApp.prisma.channel.findUniqueOrThrow({
        where: { id: created.body.id },
      });

      const renamed = await http()
        .patch(`/v1/channels/${created.body.id}`)
        .set(admin())
        .send({ name: 'World News', number: null })
        .expect(200);
      expect(renamed.body).toMatchObject({ name: 'World News', number: null, slug: 'news-24' });
      const unchanged = await testApp.prisma.channel.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(unchanged.sourceEncrypted).toBe(before.sourceEncrypted);

      const moved = await http()
        .patch(`/v1/channels/${created.body.id}`)
        .set(admin())
        .send({ source: 'rtmp://encoder.example.com/live/key-1' })
        .expect(200);
      expect(moved.body.source).toBe('rtmp://encoder.example.com/live/…');

      await http().patch(`/v1/channels/${created.body.id}`).set(admin()).send({}).expect(400);
      await http().patch(`/v1/channels/${UNKNOWN}`).set(admin()).send({ name: 'X' }).expect(404);
    });

    it('passes a channel through unless told otherwise', async () => {
      const created = await create().expect(201);
      expect(created.body).toMatchObject({ mode: 'COPY', qualities: [], outputs: null });

      // Qualities mean nothing for a channel that is passed through.
      const ignored = await create({ name: 'Other', qualities: [720] }).expect(201);
      expect(ignored.body.qualities).toEqual([]);
    });

    it('creates a transcoded channel with the chosen qualities, best first', async () => {
      const usual = await create({ mode: 'TRANSCODE' }).expect(201);
      expect(usual.body).toMatchObject({ mode: 'TRANSCODE', qualities: [1080, 720, 480] });

      const chosen = await create({
        name: 'Other',
        mode: 'TRANSCODE',
        qualities: [360, 720, 360],
      }).expect(201);
      expect(chosen.body.qualities).toEqual([720, 360]);
      // What comes out is known once a live process has seen the source.
      expect(chosen.body.outputs).toBeNull();

      const odd = await create({ name: 'Odd', mode: 'TRANSCODE', qualities: [700] }).expect(400);
      expect(odd.body.issues[0].field).toBe('qualities.0');
      await create({ name: 'None', mode: 'TRANSCODE', qualities: [] }).expect(400);
    });

    it('shows the qualities that fit the source', async () => {
      const created = await create({ mode: 'TRANSCODE', qualities: [1080, 720, 480] }).expect(201);
      await testApp.prisma.channel.update({
        where: { id: created.body.id },
        data: { videoCodec: 'mpeg2video', width: 720, height: 576, frameRate: 25 },
      });

      const response = await http().get(`/v1/channels/${created.body.id}`).set(admin()).expect(200);
      expect(response.body.outputs).toEqual([
        { name: '576p', height: 576, videoKbps: 1950 },
        { name: '480p', height: 480, videoKbps: 1400 },
      ]);
    });

    it('starts a channel over when its processing changes, and only then', async () => {
      const created = await create({ start: true }).expect(201);
      const id = created.body.id as string;
      const token = async () =>
        (await testApp.prisma.channel.findUniqueOrThrow({ where: { id } })).restartToken;
      const patch = (body: Record<string, unknown>) =>
        http().patch(`/v1/channels/${id}`).set(admin()).send(body).expect(200);

      await patch({ name: 'Renamed' });
      expect(await token()).toBe(0);

      const transcoded = await patch({ mode: 'TRANSCODE' });
      expect(transcoded.body).toMatchObject({ mode: 'TRANSCODE', qualities: [1080, 720, 480] });
      expect(await token()).toBe(1);

      await patch({ qualities: [480, 720, 1080] });
      expect(await token()).toBe(1);
      await patch({ qualities: [720, 480] });
      expect(await token()).toBe(2);

      const back = await patch({ mode: 'COPY' });
      expect(back.body.qualities).toEqual([]);
      expect(await token()).toBe(3);
    });

    it('lets viewers go back in time for a chosen while, which restarts a running channel', async () => {
      const created = await create({ start: true }).expect(201);
      const id = created.body.id as string;
      expect(created.body.dvrMinutes).toBe(0);
      const token = async () =>
        (await testApp.prisma.channel.findUniqueOrThrow({ where: { id } })).restartToken;

      const changed = await http()
        .patch(`/v1/channels/${id}`)
        .set(admin())
        .send({ dvrMinutes: 120 })
        .expect(200);
      expect(changed.body.dvrMinutes).toBe(120);
      expect(await token()).toBe(1);

      await http().patch(`/v1/channels/${id}`).set(admin()).send({ dvrMinutes: 120 }).expect(200);
      expect(await token()).toBe(1);

      const odd = await http()
        .patch(`/v1/channels/${id}`)
        .set(admin())
        .send({ dvrMinutes: 45 })
        .expect(400);
      expect(odd.body.issues[0].field).toBe('dvrMinutes');
      await create({ name: 'Other', dvrMinutes: 30 }).expect(201);
    });

    it('deletes a channel', async () => {
      const created = await create().expect(201);
      await http().delete(`/v1/channels/${created.body.id}`).set(admin()).expect(204);
      await http().get(`/v1/channels/${created.body.id}`).set(admin()).expect(404);
      await http().delete(`/v1/channels/${created.body.id}`).set(admin()).expect(404);
    });

    it('lets editors look and nothing else', async () => {
      const created = await create().expect(201);
      await http().post('/v1/admins').set(admin()).send(EDITOR).expect(201);
      const editor = testApp.bearer(await testApp.login(EDITOR.email, EDITOR.password));

      await http().get('/v1/channels').set(editor).expect(200);
      await http().get(`/v1/channels/${created.body.id}`).set(editor).expect(200);
      await http().post(`/v1/channels/${created.body.id}/playback`).set(editor).expect(200);

      await http().get(`/v1/channels/${created.body.id}/source`).set(editor).expect(403);
      await http().post('/v1/channels').set(editor).send({ name: 'X', source: SOURCE }).expect(403);
      await http().post(`/v1/channels/${created.body.id}/start`).set(editor).expect(403);
      await http().post('/v1/channels/probe').set(editor).send({ source: SOURCE }).expect(403);
      await http().delete(`/v1/channels/${created.body.id}`).set(editor).expect(403);
      await http().get('/v1/channels').expect(401);
    });
  });

  describe('channels pushed by an encoder', () => {
    const auth = (body: Record<string, unknown>) => http().post('/v1/live/ingest/auth').send(body);
    const publish = (key: string) =>
      auth({ action: 'publish', path: `live/${key}`, protocol: 'rtmp', user: '', password: '' });
    const createPushed = (body: Record<string, unknown> = {}) =>
      http()
        .post('/v1/channels')
        .set(admin())
        .send({ name: 'Studio', ingest: 'PUSH', ...body });
    const encoderOf = async (id: string) =>
      (await http().get(`/v1/channels/${id}/encoder`).set(admin()).expect(200)).body as {
        streamKey: string;
      };

    it('gets a stream key instead of an address', async () => {
      const created = await createPushed().expect(201);
      expect(created.body).toMatchObject({ ingest: 'PUSH', source: '', status: 'STOPPED' });
      expect(JSON.stringify(created.body)).not.toContain('streamKey');

      const encoder = await encoderOf(created.body.id);
      expect(encoder).toEqual({
        streamKey: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
        rtmpServer: null,
        rtmpUrl: null,
        srtUrl: null,
      });

      const stored = await testApp.prisma.channel.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.sourceEncrypted).toBeNull();
      expect(stored.streamKeyEncrypted).not.toContain(encoder.streamKey);
      expect(stored.streamKeyHash).not.toContain(encoder.streamKey);
    });

    it('needs an address for a pulled channel and takes none for a pushed one', async () => {
      const missing = await http()
        .post('/v1/channels')
        .set(admin())
        .send({ name: 'No source' })
        .expect(400);
      expect(missing.body.issues[0]).toEqual({
        field: 'source',
        message: 'Enter the address of the source',
      });
      await createPushed({ source: SOURCE }).expect(400);
    });

    it('lets an encoder publish with its key while the channel is switched on', async () => {
      const created = await createPushed().expect(201);
      const { streamKey } = await encoderOf(created.body.id);

      // Switched off: the encoder is refused, which tells its operator at once.
      await publish(streamKey).expect(401);

      await http().post(`/v1/channels/${created.body.id}/start`).set(admin()).expect(200);
      await publish(streamKey).expect(204);

      await publish(`${streamKey}x`).expect(401);
      await publish('short').expect(401);
      await auth({ action: 'publish', path: `other/${streamKey}` }).expect(401);
      await auth({}).expect(401);
      await auth({ action: 'publish', path: 42 }).expect(401);
    });

    it('keeps reading streams and the control API to the platform itself', async () => {
      const created = await createPushed({ start: true }).expect(201);
      const { streamKey } = await encoderOf(created.body.id);
      const password = ingestPassword('b'.repeat(64));

      for (const action of ['read', 'playback', 'api', 'metrics', 'pprof']) {
        const request = { action, path: `live/${streamKey}` };
        await auth({ ...request, user: '', password: '' }).expect(401);
        await auth({ ...request, user: 'onyx', password: 'guess' }).expect(401);
        // The stream key opens publishing and nothing else.
        await auth({ ...request, user: 'onyx', password: streamKey }).expect(401);
        await auth({ ...request, user: 'onyx', password }).expect(204);
      }
      // The password of the platform is no stream key.
      await auth({
        action: 'publish',
        path: 'live/unknownunknownunknown',
        user: 'onyx',
        password,
      }).expect(401);
    });

    it('replaces a stream key, after which the old one is dead', async () => {
      const created = await createPushed({ start: true }).expect(201);
      const id = created.body.id as string;
      const before = await encoderOf(id);

      const replaced = await http().post(`/v1/channels/${id}/stream-key`).set(admin()).expect(200);
      expect(replaced.body.streamKey).not.toBe(before.streamKey);
      expect(await encoderOf(id)).toEqual(replaced.body);

      await publish(before.streamKey).expect(401);
      await publish(replaced.body.streamKey).expect(204);

      const audit = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'channel.stream-key' },
      });
      expect(JSON.stringify(audit.metadata)).not.toContain(replaced.body.streamKey);
      expect(audit.metadata).toMatchObject({ source: 'encoder' });
    });

    it('has no stream key for a pulled channel', async () => {
      const pulled = await create().expect(201);
      await http().get(`/v1/channels/${pulled.body.id}/encoder`).set(admin()).expect(400);
      await http().post(`/v1/channels/${pulled.body.id}/stream-key`).set(admin()).expect(400);
      await http().get(`/v1/channels/${UNKNOWN}/encoder`).set(admin()).expect(404);
    });

    it('can be turned into a pulled channel and back', async () => {
      const created = await createPushed({ start: true }).expect(201);
      const id = created.body.id as string;
      const first = await encoderOf(id);
      const patch = (body: Record<string, unknown>) =>
        http().patch(`/v1/channels/${id}`).set(admin()).send(body);

      // A pulled channel needs an address.
      await patch({ ingest: 'PULL' }).expect(400);
      const pulled = await patch({ ingest: 'PULL', source: SOURCE }).expect(200);
      expect(pulled.body).toMatchObject({
        ingest: 'PULL',
        source: 'https://cdn.example.com/…/live.m3u8',
      });
      await publish(first.streamKey).expect(401);

      const pushed = await patch({ ingest: 'PUSH' }).expect(200);
      expect(pushed.body).toMatchObject({ ingest: 'PUSH', source: '' });
      const second = await encoderOf(id);
      expect(second.streamKey).not.toBe(first.streamKey);
      await publish(second.streamKey).expect(204);

      // Renaming a pushed channel keeps its key.
      await patch({ name: 'Studio B' }).expect(200);
      expect((await encoderOf(id)).streamKey).toBe(second.streamKey);
    });

    it('keeps stream keys from those who may only look', async () => {
      const created = await createPushed().expect(201);
      await http().post('/v1/admins').set(admin()).send(EDITOR).expect(201);
      const editor = testApp.bearer(await testApp.login(EDITOR.email, EDITOR.password));

      await http().get(`/v1/channels/${created.body.id}`).set(editor).expect(200);
      await http().get(`/v1/channels/${created.body.id}/encoder`).set(editor).expect(403);
      await http().post(`/v1/channels/${created.body.id}/stream-key`).set(editor).expect(403);
    });
  });

  describe('starting and stopping', () => {
    it('records what is wanted and tells the live processes at once', async () => {
      const created = await create().expect(201);
      const id = created.body.id as string;

      const started = await http().post(`/v1/channels/${id}/start`).set(admin()).expect(200);
      expect(started.body).toMatchObject({ enabled: true, status: 'WAITING', restartCount: 0 });
      expect(testApp.redis.published.at(-1)).toEqual({ channel: 'onyx:live:nudge', message: id });

      const restarted = await http().post(`/v1/channels/${id}/restart`).set(admin()).expect(200);
      expect(restarted.body.enabled).toBe(true);
      const stored = await testApp.prisma.channel.findUniqueOrThrow({ where: { id } });
      expect(stored.restartToken).toBe(1);

      const stopped = await http().post(`/v1/channels/${id}/stop`).set(admin()).expect(200);
      expect(stopped.body).toMatchObject({ enabled: false, status: 'STOPPED', health: null });

      const actions = await testApp.prisma.auditLog.findMany({
        where: { entityId: id },
        orderBy: { createdAt: 'asc' },
      });
      expect(actions.map((entry) => entry.action)).toEqual([
        'channel.create',
        'channel.start',
        'channel.restart',
        'channel.stop',
      ]);
    });

    it('can start a channel as it is created, and restart starts a stopped one', async () => {
      const created = await create({ start: true }).expect(201);
      expect(created.body).toMatchObject({ enabled: true, status: 'WAITING' });

      const other = await create({ name: 'Other' }).expect(201);
      const restarted = await http()
        .post(`/v1/channels/${other.body.id}/restart`)
        .set(admin())
        .expect(200);
      expect(restarted.body.enabled).toBe(true);
    });

    it('says so when no live process picks an enabled channel up', async () => {
      const created = await create({ start: true }).expect(201);
      await testApp.prisma.$executeRaw`
        UPDATE channels SET "updatedAt" = now() - interval '1 minute' WHERE id = ${created.body.id}::uuid`;

      const response = await http().get(`/v1/channels/${created.body.id}`).set(admin()).expect(200);
      expect(response.body.status).toBe('WAITING');
      expect(response.body.statusMessage).toContain('No live process is running');
    });

    it('shows what the live process reports', async () => {
      const created = await create({ start: true }).expect(201);
      const id = created.body.id as string;
      await testApp.prisma.channel.update({
        where: { id },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
          videoCodec: 'h264',
          width: 1920,
          height: 1080,
        },
      });
      await testApp.redis.set(
        `onyx:live:health:${id}`,
        JSON.stringify({
          node: 'live-1:abcd',
          at: Date.now(),
          pid: 42,
          bitrate: 4_200_000,
          speed: 1,
          lastDataAt: Date.now(),
          log: ['Connecting', 'The stream is running'],
        }),
      );

      const response = await http().get(`/v1/channels/${id}`).set(admin()).expect(200);
      expect(response.body).toMatchObject({
        status: 'RUNNING',
        streams: { videoCodec: 'h264', width: 1920, height: 1080 },
        health: { bitrate: 4_200_000, speed: 1, node: 'live-1:abcd' },
        log: ['Connecting', 'The stream is running'],
      });
      expect(response.body.startedAt).toEqual(expect.any(String));
    });
  });

  describe('delivery', () => {
    const SECRET = 'b'.repeat(64);
    const token = (id: string, seconds = 600) =>
      createPlaybackToken(id, Math.floor(Date.now() / 1000) + seconds, SECRET);

    async function channelWithFiles() {
      const id = (await create().expect(201)).body.id as string;
      await mkdir(path.join(livePath, id), { recursive: true });
      await writeFile(path.join(livePath, id, 'index.m3u8'), '#EXTM3U\n');
      await writeFile(path.join(livePath, id, 'seg-100.m4s'), Buffer.from('0123456789'));
      await writeFile(path.join(livePath, id, 'notes.txt'), 'private');
      return id;
    }

    it('issues a signed address that opens the playlist and the segments', async () => {
      const id = await channelWithFiles();
      const playback = await http().post(`/v1/channels/${id}/playback`).set(admin()).expect(200);
      expect(playback.body.protocol).toBe('hls');
      expect(playback.body.url).toMatch(new RegExp(`/v1/live/${id}/[^/]+/index\\.m3u8$`));

      const playlist = await http().get(playback.body.url).expect(200);
      expect(playlist.headers['content-type']).toContain('application/vnd.apple.mpegurl');
      expect(playlist.headers['cache-control']).toContain('no-cache');
      expect(playlist.text).toBe('#EXTM3U\n');

      const segment = await http()
        .get(playback.body.url.replace('index.m3u8', 'seg-100.m4s'))
        .expect(200);
      expect(segment.headers['content-type']).toBe('video/iso.segment');
      expect(segment.headers['cache-control']).toContain('max-age=60');

      const part = await http()
        .get(playback.body.url.replace('index.m3u8', 'seg-100.m4s'))
        .set('Range', 'bytes=2-5')
        .expect(206);
      expect(part.headers['content-range']).toBe('bytes 2-5/10');
      expect(part.body.toString()).toBe('2345');

      await http().head(playback.body.url).expect(200);
      await http().post(`/v1/channels/${UNKNOWN}/playback`).set(admin()).expect(404);
    });

    it('answers every refusal with a plain 404', async () => {
      const id = await channelWithFiles();
      const other = (await create({ name: 'Other' }).expect(201)).body.id as string;
      const base = `/v1/live/${id}`;

      await http()
        .get(`${base}/${token(id)}/missing.m4s`)
        .expect(404);
      await http()
        .get(`${base}/${token(id, -10)}/index.m3u8`)
        .expect(404);
      await http()
        .get(`${base}/${token(other)}/index.m3u8`)
        .expect(404);
      await http().get(`${base}/nonsense/index.m3u8`).expect(404);
      // Only the kinds of file a live process writes are served.
      await http()
        .get(`${base}/${token(id)}/notes.txt`)
        .expect(404);
      await http()
        .get(`${base}/${token(id)}/..%2F${other}%2Findex.m3u8`)
        .expect(404);
      await http()
        .get(`/v1/live/not-an-id/${token('not-an-id')}/index.m3u8`)
        .expect(404);
    });
  });
});

describe.skipIf(!TEST_DATABASE_URL || !hasFfmpeg)('Live channels (e2e, real FFmpeg)', () => {
  const PORT = 20_000 + Math.floor(Math.random() * 20_000);
  let testApp: TestApp;
  let livePath: string;
  let ownerToken: string;
  let sender: ChildProcess;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  /** Asks the supervisor to look, as its timer and a message from the API would. */
  const reconcile = () => testApp.app.get(LiveSupervisorService).reconcile();

  async function waitFor(id: string, status: string, timeoutMs = 40_000) {
    const deadline = Date.now() + timeoutMs;
    let last: { status: string; statusMessage: string | null; log: string[] } | null = null;
    while (Date.now() < deadline) {
      await reconcile();
      last = (await http().get(`/v1/channels/${id}`).set(admin()).expect(200)).body;
      if (last?.status === status) {
        return last as unknown as Record<string, never>;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`The channel did not reach ${status}: ${JSON.stringify(last)}`);
  }

  beforeAll(async () => {
    livePath = await mkdtemp(path.join(tmpdir(), 'onyx-live-ffmpeg-'));
    testApp = await createTestApp([AdminsModule, LiveModule, LiveSupervisorModule], {
      LIVE_PATH: livePath,
      LIVE_SEGMENT_SECONDS: '1',
    });
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();

    // A test picture with a tone, sent as a broadcast feed would be: MPEG-TS over UDP, MP2 audio.
    sender = spawn(
      process.env.FFMPEG_PATH ?? 'ffmpeg',
      // prettier-ignore
      [
        '-v', 'error', '-re',
        '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25',
        '-f', 'lavfi', '-i', 'sine=frequency=440',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-g', '25',
        '-pix_fmt', 'yuv420p', '-c:a', 'mp2', '-f', 'mpegts',
        `udp://127.0.0.1:${PORT}?pkt_size=1316`,
      ],
      { stdio: 'ignore' },
    );
  });

  afterAll(async () => {
    sender.kill('SIGKILL');
    await testApp.close();
    await rm(livePath, { recursive: true, force: true });
  });

  it('pulls a source, serves it as HLS and stops when told', async () => {
    const source = `udp://127.0.0.1:${PORT}`;

    const probe = await http().post('/v1/channels/probe').set(admin()).send({ source }).expect(200);
    expect(probe.body).toMatchObject({
      ok: true,
      audio: 'aac',
      copyObstacle: null,
      streams: { videoCodec: 'h264', width: 640, height: 360, audioCodec: 'mp2' },
    });

    const created = await http()
      .post('/v1/channels')
      .set(admin())
      .send({ name: 'Test card', source, start: true })
      .expect(201);
    const id = created.body.id as string;

    const running = await waitFor(id, 'RUNNING');
    expect(running).toMatchObject({
      streams: { videoCodec: 'h264', width: 640, height: 360, frameRate: 25 },
      restartCount: 0,
    });
    expect(running.startedAt).toEqual(expect.any(String));
    expect(running.log).toContain('The stream is running');

    const playback = await http().post(`/v1/channels/${id}/playback`).set(admin()).expect(200);
    const playlist = await http().get(playback.body.url).expect(200);
    expect(playlist.text).toContain('#EXT-X-MAP:URI="init-');
    expect(playlist.text).not.toContain('#EXT-X-ENDLIST');
    const segment = playlist.text
      .split('\n')
      .filter((line: string) => line.endsWith('.m4s'))
      .at(-1) as string;
    const file = await http().get(playback.body.url.replace('index.m3u8', segment)).expect(200);
    expect(Number(file.headers['content-length'])).toBeGreaterThan(1000);

    // A restart replaces the process and the channel comes back by itself.
    await http().post(`/v1/channels/${id}/restart`).set(admin()).expect(200);
    await reconcile();
    await waitFor(id, 'RUNNING');

    await http().post(`/v1/channels/${id}/stop`).set(admin()).expect(200);
    await reconcile();
    expect(testApp.app.get(LiveSupervisorService).runningIds()).toEqual([]);
    expect(await readdir(livePath)).toEqual([]);
    await http().get(playback.body.url).expect(404);

    const events = testApp.redis.published
      .filter((entry) => entry.channel === 'onyx:events')
      .map((entry) => JSON.parse(entry.message) as { type: string; change: string });
    expect(events).toContainEqual({ type: 'channel', channelId: id, change: 'status' });
  }, 120_000);

  it('encodes a channel into several qualities that players switch between', async () => {
    const created = await http()
      .post('/v1/channels')
      .set(admin())
      .send({
        name: 'Transcoded',
        source: `udp://127.0.0.1:${PORT}`,
        mode: 'TRANSCODE',
        // 720 lines are more than the source has and are left out.
        qualities: [720, 360, 240],
        start: true,
      })
      .expect(201);
    const id = created.body.id as string;

    const running = await waitFor(id, 'RUNNING', 60_000);
    expect(running.outputs).toEqual([
      { name: '360p', height: 360, videoKbps: 800 },
      { name: '240p', height: 240, videoKbps: 400 },
    ]);

    const playback = await http().post(`/v1/channels/${id}/playback`).set(admin()).expect(200);
    const master = await http().get(playback.body.url).expect(200);
    expect(master.text).toContain('RESOLUTION=640x360');
    expect(master.text).toContain('RESOLUTION=426x240');
    expect(master.text).toContain('avc1.');
    expect(master.text).toContain('mp4a.40.2');

    for (const quality of ['360p', '240p']) {
      const address = playback.body.url.replace('index.m3u8', `q-${quality}.m3u8`);
      // The playlist of a quality appears with its first segment, a moment after the list of them.
      let playlist = await http().get(address);
      for (let attempt = 0; attempt < 20 && playlist.status !== 200; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        playlist = await http().get(address);
      }
      expect(playlist.status).toBe(200);
      expect(playlist.text).toContain(`#EXT-X-MAP:URI="init-`);
      const segment = playlist.text
        .split('\n')
        .filter((line: string) => line.endsWith('.m4s'))
        .at(-1) as string;
      expect(segment).toMatch(new RegExp(`^seg-${quality}-\\d+\\.m4s$`));
      await http().get(playback.body.url.replace('index.m3u8', segment)).expect(200);
    }

    await http().delete(`/v1/channels/${id}`).set(admin()).expect(204);
    await reconcile();
    expect(testApp.app.get(LiveSupervisorService).runningIds()).toEqual([]);
  }, 120_000);

  it('keeps what was sent for a channel that lets viewers go back', async () => {
    const created = await http()
      .post('/v1/channels')
      .set(admin())
      .send({ name: 'With memory', source: `udp://127.0.0.1:${PORT}`, dvrMinutes: 30, start: true })
      .expect(201);
    const id = created.body.id as string;
    await waitFor(id, 'RUNNING');
    const playback = await http().post(`/v1/channels/${id}/playback`).set(admin()).expect(200);

    // Segments are a second long here and a channel without a window lists six.
    let segments = 0;
    for (let attempt = 0; attempt < 40 && segments <= 9; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const playlist = await http().get(playback.body.url).expect(200);
      segments = playlist.text.match(/\.m4s/g)?.length ?? 0;
    }
    expect(segments).toBeGreaterThan(9);

    await http().delete(`/v1/channels/${id}`).set(admin()).expect(204);
    await reconcile();
  }, 120_000);

  it('passes AAC audio from a transport stream through', async () => {
    const port = PORT + 1;
    const withAac = spawn(
      process.env.FFMPEG_PATH ?? 'ffmpeg',
      // prettier-ignore
      [
        '-v', 'error', '-re',
        '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25',
        '-f', 'lavfi', '-i', 'sine=frequency=440',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-g', '25',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mpegts',
        `udp://127.0.0.1:${port}?pkt_size=1316`,
      ],
      { stdio: 'ignore' },
    );
    try {
      const created = await http()
        .post('/v1/channels')
        .set(admin())
        .send({ name: 'With AAC', source: `udp://127.0.0.1:${port}`, start: true })
        .expect(201);
      const id = created.body.id as string;

      const running = await waitFor(id, 'RUNNING');
      expect(running.streams).toMatchObject({ audioCodec: 'aac' });
      // It has to stay on air: the fault this guards against ended the stream after its first segment.
      await new Promise((resolve) => setTimeout(resolve, 6000));
      await reconcile();
      const later = (await http().get(`/v1/channels/${id}`).set(admin()).expect(200)).body;
      expect(later).toMatchObject({ status: 'RUNNING', restartCount: 0 });

      const playback = await http().post(`/v1/channels/${id}/playback`).set(admin()).expect(200);
      const playlist = await http().get(playback.body.url).expect(200);
      expect(playlist.text.match(/\.m4s/g)?.length).toBeGreaterThan(2);

      await http().delete(`/v1/channels/${id}`).set(admin()).expect(204);
      await reconcile();
    } finally {
      withAac.kill('SIGKILL');
    }
  }, 120_000);

  it('reports a source that sends nothing, and keeps trying', async () => {
    const created = await http()
      .post('/v1/channels')
      .set(admin())
      // A port nobody sends to. Not a low one: those need root rights to listen on.
      .send({ name: 'Silent', source: `udp://127.0.0.1:${PORT + 2}`, start: true })
      .expect(201);
    const id = created.body.id as string;

    const waiting = await waitFor(id, 'RECONNECTING', 30_000);
    expect(waiting.statusMessage).toContain('The source did not answer');
    expect(waiting.statusMessage).toContain('Trying again in');

    await http().delete(`/v1/channels/${id}`).set(admin()).expect(204);
    await reconcile();
    expect(testApp.app.get(LiveSupervisorService).runningIds()).toEqual([]);
  }, 60_000);
});
