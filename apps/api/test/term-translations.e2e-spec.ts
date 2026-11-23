// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the translations of categories, genres, collections and
// people: working on them in the panel, many at once, and what viewers read
// in their language everywhere these names show.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)(
  'Translations of categories, genres, collections and people (e2e)',
  () => {
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
        data: {
          status: 'READY',
          manifestPath: `assets/${id}/hls/master.m3u8`,
          readyAt: new Date(),
        },
      });
      return id;
    }
    async function movie(name: string, fields: object = {}): Promise<{ id: string; slug: string }> {
      const title = (await post('/v1/titles', { type: 'MOVIE', name }).expect(201)).body;
      await patch(`/v1/titles/${title.id}`, { assetId: await asset(name), ...fields }).expect(200);
      await put(`/v1/titles/${title.id}/status`, { status: 'PUBLISHED' }).expect(200);
      return title;
    }
    const created = async (url: string, body: object) =>
      (await post(url, body).expect(201)).body as { id: string; slug: string };
    const save = (kind: string, language: string, items: object[]) =>
      put(`/v1/translations/terms/${kind}/${language}`, { items });

    beforeAll(async () => {
      workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-terms-'));
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

    describe('in the panel', () => {
      it('says what there is to translate and how far each language is', async () => {
        const drama = await created('/v1/genres', { name: 'Drama' });
        await created('/v1/genres', { name: 'Thriller' });
        await created('/v1/categories', { name: 'Kids' });

        const empty = await get('/v1/translations/terms').expect(200);
        expect(
          empty.body.kinds.map((kind: { kind: string; total: number }) => [kind.kind, kind.total]),
        ).toEqual([
          ['categories', 1],
          ['genres', 2],
          ['collections', 0],
          ['people', 0],
        ]);
        expect(empty.body.kinds[3].fields.map((field: { key: string }) => field.key)).toEqual([
          'name',
          'knownFor',
          'biography',
        ]);
        expect(empty.body.languages).toEqual([]);

        await save('genres', 'DE', [{ id: drama.id, texts: { name: 'Schauspiel' } }]).expect(200);
        const after = await get('/v1/translations/terms').expect(200);
        expect(after.body.languages).toEqual([
          {
            language: 'de',
            translated: { categories: 0, genres: 1, collections: 0, people: 0 },
            titles: 0,
          },
        ]);
      });

      it('lists terms with their translation, searches both languages and finds the gaps', async () => {
        const drama = await created('/v1/genres', { name: 'Drama' });
        const thriller = await created('/v1/genres', { name: 'Thriller' });
        await created('/v1/genres', { name: 'Western' });
        await movie('Harbour Lights', { genreIds: [drama.id, thriller.id] });

        const saved = await save('genres', 'de', [
          { id: drama.id, texts: { name: ' Schauspiel ' } },
          { id: thriller.id, texts: { name: 'Krimi' } },
        ]).expect(200);
        expect(saved.body).toEqual({ saved: 2, cleared: 0 });

        const list = await get('/v1/translations/terms/genres?language=de').expect(200);
        expect(list.body.total).toBe(3);
        expect(list.body.items[0]).toMatchObject({
          id: drama.id,
          slug: 'drama',
          original: { name: 'Drama' },
          translation: { name: 'Schauspiel' },
          titles: 1,
        });
        expect(list.body.items[2]).toMatchObject({ translation: null, titles: 0, updatedAt: null });

        const names = async (query: string, language = 'de') =>
          (
            await get(`/v1/translations/terms/genres?language=${language}&${query}`).expect(200)
          ).body.items.map((item: { original: { name: string } }) => item.original.name);
        expect(await names('missing=true')).toEqual(['Western']);
        expect(await names('q=krim')).toEqual(['Thriller']);
        expect(await names('q=dram')).toEqual(['Drama']);
        // Another language has nothing yet.
        expect(await names('missing=true', 'fr')).toHaveLength(3);
      });

      it('keeps what a save leaves out, and removes a translation that is emptied', async () => {
        const ana = await created('/v1/people', {
          name: 'Ana Petrova',
          biography: 'Born in Varna.',
        });

        await save('people', 'bg', [
          { id: ana.id, texts: { name: 'Ана Петрова', biography: 'Родена във Варна.' } },
        ]).expect(200);
        await save('people', 'bg', [{ id: ana.id, texts: { knownFor: 'Актриса' } }]).expect(200);
        const list = await get('/v1/translations/terms/people?language=bg').expect(200);
        expect(list.body.items[0].translation).toEqual({
          name: 'Ана Петрова',
          knownFor: 'Актриса',
          biography: 'Родена във Варна.',
        });

        const cleared = await save('people', 'bg', [
          { id: ana.id, texts: { name: '', knownFor: null, biography: '  ' } },
        ]).expect(200);
        expect(cleared.body).toEqual({ saved: 0, cleared: 1 });
        expect(await testApp.prisma.personTranslation.count()).toBe(0);
      });

      it('refuses what it cannot store, and then writes nothing', async () => {
        const drama = await created('/v1/genres', { name: 'Drama' });
        const missing = '01900000-0000-7000-8000-000000000000';

        await save('titles', 'de', [{ id: drama.id, texts: { name: 'x' } }]).expect(400);
        await save('genres', 'german', [{ id: drama.id, texts: { name: 'x' } }]).expect(400);
        await save('genres', 'de', []).expect(400);
        const unknownText = await save('genres', 'de', [
          { id: drama.id, texts: { synopsis: 'x' } },
        ]).expect(400);
        expect(unknownText.body.message).toBe('Genres have no text called synopsis');
        await save('genres', 'de', [
          { id: drama.id, texts: { name: 'Schauspiel' } },
          { id: missing, texts: { name: 'x' } },
        ]).expect(400);
        await save('genres', 'de', [
          { id: drama.id, texts: { name: 'a' } },
          { id: drama.id, texts: { name: 'b' } },
        ]).expect(400);
        await save('genres', 'de', [{ id: drama.id, texts: { name: 'x'.repeat(201) } }]).expect(
          400,
        );

        expect(await testApp.prisma.genreTranslation.count()).toBe(0);
      });

      it('takes a language away from a kind, and goes with the term when it is deleted', async () => {
        const drama = await created('/v1/genres', { name: 'Drama' });
        const kids = await created('/v1/categories', { name: 'Kids' });
        await save('genres', 'de', [{ id: drama.id, texts: { name: 'Schauspiel' } }]).expect(200);
        await save('genres', 'fr', [{ id: drama.id, texts: { name: 'Drame' } }]).expect(200);
        await save('categories', 'de', [{ id: kids.id, texts: { name: 'Kinder' } }]).expect(200);

        const removed = await http()
          .delete('/v1/translations/terms/genres/de')
          .set(auth())
          .expect(200);
        expect(removed.body).toEqual({ removed: 1 });
        expect(await testApp.prisma.genreTranslation.count()).toBe(1);
        expect(await testApp.prisma.categoryTranslation.count()).toBe(1);

        await http().delete(`/v1/genres/${drama.id}`).set(auth()).expect(204);
        expect(await testApp.prisma.genreTranslation.count()).toBe(0);
      });

      it('needs the permission to change the catalog, and is written to the audit log', async () => {
        const drama = await created('/v1/genres', { name: 'Drama' });
        await post('/v1/admins', {
          email: 'viewer@example.com',
          displayName: 'Vera Viewer',
          password: 'another-long-password',
          role: 'VIEWER',
        }).expect(201);
        const viewer = testApp.bearer(
          await testApp.login('viewer@example.com', 'another-long-password'),
        );

        await http().get('/v1/translations/terms/genres?language=de').set(viewer).expect(200);
        await http()
          .put('/v1/translations/terms/genres/de')
          .set(viewer)
          .send({ items: [{ id: drama.id, texts: { name: 'x' } }] })
          .expect(403);

        await save('genres', 'de', [{ id: drama.id, texts: { name: 'Schauspiel' } }]).expect(200);
        const entry = await testApp.prisma.auditLog.findFirst({
          where: { action: 'terms.translation.save' },
        });
        expect(entry?.metadata).toEqual({ kind: 'genres', language: 'de', saved: 1, cleared: 0 });
      });
    });

    describe('for viewers', () => {
      let film: { id: string; slug: string };

      beforeEach(async () => {
        const drama = await created('/v1/genres', { name: 'Drama' });
        const action = await created('/v1/genres', { name: 'Action' });
        const kids = await created('/v1/categories', {
          name: 'Kids',
          description: 'For the young.',
        });
        const saga = await created('/v1/collections', {
          name: 'Harbour Saga',
          synopsis: 'Three films by the sea.',
        });
        const mira = await created('/v1/people', {
          name: 'Mira Castell',
          knownFor: 'Acting',
          biography: 'Born in Kiel.',
        });
        film = await movie('Harbour Lights', {
          genreIds: [drama.id, action.id],
          categoryIds: [kids.id],
        });
        await put(`/v1/collections/${saga.id}/titles`, { titleIds: [film.id] }).expect(200);
        await put(`/v1/titles/${film.id}/credits`, {
          credits: [{ personId: mira.id, kind: 'CAST', role: 'Greta Holm' }],
        }).expect(200);

        await save('genres', 'de', [
          { id: drama.id, texts: { name: 'Schauspiel' } },
          { id: action.id, texts: { name: 'Zack' } },
        ]).expect(200);
        await save('categories', 'de', [
          { id: kids.id, texts: { name: 'Kinder', description: 'Für die Jungen.' } },
        ]).expect(200);
        await save('collections', 'de', [{ id: saga.id, texts: { name: 'Hafen-Saga' } }]).expect(
          200,
        );
        await save('people', 'de', [
          { id: mira.id, texts: { knownFor: 'Schauspiel', biography: 'Geboren in Kiel.' } },
        ]).expect(200);
      });

      it('translates the lists of genres, categories and collections', async () => {
        const genres = await http().get('/v1/catalog/genres?language=de').expect(200);
        // Sorted by the name the viewer reads.
        expect(genres.body).toEqual([
          { slug: 'drama', name: 'Schauspiel', titleCount: 1 },
          { slug: 'action', name: 'Zack', titleCount: 1 },
        ]);
        expect((await http().get('/v1/catalog/genres').expect(200)).body[0].name).toBe('Action');

        const categories = await http().get('/v1/catalog/categories?language=de').expect(200);
        expect(categories.body).toEqual([
          { slug: 'kids', name: 'Kinder', description: 'Für die Jungen.', titleCount: 1 },
        ]);

        const collections = await http().get('/v1/catalog/collections?language=de-AT').expect(200);
        expect(collections.body[0]).toMatchObject({
          slug: 'harbour-saga',
          name: 'Hafen-Saga',
          // Not translated: stays in the language of the catalog.
          synopsis: 'Three films by the sea.',
        });
      });

      it('translates them on a title, with the people in it', async () => {
        const shown = await http().get(`/v1/catalog/titles/${film.slug}?language=de`).expect(200);
        expect(shown.body).toMatchObject({
          name: 'Harbour Lights',
          categories: [{ slug: 'kids', name: 'Kinder' }],
          genres: [
            { slug: 'drama', name: 'Schauspiel' },
            { slug: 'action', name: 'Zack' },
          ],
          collections: [{ slug: 'harbour-saga', name: 'Hafen-Saga' }],
          // Her name has no translation, and needs none.
          cast: [{ slug: 'mira-castell', name: 'Mira Castell', role: 'Greta Holm' }],
        });

        const plain = await http().get(`/v1/catalog/titles/${film.slug}`).expect(200);
        expect(plain.body.genres[0]).toEqual({ slug: 'action', name: 'Action' });
        expect(plain.body.categories).toEqual([{ slug: 'kids', name: 'Kids' }]);
      });

      it('translates the pages of a person, a collection, a category and a genre', async () => {
        const person = await http().get('/v1/catalog/people/mira-castell?language=de').expect(200);
        expect(person.body).toMatchObject({
          name: 'Mira Castell',
          knownFor: 'Schauspiel',
          biography: 'Geboren in Kiel.',
          titles: [{ name: 'Harbour Lights', categories: [{ slug: 'kids', name: 'Kinder' }] }],
        });
        expect(person.body).not.toHaveProperty('id');

        const collection = await http()
          .get('/v1/catalog/collections/harbour-saga?language=de')
          .expect(200);
        expect(collection.body).toMatchObject({ name: 'Hafen-Saga', titleCount: 1 });

        const category = await http()
          .get('/v1/catalog/pages/category/kids?language=de')
          .expect(200);
        expect(category.body.subject).toEqual({
          slug: 'kids',
          name: 'Kinder',
          description: 'Für die Jungen.',
        });
        const genre = await http().get('/v1/catalog/pages/genre/drama?language=de').expect(200);
        expect(genre.body.subject).toEqual({
          slug: 'drama',
          name: 'Schauspiel',
          description: null,
        });
      });

      it('names the rows of a page after the translated category, genre or collection', async () => {
        const row = async (language?: string) => {
          const home = await http()
            .get(`/v1/catalog/home${language ? `?language=${language}` : ''}`)
            .expect(200);
          return home.body.rows
            .filter((entry: { kind: string }) => entry.kind === 'titles')
            .map((entry: { name: string; category: { name: string } | null }) => [
              entry.name,
              entry.category?.name ?? null,
            ]);
        };
        // The page that puts itself together has a row per category.
        expect(await row('de')).toEqual([
          ['New', null],
          ['Kinder', 'Kinder'],
        ]);
        expect(await row()).toEqual([
          ['New', null],
          ['Kids', 'Kids'],
        ]);

        const drama = await testApp.prisma.genre.findUniqueOrThrow({ where: { slug: 'drama' } });
        const kids = await testApp.prisma.category.findUniqueOrThrow({ where: { slug: 'kids' } });
        const saga = await testApp.prisma.collection.findFirstOrThrow();
        const section = (body: object) => post('/v1/layout/home/sections', body).expect(201);
        await section({ kind: 'TITLES', source: 'GENRE', genreId: drama.id, titleType: 'MOVIE' });
        await section({ kind: 'TITLES', source: 'CATEGORY', categoryId: kids.id });
        await section({ kind: 'TITLES', source: 'COLLECTION', collectionId: saga.id });
        await section({
          kind: 'TITLES',
          source: 'GENRE',
          genreId: drama.id,
          name: 'Typed by hand',
        });

        expect(await row('de')).toEqual([
          ['Schauspiel movies', null],
          ['Kinder', 'Kinder'],
          ['Hafen-Saga', null],
          ['Typed by hand', null],
        ]);
      });
    });
  },
);
