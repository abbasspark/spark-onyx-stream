// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the home page of the website: how admins arrange it, and
// what viewers get.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { png } from './support/fake-tmdb.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const READER = {
  email: 'viewer-admin@example.com',
  displayName: 'Vera Viewer',
  password: 'viewer-password-123',
  role: 'VIEWER',
};

interface Row {
  key: string;
  name: string;
  kind: string;
  layout: string;
  browse: string | null;
  titles: { name: string }[];
}

describe.skipIf(!TEST_DATABASE_URL)('Home page (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let workDirectory: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const get = (url: string) => http().get(url).set(auth());
  const post = (url: string, body: object = {}) => http().post(url).set(auth()).send(body);
  const patch = (url: string, body: object) => http().patch(url).set(auth()).send(body);
  const put = (url: string, body: object) => http().put(url).set(auth()).send(body);
  const names = (titles: { name: string }[]) => titles.map((title) => title.name);

  async function asset(name: string): Promise<string> {
    const response = await post('/v1/assets', { title: name }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: { status: 'READY', manifestPath: `assets/${id}/hls/master.m3u8`, readyAt: new Date() },
    });
    return id;
  }
  /** A published movie. The order of creation is the order of "newest", last first. */
  async function movie(name: string, fields: Record<string, unknown> = {}, publish = true) {
    const title = (await post('/v1/titles', { type: 'MOVIE', name }).expect(201)).body;
    await patch(`/v1/titles/${title.id}`, { assetId: await asset(name), ...fields }).expect(200);
    if (publish) {
      await put(`/v1/titles/${title.id}/status`, { status: 'PUBLISHED' }).expect(200);
    }
    return title.id as string;
  }
  async function series(name: string) {
    const title = (await post('/v1/titles', { type: 'SERIES', name }).expect(201)).body;
    const season = await post(`/v1/titles/${title.id}/seasons`).expect(201);
    const episode = await post(`/v1/seasons/${season.body.seasons[0].id}/episodes`, {
      name: 'One',
      assetId: await asset(`${name} 1`),
    }).expect(201);
    await patch(`/v1/episodes/${episode.body.id}`, { status: 'PUBLISHED' }).expect(200);
    await put(`/v1/titles/${title.id}/status`, { status: 'PUBLISHED' }).expect(200);
    return title.id as string;
  }
  const named = async (kind: 'categories' | 'genres' | 'collections', name: string) =>
    (await post(`/v1/${kind}`, { name }).expect(201)).body.id as string;
  async function backdrop(): Promise<string> {
    const response = await http()
      .post('/v1/images?kind=BACKDROP')
      .set(auth())
      .set('Content-Type', 'application/octet-stream')
      .send(png(1920, 1080))
      .expect(201);
    return response.body.id as string;
  }
  const section = async (body: object) =>
    (await post('/v1/layout/home/sections', body).expect(201)).body as { id: string };
  const home = async () =>
    (await http().get('/v1/catalog/home').expect(200)).body as {
      custom: boolean;
      hero: { titles: { name: string }[] } | null;
      rows: Row[];
    };
  const layout = async () => (await home()).rows.map((row) => [row.name, names(row.titles)]);

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-home-'));
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

  describe('while nobody arranged it', () => {
    it('puts itself together, and says so', async () => {
      await movie('Alpha');
      await movie('Beta', { isFeatured: true });
      await movie('Gamma', { isFeatured: true, backdropId: await backdrop() });

      expect((await get('/v1/layout/home').expect(200)).body).toEqual({
        page: 'HOME',
        custom: false,
        sections: [],
      });
      const page = await home();
      expect(page.custom).toBe(false);
      // The opening is the featured title with a picture, not the newest of them by chance.
      expect(names(page.hero?.titles ?? [])).toEqual(['Gamma']);
      expect(page.rows.map((row) => [row.key, row.kind, row.browse, names(row.titles)])).toEqual([
        ['continue', 'continue', null, []],
        ['featured', 'titles', '/browse?featured=true', ['Gamma', 'Beta']],
        ['latest', 'titles', '/browse', ['Gamma', 'Beta', 'Alpha']],
      ]);
    });

    it('is taken over with sections that show the same', async () => {
      const drama = await named('categories', 'Drama');
      await named('categories', 'Empty');
      await movie('Alpha', { categoryIds: [drama] });
      await movie('Beta', { isFeatured: true });
      await movie('Gamma', { isFeatured: true });
      const before = await home();

      const started = await post('/v1/layout/home/start').expect(201);
      expect(started.body.custom).toBe(true);
      expect(
        started.body.sections.map((entry: { kind: string; defaultName: string; count: number }) => [
          entry.kind,
          entry.defaultName,
          entry.count,
        ]),
      ).toEqual([
        ['HERO', 'Featured', 2],
        ['CONTINUE_WATCHING', 'Continue watching', 0],
        ['TITLES', 'Featured', 2],
        ['TITLES', 'New', 3],
        ['TITLES', 'Drama', 1],
      ]);
      await post('/v1/layout/home/start').expect(409);

      const after = await home();
      expect(after.custom).toBe(true);
      expect(after.rows.map((row) => [row.name, row.kind, row.browse, names(row.titles)])).toEqual(
        before.rows.map((row) => [row.name, row.kind, row.browse, names(row.titles)]),
      );
      expect(names(after.hero?.titles ?? [])).toEqual(['Gamma', 'Beta']);

      // And given back.
      await http().delete('/v1/layout/home').set(auth()).expect(204);
      expect((await home()).custom).toBe(false);
      expect(await testApp.prisma.homeSection.count()).toBe(0);
    });
  });

  describe('sections', () => {
    it('show what their source, kind of title, order and limit say', async () => {
      const drama = await named('categories', 'Drama');
      const thriller = await named('genres', 'Thriller');
      const low = await movie('Low', { categoryIds: [drama] });
      const high = await movie('High', { genreIds: [thriller], isFeatured: true });
      await movie('Middle', { categoryIds: [drama], genreIds: [thriller] });
      await movie('Hidden draft', { categoryIds: [drama] }, false);
      await series('Deep Water');
      await testApp.prisma.title.update({ where: { id: low }, data: { rating: 4.1 } });
      await testApp.prisma.title.update({ where: { id: high }, data: { rating: 9.2 } });

      await section({ kind: 'TITLES', source: 'ALL', sort: 'RATING', titleType: 'MOVIE' });
      await section({ kind: 'TITLES', source: 'CATEGORY', categoryId: drama, sort: 'NAME' });
      await section({ kind: 'TITLES', source: 'GENRE', genreId: thriller, layout: 'LANDSCAPE' });
      await section({ kind: 'TITLES', source: 'FEATURED', name: 'Staff favourites' });
      await section({ kind: 'TITLES', source: 'ALL', titleType: 'SERIES', layout: 'NUMBERED' });
      await section({ kind: 'TITLES', source: 'ALL', limit: 4, name: 'Only four' });

      const page = await home();
      expect(page.hero).toBeNull();
      expect(page.rows.map((row) => [row.name, row.layout, row.browse, names(row.titles)])).toEqual(
        [
          [
            'Top rated movies',
            'poster',
            '/browse?type=MOVIE&sort=rating',
            ['High', 'Low', 'Middle'],
          ],
          ['Drama', 'poster', '/browse?category=drama&sort=name', ['Low', 'Middle']],
          ['Thriller', 'landscape', '/browse?genre=thriller', ['Middle', 'High']],
          ['Staff favourites', 'poster', '/browse?featured=true', ['High']],
          ['New series', 'numbered', '/browse?type=SERIES', ['Deep Water']],
          ['Only four', 'poster', '/browse', ['Deep Water', 'Middle', 'High', 'Low']],
        ],
      );
      // What "See all" leads to exists.
      const sorted = await http().get('/v1/catalog/titles?type=MOVIE&sort=rating').expect(200);
      expect(names(sorted.body.items)).toEqual(['High', 'Low', 'Middle']);
    });

    it('show picked titles and collections in their own order, without what viewers may not see', async () => {
      const first = await movie('First');
      const second = await movie('Second');
      const draft = await movie('Draft', {}, false);
      const saga = await named('collections', 'The Saga');
      await put(`/v1/collections/${saga}/titles`, { titleIds: [second, draft, first] }).expect(200);

      const picks = await section({
        kind: 'TITLES',
        source: 'MANUAL',
        titleIds: [first, draft, second],
        // Picked titles keep their order, whatever is asked for.
        sort: 'NAME',
      });
      await section({ kind: 'TITLES', source: 'COLLECTION', collectionId: saga });
      await section({ kind: 'TITLES', source: 'COLLECTION', collectionId: saga, sort: 'NAME' });

      const page = await home();
      expect(page.rows.map((row) => [row.name, row.browse, names(row.titles)])).toEqual([
        ['Our picks', null, ['First', 'Second']],
        ['The Saga', '/collection/the-saga', ['Second', 'First']],
        ['The Saga', '/collection/the-saga', ['First', 'Second']],
      ]);

      // The panel names every picked title, and says which one viewers do not get.
      const view = (await get('/v1/layout/home').expect(200)).body.sections[0];
      expect(view).toMatchObject({ id: picks.id, sort: 'CURATED', count: 2, shownNow: true });
      expect(view.picked).toEqual([
        { id: first, name: 'First', type: 'MOVIE', visible: true },
        { id: draft, name: 'Draft', type: 'MOVIE', visible: false },
        { id: second, name: 'Second', type: 'MOVIE', visible: true },
      ]);
      expect(names(view.preview)).toEqual(['First', 'Second']);

      // Another list replaces the picks. Another source lets them go.
      const changed = await patch(`/v1/layout/sections/${picks.id}`, { titleIds: [second] }).expect(
        200,
      );
      expect(names(changed.body.picked)).toEqual(['Second']);
      await patch(`/v1/layout/sections/${picks.id}`, { source: 'ALL' }).expect(200);
      expect(await testApp.prisma.homeSectionTitle.count()).toBe(0);
      expect((await get('/v1/layout/home').expect(200)).body.sections[0]).toMatchObject({
        source: 'ALL',
        sort: 'NEWEST',
        defaultName: 'New',
      });
    });

    it('are hidden by their switch, by their dates, and when they are empty', async () => {
      const empty = await named('categories', 'Empty');
      await movie('Alpha');
      const past = '2020-01-01T00:00:00.000Z';
      const future = '2099-01-01T00:00:00.000Z';

      await section({ kind: 'TITLES', name: 'Shown' });
      const off = await section({ kind: 'TITLES', name: 'Switched off', visible: false });
      await section({ kind: 'TITLES', name: 'Not yet', visibleFrom: future });
      await section({
        kind: 'TITLES',
        name: 'Over',
        visibleFrom: past,
        visibleUntil: past.replace('2020', '2021'),
      });
      await section({ kind: 'TITLES', name: 'In season', visibleFrom: past, visibleUntil: future });
      await section({ kind: 'TITLES', source: 'CATEGORY', categoryId: empty });

      expect(await layout()).toEqual([
        ['Shown', ['Alpha']],
        ['In season', ['Alpha']],
      ]);
      const sections = (await get('/v1/layout/home').expect(200)).body.sections;
      expect(sections.map((entry: { shownNow: boolean }) => entry.shownNow)).toEqual([
        true,
        false,
        false,
        false,
        true,
        false,
      ]);

      await patch(`/v1/layout/sections/${off.id}`, { visible: true }).expect(200);
      expect((await layout()).map(([name]) => name)).toEqual([
        'Shown',
        'Switched off',
        'In season',
      ]);
      await post('/v1/layout/home/sections', {
        kind: 'TITLES',
        visibleFrom: future,
        visibleUntil: past,
      }).expect(400);
    });

    it('are put in order, changed and deleted', async () => {
      await movie('Alpha');
      const a = await section({ kind: 'TITLES', name: 'A' });
      const b = await section({ kind: 'TITLES', name: 'B' });
      const c = await section({ kind: 'CONTINUE_WATCHING' });

      const ordered = await put('/v1/layout/home/sections/order', {
        ids: [c.id, b.id, a.id],
      }).expect(200);
      expect(ordered.body.sections.map((entry: { id: string }) => entry.id)).toEqual([
        c.id,
        b.id,
        a.id,
      ]);
      expect((await home()).rows.map((row) => [row.name, row.kind])).toEqual([
        ['Continue watching', 'continue'],
        ['B', 'titles'],
        ['A', 'titles'],
      ]);
      await put('/v1/layout/home/sections/order', { ids: [a.id, b.id] }).expect(400);
      await put('/v1/layout/home/sections/order', { ids: [a.id, a.id, b.id] }).expect(400);

      const renamed = await patch(`/v1/layout/sections/${a.id}`, { name: '  ' }).expect(200);
      expect(renamed.body).toMatchObject({ name: null, defaultName: 'New' });
      await http().delete(`/v1/layout/sections/${b.id}`).set(auth()).expect(204);
      await http().delete(`/v1/layout/sections/${b.id}`).set(auth()).expect(404);
      expect((await home()).rows.map((row) => row.name)).toEqual(['Continue watching', 'New']);
    });

    it('are checked', async () => {
      const missing = '01a1fdfd-0000-7000-8000-000000000000';
      const refused = async (body: object, message: RegExp) => {
        const response = await post('/v1/layout/home/sections', body).expect(400);
        expect(response.body.message).toMatch(message);
      };
      await refused({ kind: 'TITLES', source: 'CATEGORY' }, /Choose the category/);
      await refused({ kind: 'TITLES', source: 'GENRE', genreId: missing }, /genre does not exist/);
      await refused({ kind: 'TITLES', source: 'MANUAL', titleIds: [missing] }, /picked titles/);
      await refused({ kind: 'TITLES', limit: 2 }, /4 titles at least/);
      await refused({ kind: 'HERO', limit: 9 }, /8 titles at most/);
      await post('/v1/layout/home/sections', { kind: 'BANNER' }).expect(400);

      await section({ kind: 'HERO' });
      await section({ kind: 'CONTINUE_WATCHING' });
      await post('/v1/layout/home/sections', { kind: 'HERO' }).expect(409);
      await post('/v1/layout/home/sections', { kind: 'CONTINUE_WATCHING' }).expect(409);
    });

    it('go with the category, genre or collection they show', async () => {
      await movie('Alpha');
      const drama = await named('categories', 'Drama');
      await section({ kind: 'TITLES', source: 'CATEGORY', categoryId: drama });
      await section({ kind: 'TITLES', name: 'Stays' });
      await http().delete(`/v1/categories/${drama}`).set(auth()).expect(204);
      expect((await get('/v1/layout/home').expect(200)).body.sections).toHaveLength(1);
      expect((await home()).custom).toBe(true);
    });
  });

  describe('the pages for movies and for series', () => {
    const page = async (name: string) =>
      (await http().get(`/v1/catalog/pages/${name}`).expect(200)).body as {
        custom: boolean;
        hero: { titles: { name: string }[] } | null;
        rows: Row[];
      };

    it('are the list of all of them until someone arranges them', async () => {
      await movie('Alpha');
      expect(await page('movies')).toEqual({ custom: false, hero: null, rows: [] });
      expect(await page('series')).toEqual({ custom: false, hero: null, rows: [] });
      // The home page is a page like the others, under its own name as well.
      expect((await page('home')).rows.map((row) => row.key)).toEqual(['continue', 'latest']);
      await http().get('/v1/catalog/pages/live').expect(404);
      await http().get('/v1/catalog/pages/MOVIES').expect(404);

      expect((await get('/v1/layout').expect(200)).body).toEqual([
        { page: 'HOME', custom: false, sections: 0 },
        { page: 'MOVIES', custom: false, sections: 0 },
        { page: 'SERIES', custom: false, sections: 0 },
      ]);
    });

    it('start with sections about their own kind of title, each page by itself', async () => {
      const drama = await named('categories', 'Drama');
      const shows = await named('categories', 'Shows only');
      await movie('Alpha', { categoryIds: [drama] });
      const beta = await movie('Beta', { isFeatured: true });
      const deep = await series('Deep Water');
      await patch(`/v1/titles/${deep}`, { categoryIds: [shows], isFeatured: true }).expect(200);
      await testApp.prisma.title.update({ where: { id: beta }, data: { rating: 9 } });

      const started = await post('/v1/layout/movies/start').expect(201);
      expect(started.body.page).toBe('MOVIES');
      expect(
        started.body.sections.map(
          (entry: { kind: string; defaultName: string; titleType: string; count: number }) => [
            entry.kind,
            entry.defaultName,
            entry.titleType,
            entry.count,
          ],
        ),
      ).toEqual([
        ['HERO', 'Featured', 'MOVIE', 1],
        ['TITLES', 'Featured', 'MOVIE', 1],
        ['TITLES', 'New', 'MOVIE', 2],
        ['TITLES', 'Top rated', 'MOVIE', 2],
        // Only categories that have a movie: "Shows only" has none.
        ['TITLES', 'Drama', 'MOVIE', 1],
      ]);
      await post('/v1/layout/movies/start').expect(409);

      const movies = await page('movies');
      expect(movies.custom).toBe(true);
      expect(names(movies.hero?.titles ?? [])).toEqual(['Beta']);
      expect(movies.rows.map((row) => [row.name, row.browse, names(row.titles)])).toEqual([
        ['Featured', '/browse?type=MOVIE&featured=true', ['Beta']],
        ['New', '/browse?type=MOVIE', ['Beta', 'Alpha']],
        ['Top rated', '/browse?type=MOVIE&sort=rating', ['Beta', 'Alpha']],
        ['Drama', '/browse?type=MOVIE&category=drama', ['Alpha']],
      ]);

      // The other pages are untouched.
      expect((await page('series')).custom).toBe(false);
      expect((await home()).custom).toBe(false);
      expect((await get('/v1/layout').expect(200)).body).toEqual([
        { page: 'HOME', custom: false, sections: 0 },
        { page: 'MOVIES', custom: true, sections: 5 },
        { page: 'SERIES', custom: false, sections: 0 },
      ]);
    });

    it('have an opening and an order of their own', async () => {
      await movie('Alpha');
      await series('Deep Water');
      const first = (
        await post('/v1/layout/series/sections', { kind: 'TITLES', name: 'A' }).expect(201)
      ).body;
      // A new row of the page for series shows series, unless it is told otherwise.
      expect(first).toMatchObject({ titleType: 'SERIES', defaultName: 'New' });
      const both = (
        await post('/v1/layout/series/sections', {
          kind: 'TITLES',
          name: 'Everything',
          titleType: null,
        }).expect(201)
      ).body;
      await post('/v1/layout/series/sections', { kind: 'HERO', source: 'ALL' }).expect(201);
      await post('/v1/layout/series/sections', { kind: 'HERO' }).expect(409);
      // Each page has one opening of its own.
      await post('/v1/layout/home/sections', { kind: 'HERO', source: 'ALL' }).expect(201);
      await post('/v1/layout/movies/sections', { kind: 'TITLES' }).expect(201);

      const series1 = await page('series');
      expect(names(series1.hero?.titles ?? [])).toEqual(['Deep Water']);
      expect(series1.rows.map((row) => [row.name, names(row.titles)])).toEqual([
        ['A', ['Deep Water']],
        ['Everything', ['Deep Water', 'Alpha']],
      ]);

      const sections = (await get('/v1/layout/series').expect(200)).body.sections as {
        id: string;
      }[];
      const hero = sections[0]?.id as string;
      await put('/v1/layout/series/sections/order', { ids: [hero, both.id, first.id] }).expect(200);
      expect((await page('series')).rows.map((row) => row.name)).toEqual(['Everything', 'A']);
      // The sections of another page are not part of this order.
      const other = (await get('/v1/layout/movies').expect(200)).body.sections[0].id as string;
      await put('/v1/layout/series/sections/order', {
        ids: [hero, both.id, first.id, other],
      }).expect(400);

      await http().delete('/v1/layout/series').set(auth()).expect(204);
      expect((await page('series')).custom).toBe(false);
      expect((await page('movies')).custom).toBe(true);
      expect((await home()).custom).toBe(true);
      await get('/v1/layout/live').expect(404);
    });
  });

  describe('the opening', () => {
    it('stands first, prefers titles with a picture, and can be picked by hand', async () => {
      const plain = await movie('Plain', { isFeatured: true });
      const pictured = await movie('Pictured', { backdropId: await backdrop() });
      await section({ kind: 'TITLES', name: 'Row' });
      const hero = await section({ kind: 'HERO', source: 'ALL' });

      // Made last, and still first on the page.
      const sections = (await get('/v1/layout/home').expect(200)).body.sections;
      expect(sections.map((entry: { kind: string }) => entry.kind)).toEqual(['HERO', 'TITLES']);
      expect(names((await home()).hero?.titles ?? [])).toEqual(['Pictured']);

      // Featured titles without a picture are better than no opening.
      await patch(`/v1/layout/sections/${hero.id}`, { source: 'FEATURED' }).expect(200);
      expect(names((await home()).hero?.titles ?? [])).toEqual(['Plain']);

      await patch(`/v1/layout/sections/${hero.id}`, {
        source: 'MANUAL',
        titleIds: [plain, pictured],
      }).expect(200);
      const page = await home();
      expect(names(page.hero?.titles ?? [])).toEqual(['Plain', 'Pictured']);
      expect(page.rows.map((row) => row.name)).toEqual(['Row']);

      await patch(`/v1/layout/sections/${hero.id}`, { visible: false }).expect(200);
      expect((await home()).hero).toBeNull();
    });
  });

  describe('texts and access', () => {
    it('gives titles in the language asked for', async () => {
      const id = await movie('Night Ferry');
      await put(`/v1/titles/${id}/translations/de`, { name: 'Nachtfähre' }).expect(200);
      await section({ kind: 'HERO', source: 'ALL' });
      await section({ kind: 'TITLES' });
      const page = (await http().get('/v1/catalog/home?language=de').expect(200)).body;
      expect(page.hero.titles[0].name).toBe('Nachtfähre');
      expect(page.rows[0].titles[0].name).toBe('Nachtfähre');
    });

    it('needs the right to write the catalog, and is written to the log', async () => {
      const made = await section({ kind: 'TITLES', name: 'Row' });
      await http().get('/v1/layout/home').expect(401);
      await post('/v1/admins', READER).expect(201);
      const reader = testApp.bearer(await testApp.login(READER.email, READER.password));
      await http().get('/v1/layout/home').set(reader).expect(200);
      await http()
        .post('/v1/layout/home/sections')
        .set(reader)
        .send({ kind: 'TITLES' })
        .expect(403);
      await http().delete('/v1/layout/home').set(reader).expect(403);
      await http()
        .patch(`/v1/layout/sections/${made.id}`)
        .set(reader)
        .send({ name: 'x' })
        .expect(403);

      const entry = await testApp.prisma.auditLog.findFirst({
        where: { action: 'layout.section.create' },
      });
      expect(entry).toMatchObject({ entityType: 'HomeSection', entityId: made.id });
      expect(entry?.metadata).toMatchObject({ kind: 'TITLES', name: 'Row' });
    });
  });
});
