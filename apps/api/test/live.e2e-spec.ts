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
    testApp = await createTestApp([AdminsModule, LiveModule], { LIVE_PATH: livePath });
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
        '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25',
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
      streams: { videoCodec: 'h264', width: 320, height: 180, audioCodec: 'mp2' },
    });

    const created = await http()
      .post('/v1/channels')
      .set(admin())
      .send({ name: 'Test card', source, start: true })
      .expect(201);
    const id = created.body.id as string;

    const running = await waitFor(id, 'RUNNING');
    expect(running).toMatchObject({
      streams: { videoCodec: 'h264', width: 320, height: 180, frameRate: 25 },
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

  it('reports a source that sends nothing, and keeps trying', async () => {
    const created = await http()
      .post('/v1/channels')
      .set(admin())
      .send({ name: 'Silent', source: 'udp://127.0.0.1:1', start: true })
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
