// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of what viewers get about genres, facts and people, and of
// the languages on offer.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('Genres, facts and people for viewers (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let workDirectory: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const post = (url: string, body: object) => http().post(url).set(auth()).send(body);
  const put = (url: string, body: object) => http().put(url).set(auth()).send(body);
  const patch = (url: string, body: object) => http().patch(url).set(auth()).send(body);
  const names = (items: { name: string }[]) => items.map((item) => item.name);

  async function asset(name: string): Promise<string> {
    const response = await post('/v1/assets', { title: name }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: { status: 'READY', manifestPath: `assets/${id}/hls/master.m3u8`, readyAt: new Date() },
    });
    return id;
  }
  async function movie(
    name: string,
    fields: object = {},
    published = true,
  ): Promise<{ id: string; slug: string }> {
    const title = (await post('/v1/titles', { type: 'MOVIE', name }).expect(201)).body;
    await patch(`/v1/titles/${title.id}`, { assetId: await asset(name), ...fields }).expect(200);
    if (published) {
      await put(`/v1/titles/${title.id}/status`, { status: 'PUBLISHED' }).expect(200);
    }
    return title;
  }
  const genre = async (name: string) =>
    (await post('/v1/genres', { name }).expect(201)).body.id as string;
  const person = async (name: string, fields: object = {}) =>
    (await post('/v1/people', { name, ...fields }).expect(201)).body as {
      id: string;
      slug: string;
    };

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-public-people-'));
    testApp = await createTestApp([AssetsModule, CatalogModule], {
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

  it('shows the genres, facts and people of a title', async () => {
    const [thriller, drama] = [await genre('Thriller'), await genre('Drama')];
    const [mira, leni] = [await person('Mira Castell'), await person('Leni Hartwig')];
    const film = await movie('Harbour Lights', {
      genreIds: [thriller, drama],
      releaseDate: '2024-03-14',
      runtimeMinutes: 118,
      countries: ['DE', 'DK'],
      studios: ['Nordkai Film'],
    });
    await testApp.prisma.title.update({
      where: { id: film.id },
      data: { rating: 7.6, ratingCount: 1842 },
    });
    await put(`/v1/titles/${film.id}/credits`, {
      credits: [
        { personId: mira.id, kind: 'CAST', role: 'Greta Holm' },
        { personId: leni.id, kind: 'CREW', role: 'Director' },
        { personId: leni.id, kind: 'CREW', role: 'Writer' },
      ],
    }).expect(200);

    const shown = await http().get(`/v1/catalog/titles/${film.slug}`).expect(200);
    expect(shown.body).toMatchObject({
      genres: [
        { slug: 'drama', name: 'Drama' },
        { slug: 'thriller', name: 'Thriller' },
      ],
      releaseDate: '2024-03-14',
      runtimeMinutes: 118,
      countries: ['DE', 'DK'],
      studios: ['Nordkai Film'],
      rating: 7.6,
      ratingCount: 1842,
      seriesStatus: null,
      cast: [{ slug: 'mira-castell', name: 'Mira Castell', role: 'Greta Holm', portrait: null }],
      crew: [
        { slug: 'leni-hartwig', name: 'Leni Hartwig', role: 'Director' },
        { slug: 'leni-hartwig', name: 'Leni Hartwig', role: 'Writer' },
      ],
    });
    // Nothing of the panel's own leaks out with a person.
    expect(shown.body.cast[0]).not.toHaveProperty('id');
  });

  it('lists the genres that have something to watch, and filters by them', async () => {
    const [thriller, drama, empty] = [
      await genre('Thriller'),
      await genre('Drama'),
      await genre('Western'),
    ];
    await movie('Harbour Lights', { genreIds: [thriller, drama] });
    await movie('Night Ferry', { genreIds: [thriller] });
    await movie('Unseen', { genreIds: [drama, empty] }, false);

    const genres = await http().get('/v1/catalog/genres').expect(200);
    expect(genres.body).toEqual([
      { slug: 'drama', name: 'Drama', titleCount: 1 },
      { slug: 'thriller', name: 'Thriller', titleCount: 2 },
    ]);

    const list = async (query: string) =>
      names((await http().get(`/v1/catalog/titles?sort=name&${query}`).expect(200)).body.items);
    expect(await list('genre=thriller')).toEqual(['Harbour Lights', 'Night Ferry']);
    expect(await list('genre=drama')).toEqual(['Harbour Lights']);
    expect(await list('genre=western')).toEqual([]);
    await http().get('/v1/catalog/titles?genre=Not%20A%20Slug').expect(400);
  });

  it('has a page for a person with what viewers can see of them', async () => {
    const mira = await person('Mira Castell', {
      knownFor: 'Acting',
      biography: 'Stage actor from Aarhus.',
    });
    const nobody = await person('Nobody Yet');
    const [first, second, hidden] = [
      await movie('Harbour Lights', { releaseYear: 2024 }),
      await movie('Night Ferry', { releaseYear: 2019 }),
      await movie('Unseen', { releaseYear: 2025 }, false),
    ];
    const cast = (role: string) => ({ credits: [{ personId: mira.id, kind: 'CAST', role }] });
    await put(`/v1/titles/${first.id}/credits`, {
      credits: [
        { personId: mira.id, kind: 'CAST', role: 'Greta Holm' },
        { personId: mira.id, kind: 'CREW', role: 'Producer' },
      ],
    }).expect(200);
    await put(`/v1/titles/${second.id}/credits`, cast('The Captain')).expect(200);
    await put(`/v1/titles/${hidden.id}/credits`, cast('Herself')).expect(200);
    await put(`/v1/titles/${second.id}/translations/de`, { name: 'Nachtfähre' }).expect(200);

    const page = await http().get(`/v1/catalog/people/${mira.slug}`).expect(200);
    expect(page.body).toMatchObject({
      slug: 'mira-castell',
      name: 'Mira Castell',
      knownFor: 'Acting',
      biography: 'Stage actor from Aarhus.',
      portrait: null,
    });
    // Newest first, each title once with the part in the cast, and nothing unpublished.
    expect(
      page.body.titles.map((title: { name: string; role: string }) => [title.name, title.role]),
    ).toEqual([
      ['Harbour Lights', 'Greta Holm'],
      ['Night Ferry', 'The Captain'],
    ]);
    const german = await http().get(`/v1/catalog/people/${mira.slug}?language=de`).expect(200);
    expect(names(german.body.titles)).toEqual(['Harbour Lights', 'Nachtfähre']);

    expect(
      names((await http().get(`/v1/catalog/titles?person=${mira.slug}`).expect(200)).body.items),
    ).toHaveLength(2);
    // Somebody with nothing to watch has no page.
    await http().get(`/v1/catalog/people/${nobody.slug}`).expect(404);
    await http().get('/v1/catalog/people/who-is-this').expect(404);
  });

  it('says which languages titles can be read in', async () => {
    const [first, second, hidden] = [
      await movie('Harbour Lights'),
      await movie('Night Ferry'),
      await movie('Unseen', {}, false),
    ];
    expect((await http().get('/v1/catalog/languages').expect(200)).body).toEqual({
      default: 'en',
      translated: [],
    });
    await put(`/v1/titles/${first.id}/translations/de`, { name: 'Hafenlichter' }).expect(200);
    await put(`/v1/titles/${second.id}/translations/de`, { name: 'Nachtfähre' }).expect(200);
    await put(`/v1/titles/${second.id}/translations/fr`, { name: 'Ferry de nuit' }).expect(200);
    // A language only a draft is translated into is not on offer.
    await put(`/v1/titles/${hidden.id}/translations/ar`, { name: 'x' }).expect(200);

    expect((await http().get('/v1/catalog/languages').expect(200)).body).toEqual({
      default: 'en',
      translated: [
        { language: 'de', titles: 2 },
        { language: 'fr', titles: 1 },
      ],
    });
  });

  it('filters titles by collection', async () => {
    const [first, second] = [await movie('Harbour Lights'), await movie('Night Ferry')];
    await movie('Other');
    await post('/v1/collections', { name: 'Harbour', titleIds: [first.id, second.id] }).expect(201);
    await post('/v1/collections', { name: 'Hidden', visible: false, titleIds: [first.id] });
    const list = async (slug: string) =>
      names(
        (await http().get(`/v1/catalog/titles?sort=name&collection=${slug}`).expect(200)).body
          .items,
      );
    expect(await list('harbour')).toEqual(['Harbour Lights', 'Night Ferry']);
    expect(await list('hidden')).toEqual([]);
  });
});
