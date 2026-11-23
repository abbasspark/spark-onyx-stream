// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the texts of titles in more than one language: how
// admins write them, and what viewers get when they ask for a language.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const READER = {
  email: 'viewer-admin@example.com',
  displayName: 'Vera Viewer',
  password: 'viewer-password-123',
  role: 'VIEWER',
};

describe.skipIf(!TEST_DATABASE_URL)('Translations (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let workDirectory: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const get = (url: string) => http().get(url).set(auth());
  const post = (url: string, body: object) => http().post(url).set(auth()).send(body);
  const put = (url: string, body: object) => http().put(url).set(auth()).send(body);
  const patch = (url: string, body: object) => http().patch(url).set(auth()).send(body);

  async function asset(name: string): Promise<string> {
    const response = await post('/v1/assets', { title: name }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: { status: 'READY', manifestPath: `assets/${id}/hls/master.m3u8`, readyAt: new Date() },
    });
    return id;
  }
  /** A published movie with a tagline and a synopsis. */
  async function movie(name: string): Promise<{ id: string; slug: string }> {
    const title = (await post('/v1/titles', { type: 'MOVIE', name }).expect(201)).body;
    await patch(`/v1/titles/${title.id}`, {
      assetId: await asset(name),
      tagline: 'Nobody sleeps.',
      synopsis: 'A ferry, a night, a secret.',
    }).expect(200);
    await put(`/v1/titles/${title.id}/status`, { status: 'PUBLISHED' }).expect(200);
    return title;
  }
  /** A published series with one season and two published episodes. */
  async function series(): Promise<{
    id: string;
    slug: string;
    seasonId: string;
    episodeIds: [string, string];
  }> {
    const title = (await post('/v1/titles', { type: 'SERIES', name: 'Deep Water' }).expect(201))
      .body;
    const season = await post(`/v1/titles/${title.id}/seasons`, {}).expect(201);
    const seasonId = season.body.seasons[0].id as string;
    await patch(`/v1/seasons/${seasonId}`, { name: 'The Dives' }).expect(200);
    const episodeIds: string[] = [];
    for (const name of ['The Shelf', 'Midnight Zone']) {
      const episode = await post(`/v1/seasons/${seasonId}/episodes`, {
        name,
        synopsis: `About ${name}.`,
        assetId: await asset(name),
      }).expect(201);
      await patch(`/v1/episodes/${episode.body.id}`, { status: 'PUBLISHED' }).expect(200);
      episodeIds.push(episode.body.id);
    }
    await put(`/v1/titles/${title.id}/status`, { status: 'PUBLISHED' }).expect(200);
    return { ...title, seasonId, episodeIds: episodeIds as [string, string] };
  }

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-translations-'));
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

  describe('for admins', () => {
    it('are written per language, counted, and replaced as a whole', async () => {
      const show = await series();
      const url = `/v1/titles/${show.id}/translations`;
      expect((await get(url).expect(200)).body).toEqual([]);

      const saved = await put(`${url}/de`, {
        name: 'Tiefes Wasser',
        synopsis: '  ',
        seasons: [{ id: show.seasonId, name: 'Die Tauchgänge' }],
        episodes: [
          { id: show.episodeIds[0], name: 'Der Schelf', synopsis: 'Im Sonnenlicht.' },
          { id: show.episodeIds[1], name: '', synopsis: null },
        ],
      }).expect(200);
      expect(saved.body).toHaveLength(1);
      expect(saved.body[0]).toMatchObject({
        language: 'de',
        name: 'Tiefes Wasser',
        tagline: null,
        synopsis: null,
        seasons: [{ id: show.seasonId, name: 'Die Tauchgänge', synopsis: null }],
        // An episode with nothing translated is not kept.
        episodes: [{ id: show.episodeIds[0], name: 'Der Schelf', synopsis: 'Im Sonnenlicht.' }],
        // Name of the title, of the season, and name and synopsis of one episode,
        // of: the name, the season's name, and two names and two synopses of episodes.
        filled: 4,
        total: 6,
      });

      // A second language stands beside the first, and tags are tidied.
      await put(`${url}/PT-br`, { name: 'Águas Profundas' }).expect(200);
      // Saving again replaces everything of that language.
      const again = await put(`${url}/de`, { name: 'Tiefsee' }).expect(200);
      expect(again.body.map((item: { language: string }) => item.language)).toEqual([
        'de',
        'pt-BR',
      ]);
      expect(again.body[0]).toMatchObject({
        name: 'Tiefsee',
        seasons: [],
        episodes: [],
        filled: 1,
      });

      const languages = await get('/v1/translations/languages').expect(200);
      expect(languages.body).toEqual([
        { language: 'de', titles: 1 },
        { language: 'pt-BR', titles: 1 },
      ]);
    });

    it('are checked', async () => {
      const film = await movie('Harbour Lights');
      const show = await series();
      const url = `/v1/titles/${film.id}/translations`;
      await put(`${url}/german`, { name: 'X' }).expect(400);
      await put(`${url}/de`, { name: 'x'.repeat(201) }).expect(400);
      // A season of another title.
      await put(`${url}/de`, { seasons: [{ id: show.seasonId, name: 'X' }] }).expect(400);
      await put(`${url}/de`, { episodes: [{ id: show.episodeIds[0], name: 'X' }] }).expect(400);
      await put('/v1/titles/01900000-0000-7000-8000-000000000000/translations/de', {
        name: 'X',
      }).expect(404);
      await http().delete(`${url}/de`).set(auth()).expect(404);
    });

    it('go with their language, their episode, and their title', async () => {
      const show = await series();
      const url = `/v1/titles/${show.id}/translations`;
      const body = {
        name: 'Tiefes Wasser',
        episodes: [
          { id: show.episodeIds[0], name: 'Der Schelf' },
          { id: show.episodeIds[1], name: 'Mitternachtszone' },
        ],
      };
      await put(`${url}/de`, body).expect(200);
      await put(`${url}/fr`, { name: 'Eaux profondes' }).expect(200);

      await http().delete(`/v1/episodes/${show.episodeIds[1]}`).set(auth()).expect(200);
      expect((await get(url).expect(200)).body[0].episodes).toHaveLength(1);

      await http().delete(`${url}/de`).set(auth()).expect(204);
      const left = await get(url).expect(200);
      expect(left.body.map((item: { language: string }) => item.language)).toEqual(['fr']);
      expect(await testApp.prisma.episodeTranslation.count()).toBe(0);

      await put(`/v1/titles/${show.id}/status`, { status: 'DRAFT' }).expect(200);
      await http().delete(`/v1/titles/${show.id}`).set(auth()).expect(204);
      expect(await testApp.prisma.titleTranslation.count()).toBe(0);
    });

    it('let those who only read see, and nobody else change', async () => {
      await post('/v1/admins', READER).expect(201);
      const reader = testApp.bearer(await testApp.login(READER.email, READER.password));
      const film = await movie('Harbour Lights');
      const url = `/v1/titles/${film.id}/translations`;
      await put(`${url}/de`, { name: 'Hafenlichter' }).expect(200);

      await http().get(url).set(reader).expect(200);
      await http().get('/v1/translations/languages').set(reader).expect(200);
      await http().put(`${url}/de`).set(reader).send({ name: 'X' }).expect(403);
      await http().delete(`${url}/de`).set(reader).expect(403);
      await http().get(url).expect(401);
    });
  });

  describe('for viewers', () => {
    it('come when a language is asked for, with the catalog’s own texts where one is missing', async () => {
      const show = await series();
      await put(`/v1/titles/${show.id}/translations/de`, {
        name: 'Tiefes Wasser',
        seasons: [{ id: show.seasonId, name: 'Die Tauchgänge' }],
        episodes: [{ id: show.episodeIds[0], name: 'Der Schelf', synopsis: 'Im Sonnenlicht.' }],
      }).expect(200);
      const page = (query: string) => http().get(`/v1/catalog/titles/${show.slug}${query}`);

      const own = await page('').expect(200);
      expect(own.body).toMatchObject({ name: 'Deep Water' });
      expect(own.body.seasons[0].episodes[0].name).toBe('The Shelf');

      const german = await page('?language=de').expect(200);
      expect(german.body).toMatchObject({ name: 'Tiefes Wasser', slug: show.slug });
      expect(german.body.seasons[0]).toMatchObject({ name: 'Die Tauchgänge' });
      expect(german.body.seasons[0].episodes).toMatchObject([
        { name: 'Der Schelf', synopsis: 'Im Sonnenlicht.' },
        // Not translated: as the catalog has it.
        { name: 'Midnight Zone', synopsis: 'About Midnight Zone.' },
      ]);

      // A country falls back to its language, another language to the catalog's own.
      expect((await page('?language=de-AT').expect(200)).body.name).toBe('Tiefes Wasser');
      expect((await page('?language=fr').expect(200)).body.name).toBe('Deep Water');
      // What is not a language is no reason to fail a page.
      expect((await page('?language=klingon!').expect(200)).body.name).toBe('Deep Water');
    });

    it('reach lists, the home page and collections, and the search', async () => {
      const film = await movie('Harbour Lights');
      const other = await movie('Night Ferry');
      await put(`/v1/titles/${film.id}/translations/de`, {
        name: 'Hafenlichter',
        tagline: 'Niemand schläft.',
      }).expect(200);
      await patch(`/v1/titles/${film.id}`, { isFeatured: true }).expect(200);
      const collection = (
        await post('/v1/collections', { name: 'Harbour', titleIds: [film.id, other.id] }).expect(
          201,
        )
      ).body as { slug: string };

      const names = (items: { name: string }[]) => items.map((item) => item.name);
      const list = await http().get('/v1/catalog/titles?sort=name&language=de').expect(200);
      expect(list.body.items).toMatchObject([
        { name: 'Hafenlichter', tagline: 'Niemand schläft.' },
        { name: 'Night Ferry', tagline: 'Nobody sleeps.' },
      ]);

      const home = await http().get('/v1/catalog/home?language=de').expect(200);
      const rows = home.body.rows as { key: string; titles: { name: string }[] }[];
      expect(names(rows.find((row) => row.key === 'featured')?.titles ?? [])).toEqual([
        'Hafenlichter',
      ]);
      expect(names(rows.find((row) => row.key === 'latest')?.titles ?? []).sort()).toEqual([
        'Hafenlichter',
        'Night Ferry',
      ]);

      const shelf = await http()
        .get(`/v1/catalog/collections/${collection.slug}?language=de`)
        .expect(200);
      expect(names(shelf.body.titles)).toEqual(['Hafenlichter', 'Night Ferry']);

      // The search finds a title by the name the viewer reads, and still by its own.
      const found = async (query: string) =>
        names((await http().get(`/v1/catalog/titles?${query}`).expect(200)).body.items);
      expect(await found('q=hafen&language=de')).toEqual(['Hafenlichter']);
      expect(await found('q=harbour&language=de')).toEqual(['Hafenlichter']);
      expect(await found('q=hafen')).toEqual([]);
      expect(await found('q=hafen&language=fr')).toEqual([]);
    });
  });
});
