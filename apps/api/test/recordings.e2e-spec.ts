// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of recordings: planning them, and a real recording of a
// running channel that ends up in the library.
//
// Skipped unless TEST_DATABASE_URL is set. The last part needs FFmpeg.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { GuideModule } from '../src/guide/guide.module.js';
import { LiveModule, LiveSupervisorModule } from '../src/live/live.module.js';
import { LiveSupervisorService } from '../src/live/live-supervisor.service.js';
import { RecordingSupervisorService } from '../src/recordings/recording-supervisor.service.js';
import {
  RecordingsModule,
  RecordingSupervisorModule,
} from '../src/recordings/recordings.module.js';
import { hasFfmpeg } from './support/processing-helpers.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MINUTE = 60_000;
const EDITOR = {
  email: 'editor@example.com',
  displayName: 'Eddie Editor',
  password: 'editor-password-123',
  role: 'EDITOR',
};
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

describe.skipIf(!TEST_DATABASE_URL)('Recordings (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let channelId: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);
  const create = (body: Record<string, unknown> = {}) =>
    http()
      .post('/v1/recordings')
      .set(admin())
      .send({
        channelId,
        title: 'Evening News',
        startsAt: iso(10 * MINUTE),
        endsAt: iso(40 * MINUTE),
        ...body,
      });

  beforeAll(async () => {
    testApp = await createTestApp([AdminsModule, LiveModule, GuideModule, RecordingsModule], {
      INGEST_API_URL: 'http://127.0.0.1:1',
    });
  });
  afterAll(() => testApp.close());

  beforeEach(async () => {
    await testApp.resetDatabase();
    testApp.redis.clear();
    ownerToken = await testApp.setupOwner();
    const channel = await http()
      .post('/v1/channels')
      .set(admin())
      .send({ name: 'News 24', source: 'https://cdn.example.com/live.m3u8' })
      .expect(201);
    channelId = channel.body.id as string;
  });

  it('plans a recording and lists it', async () => {
    const startsAt = iso(10 * MINUTE);
    const endsAt = iso(40 * MINUTE);
    const created = await create({ startsAt, endsAt, title: '  Evening News ' }).expect(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      title: 'Evening News',
      channel: { id: channelId, name: 'News 24' },
      startsAt,
      endsAt,
      status: 'SCHEDULED',
      statusMessage: null,
      recordedSeconds: null,
      bytes: null,
      asset: null,
      createdAt: expect.any(String),
    });

    const list = await http().get('/v1/recordings').set(admin()).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(created.body.id);
    const open = await http().get('/v1/recordings').query({ show: 'open' }).set(admin());
    expect(open.body.total).toBe(1);
    const finished = await http().get('/v1/recordings').query({ show: 'finished' }).set(admin());
    expect(finished.body.total).toBe(0);

    const audit = await testApp.prisma.auditLog.findFirstOrThrow({
      where: { action: 'recording.create' },
    });
    expect(audit.metadata).toEqual({ title: 'Evening News', channel: 'News 24' });
  });

  it('refuses times that cannot be recorded', async () => {
    const check = async (startsAt: string, endsAt: string, field: string, part: string) => {
      const response = await create({ startsAt, endsAt }).expect(400);
      expect(response.body.issues[0].field).toBe(field);
      expect(response.body.issues[0].message).toContain(part);
    };
    await check(iso(20 * MINUTE), iso(10 * MINUTE), 'endsAt', 'after the start');
    await check(iso(0), iso(9 * 60 * MINUTE), 'endsAt', 'eight hours');
    await check(iso(-60 * MINUTE), iso(-30 * MINUTE), 'endsAt', 'already over');
    await check(iso(-5 * 60 * MINUTE), iso(10 * MINUTE), 'startsAt', 'further back');
    await create({ startsAt: 'tomorrow' }).expect(400);
    await create({ channelId: '0190a0a0-0000-7000-8000-000000000000' }).expect(400);

    // What began a while ago can still be recorded: a channel may keep it.
    await create({ startsAt: iso(-30 * MINUTE), endsAt: iso(30 * MINUTE) }).expect(201);
  });

  it('does not plan the same recording twice', async () => {
    const startsAt = iso(10 * MINUTE);
    const endsAt = iso(40 * MINUTE);
    await create({ startsAt, endsAt }).expect(201);
    const again = await create({ startsAt, endsAt }).expect(409);
    expect(again.body.message).toBe('This is already being recorded');
  });

  it('records a programme of the guide under its name and for its time', async () => {
    const programme = await http()
      .post(`/v1/channels/${channelId}/programmes`)
      .set(admin())
      .send({
        title: 'Town Hall',
        subtitle: 'Questions from viewers',
        startsAt: iso(5 * MINUTE),
        endsAt: iso(65 * MINUTE),
      })
      .expect(201);

    const created = await http()
      .post(`/v1/programmes/${programme.body.id}/record`)
      .set(admin())
      .expect(201);
    expect(created.body).toMatchObject({
      title: 'Town Hall: Questions from viewers',
      startsAt: programme.body.startsAt,
      endsAt: programme.body.endsAt,
      status: 'SCHEDULED',
    });
    await http().post(`/v1/programmes/${programme.body.id}/record`).set(admin()).expect(409);

    const over = await testApp.prisma.programme.create({
      data: {
        channelId,
        title: 'Yesterday',
        startsAt: new Date(Date.now() - 26 * 60 * MINUTE),
        endsAt: new Date(Date.now() - 25 * 60 * MINUTE),
      },
    });
    const refused = await http().post(`/v1/programmes/${over.id}/record`).set(admin()).expect(400);
    expect(refused.body.message).toContain('already over');
  });

  it('calls a waiting recording off, and ends a running one now', async () => {
    const waiting = await create().expect(201);
    const cancelled = await http()
      .post(`/v1/recordings/${waiting.body.id}/stop`)
      .set(admin())
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    await http().post(`/v1/recordings/${waiting.body.id}/stop`).set(admin()).expect(409);

    const running = await create({ startsAt: iso(-MINUTE), endsAt: iso(30 * MINUTE) }).expect(201);
    await testApp.prisma.recording.update({
      where: { id: running.body.id },
      data: { status: 'RECORDING' },
    });
    const stopped = await http()
      .post(`/v1/recordings/${running.body.id}/stop`)
      .set(admin())
      .expect(200);
    // It stays in the hands of the live process, which sees the new end and finishes the file.
    expect(stopped.body.status).toBe('RECORDING');
    expect(new Date(stopped.body.endsAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('keeps a recording when its channel is deleted, and removes it when asked', async () => {
    const created = await create().expect(201);
    await http().delete(`/v1/channels/${channelId}`).set(admin()).expect(204);

    const list = await http().get('/v1/recordings').set(admin()).expect(200);
    expect(list.body.items[0].channel).toEqual({ id: null, name: 'News 24' });

    await http().delete(`/v1/recordings/${created.body.id}`).set(admin()).expect(204);
    await http().delete(`/v1/recordings/${created.body.id}`).set(admin()).expect(404);
  });

  it('lets editors look and nothing else', async () => {
    const created = await create().expect(201);
    await http().post('/v1/admins').set(admin()).send(EDITOR).expect(201);
    const editor = testApp.bearer(await testApp.login(EDITOR.email, EDITOR.password));

    await http().get('/v1/recordings').set(editor).expect(200);
    await http()
      .post('/v1/recordings')
      .set(editor)
      .send({ channelId, title: 'X', startsAt: iso(MINUTE), endsAt: iso(2 * MINUTE) })
      .expect(403);
    await http().post(`/v1/recordings/${created.body.id}/stop`).set(editor).expect(403);
    await http().delete(`/v1/recordings/${created.body.id}`).set(editor).expect(403);
    await http().get('/v1/recordings').expect(401);
  });
});

describe.skipIf(!TEST_DATABASE_URL || !hasFfmpeg)('Recordings (e2e, real FFmpeg)', () => {
  const PORT = 20_000 + Math.floor(Math.random() * 20_000);
  let testApp: TestApp;
  let livePath: string;
  let storagePath: string;
  let ownerToken: string;
  let sender: ChildProcess;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);
  /** Lets the supervisors look, as their timers would. */
  const tick = async () => {
    await testApp.app.get(LiveSupervisorService).reconcile();
    await testApp.app.get(RecordingSupervisorService).check();
  };
  async function waitFor<T>(what: string, read: () => Promise<T | null>, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await tick();
      const value = await read();
      if (value !== null) {
        return value;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for ${what}`);
  }
  const recordingOf = async (id: string) =>
    (await http().get('/v1/recordings').set(admin()).expect(200)).body.items.find(
      (item: { id: string }) => item.id === id,
    ) as {
      status: string;
      statusMessage: string | null;
      recordedSeconds: number;
      bytes: string;
      asset: { id: string; status: string } | null;
    };

  beforeAll(async () => {
    livePath = await mkdtemp(path.join(tmpdir(), 'onyx-rec-live-'));
    storagePath = await mkdtemp(path.join(tmpdir(), 'onyx-rec-storage-'));
    testApp = await createTestApp(
      [
        AdminsModule,
        LiveModule,
        LiveSupervisorModule,
        GuideModule,
        RecordingsModule,
        RecordingSupervisorModule,
      ],
      {
        LIVE_PATH: livePath,
        LIVE_SEGMENT_SECONDS: '1',
        STORAGE_LOCAL_PATH: storagePath,
        INGEST_API_URL: 'http://127.0.0.1:1',
      },
    );
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
    sender = spawn(
      process.env.FFMPEG_PATH ?? 'ffmpeg',
      // prettier-ignore
      [
        '-v', 'error', '-re',
        '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25',
        '-f', 'lavfi', '-i', 'sine=frequency=440',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-g', '25',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-f', 'mpegts',
        `udp://127.0.0.1:${PORT}?pkt_size=1316`,
      ],
      { stdio: 'ignore' },
    );
  });

  afterAll(async () => {
    sender.kill('SIGKILL');
    await testApp.close();
    await rm(livePath, { recursive: true, force: true });
    await rm(storagePath, { recursive: true, force: true });
  });

  it('records a running channel into the library, reaching back into what it keeps', async () => {
    const channel = await http()
      .post('/v1/channels')
      .set(admin())
      .send({ name: 'Test card', source: `udp://127.0.0.1:${PORT}`, dvrMinutes: 30, start: true })
      .expect(201);
    const channelId = channel.body.id as string;
    await waitFor('the channel to run', async () => {
      const shown = await http().get(`/v1/channels/${channelId}`).set(admin()).expect(200);
      return shown.body.status === 'RUNNING' ? true : null;
    });
    // Some of the channel's past, to reach back into.
    await new Promise((resolve) => setTimeout(resolve, 8000));

    const created = await http()
      .post('/v1/recordings')
      .set(admin())
      .send({
        channelId,
        title: 'Test card, first minutes',
        // Began six seconds ago, which the channel still keeps.
        startsAt: iso(-6000),
        endsAt: iso(6000),
      })
      .expect(201);
    const id = created.body.id as string;

    const done = await waitFor('the recording to finish', async () => {
      const recording = await recordingOf(id);
      return recording.status === 'DONE' || recording.status === 'FAILED' ? recording : null;
    });
    expect(done.statusMessage).toBeNull();
    expect(done.status).toBe('DONE');
    // Twelve seconds were asked for, cut where segments begin and end.
    expect(done.recordedSeconds).toBeGreaterThanOrEqual(9);
    expect(done.recordedSeconds).toBeLessThanOrEqual(15);
    expect(Number(done.bytes)).toBeGreaterThan(10_000);

    const asset = await testApp.prisma.asset.findUniqueOrThrow({
      where: { id: done.asset?.id as string },
    });
    expect(asset).toMatchObject({ title: 'Test card, first minutes', status: 'PROCESSING' });
    expect(asset.sourcePath).toMatch(/^sources\/.+\/Test-card-first-minutes-.+\.mp4$/);
    expect(asset.sourceChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(asset.sourceBytes).toBe(BigInt(done.bytes));
    expect(testApp.app.get(RecordingSupervisorService).runningIds()).toEqual([]);

    await http().delete(`/v1/channels/${channelId}`).set(admin()).expect(204);
    await tick();
  }, 120_000);

  it('says so when the channel was not on air', async () => {
    const channel = await http()
      .post('/v1/channels')
      .set(admin())
      .send({ name: 'Silent', source: `udp://127.0.0.1:${PORT + 2}`, start: true })
      .expect(201);
    const created = await http()
      .post('/v1/recordings')
      .set(admin())
      .send({
        channelId: channel.body.id,
        title: 'Nothing',
        startsAt: iso(-1000),
        endsAt: iso(4000),
      })
      .expect(201);

    const failed = await waitFor('the recording to fail', async () => {
      const recording = await recordingOf(created.body.id as string);
      return recording.status === 'FAILED' ? recording : null;
    });
    expect(failed.statusMessage).toBe('Nothing was recorded: the channel was not on air');
    expect(failed.asset).toBeNull();

    await http().delete(`/v1/channels/${channel.body.id}`).set(admin()).expect(204);
    await tick();
  }, 120_000);
});
