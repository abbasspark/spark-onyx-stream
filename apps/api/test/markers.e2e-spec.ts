// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of markers: the intro, recap and credits of a video that
// a player offers to skip, set by hand, and found for the episodes of a
// season by comparing their sound with the real FFmpeg.
//
// Skipped unless TEST_DATABASE_URL is set and FFmpeg is installed.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { ProcessingApiModule, ProcessingStepsModule } from '../src/processing/processing.module.js';
import { StoragePoolsModule } from '../src/storage/storage.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { WatchingModule } from '../src/watching/watching.module.js';
import {
  drainQueue as drainQueueOf,
  FFMPEG,
  FFPROBE,
  generateVideo,
  hasFfmpeg,
  uploadSource as uploadSourceTo,
} from './support/processing-helpers.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const RATE = 8000;

/** A source of numbers that is the same on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Sound like nothing else: what happens in an episode. */
function scene(seconds: number, seed: number): number[] {
  const next = random(seed);
  const samples: number[] = [];
  let smooth = 0;
  for (let index = 0; index < seconds * RATE; index += 1) {
    smooth = smooth * 0.85 + (next() - 0.5) * 0.15;
    samples.push(smooth * 24_000 * (0.6 + 0.4 * Math.sin(index / 9000)));
  }
  return samples;
}

/** A tune, the same for the same seed: the music of an opening. */
function tune(seconds: number, seed: number): number[] {
  const next = random(seed);
  const samples: number[] = [];
  const note = Math.round(RATE * 0.22);
  let pitch = 440;
  for (let index = 0; index < seconds * RATE; index += 1) {
    if (index % note === 0) {
      pitch = 330 * 2 ** (Math.floor(next() * 24) / 12);
    }
    const time = index / RATE;
    samples.push(
      Math.min(1, (index % note) / 200) *
        (5000 * Math.sin(2 * Math.PI * pitch * time) +
          2500 * Math.sin(2 * Math.PI * pitch * 2 * time)),
    );
  }
  return samples;
}

/** Writes samples as a WAV file FFmpeg can read. */
async function writeWav(file: string, samples: readonly number[]): Promise<void> {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) =>
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample))), index * 2),
  );
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  await writeFile(file, Buffer.concat([header, data]));
}

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

interface Marker {
  kind: string;
  startMs: number;
  endMs: number | null;
  source?: string;
}

