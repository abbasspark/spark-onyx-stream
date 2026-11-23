// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of duplicating a title: what a copy takes along by
// default, what the choices add or leave out, and what always stays with the
// original.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

/** The start of a PNG file, which is all the server reads to recognize it. */
function png(width: number, height: number): Buffer {
  const data = Buffer.alloc(133);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write('IHDR', 12, 'latin1');
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

describe.skipIf(!TEST_DATABASE_URL)('Duplicating a title (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let workDirectory: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const get = (url: string) => http().get(url).set(auth());
  const post = (url: string, body: object = {}) => http().post(url).set(auth()).send(body);
  const put = (url: string, body: object) => http().put(url).set(auth()).send(body);
  const patch = (url: string, body: object) => http().patch(url).set(auth()).send(body);
  const created = async (url: string, body: object) =>
    (await post(url, body).expect(201)).body as { id: string; slug: string };

  async function asset(name: string): Promise<string> {
    const response = await post('/v1/assets', { title: name }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: { status: 'READY', manifestPath: `assets/${id}/hls/master.m3u8`, readyAt: new Date() },
    });
    return id;
  }
  const image = async (kind: string, width: number, height: number) =>
    (
      await http()
        .post(`/v1/images?kind=${kind}`)
        .set(auth())
        .set('Content-Type', 'application/octet-stream')
        .send(png(width, height))
        .expect(201)
    ).body.id as string;

  /** A published movie with everything a title can carry. */
  async function fullMovie() {
    const drama = await created('/v1/genres', { name: 'Drama' });
    const kids = await created('/v1/categories', { name: 'Kids' });
    const saga = await created('/v1/collections', { name: 'Harbour Saga' });
    const mira = await created('/v1/people', { name: 'Mira Castell' });
    const film = await created('/v1/titles', { type: 'MOVIE', name: 'Harbour Lights' });
    const [main, trailer, teaser] = [await asset('Film'), await asset('Trailer'), await asset('T')];
    const poster = await image('POSTER', 1000, 1500);
    await patch(`/v1/titles/${film.id}`, {
      assetId: main,
      trailerAssetId: trailer,
      posterId: poster,
      synopsis: 'A port town in winter.',
      releaseYear: 2024,
      keywords: ['harbour', 'winter'],
      genreIds: [drama.id],
      categoryIds: [kids.id],
      access: 'PAID',
      rentAmount: 399,
      availableFrom: '2020-01-01T00:00:00.000Z',
      isFeatured: true,
    }).expect(200);
    await post(`/v1/titles/${film.id}/extras`, { name: 'Teaser', assetId: teaser }).expect(201);
    await put(`/v1/titles/${film.id}/credits`, {
      credits: [{ personId: mira.id, kind: 'CAST', role: 'Greta Holm' }],
    }).expect(200);
    await put(`/v1/titles/${film.id}/translations/de`, { name: 'Hafenlichter' }).expect(200);
    await put(`/v1/collections/${saga.id}/titles`, { titleIds: [film.id] }).expect(200);
    await testApp.prisma.title.update({
      where: { id: film.id },
      data: { metadataSource: 'tmdb', metadataId: 'movie:603', rating: 7.6 },
    });
    await put(`/v1/titles/${film.id}/status`, { status: 'PUBLISHED' }).expect(200);
    return { film, main, trailer, poster, saga };
  }

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-duplicate-'));
    testApp = await createTestApp([AssetsModule, AdminsModule, CatalogModule], {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
    });
  });
  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });
  afterAll(async () => {
    await testApp?.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  describe('a movie', () => {
    it('becomes a draft with the texts, people and prices, and without videos', async () => {
      const { film, poster } = await fullMovie();

      const response = await post(`/v1/titles/${film.id}/duplicate`).expect(201);
      const copy = response.body.title;
      expect(copy).toMatchObject({
        name: 'Harbour Lights (copy)',
        slug: 'harbour-lights-copy',
        type: 'MOVIE',
        status: 'DRAFT',
        isFeatured: false,
        synopsis: 'A port town in winter.',
        releaseYear: 2024,
        keywords: ['harbour', 'winter'],
        access: 'PAID',
        rentAmount: 399,
        asset: null,
        metadata: null,
        availableFrom: null,
      });
      expect(copy.id).not.toBe(film.id);
      expect(copy.poster.id).toBe(poster);
      expect(copy.genres.map((genre: { name: string }) => genre.name)).toEqual(['Drama']);
      expect(copy.categories.map((category: { name: string }) => category.name)).toEqual(['Kids']);
      expect(response.body.copied).toEqual({
        genres: 1,
        categories: 1,
        collections: 0,
        credits: 1,
        translations: 1,
        packages: 0,
        extras: 0,
        seasons: 0,
        episodes: 0,
        videos: 0,
      });

      const stored = await testApp.prisma.title.findUniqueOrThrow({
        where: { id: copy.id },
        include: { credits: true, translations: true, extras: true, collections: true },
      });
      expect(stored.rating).toBe(7.6);
      expect(stored.trailerAssetId).toBeNull();
      expect(stored.credits).toMatchObject([{ kind: 'CAST', role: 'Greta Holm' }]);
      expect(stored.translations).toMatchObject([{ language: 'de', name: 'Hafenlichter' }]);
      expect(stored.extras).toEqual([]);
      expect(stored.collections).toEqual([]);

      // The original is as it was, and viewers do not see the copy.
      const original = await get(`/v1/titles/${film.id}`).expect(200);
      expect(original.body).toMatchObject({ status: 'PUBLISHED', isFeatured: true });
      await http().get('/v1/catalog/titles/harbour-lights-copy').expect(404);
    });

    it('takes the videos, the collections, the dates and the link along when asked', async () => {
      const { film, main, trailer, saga } = await fullMovie();
      const other = await created('/v1/titles', { type: 'MOVIE', name: 'Second' });
      await put(`/v1/collections/${saga.id}/titles`, { titleIds: [film.id, other.id] }).expect(200);

      const response = await post(`/v1/titles/${film.id}/duplicate`, {
        name: 'Harbour Lights: Director’s Cut',
        parts: { videos: true, collections: true, availability: true, metadataLink: true },
      }).expect(201);
      const copy = response.body.title;
      expect(copy).toMatchObject({
        name: 'Harbour Lights: Director’s Cut',
        slug: 'harbour-lights-directors-cut',
        status: 'DRAFT',
        metadata: { source: 'tmdb', id: 'movie:603' },
        availableFrom: '2020-01-01T00:00:00.000Z',
      });
      expect(copy.asset.id).toBe(main);
      expect(response.body.copied).toMatchObject({ videos: 3, extras: 1, collections: 1 });

      const stored = await testApp.prisma.title.findUniqueOrThrow({
        where: { id: copy.id },
        include: { extras: true },
      });
      expect(stored.trailerAssetId).toBe(trailer);
      expect(stored.extras).toMatchObject([{ name: 'Teaser' }]);

      // At the end of the collection, behind what was arranged.
      const links = await testApp.prisma.collectionTitle.findMany({
        where: { collectionId: saga.id },
        orderBy: { position: 'asc' },
      });
      expect(links.map((link) => link.titleId)).toEqual([film.id, other.id, copy.id]);

      // With its video it can be published like any title.
      await put(`/v1/titles/${copy.id}/status`, { status: 'PUBLISHED' }).expect(200);
    });

    it('can be a bare template: the texts and nothing else', async () => {
      const { film } = await fullMovie();
      const response = await post(`/v1/titles/${film.id}/duplicate`, {
        parts: {
          artwork: false,
          classification: false,
          credits: false,
          translations: false,
          pricing: false,
        },
      }).expect(201);
      expect(response.body.title).toMatchObject({
        poster: null,
        genres: [],
        categories: [],
        keywords: [],
        access: 'FREE',
        rentAmount: null,
        synopsis: 'A port town in winter.',
      });
      expect(
        Object.values(response.body.copied as Record<string, number>).every((n) => n === 0),
      ).toBe(true);
    });

    it('gives every copy an address of its own, and does not stack "(copy)"', async () => {
      const { film } = await fullMovie();
      const first = await post(`/v1/titles/${film.id}/duplicate`).expect(201);
      const second = await post(`/v1/titles/${film.id}/duplicate`).expect(201);
      const third = await post(`/v1/titles/${first.body.title.id}/duplicate`).expect(201);

      expect(second.body.title).toMatchObject({
        name: 'Harbour Lights (copy)',
        slug: 'harbour-lights-copy-2',
      });
      expect(third.body.title).toMatchObject({
        name: 'Harbour Lights (copy)',
        slug: 'harbour-lights-copy-3',
      });
    });

    it('keeps a picture that two titles share', async () => {
      const { film, poster } = await fullMovie();
      const copy = (await post(`/v1/titles/${film.id}/duplicate`).expect(201)).body.title;

      await patch(`/v1/titles/${film.id}`, { posterId: null }).expect(200);
      await http().delete(`/v1/images/${poster}`).set(auth()).expect(409);
      await http().delete(`/v1/titles/${copy.id}`).set(auth()).expect(204);
      await http().delete(`/v1/images/${poster}`).set(auth()).expect(204);
    });
  });

  describe('a series', () => {
    async function series() {
      const show = await created('/v1/titles', { type: 'SERIES', name: 'Tide Tables' });
      const detail = await post(`/v1/titles/${show.id}/seasons`, {
        number: 1,
        name: 'First winter',
      }).expect(201);
      const seasonId = detail.body.seasons[0].id as string;
      const video = await asset('Episode 1');
      const still = await image('STILL', 1280, 720);
      const one = await post(`/v1/seasons/${seasonId}/episodes`, {
        number: 1,
        name: 'Low water',
      }).expect(201);
      await patch(`/v1/episodes/${one.body.id}`, {
        assetId: video,
        stillId: still,
        status: 'PUBLISHED',
      }).expect(200);
      const two = await post(`/v1/seasons/${seasonId}/episodes`, {
        number: 2,
        name: 'High water',
      }).expect(201);
      await put(`/v1/titles/${show.id}/translations/de`, {
        name: 'Gezeiten',
        seasons: [{ id: seasonId, name: 'Erster Winter' }],
        episodes: [{ id: one.body.id, name: 'Niedrigwasser' }],
      }).expect(200);
      return { show, video, still, episodeIds: [one.body.id, two.body.id] as string[] };
    }

    it('keeps its seasons and episodes as drafts without videos', async () => {
      const { show, still, episodeIds } = await series();

      const response = await post(`/v1/titles/${show.id}/duplicate`).expect(201);
      const copy = response.body.title;
      expect(response.body.copied).toMatchObject({ seasons: 1, episodes: 2, videos: 0 });
      expect(copy.seasons).toHaveLength(1);
      expect(copy.seasons[0]).toMatchObject({ number: 1, name: 'First winter' });
      expect(copy.seasons[0].episodes).toMatchObject([
        { number: 1, name: 'Low water', status: 'DRAFT', asset: null },
        { number: 2, name: 'High water', status: 'DRAFT', asset: null },
      ]);
      expect(copy.seasons[0].episodes[0].still.id).toBe(still);
      // New episodes, not the old ones moved.
      expect(copy.seasons[0].episodes.map((episode: { id: string }) => episode.id)).not.toEqual(
        episodeIds,
      );

      const translations = await get(`/v1/titles/${copy.id}/translations`).expect(200);
      expect(translations.body[0]).toMatchObject({
        language: 'de',
        name: 'Gezeiten',
        seasons: [{ id: copy.seasons[0].id, name: 'Erster Winter' }],
        episodes: [{ id: copy.seasons[0].episodes[0].id, name: 'Niedrigwasser' }],
      });

      const original = await get(`/v1/titles/${show.id}`).expect(200);
      expect(original.body.seasons[0].episodes[0]).toMatchObject({ status: 'PUBLISHED' });
    });

    it('takes the videos of the episodes along with "full", or no seasons with "none"', async () => {
      const { show, video } = await series();

      const full = await post(`/v1/titles/${show.id}/duplicate`, {
        parts: { seasons: 'full' },
      }).expect(201);
      expect(full.body.copied).toMatchObject({ seasons: 1, episodes: 2, videos: 1 });
      expect(full.body.title.seasons[0].episodes[0]).toMatchObject({ status: 'DRAFT' });
      expect(full.body.title.seasons[0].episodes[0].asset.id).toBe(video);

      const none = await post(`/v1/titles/${show.id}/duplicate`, {
        name: 'Tide Tables: The Return',
        parts: { seasons: 'none' },
      }).expect(201);
      expect(none.body.title.seasons).toEqual([]);
      expect(none.body.copied).toMatchObject({ seasons: 0, episodes: 0, translations: 1 });
    });
  });

  describe('who and what', () => {
    it('needs the permission to change the catalog, a title that exists and choices it knows', async () => {
      const film = await created('/v1/titles', { type: 'MOVIE', name: 'Alpha' });
      await post('/v1/admins', {
        email: 'viewer@example.com',
        displayName: 'Vera Viewer',
        password: 'another-long-password',
        role: 'VIEWER',
      }).expect(201);
      const viewer = testApp.bearer(
        await testApp.login('viewer@example.com', 'another-long-password'),
      );

      await http().post(`/v1/titles/${film.id}/duplicate`).set(viewer).send({}).expect(403);
      await post('/v1/titles/01900000-0000-7000-8000-000000000000/duplicate').expect(404);
      await post(`/v1/titles/${film.id}/duplicate`, { parts: { seasons: 'all' } }).expect(400);
      await post(`/v1/titles/${film.id}/duplicate`, { name: ' ' }).expect(400);
      expect(await testApp.prisma.title.count()).toBe(1);
    });

    it('is written to the audit log with where the copy came from', async () => {
      const film = await created('/v1/titles', { type: 'MOVIE', name: 'Alpha' });
      const copy = (await post(`/v1/titles/${film.id}/duplicate`).expect(201)).body.title;
      const entry = await testApp.prisma.auditLog.findFirst({
        where: { action: 'title.duplicate' },
      });
      expect(entry).toMatchObject({ entityType: 'Title', entityId: copy.id });
      expect(entry?.metadata).toMatchObject({
        name: 'Alpha (copy)',
        from: film.id,
        parts: { seasons: 'structure', videos: false },
      });
    });
  });
});
