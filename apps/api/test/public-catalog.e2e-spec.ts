// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the public catalog: what viewers can see and play
// without signing in, and what must stay hidden from them.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

interface Card {
  slug: string;
  name: string;
}

describe.skipIf(!TEST_DATABASE_URL)('Public catalog (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const names = (items: Card[]) => items.map((item) => item.name);

  async function createAsset(title: string, ready = true): Promise<string> {
    const response = await http().post('/v1/assets').set(auth()).send({ title }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: {
        status: ready ? 'READY' : 'PROCESSING',
        manifestPath: ready ? `assets/${id}/hls/master.m3u8` : null,
        durationMs: 90_000,
        height: 1080,
      },
    });
    return id;
  }

  async function createCategory(name: string): Promise<{ id: string; slug: string }> {
    const response = await http().post('/v1/categories').set(auth()).send({ name }).expect(201);
    return response.body as { id: string; slug: string };
  }

  /** Creates a movie with a ready video. Published unless told otherwise. */
  async function createMovie(
    name: string,
    fields: Record<string, unknown> = {},
    publish = true,
  ): Promise<{ id: string; slug: string; assetId: string }> {
    const created = await http()
      .post('/v1/titles')
      .set(auth())
      .send({ type: 'MOVIE', name })
      .expect(201);
    const assetId = await createAsset(`${name} master`);
    await http()
      .patch(`/v1/titles/${created.body.id}`)
      .set(auth())
      .send({ assetId, ...fields })
      .expect(200);
    if (publish) {
      await http()
        .put(`/v1/titles/${created.body.id}/status`)
        .set(auth())
        .send({ status: 'PUBLISHED' })
        .expect(200);
    }
    return { id: created.body.id as string, slug: created.body.slug as string, assetId };
  }

  /**
   * Creates a published series with two seasons. Season 1 has a published and
   * a draft episode. Season 2 has only a draft episode.
   */
  async function createSeries(name: string, fields: Record<string, unknown> = {}) {
    const created = await http()
      .post('/v1/titles')
      .set(auth())
      .send({ type: 'SERIES', name })
      .expect(201);
    const id = created.body.id as string;
    if (Object.keys(fields).length > 0) {
      await http().patch(`/v1/titles/${id}`).set(auth()).send(fields).expect(200);
    }

    const episode = async (seasonId: string, episodeName: string, publish: boolean) => {
      const assetId = await createAsset(`${name} ${episodeName}`);
      const response = await http()
        .post(`/v1/seasons/${seasonId}/episodes`)
        .set(auth())
        .send({ name: episodeName, assetId })
        .expect(201);
      if (publish) {
        await http()
          .patch(`/v1/episodes/${response.body.id}`)
          .set(auth())
          .send({ status: 'PUBLISHED' })
          .expect(200);
      }
      return { id: response.body.id as string, assetId };
    };

    const first = await http().post(`/v1/titles/${id}/seasons`).set(auth()).send({}).expect(201);
    const seasonOne = first.body.seasons[0].id as string;
    const pilot = await episode(seasonOne, 'Pilot', true);
    const draft = await episode(seasonOne, 'Unfinished', false);
    const second = await http().post(`/v1/titles/${id}/seasons`).set(auth()).send({}).expect(201);
    await episode(second.body.seasons[1].id as string, 'Next year', false);

    await http()
      .put(`/v1/titles/${id}/status`)
      .set(auth())
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return { id, slug: created.body.slug as string, pilot, draft };
  }

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-public-catalog-'));
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
    await testApp.resetDatabase();
    await testApp.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  it('answers without sign-in, and with nothing when the catalog is empty', async () => {
    const home = await http().get('/v1/catalog/home').expect(200);
    expect(home.body).toEqual({ custom: false, hero: null, rows: [] });
    expect(home.headers['cache-control']).toBe('public, max-age=30');

    const titles = await http().get('/v1/catalog/titles').expect(200);
    expect(titles.body).toMatchObject({ items: [], total: 0 });
    expect((await http().get('/v1/catalog/categories').expect(200)).body).toEqual([]);
  });

  describe('what viewers see', () => {
    it('lists only published titles and nothing internal about them', async () => {
      const drama = await createCategory('Drama');
      await createMovie('Night Train', {
        tagline: 'One night.',
        releaseYear: 2024,
        ageRating: '16',
        categoryIds: [drama.id],
      });
      await createMovie('Still Editing', {}, false);
      const archived = await createMovie('Old Cut');
      await http()
        .put(`/v1/titles/${archived.id}/status`)
        .set(auth())
        .send({ status: 'ARCHIVED' })
        .expect(200);

      const list = await http().get('/v1/catalog/titles').expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0]).toEqual({
        id: expect.any(String),
        type: 'MOVIE',
        slug: 'night-train',
        name: 'Night Train',
        tagline: 'One night.',
        releaseYear: 2024,
        ageRating: '16',
        // Read from the rating.
        minAge: 16,
        isFeatured: false,
        access: 'FREE',
        packageIds: [],
        rentAmount: null,
        buyAmount: null,
        purchaseOnly: false,
        poster: null,
        backdrop: null,
        logo: null,
        categories: [{ slug: 'drama', name: 'Drama' }],
        durationMs: 90_000,
        seasonCount: 0,
        episodeCount: 0,
        publishedAt: expect.any(String),
      });
    });

    it('shows a title by its slug and hides drafts behind the same answer as a wrong slug', async () => {
      await createMovie('Night Train', { synopsis: 'A train at night.', originalLanguage: 'en' });
      await createMovie('Still Editing', {}, false);

      const shown = await http().get('/v1/catalog/titles/night-train').expect(200);
      expect(shown.body).toMatchObject({
        name: 'Night Train',
        synopsis: 'A train at night.',
        originalLanguage: 'en',
        hasTrailer: false,
        seasons: [],
      });
      expect(shown.body).not.toHaveProperty('status');
      expect(shown.body).not.toHaveProperty('asset');
      expect(shown.body).not.toHaveProperty('checklist');

      const draft = await http().get('/v1/catalog/titles/still-editing').expect(404);
      const missing = await http().get('/v1/catalog/titles/no-such-title').expect(404);
      expect(draft.body.message).toBe(missing.body.message);

      await http().get('/v1/catalog/titles/Not%20A%20Slug').expect(400);
    });

    it('shows of a series only the episodes that are published', async () => {
      const series = await createSeries('Deep Ocean');

      const shown = await http().get(`/v1/catalog/titles/${series.slug}`).expect(200);
      expect(shown.body).toMatchObject({ type: 'SERIES', seasonCount: 1, episodeCount: 1 });
      expect(shown.body.durationMs).toBeNull();
      expect(shown.body.seasons).toEqual([
        {
          number: 1,
          name: null,
          synopsis: null,
          episodes: [
            {
              id: series.pilot.id,
              number: 1,
              name: 'Pilot',
              synopsis: null,
              still: null,
              durationMs: 90_000,
            },
          ],
        },
      ]);

      const list = await http().get('/v1/catalog/titles?type=SERIES').expect(200);
      expect(list.body.items[0]).toMatchObject({ seasonCount: 1, episodeCount: 1 });
    });

    it('hides a published title while its video cannot be played', async () => {
      const movie = await createMovie('Night Train');
      const series = await createSeries('Deep Ocean');
      const visible = async () =>
        names((await http().get('/v1/catalog/titles?sort=name').expect(200)).body.items as Card[]);
      expect(await visible()).toEqual(['Deep Ocean', 'Night Train']);

      // The video is deleted in the library, or is being processed again.
      await testApp.prisma.asset.update({
        where: { id: movie.assetId },
        data: { status: 'DELETED' },
      });
      await testApp.prisma.asset.update({
        where: { id: series.pilot.assetId },
        data: { status: 'PROCESSING' },
      });

      expect(await visible()).toEqual([]);
      await http().get(`/v1/catalog/titles/${movie.slug}`).expect(404);
      await http().post(`/v1/catalog/titles/${movie.slug}/playback`).expect(404);
      await http().post(`/v1/catalog/episodes/${series.pilot.id}/playback`).expect(404);

      // The panel says so: still published, but not visible.
      const admin = await http().get(`/v1/titles/${movie.id}`).set(auth()).expect(200);
      expect(admin.body).toMatchObject({ status: 'PUBLISHED', isVisible: false });
      const adminList = await http().get('/v1/titles?sort=name&order=asc').set(auth()).expect(200);
      expect(
        (adminList.body.items as { name: string; isVisible: boolean }[]).map((item) => [
          item.name,
          item.isVisible,
        ]),
      ).toEqual([
        ['Deep Ocean', false],
        ['Night Train', false],
      ]);

      // Processing finishes and the series is back.
      await testApp.prisma.asset.update({
        where: { id: series.pilot.assetId },
        data: { status: 'READY' },
      });
      expect(await visible()).toEqual(['Deep Ocean']);
    });
  });

  describe('browsing', () => {
    it('filters by kind, category, featured and name, and sorts', async () => {
      const drama = await createCategory('Drama');
      const nature = await createCategory('Nature');
      await createMovie('Night Train', { categoryIds: [drama.id], releaseYear: 2020 });
      await createMovie('Harvest', {
        categoryIds: [drama.id, nature.id],
        releaseYear: 2024,
        isFeatured: true,
      });
      await createSeries('Deep Ocean', { categoryIds: [nature.id], originalName: 'Tiefsee' });
      await createMovie('Draft Drama', { categoryIds: [drama.id], isFeatured: true }, false);

      const list = async (query: string) =>
        names((await http().get(`/v1/catalog/titles?${query}`).expect(200)).body.items as Card[]);

      expect(await list('sort=name')).toEqual(['Deep Ocean', 'Harvest', 'Night Train']);
      expect(await list('sort=newest')).toEqual(['Deep Ocean', 'Harvest', 'Night Train']);
      expect(await list('sort=year')).toEqual(['Harvest', 'Night Train', 'Deep Ocean']);
      expect(await list('type=MOVIE&sort=name')).toEqual(['Harvest', 'Night Train']);
      expect(await list('category=drama&sort=name')).toEqual(['Harvest', 'Night Train']);
      expect(await list('category=nature&type=SERIES')).toEqual(['Deep Ocean']);
      expect(await list('featured=true')).toEqual(['Harvest']);
      expect(await list('q=TRAIN')).toEqual(['Night Train']);
      expect(await list('q=tiefsee')).toEqual(['Deep Ocean']);
      expect(await list('q=draft')).toEqual([]);
      expect(await list('category=no-such-category')).toEqual([]);

      const paged = await http().get('/v1/catalog/titles?sort=name&pageSize=2&page=2').expect(200);
      expect(paged.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(names(paged.body.items as Card[])).toEqual(['Night Train']);

      await http().get('/v1/catalog/titles?sort=secret').expect(400);
    });

    it('lists the categories that have something to show, with honest counts', async () => {
      const drama = await createCategory('Drama');
      const nature = await createCategory('Nature');
      await createCategory('Empty');
      const draftsOnly = await createCategory('Drafts only');
      await createMovie('Night Train', { categoryIds: [drama.id] });
      await createMovie('Harvest', { categoryIds: [drama.id, nature.id] });
      await createMovie('Draft', { categoryIds: [drama.id, draftsOnly.id] }, false);

      const categories = await http().get('/v1/catalog/categories').expect(200);
      expect(categories.body).toEqual([
        { slug: 'drama', name: 'Drama', description: null, titleCount: 2 },
        { slug: 'nature', name: 'Nature', description: null, titleCount: 1 },
      ]);
    });

    it('builds the home page from featured, new and category rows', async () => {
      const drama = await createCategory('Drama');
      await createCategory('Empty');
      await createMovie('Night Train', { categoryIds: [drama.id] });
      await createMovie('Harvest', { isFeatured: true });
      await createMovie('Draft', { categoryIds: [drama.id], isFeatured: true }, false);

      const home = await http().get('/v1/catalog/home').expect(200);
      expect(
        (home.body.rows as { key: string; name: string; titles: Card[] }[]).map((row) => [
          row.key,
          row.name,
          names(row.titles),
        ]),
      ).toEqual([
        ['continue', 'Continue watching', []],
        ['list', 'My list', []],
        // One featured title is the opening. A row of one would only repeat it.
        ['latest', 'New', ['Harvest', 'Night Train']],
        ['recommended', 'Because you watched', []],
        ['category:drama', 'Drama', ['Night Train']],
      ]);
      expect(home.body.custom).toBe(false);
      expect(names(home.body.hero.titles)).toEqual(['Harvest']);
      expect(home.body.rows[4]).toMatchObject({
        category: { slug: 'drama', name: 'Drama' },
        kind: 'titles',
        layout: 'poster',
        browse: '/browse?category=drama',
      });
    });
  });

  describe('playback', () => {
    it('gives signed addresses for a movie, its trailer and an episode', async () => {
      const trailerId = await createAsset('Trailer');
      const movie = await createMovie('Night Train', { trailerAssetId: trailerId });
      const series = await createSeries('Deep Ocean');

      const film = await http().post(`/v1/catalog/titles/${movie.slug}/playback`).expect(200);
      expect(film.body.protocol).toBe('hls');
      expect(film.body.manifestUrl).toMatch(
        new RegExp(`^/v1/media/${movie.assetId}/[^/]+/hls/master\\.m3u8$`),
      );
      expect(film.headers['cache-control']).toBe('no-store');

      const detail = await http().get(`/v1/catalog/titles/${movie.slug}`).expect(200);
      expect(detail.body.hasTrailer).toBe(true);
      const trailer = await http()
        .post(`/v1/catalog/titles/${movie.slug}/trailer/playback`)
        .expect(200);
      expect(trailer.body.manifestUrl).toContain(`/v1/media/${trailerId}/`);

      const episode = await http()
        .post(`/v1/catalog/episodes/${series.pilot.id}/playback`)
        .expect(200);
      expect(episode.body.manifestUrl).toContain(`/v1/media/${series.pilot.assetId}/`);
    });

    it('refuses what is not published or not there', async () => {
      const draft = await createMovie('Still Editing', {}, false);
      const movie = await createMovie('Night Train');
      const series = await createSeries('Deep Ocean');

      await http().post(`/v1/catalog/titles/${draft.slug}/playback`).expect(404);
      await http().post(`/v1/catalog/titles/${movie.slug}/trailer/playback`).expect(404);
      await http().post(`/v1/catalog/episodes/${series.draft.id}/playback`).expect(404);
      await http().post(`/v1/catalog/episodes/${movie.id}/playback`).expect(404);
      await http().post('/v1/catalog/episodes/not-an-id/playback').expect(400);

      const whole = await http().post(`/v1/catalog/titles/${series.slug}/playback`).expect(409);
      expect(whole.body.message).toContain('episode by episode');

      // An episode of a series that was unpublished as a whole.
      await http()
        .put(`/v1/titles/${series.id}/status`)
        .set(auth())
        .send({ status: 'DRAFT' })
        .expect(200);
      await http().post(`/v1/catalog/episodes/${series.pilot.id}/playback`).expect(404);
    });

    it('limits how often one client may ask for playback', async () => {
      for (let request = 0; request < 120; request += 1) {
        await http().post('/v1/catalog/titles/no-such-title/playback').expect(404);
      }
      const refused = await http().post('/v1/catalog/titles/no-such-title/playback').expect(429);
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      expect(refused.body.retryAfterSeconds).toBeGreaterThan(0);

      // Browsing has its own, larger allowance.
      await http().get('/v1/catalog/titles').expect(200);
    });
  });

  describe('with playback closed', () => {
    let closedApp: TestApp;

    beforeAll(async () => {
      closedApp = await createTestApp([AssetsModule, AdminsModule, CatalogModule], {
        STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
        UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
        CATALOG_PLAYBACK: 'off',
      });
    });

    afterAll(async () => {
      await closedApp.close();
    });

    it('still shows the catalog but plays nothing', async () => {
      const movie = await createMovie('Night Train');

      const list = await closedApp.http().get('/v1/catalog/titles').expect(200);
      expect(names(list.body.items as Card[])).toEqual(['Night Train']);

      const refused = await closedApp
        .http()
        .post(`/v1/catalog/titles/${movie.slug}/playback`)
        .expect(403);
      expect(refused.body.message).toContain('not open');
    });
  });
});
