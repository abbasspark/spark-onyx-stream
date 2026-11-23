// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of watched locations: a folder is looked through, files
// are recognised by their names, imported with their titles from a stand-in
// for TMDB, and cleared away.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { MetadataModule } from '../src/metadata/metadata.module.js';
import { WatchRunner } from '../src/watch/watch-runner.service.js';
import { WatchModule } from '../src/watch/watch.module.js';
import { type FakeTmdb, startFakeTmdb } from './support/fake-tmdb.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const READER = {
  email: 'viewer-admin@example.com',
  displayName: 'Vera Viewer',
  password: 'viewer-password-123',
  role: 'VIEWER',
};

interface FileRow {
  id: string;
  path: string;
  state: string;
  note: string | null;
  metadataId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  title: { id: string; type: string; name: string } | null;
  episode: { id: string; name: string } | null;
  asset: { id: string; status: string } | null;
  publishPending: boolean;
}

describe.skipIf(!TEST_DATABASE_URL)('Watched locations (e2e)', () => {
  let testApp: TestApp;
  let tmdb: FakeTmdb;
  let ownerToken: string;
  let workDirectory: string;
  let folder: string;
  let clock: number;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const get = (url: string) => http().get(url).set(auth());
  const post = (url: string, body: object = {}) => http().post(url).set(auth()).send(body);
  const patch = (url: string, body: object) => http().patch(url).set(auth()).send(body);
  const runner = () => testApp.app.get(WatchRunner);

  /** One look, ten minutes after the last: every location is due, and every file has settled. */
  const look = async () => {
    clock += 10 * 60_000;
    await runner().look(new Date(clock));
  };
  /** Two looks: a file in a folder is seen first and taken with the second. */
  const lookTwice = async () => {
    await look();
    await look();
  };
  const drop = async (name: string, content = `video:${name}`) => {
    const target = path.join(folder, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  };
  const location = async (settings: object = {}) =>
    (
      await post('/v1/watch/locations', {
        name: 'Incoming',
        driver: 'LOCAL',
        config: { basePath: folder },
        ...settings,
      }).expect(201)
    ).body as { id: string };
  const files = async (query = '') =>
    ((await get(`/v1/watch/files?pageSize=100${query}`).expect(200)).body.items as FileRow[]).sort(
      (a, b) => a.path.localeCompare(b.path),
    );
  const file = async (name: string) => {
    const found = (await files()).find((row) => row.path === name);
    if (!found) {
      throw new Error(`No row for ${name}`);
    }
    return found;
  };
  const exists = (name: string) =>
    stat(path.join(folder, name)).then(
      () => true,
      () => false,
    );
  /** Makes a video playable, as processing would. */
  const ready = (assetId: string) =>
    testApp.prisma.asset.update({
      where: { id: assetId },
      data: {
        status: 'READY',
        manifestPath: `assets/${assetId}/hls/master.m3u8`,
        readyAt: new Date(),
      },
    });

  beforeAll(async () => {
    tmdb = await startFakeTmdb();
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-watch-'));
    testApp = await createTestApp(
      [AssetsModule, AdminsModule, CatalogModule, MetadataModule, WatchModule],
      {
        STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
        UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
        TMDB_API_URL: tmdb.apiUrl,
        TMDB_IMAGE_URL: tmdb.imageUrl,
        TMDB_API_TOKEN: 'a-read-access-token',
        WATCH_SETTLE_SECONDS: '30',
      },
    );
  });
  beforeEach(async () => {
    await testApp.resetDatabase();
    tmdb.reset();
    ownerToken = await testApp.setupOwner();
    folder = await mkdtemp(path.join(workDirectory, 'incoming-'));
    clock = Date.now();
  });
  afterAll(async () => {
    await testApp?.resetDatabase();
    await testApp?.close();
    await tmdb?.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  describe('locations', () => {
    it('are made, shown without their secret, changed and deleted', async () => {
      const created = await post('/v1/watch/locations', {
        name: 'Bucket',
        driver: 'S3',
        config: {
          bucket: 'incoming',
          endpoint: 'http://127.0.0.1:9',
          accessKeyId: 'key',
          secretAccessKey: 'a-secret',
          keyPrefix: 'films',
        },
        scanIntervalMinutes: 15,
        autoPublish: true,
      }).expect(201);
      expect(created.body).toMatchObject({
        name: 'Bucket',
        driver: 'S3',
        config: { bucket: 'incoming', keyPrefix: 'films', secretAccessKeySet: true },
        isActive: true,
        scanIntervalMinutes: 15,
        autoPublish: true,
        afterImport: 'MOVE',
        storagePool: null,
        lastScanAt: null,
        counts: {},
      });
      expect(JSON.stringify(created.body)).not.toContain('a-secret');
      const stored = await testApp.prisma.watchLocation.findFirstOrThrow();
      expect(JSON.stringify(stored.config)).not.toContain('a-secret');

      const id = created.body.id as string;
      const changed = await patch(`/v1/watch/locations/${id}`, {
        name: 'Films',
        afterImport: 'KEEP',
        isActive: false,
        config: { keyPrefix: null, region: 'eu-central-1' },
      }).expect(200);
      expect(changed.body).toMatchObject({
        name: 'Films',
        afterImport: 'KEEP',
        isActive: false,
        config: { bucket: 'incoming', region: 'eu-central-1', secretAccessKeySet: true },
      });
      expect(changed.body.config).not.toHaveProperty('keyPrefix');

      // A paused location is not looked through, also when asked.
      await post(`/v1/watch/locations/${id}/scan`).expect(409);
      await http().delete(`/v1/watch/locations/${id}`).set(auth()).expect(204);
      expect((await get('/v1/watch/locations').expect(200)).body).toEqual([]);
    });

    it('are checked', async () => {
      const first = await location();
      await post('/v1/watch/locations', {
        name: 'Incoming',
        driver: 'LOCAL',
        config: { basePath: folder },
      }).expect(409);
      const body = { name: 'Other', driver: 'LOCAL', config: { basePath: folder } };
      await post('/v1/watch/locations', { ...body, config: { basePath: 'relative' } }).expect(400);
      await post('/v1/watch/locations', { ...body, scanIntervalMinutes: 0 }).expect(400);
      await post('/v1/watch/locations', {
        ...body,
        storagePoolId: '01900000-0000-7000-8000-000000000000',
      }).expect(400);
      await post('/v1/watch/locations', {
        ...body,
        encodingProfileId: '01900000-0000-7000-8000-000000000000',
      }).expect(400);
      await patch(`/v1/watch/locations/${first.id}`, { config: { basePath: 'nope' } }).expect(400);
      await patch(`/v1/watch/locations/${first.id}`, {}).expect(400);
      await get('/v1/watch/locations/01900000-0000-7000-8000-000000000000').expect(404);
    });

    it('can be tried before they are saved', async () => {
      await drop('603_the-matrix.mkv');
      await drop('series/1399_S01E02_midnight-zone.mp4');
      await drop('holiday.mkv');
      await drop('603_the-matrix.en.srt');
      await drop('imported/604_done.mkv');

      const tried = await post('/v1/watch/locations/test', {
        driver: 'LOCAL',
        config: { basePath: folder },
      }).expect(200);
      expect(tried.body).toMatchObject({
        files: 5,
        videos: 3,
        recognised: 2,
        capped: false,
        writable: true,
      });
      expect(tried.body.samples).toEqual([
        { path: '603_the-matrix.mkv', recognisedAs: 'Movie 603' },
        { path: 'holiday.mkv', recognisedAs: null },
        {
          path: 'series/1399_S01E02_midnight-zone.mp4',
          recognisedAs: 'Series 1399, season 1, episode 2',
        },
      ]);
      expect(await testApp.prisma.watchLocation.count()).toBe(0);

      const missing = await post('/v1/watch/locations/test', {
        driver: 'LOCAL',
        config: { basePath: path.join(folder, 'not-there') },
      }).expect(400);
      expect(missing.body.message).toContain('does not exist on the server');
    });

    it('let those who only read see, and nobody else change', async () => {
      await post('/v1/admins', READER).expect(201);
      const reader = testApp.bearer(await testApp.login(READER.email, READER.password));
      const { id } = await location();

      await http().get('/v1/watch/locations').set(reader).expect(200);
      await http().get('/v1/watch/files').set(reader).expect(200);
      await http().get('/v1/watch/summary').set(reader).expect(200);
      await http()
        .post('/v1/watch/locations')
        .set(reader)
        .send({ name: 'X', driver: 'LOCAL', config: { basePath: folder } })
        .expect(403);
      await http().patch(`/v1/watch/locations/${id}`).set(reader).send({ name: 'X' }).expect(403);
      await http().post(`/v1/watch/locations/${id}/scan`).set(reader).expect(403);
      await http().delete(`/v1/watch/locations/${id}`).set(reader).expect(403);
      await http().get('/v1/watch/locations').expect(401);
    });
  });

  describe('a movie', () => {
    it('is seen, left alone while it may still be copied, then imported and moved away', async () => {
      const { id } = await location();
      await drop('603_the-matrix.mkv', 'the film itself');
      await drop('603_the-matrix.en.srt', '1\n00:00:01,000 --> 00:00:02,000\nWake up, Neo.\n');
      await drop('notes.txt', 'not a video');

      // The first look only takes note of it.
      await look();
      expect(await files()).toMatchObject([{ path: '603_the-matrix.mkv', state: 'WAITING' }]);
      expect(await testApp.prisma.title.count()).toBe(0);

      // A file that grew since is not touched yet.
      await drop('603_the-matrix.mkv', 'the film itself, all of it');
      await look();
      expect((await file('603_the-matrix.mkv')).state).toBe('WAITING');

      await look();
      const row = await file('603_the-matrix.mkv');
      expect(row).toMatchObject({
        state: 'IMPORTED',
        metadataId: 'movie:603',
        seasonNumber: null,
        title: { type: 'MOVIE', name: 'The Matrix' },
        episode: null,
        asset: { status: 'PROCESSING' },
        note: null,
        publishPending: false,
      });

      // The title is a draft with everything the source has, and the video is attached.
      const title = (await get(`/v1/titles/${row.title?.id}`).expect(200)).body;
      expect(title).toMatchObject({
        status: 'DRAFT',
        name: 'The Matrix',
        asset: { id: row.asset?.id },
        metadata: { source: 'tmdb', id: 'movie:603' },
      });
      expect(title.poster).not.toBeNull();
      expect(title.credits.length).toBeGreaterThan(0);

      // The video is in the pool, whole, and processing was asked for.
      const asset = await testApp.prisma.asset.findUniqueOrThrow({ where: { id: row.asset?.id } });
      expect(asset).toMatchObject({
        title: 'The Matrix',
        sourceFilename: '603_the-matrix.mkv',
        sourceBytes: 26n,
      });
      expect(asset.sourceChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
      const stored = path.join(workDirectory, 'storage', asset.sourcePath as string);
      expect(await readFile(stored, 'utf8')).toBe('the film itself, all of it');
      expect(await testApp.prisma.job.count({ where: { assetId: asset.id, type: 'PROBE' } })).toBe(
        1,
      );

      // The subtitles beside it became a track of the video, in the language their name says.
      const tracks = await testApp.prisma.subtitleTrack.findMany({ where: { assetId: asset.id } });
      expect(tracks).toMatchObject([
        { language: 'en', label: 'English', source: 'UPLOADED', isForced: false },
      ]);
      const kept = path.join(
        workDirectory,
        'storage',
        'subtitles',
        asset.id,
        `${tracks[0]?.id}.vtt`,
      );
      expect(await readFile(kept, 'utf8')).toBe(
        'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nWake up, Neo.\n',
      );
      // The file and its subtitles moved to "imported". What is not a video stays.
      expect(await exists('603_the-matrix.mkv')).toBe(false);
      expect((await readdir(path.join(folder, 'imported'))).sort()).toEqual([
        '603_the-matrix.en.srt',
        '603_the-matrix.mkv',
      ]);
      expect(await exists('notes.txt')).toBe(true);

      // Later looks leave everything as it is.
      await lookTwice();
      expect(await files()).toHaveLength(1);
      expect(await testApp.prisma.asset.count()).toBe(1);

      const shown = (await get(`/v1/watch/locations/${id}`).expect(200)).body;
      expect(shown).toMatchObject({ counts: { IMPORTED: 1 }, lastScanError: null });
      expect((await get('/v1/watch/summary').expect(200)).body).toEqual({
        locations: 1,
        counts: { IMPORTED: 1 },
        attention: 0,
      });
      const audit = await testApp.prisma.auditLog.findFirst({ where: { action: 'watch.import' } });
      expect(audit?.metadata).toMatchObject({
        location: 'Incoming',
        path: '603_the-matrix.mkv',
        subtitles: ['English'],
      });
    });

    it('takes every subtitle file beside it, and says which one it could not read', async () => {
      await location();
      await drop('603_the-matrix.mkv', 'the film itself');
      await drop('603_the-matrix.de.srt', '1\n00:00:01,000 --> 00:00:02,000\nWach auf, Neo.\n');
      await drop('603_the-matrix.en.forced.vtt', 'WEBVTT\n\n00:01.000 --> 00:02.000\nSign\n');
      await drop('603_the-matrix.fr.srt', 'this is not a subtitle file');
      await drop('603_the-matrix.nfo', 'notes');
      await drop('604_another-film.es.srt', '1\n00:00:01,000 --> 00:00:02,000\nHola\n');
      await lookTwice();

      const row = await file('603_the-matrix.mkv');
      expect(row.state).toBe('IMPORTED');
      expect(row.note).toBe(
        'The subtitle file "603_the-matrix.fr.srt" was not added: No subtitle with a start and an end was found in the file.',
      );
      const tracks = await testApp.prisma.subtitleTrack.findMany({
        where: { assetId: row.asset?.id },
        orderBy: { language: 'asc' },
      });
      expect(tracks.map((track) => [track.language, track.label, track.isForced])).toEqual([
        ['de', 'Deutsch', false],
        ['en', 'English (Forced)', true],
      ]);
      // All of them travelled with the video, also the one that could not be read.
      expect((await readdir(path.join(folder, 'imported'))).sort()).toEqual([
        '603_the-matrix.de.srt',
        '603_the-matrix.en.forced.vtt',
        '603_the-matrix.fr.srt',
        '603_the-matrix.mkv',
        '603_the-matrix.nfo',
      ]);
      expect(await exists('604_another-film.es.srt')).toBe(true);
    });

    it('joins the title the catalog has already, and does not take the place of its video', async () => {
      await location();
      await drop('603_the-matrix.mkv', 'first');
      await lookTwice();
      const first = await file('603_the-matrix.mkv');

      await drop('603_the-matrix-remaster.mkv', 'second');
      await lookTwice();
      const second = await file('603_the-matrix-remaster.mkv');
      expect(second).toMatchObject({ state: 'CONFLICT', asset: null });
      expect(second.note).toContain('has a video already');
      // No second title, no second video, and the file stays where it is.
      expect(await testApp.prisma.title.count()).toBe(1);
      expect(await testApp.prisma.asset.count()).toBe(1);
      expect(await exists('603_the-matrix-remaster.mkv')).toBe(true);
      expect((await get('/v1/watch/summary').expect(200)).body.attention).toBe(1);

      // An admin lets it replace the video. The title is a draft, so it does at once.
      await post(`/v1/watch/files/${second.id}/retry`, { replace: true }).expect(200);
      await look();
      const replaced = await file('603_the-matrix-remaster.mkv');
      expect(replaced.state).toBe('IMPORTED');
      const title = (await get(`/v1/titles/${first.title?.id}`).expect(200)).body;
      expect(title.asset.id).toBe(replaced.asset?.id);
      expect(title.asset.id).not.toBe(first.asset?.id);
    });

    it('keeps the video of a published title until the new one plays', async () => {
      await location();
      await drop('603_the-matrix.mkv', 'first');
      await lookTwice();
      const first = await file('603_the-matrix.mkv');
      await ready(first.asset?.id as string);
      await http()
        .put(`/v1/titles/${first.title?.id}/status`)
        .set(auth())
        .send({ status: 'PUBLISHED' })
        .expect(200);

      await drop('603_better.mkv', 'second');
      await lookTwice();
      const second = await file('603_better.mkv');
      await post(`/v1/watch/files/${second.id}/retry`, { replace: true }).expect(200);
      await look();
      const imported = await file('603_better.mkv');
      expect(imported.state).toBe('IMPORTED');
      const playing = async () =>
        (await get(`/v1/titles/${first.title?.id}`).expect(200)).body.asset.id as string;
      // Viewers go on watching the first one.
      expect(await playing()).toBe(first.asset?.id);

      await ready(imported.asset?.id as string);
      await look();
      expect(await playing()).toBe(imported.asset?.id);
    });
  });

  describe('an episode', () => {
    it('brings its series, and goes to its place in it', async () => {
      await location();
      await drop('shows/1399_S01E02_midnight-zone.mkv', 'episode two');
      await lookTwice();

      const row = await file('shows/1399_S01E02_midnight-zone.mkv');
      expect(row).toMatchObject({
        state: 'IMPORTED',
        metadataId: 'tv:1399',
        seasonNumber: 1,
        episodeNumber: 2,
        title: { type: 'SERIES', name: 'Deep Water' },
        episode: { name: 'Midnight Zone' },
      });
      const series = (await get(`/v1/titles/${row.title?.id}`).expect(200)).body;
      const season = series.seasons.find((item: { number: number }) => item.number === 1);
      const byNumber = (number: number) =>
        season.episodes.find((item: { number: number }) => item.number === number);
      expect(byNumber(2).asset).toMatchObject({ id: row.asset?.id });
      // The other episode waits for its file.
      expect(byNumber(1).asset).toBeNull();
      const asset = await testApp.prisma.asset.findUniqueOrThrow({ where: { id: row.asset?.id } });
      expect(asset.title).toBe('Deep Water S01E02 · Midnight Zone');
      expect(await exists('imported/shows/1399_S01E02_midnight-zone.mkv')).toBe(true);

      // The next episode joins the same series.
      await drop('shows/1399_s01e01.mkv', 'episode one');
      await lookTwice();
      expect((await file('shows/1399_s01e01.mkv')).episode?.name).toBe('The Shelf');
      expect(await testApp.prisma.title.count()).toBe(1);
    });

    it('fails with a reason when the source has no such episode', async () => {
      await location();
      await drop('1399_S01E09_nowhere.mkv');
      await lookTwice();
      const row = await file('1399_S01E09_nowhere.mkv');
      expect(row.state).toBe('FAILED');
      expect(row.note).toContain('TMDB lists no S01E09 for "Deep Water"');
      expect(await testApp.prisma.asset.count()).toBe(0);
      expect(await exists('1399_S01E09_nowhere.mkv')).toBe(true);
    });
  });

  describe('files that need an admin', () => {
    it('are listed when their name says nothing, and imported once they are matched', async () => {
      await location();
      await drop('The Matrix (1999).mkv');
      await lookTwice();
      const row = await file('The Matrix (1999).mkv');
      expect(row).toMatchObject({ state: 'UNRECOGNISED', metadataId: null });
      expect((await files('&state=UNRECOGNISED')).map((item) => item.path)).toEqual([
        'The Matrix (1999).mkv',
      ]);
      expect(await files('&q=nothing-like-it')).toEqual([]);

      const url = `/v1/watch/files/${row.id}`;
      await post(`${url}/retry`).expect(409);
      await post(`${url}/match`, { kind: 'MOVIE', tmdbId: 603, seasonNumber: 1 }).expect(400);
      await post(`${url}/match`, { kind: 'SERIES', tmdbId: 1399 }).expect(400);
      const matched = await post(`${url}/match`, { kind: 'MOVIE', tmdbId: 603 }).expect(200);
      expect(matched.body).toMatchObject({
        state: 'QUEUED',
        metadataId: 'movie:603',
        matchedByHand: true,
      });

      await look();
      expect(await file('The Matrix (1999).mkv')).toMatchObject({
        state: 'IMPORTED',
        title: { name: 'The Matrix' },
      });
      // What is imported cannot be matched again.
      await post(`${url}/match`, { kind: 'MOVIE', tmdbId: 603 }).expect(409);
    });

    it('can be set aside, and are forgotten when they are gone', async () => {
      await location();
      await drop('holiday.mkv');
      await drop('603_the-matrix.mkv');
      await look();
      const waiting = await file('603_the-matrix.mkv');
      await post(`/v1/watch/files/${waiting.id}/ignore`).expect(200);
      await lookTwice();
      expect(await files()).toMatchObject([
        { path: '603_the-matrix.mkv', state: 'IGNORED' },
        { path: 'holiday.mkv', state: 'UNRECOGNISED' },
      ]);
      expect(await testApp.prisma.title.count()).toBe(0);

      // Taken back, it is imported like any other.
      await post(`/v1/watch/files/${waiting.id}/retry`).expect(200);
      await rm(path.join(folder, 'holiday.mkv'));
      await look();
      expect(await files()).toMatchObject([{ path: '603_the-matrix.mkv', state: 'IMPORTED' }]);
    });

    it('fail with what the source said, and are tried again together', async () => {
      const { id } = await location();
      await drop('603_the-matrix.mkv');
      await drop('1399_S01E01_the-shelf.mkv');
      await look();
      tmdb.failWith = 500;
      await look();
      const failed = await files();
      expect(failed.map((row) => row.state)).toEqual(['FAILED', 'FAILED']);
      expect(failed[0]?.note).toBeTruthy();
      expect(await testApp.prisma.title.count()).toBe(0);
      expect(await exists('603_the-matrix.mkv')).toBe(true);
      // Left alone until somebody asks.
      tmdb.failWith = null;
      await look();
      expect((await files()).map((row) => row.state)).toEqual(['FAILED', 'FAILED']);

      const again = await post('/v1/watch/files/retry', { locationId: id }).expect(200);
      expect(again.body).toEqual({ queued: 2 });
      await look();
      expect((await files()).map((row) => row.state)).toEqual(['IMPORTED', 'IMPORTED']);
    });
  });

  describe('what a location is set to do', () => {
    it('publishes by itself once the video plays', async () => {
      await location({ autoPublish: true });
      await drop('603_the-matrix.mkv');
      await drop('1399_S01E01_the-shelf.mkv');
      await lookTwice();
      const [episode, movie] = await files();
      expect(movie).toMatchObject({ state: 'IMPORTED', publishPending: true });
      const status = async (id: string | undefined) =>
        (await get(`/v1/titles/${id}`).expect(200)).body.status as string;
      // Not before the video plays.
      await look();
      expect(await status(movie?.title?.id)).toBe('DRAFT');

      await ready(movie?.asset?.id as string);
      await ready(episode?.asset?.id as string);
      await look();
      expect(await status(movie?.title?.id)).toBe('PUBLISHED');
      expect(await status(episode?.title?.id)).toBe('PUBLISHED');
      expect((await files()).every((row) => !row.publishPending)).toBe(true);
      expect((await http().get('/v1/catalog/titles').expect(200)).body.total).toBe(2);
    });

    it('says so when a video that should be published cannot be processed', async () => {
      await location({ autoPublish: true });
      await drop('603_the-matrix.mkv');
      await lookTwice();
      const row = await file('603_the-matrix.mkv');
      await testApp.prisma.asset.update({
        where: { id: row.asset?.id },
        data: { status: 'FAILED' },
      });
      await look();
      const after = await file('603_the-matrix.mkv');
      expect(after).toMatchObject({ state: 'IMPORTED', publishPending: false });
      expect(after.note).toContain('could not be processed');
    });

    it('keeps files where they are without importing them twice, or deletes them', async () => {
      const { id } = await location({ afterImport: 'KEEP' });
      await drop('603_the-matrix.mkv', 'first');
      await lookTwice();
      await lookTwice();
      expect(await exists('603_the-matrix.mkv')).toBe(true);
      expect(await testApp.prisma.asset.count()).toBe(1);

      // Another file under the same name is a new delivery: it asks before it replaces.
      await drop('603_the-matrix.mkv', 'second, longer');
      await lookTwice();
      expect((await file('603_the-matrix.mkv')).state).toBe('CONFLICT');

      await patch(`/v1/watch/locations/${id}`, { afterImport: 'DELETE' }).expect(200);
      await drop('1399_S01E01_the-shelf.mkv');
      await drop('1399_S01E01_the-shelf.de.srt');
      await lookTwice();
      expect((await file('1399_S01E01_the-shelf.mkv')).state).toBe('IMPORTED');
      expect(await exists('1399_S01E01_the-shelf.mkv')).toBe(false);
      expect(await exists('1399_S01E01_the-shelf.de.srt')).toBe(false);
      expect(await exists('imported')).toBe(false);
    });

    it('waits for its interval, unless a look is asked for, and rests while paused', async () => {
      const { id } = await location({ scanIntervalMinutes: 60 });
      await drop('603_the-matrix.mkv');
      // An old file needs no second look to be trusted... but still one to be seen.
      const old = new Date(Date.now() - 3_600_000);
      await utimes(path.join(folder, '603_the-matrix.mkv'), old, old);
      await look();
      expect((await file('603_the-matrix.mkv')).state).toBe('WAITING');
      // Ten minutes later the hour is not over.
      await look();
      expect((await file('603_the-matrix.mkv')).state).toBe('WAITING');

      const asked = await post(`/v1/watch/locations/${id}/scan`).expect(200);
      expect(asked.body.scanRequested).toBe(true);
      await look();
      expect((await file('603_the-matrix.mkv')).state).toBe('IMPORTED');
      expect((await get(`/v1/watch/locations/${id}`).expect(200)).body.scanRequested).toBe(false);

      await patch(`/v1/watch/locations/${id}`, { isActive: false, scanIntervalMinutes: 1 }).expect(
        200,
      );
      await drop('1399_S01E01_the-shelf.mkv');
      await lookTwice();
      expect(await files()).toHaveLength(1);
    });

    it('reports a place that cannot be read, and goes on with the others', async () => {
      const broken = (
        await post('/v1/watch/locations', {
          name: 'Bucket',
          driver: 'S3',
          config: {
            bucket: 'incoming',
            endpoint: 'http://127.0.0.1:9',
            accessKeyId: 'key',
            secretAccessKey: 'a-secret',
          },
        }).expect(201)
      ).body as { id: string };
      await location();
      await drop('603_the-matrix.mkv');
      await lookTwice();

      const shown = (await get(`/v1/watch/locations/${broken.id}`).expect(200)).body;
      expect(shown.lastScanError).toBeTruthy();
      expect(shown.lastScanAt).not.toBeNull();
      expect((await file('603_the-matrix.mkv')).state).toBe('IMPORTED');
    }, 60_000);
  });
});
