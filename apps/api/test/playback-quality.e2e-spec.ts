// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of playback quality: a player gets a place to report to
// with the playback addresses, its reports are kept without being trusted,
// and the panel gets figures made of them.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { QualityRecorder } from '../src/quality/quality-recorder.service.js';
import { QualityModule } from '../src/quality/quality.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [AssetsModule, AdminsModule, CatalogModule, ViewersModule, QualityModule];
const TV = 'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K) AppleWebKit/537.36 Android TV';
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

describe.skipIf(!TEST_DATABASE_URL)('Playback quality (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function createMovie(name: string) {
    const created = await http()
      .post('/v1/titles')
      .set(admin())
      .send({ type: 'MOVIE', name })
      .expect(201);
    const id = created.body.id as string;
    const asset = await http().post('/v1/assets').set(admin()).send({ title: name }).expect(201);
    const assetId = asset.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id: assetId },
      data: {
        status: 'READY',
        manifestPath: `assets/${assetId}/hls/master.m3u8`,
        durationMs: 5_400_000,
      },
    });
    await http().patch(`/v1/titles/${id}`).set(admin()).send({ assetId }).expect(200);
    await http().put(`/v1/titles/${id}/status`).set(admin()).send({ status: 'PUBLISHED' });
    return { id, slug: created.body.slug as string };
  }

  async function play(slug: string, userAgent = PHONE): Promise<string> {
    const answer = await http()
      .post(`/v1/catalog/titles/${slug}/playback`)
      .set('User-Agent', userAgent)
      .expect(200);
    return answer.body.qualityId as string;
  }

  const report = (id: string, body: Record<string, unknown>) =>
    http()
      .post(`/v1/playback/sessions/${id}/report`)
      .send({ played: 0, stalls: 0, stallMs: 0, qualityChanges: 0, ...body });

  /** Moves a playback back in time, so that what it reports can have happened. */
  const began = (id: string, secondsAgo: number) =>
    testApp.prisma.playbackSession.update({
      where: { id },
      data: { startedAt: new Date(Date.now() - secondsAgo * 1000) },
    });

  const summary = async (query = '') =>
    (
      await http()
        .get(`/v1/analytics/quality?from=${today()}&to=${today()}${query}`)
        .set(admin())
        .expect(200)
    ).body;

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-quality-'));
    testApp = await createTestApp(MODULES, {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
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

  it('hands out a place to report to, and keeps what a player says', async () => {
    const movie = await createMovie('Glass Tide');
    const id = await play(movie.slug, TV);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await began(id, 120);

    const first = await report(id, {
      startupMs: 1400,
      played: 30,
      bitrateKbps: 5200,
      height: 1080,
      player: { name: 'android-tv', version: '2.1.0' },
    }).expect(204);
    expect(first.headers['cache-control']).toBe('no-store');
    await report(id, {
      startupMs: 9999,
      played: 95,
      stalls: 2,
      stallMs: 4000,
      qualityChanges: 1,
      droppedFrames: 7,
      ended: true,
    }).expect(204);

    const row = await testApp.prisma.playbackSession.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      kind: 'VIDEO',
      titleId: movie.id,
      device: 'TV',
      server: 'origin',
      player: 'android-tv',
      playerVersion: '2.1.0',
      // As first said.
      startupMs: 1400,
      playedSeconds: 95,
      stallCount: 2,
      stallMs: 4000,
      qualityChanges: 1,
      bitrateKbps: 5200,
      height: 1080,
      droppedFrames: 7,
      errorCode: null,
      ended: true,
    });
    // Nothing about who watched is on the row.
    expect(Object.keys(row).some((key) => /viewer|address|agent/i.test(key))).toBe(false);
  });

  it('does not trust the player, and never says whether a playback exists', async () => {
    const movie = await createMovie('Night Train');
    const id = await play(movie.slug);

    // Asked for a moment ago: an hour cannot have been played.
    await report(id, { startupMs: 500, played: 3600, stallMs: 900_000, stalls: 3 }).expect(204);
    const row = await testApp.prisma.playbackSession.findUniqueOrThrow({ where: { id } });
    expect(row.playedSeconds).toBeLessThanOrEqual(15);
    expect(row.stallMs).toBeLessThanOrEqual(15_000);

    // A signed address in what the player says is not kept.
    await report(id, {
      played: 2,
      error: {
        code: 'network',
        message: 'fragLoadError https://media.example.com/v1/media/a/secret-token/seg.m4s',
        position: 2,
      },
    }).expect(204);
    const failed = await testApp.prisma.playbackSession.findUniqueOrThrow({ where: { id } });
    expect(failed.errorMessage).toBe('fragLoadError https://media.example.com/…');
    expect(failed.errorCode).toBe('network');

    await report('01900000-0000-7000-8000-000000000000', { played: 5 }).expect(204);
    await report('not-an-id', { played: 5 }).expect(400);
    await report(id, { played: -1 }).expect(400);
    await report(id, { error: { code: 'Not A Code' } }).expect(400);

    // A playback older than a day takes no more reports.
    await began(id, 25 * 3600);
    await report(id, { played: 9, recoveredErrors: 4 }).expect(204);
    expect(
      (await testApp.prisma.playbackSession.findUniqueOrThrow({ where: { id } })).recoveredErrors,
    ).toBe(0);
  });

  it('makes figures of the reports', async () => {
    const good = await createMovie('Glass Tide');
    const bad = await createMovie('Broken Reel');
    await http().get('/v1/analytics/quality').expect(401);

    // Four good playbacks of one title, on a phone.
    for (const startupMs of [800, 1000, 1200, 2000]) {
      const id = await play(good.slug);
      await began(id, 700);
      await report(id, { startupMs, played: 600, bitrateKbps: 4000, height: 1080 }).expect(204);
    }
    // One that stopped to load for a minute in ten.
    const stalled = await play(good.slug, TV);
    await began(stalled, 700);
    await report(stalled, {
      startupMs: 3000,
      played: 540,
      stalls: 4,
      stallMs: 60_000,
      bitrateKbps: 2000,
      height: 720,
    }).expect(204);
    // The other title: two never start, one breaks while playing, two are fine.
    for (let index = 0; index < 5; index += 1) {
      const id = await play(bad.slug, TV);
      await began(id, 400);
      await report(
        id,
        index < 2
          ? { error: { code: 'unsupported', message: 'no supported source' } }
          : index === 2
            ? { startupMs: 900, played: 60, error: { code: 'media', position: 60 } }
            : { startupMs: 900, played: 300 },
      ).expect(204);
    }
    // One the viewer left before it started, and one no player ever reported on.
    const left = await play(good.slug);
    await report(left, { ended: true }).expect(204);
    await play(good.slug);

    const all = await summary();
    expect(all.recording).toBe(true);
    expect(all.keptDays).toBe(90);
    expect(all.totals).toMatchObject({
      attempts: 11,
      started: 8,
      startFailures: 2,
      leftBeforeStart: 1,
      playbackFailures: 1,
      stalledSessions: 1,
      stallCount: 4,
      stallMs: 60_000,
      playedSeconds: 3600,
      // Half of the eight starts were faster than this.
      startupP50Ms: 950,
    });
    // A minute of waiting in an hour and a minute.
    expect(all.totals.rebufferRatio).toBeCloseTo(60 / 3660, 5);
    // 2400 s at 4000 and 540 s at 2000.
    expect(all.totals.bitrateKbps).toBe(Math.round((2400 * 4000 + 540 * 2000) / 2940));
    expect(all.previous.attempts).toBe(0);
    expect(all.days).toHaveLength(1);
    expect(all.days[0]).toMatchObject({ day: today(), attempts: 11 });

    expect(
      all.devices.map((group: { key: string; attempts: number }) => [group.key, group.attempts]),
    ).toEqual([
      ['TV', 6],
      ['MOBILE', 5],
    ]);
    expect(all.servers).toMatchObject([{ key: 'origin', attempts: 11 }]);
    expect(all.knownServers).toEqual(['origin']);
    expect(all.heights).toEqual([
      { height: 1080, sessions: 4, playedSeconds: 2400 },
      { height: 720, sessions: 1, playedSeconds: 540 },
    ]);
    expect(
      all.errors.map((error: { code: string; sessions: number; beforeStart: number }) => [
        error.code,
        error.sessions,
        error.beforeStart,
      ]),
    ).toEqual([
      ['unsupported', 2, 2],
      ['media', 1, 0],
    ]);
    expect(all.errors[0].message).toBe('no supported source');
    // The title where three of five playbacks failed leads. The other had only waiting.
    expect(
      all.troubled.map((subject: { name: string; attempts: number; kind: string }) => [
        subject.name,
        subject.kind,
        subject.attempts,
      ]),
    ).toEqual([
      ['Broken Reel', 'title', 5],
      ['Glass Tide', 'title', 6],
    ]);

    // Narrowed to a kind of device, and to what is not there.
    expect((await summary('&device=TV')).totals).toMatchObject({ attempts: 6, startFailures: 2 });
    expect((await summary('&kind=LIVE')).totals.attempts).toBe(0);
    expect((await summary('&server=edge.example.com')).totals.attempts).toBe(0);
    await http().get(`/v1/analytics/quality?from=${today()}`).set(admin()).expect(400);

    const failures = await http()
      .get(`/v1/analytics/quality/failures?from=${today()}&to=${today()}`)
      .set(admin())
      .expect(200);
    expect(failures.body.total).toBe(3);
    expect(failures.body.items[0]).toMatchObject({
      subject: 'Broken Reel',
      titleId: bad.id,
      titleType: 'MOVIE',
      device: 'TV',
      server: 'origin',
    });
    const media = await http()
      .get(`/v1/analytics/quality/failures?from=${today()}&to=${today()}&code=media`)
      .set(admin())
      .expect(200);
    expect(media.body.items).toMatchObject([
      { code: 'media', startupMs: 900, atSeconds: 60, playedSeconds: 60 },
    ]);
  });

  it('clears away what no player reported on, and what is older than it is kept', async () => {
    const movie = await createMovie('Glass Tide');
    const recorder = testApp.app.get(QualityRecorder);
    const make = async (startedAt: Date, reported: boolean) => {
      const id = await play(movie.slug);
      await testApp.prisma.playbackSession.update({
        where: { id },
        data: { startedAt, reportedAt: reported ? startedAt : null },
      });
      return id;
    };
    const fresh = await make(new Date(), false);
    const silent = await make(daysAgo(3), false);
    const kept = await make(daysAgo(30), true);
    const old = await make(daysAgo(91), true);

    expect(await recorder.purge()).toBe(2);
    const left = await testApp.prisma.playbackSession.findMany({ select: { id: true } });
    expect(left.map((row) => row.id).sort()).toEqual([fresh, kept].sort());
    expect([silent, old]).toHaveLength(2);

    // Deleting a title keeps the figures and forgets what they were of.
    await testApp.prisma.title.delete({ where: { id: movie.id } });
    expect(
      (await testApp.prisma.playbackSession.findUniqueOrThrow({ where: { id: kept } })).titleId,
    ).toBeNull();
  });
});