describe.skipIf(!TEST_DATABASE_URL || !hasFfmpeg)('Markers (e2e, real FFmpeg)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let storageDirectory: string;
  let ownerToken: string;
  /**
   * Three episodes of 150 seconds. Each has the same opening of 20 seconds,
   * at 10, 25 and 5 seconds, and the same closing music over its last 22
   * seconds. Everything else differs, and each is encoded differently.
   */
  const episodeFiles: string[] = [];
  const INTRO_AT = [10, 25, 5];
  const LENGTH = 150;
  const INTRO = 20;
  const CREDITS = 22;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const drainQueue = () => drainQueueOf(testApp);
  const markersOf = async (assetId: string) =>
    (await http().get(`/v1/assets/${assetId}/markers`).set(auth()).expect(200)).body as Marker[];
  const setMarkers = (assetId: string, markers: Marker[]) =>
    http().put(`/v1/assets/${assetId}/markers`).set(auth()).send({ markers });

  /** A series with one season and an episode for each of the files, processed and published. */
  async function createSeries(files: readonly string[] = episodeFiles) {
    const created = await http()
      .post('/v1/titles')
      .set(auth())
      .send({ type: 'SERIES', name: 'Harbour Lights' })
      .expect(201);
    const titleId = created.body.id as string;
    const withSeason = await http()
      .post(`/v1/titles/${titleId}/seasons`)
      .set(auth())
      .send({})
      .expect(201);
    const seasonId = withSeason.body.seasons[0].id as string;
    const episodes: { id: string; assetId: string }[] = [];
    for (const [index, file] of files.entries()) {
      const assetId = await uploadSourceTo(testApp, ownerToken, file);
      const episode = await http()
        .post(`/v1/seasons/${seasonId}/episodes`)
        .set(auth())
        .send({ name: `Part ${index + 1}`, assetId })
        .expect(201);
      episodes.push({ id: episode.body.id as string, assetId });
    }
    await drainQueue();
    for (const episode of episodes) {
      await http()
        .patch(`/v1/episodes/${episode.id}`)
        .set(auth())
        .send({ status: 'PUBLISHED' })
        .expect(200);
    }
    await http()
      .put(`/v1/titles/${titleId}/status`)
      .set(auth())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return { titleId, slug: created.body.slug as string, seasonId, episodes };
  }

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-markers-'));
    storageDirectory = path.join(workDirectory, 'storage');
    const opening = tune(INTRO, 99);
    const closing = tune(CREDITS, 77);
    const codecs = [
      ['-c:a', 'aac', '-b:a', '64k'],
      ['-c:a', 'libmp3lame', '-b:a', '128k'],
      ['-c:a', 'aac', '-b:a', '128k', '-ar', '44100'],
    ];
    for (const [index, introAt] of INTRO_AT.entries()) {
      const wav = path.join(workDirectory, `episode-${index}.wav`);
      await writeWav(wav, [
        ...scene(introAt, index * 10 + 1),
        // Quieter in one episode: loudness must not matter.
        ...opening.map((sample) => sample * (index === 1 ? 0.6 : 1)),
        ...scene(LENGTH - introAt - INTRO - CREDITS, index * 10 + 2),
        ...closing,
      ]);
      const file = path.join(workDirectory, `episode-${index}.mkv`);
      generateVideo(file, [
        '-f',
        'lavfi',
        '-i',
        `testsrc2=size=160x90:rate=10:duration=${LENGTH}`,
        '-i',
        wav,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '20',
        '-keyint_min',
        '20',
        '-sc_threshold',
        '0',
        ...(codecs[index] as string[]),
        '-shortest',
      ]);
      episodeFiles.push(file);
    }

    testApp = await createTestApp(
      [
        StoragePoolsModule,
        AssetsModule,
        AdminsModule,
        CatalogModule,
        ViewersModule,
        WatchingModule,
        ProcessingApiModule,
        ProcessingStepsModule,
      ],
      {
        STORAGE_LOCAL_PATH: storageDirectory,
        UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
        PROCESSING_TEMP_PATH: path.join(workDirectory, 'processing'),
        FFMPEG_PATH: FFMPEG,
        FFPROBE_PATH: FFPROBE,
      },
    );
  }, 240_000);

  beforeEach(async () => {
    await testApp.resetDatabase();
    await rm(storageDirectory, { recursive: true, force: true });
    await mkdir(storageDirectory, { recursive: true });
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp?.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  it('finds the intro and the credits of every episode of a season by their sound', async () => {
    const series = await createSeries();
    expect(await markersOf(series.episodes[0]!.assetId)).toEqual([]);
    const never = await http()
      .get(`/v1/seasons/${series.seasonId}/markers/detection`)
      .set(auth())
      .expect(200);
    expect(never.body).toEqual({ detection: null });

    const started = await http()
      .post(`/v1/seasons/${series.seasonId}/markers/detect`)
      .set(auth())
      .send({})
      .expect(202);
    expect(started.body).toMatchObject({ status: 'QUEUED', result: null });
    // One search of a season at a time.
    await http()
      .post(`/v1/seasons/${series.seasonId}/markers/detect`)
      .set(auth())
      .send({})
      .expect(409);
    await drainQueue();

    const done = await http()
      .get(`/v1/seasons/${series.seasonId}/markers/detection`)
      .set(auth())
      .expect(200);
    expect(done.body.detection).toMatchObject({
      jobId: started.body.jobId,
      status: 'COMPLETED',
      result: {
        episodes: 3,
        intros: 3,
        credits: 3,
        keptManual: 0,
        perEpisode: [
          { episode: 1, intro: true, credits: true },
          { episode: 2, intro: true, credits: true },
          { episode: 3, intro: true, credits: true },
        ],
      },
    });

    for (const [index, episode] of series.episodes.entries()) {
      const [intro, credits] = await markersOf(episode.assetId);
      const introAt = INTRO_AT[index] as number;
      expect(intro).toMatchObject({ kind: 'INTRO', source: 'DETECTED' });
      // To the second: a viewer who skips must land after the music, not in it.
      expect(Math.abs(intro!.startMs - introAt * 1000)).toBeLessThan(1200);
      expect(Math.abs((intro!.endMs as number) - (introAt + INTRO) * 1000)).toBeLessThan(1200);
      // The credits run to the end, so they have no end of their own.
      expect(credits).toMatchObject({ kind: 'CREDITS', source: 'DETECTED', endMs: null });
      expect(Math.abs(credits!.startMs - (LENGTH - CREDITS) * 1000)).toBeLessThan(1200);
    }

    // A player is told with the addresses of the video.
    const playback = await http()
      .post(`/v1/catalog/episodes/${series.episodes[1]!.id}/playback`)
      .expect(200);
    expect(playback.body.markers).toHaveLength(2);
    expect(playback.body.markers[0]).toEqual({
      kind: 'INTRO',
      startMs: expect.any(Number),
      endMs: expect.any(Number),
    });
  }, 300_000);

  it('leaves alone what an admin set, unless told to replace it', async () => {
    const series = await createSeries();
    const first = series.episodes[0]!.assetId;
    const byHand = await setMarkers(first, [
      { kind: 'INTRO', startMs: 9000, endMs: 31_000 },
    ]).expect(200);
    expect(byHand.body).toEqual([
      { kind: 'INTRO', startMs: 9000, endMs: 31_000, source: 'MANUAL' },
    ]);

    await http()
      .post(`/v1/seasons/${series.seasonId}/markers/detect`)
      .set(auth())
      .send({})
      .expect(202);
    await drainQueue();
    const kept = await markersOf(first);
    expect(kept[0]).toEqual({ kind: 'INTRO', startMs: 9000, endMs: 31_000, source: 'MANUAL' });
    // What was not set by hand is filled in beside it.
    expect(kept[1]).toMatchObject({ kind: 'CREDITS', source: 'DETECTED' });
    const report = await http()
      .get(`/v1/seasons/${series.seasonId}/markers/detection`)
      .set(auth())
      .expect(200);
    expect(report.body.detection.result).toMatchObject({ intros: 2, credits: 3, keptManual: 1 });

    // Saving what was found without changing it does not make it "set by hand".
    const again = await setMarkers(first, kept).expect(200);
    expect(again.body.map((marker: Marker) => marker.source)).toEqual(['MANUAL', 'DETECTED']);
    // Changing it does.
    const moved = await setMarkers(first, [
      kept[0]!,
      { kind: 'CREDITS', startMs: kept[1]!.startMs + 2000, endMs: null },
    ]).expect(200);
    expect(moved.body.map((marker: Marker) => marker.source)).toEqual(['MANUAL', 'MANUAL']);

    await http()
      .post(`/v1/seasons/${series.seasonId}/markers/detect`)
      .set(auth())
      .send({ overwrite: true })
      .expect(202);
    await drainQueue();
    const replaced = await markersOf(first);
    expect(replaced.map((marker) => marker.source)).toEqual(['DETECTED', 'DETECTED']);
    expect(Math.abs(replaced[0]!.startMs - 10_000)).toBeLessThan(1200);
  }, 300_000);

  it('takes markers set by hand that fit the video and each other', async () => {
    const series = await createSeries(episodeFiles.slice(0, 1));
    const assetId = series.episodes[0]!.assetId;
    await http().get(`/v1/assets/${assetId}/markers`).expect(401);
    await http().put(`/v1/assets/${assetId}/markers`).send({ markers: [] }).expect(401);

    const saved = await setMarkers(assetId, [
      { kind: 'CREDITS', startMs: 128_000, endMs: 150_000 },
      { kind: 'INTRO', startMs: 30_000, endMs: 50_000 },
      { kind: 'RECAP', startMs: 0, endMs: 30_000 },
    ]).expect(200);
    // In the order of the video, and credits that end with the video run to its end.
    expect(saved.body).toEqual([
      { kind: 'RECAP', startMs: 0, endMs: 30_000, source: 'MANUAL' },
      { kind: 'INTRO', startMs: 30_000, endMs: 50_000, source: 'MANUAL' },
      { kind: 'CREDITS', startMs: 128_000, endMs: null, source: 'MANUAL' },
    ]);

    const refuse = async (markers: Marker[], words: string) => {
      const response = await setMarkers(assetId, markers).expect(400);
      expect(response.body.message).toContain(words);
    };
    await refuse(
      [
        { kind: 'INTRO', startMs: 0, endMs: 20_000 },
        { kind: 'INTRO', startMs: 30_000, endMs: 50_000 },
      ],
      'once',
    );
    await refuse([{ kind: 'INTRO', startMs: 10_000, endMs: null }], 'needs an end');
    await refuse([{ kind: 'INTRO', startMs: 10_000, endMs: 10_500 }], 'less than a second');
    await refuse(
      [{ kind: 'CREDITS', startMs: 200_000, endMs: null }],
      'after the end of the video',
    );
    await refuse(
      [
        { kind: 'RECAP', startMs: 0, endMs: 40_000 },
        { kind: 'INTRO', startMs: 30_000, endMs: 50_000 },
      ],
      'overlap',
    );
    await setMarkers(assetId, [{ kind: 'BREAK', startMs: 0, endMs: 2000 }]).expect(400);
    // Nothing was changed by what was refused.
    expect(await markersOf(assetId)).toHaveLength(3);

    await setMarkers(assetId, []).expect(200);
    expect(await markersOf(assetId)).toEqual([]);
    const logged = await testApp.prisma.auditLog.count({
      where: { action: 'asset.markers.update' },
    });
    expect(logged).toBe(2);

    // One episode has nothing to be compared with.
    const alone = await http()
      .post(`/v1/seasons/${series.seasonId}/markers/detect`)
      .set(auth())
      .send({})
      .expect(409);
    expect(alone.body.message).toContain('two episodes');
  }, 300_000);

  it('counts an episode as watched from where its credits begin', async () => {
    const series = await createSeries(episodeFiles.slice(0, 1));
    const episode = series.episodes[0]!;
    const viewer = cookieOf(
      await http()
        .post('/v1/viewer/register')
        .send({ email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' })
        .expect(201),
    );
    const report = (position: number) =>
      http()
        .put('/v1/viewer/watching')
        .set('Cookie', viewer)
        .send({ items: [{ title: series.slug, episodeId: episode.id, position, duration: 150 }] })
        .expect(200);
    const state = async () =>
      (
        await http()
          .get(`/v1/viewer/watching/titles/${series.slug}`)
          .set('Cookie', viewer)
          .expect(200)
      ).body.items[0] as { completed: boolean; position: number };

    // Without credits: watched from 95 percent, which is at 142.5 seconds.
    await report(130);
    expect(await state()).toMatchObject({ completed: false, position: 130 });

    await setMarkers(episode.assetId, [{ kind: 'CREDITS', startMs: 128_000, endMs: null }]).expect(
      200,
    );
    await report(120);
    expect(await state()).toMatchObject({ completed: false, position: 120 });
    await report(129);
    expect(await state()).toMatchObject({ completed: true, position: 0 });

    // Credits marked in the first half are a mistake, and nobody loses their place over it.
    await setMarkers(episode.assetId, [{ kind: 'CREDITS', startMs: 20_000, endMs: 40_000 }]).expect(
      200,
    );
    await report(60);
    expect((await state()).position).toBe(60);
  }, 300_000);
});
