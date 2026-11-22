// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of what makes movies and series more than a name and a
// video: their facts, genres, the people in them, and the lists that filter
// by all of it.
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

const EDITOR = {
  email: 'viewer-admin@example.com',
  displayName: 'Vera Viewer',
  password: 'viewer-password-123',
  role: 'VIEWER',
};

describe.skipIf(!TEST_DATABASE_URL)('Movies, series, genres and people (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let workDirectory: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const post = (url: string, body: object) => http().post(url).set(auth()).send(body);
  const patch = (url: string, body: object) => http().patch(url).set(auth()).send(body);
  const title = async (type: 'MOVIE' | 'SERIES', name: string) =>
    (await post('/v1/titles', { type, name }).expect(201)).body.id as string;
  const person = async (name: string) =>
    (await post('/v1/people', { name }).expect(201)).body.id as string;
  const genre = async (name: string) =>
    (await post('/v1/genres', { name }).expect(201)).body.id as string;
  const names = async (query: string) =>
    (
      (await http().get(`/v1/titles?sort=name&order=asc&${query}`).set(auth()).expect(200)).body
        .items as { name: string }[]
    ).map((item) => item.name);

  async function asset(name: string, ready = true): Promise<string> {
    const response = await post('/v1/assets', { title: name }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: ready
        ? { status: 'READY', manifestPath: `assets/${id}/hls/master.m3u8`, readyAt: new Date() }
        : { status: 'PROCESSING' },
    });
    return id;
  }
  const upload = async (kind: string) =>
    (
      await http()
        .post(`/v1/images?kind=${kind}`)
        .set(auth())
        .set('Content-Type', 'application/octet-stream')
        .send(png(600, 900))
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-people-'));
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

  describe('the facts of a title', () => {
    it('are empty at first and can be set', async () => {
      const id = await title('MOVIE', 'The Long Road');
      const fresh = (await http().get(`/v1/titles/${id}`).set(auth()).expect(200)).body;
      expect(fresh).toMatchObject({
        releaseDate: null,
        runtimeMinutes: null,
        countries: [],
        studios: [],
        keywords: [],
        imdbId: null,
        rating: null,
        seriesStatus: null,
        genres: [],
        credits: [],
      });

      const saved = await patch(`/v1/titles/${id}`, {
        releaseDate: '2024-02-29',
        runtimeMinutes: 112,
        countries: ['DE', 'FR', 'DE'],
        studios: ['Nordlicht Film', ' Nordlicht Film '],
        keywords: ['road trip', 'friendship'],
        imdbId: 'tt1234567',
      }).expect(200);
      expect(saved.body).toMatchObject({
        releaseDate: '2024-02-29',
        runtimeMinutes: 112,
        // Each once.
        countries: ['DE', 'FR'],
        studios: ['Nordlicht Film'],
        keywords: ['road trip', 'friendship'],
        imdbId: 'tt1234567',
      });

      const cleared = await patch(`/v1/titles/${id}`, {
        releaseDate: null,
        runtimeMinutes: null,
        imdbId: null,
        studios: [],
      }).expect(200);
      expect(cleared.body).toMatchObject({ releaseDate: null, runtimeMinutes: null, studios: [] });
    });

    it('are checked', async () => {
      const id = await title('MOVIE', 'The Long Road');
      for (const body of [
        { releaseDate: '2023-02-29' },
        { releaseDate: '29.02.2024' },
        { runtimeMinutes: 0 },
        { runtimeMinutes: 90.5 },
        { countries: ['Germany'] },
        { imdbId: 'nm0000206' },
        { seriesStatus: 'PAUSED' },
        { keywords: Array.from({ length: 31 }, (_, index) => `k${index}`) },
      ]) {
        await patch(`/v1/titles/${id}`, body).expect(400);
      }
    });

    it('let only a series be running or ended', async () => {
      const movie = await title('MOVIE', 'The Long Road');
      const series = await title('SERIES', 'Deep Water');
      const refused = await patch(`/v1/titles/${movie}`, { seriesStatus: 'ENDED' }).expect(400);
      expect(refused.body.message).toMatch(/Only a series/);
      const saved = await patch(`/v1/titles/${series}`, { seriesStatus: 'ENDED' }).expect(200);
      expect(saved.body.seriesStatus).toBe('ENDED');
    });
  });

  describe('genres', () => {
    it('are made, renamed and counted', async () => {
      const drama = await post('/v1/genres', { name: 'Drama' }).expect(201);
      expect(drama.body).toMatchObject({ name: 'Drama', slug: 'drama', titleCount: 0 });
      await post('/v1/genres', { name: 'Drama' }).expect(409);
      await post('/v1/genres', { name: '' }).expect(400);
      const comedy = await genre('Comedy');

      const id = await title('MOVIE', 'The Long Road');
      const saved = await patch(`/v1/titles/${id}`, { genreIds: [drama.body.id, comedy] }).expect(
        200,
      );
      // In the order of the alphabet, whatever order they were chosen in.
      expect(saved.body.genres.map((entry: { name: string }) => entry.name)).toEqual([
        'Comedy',
        'Drama',
      ]);

      const renamed = await patch(`/v1/genres/${drama.body.id}`, { name: 'Tragedy' }).expect(200);
      expect(renamed.body).toMatchObject({ name: 'Tragedy', titleCount: 1 });
      await patch(`/v1/genres/${comedy}`, { name: 'Tragedy' }).expect(409);

      const list = await http().get('/v1/genres').set(auth()).expect(200);
      expect(
        list.body.map((entry: { name: string; titleCount: number }) => [
          entry.name,
          entry.titleCount,
        ]),
      ).toEqual([
        ['Comedy', 1],
        ['Tragedy', 1],
      ]);
    });

    it('leave their titles behind when they are deleted', async () => {
      const drama = await genre('Drama');
      const id = await title('MOVIE', 'The Long Road');
      await patch(`/v1/titles/${id}`, { genreIds: [drama] }).expect(200);

      await http().delete(`/v1/genres/${drama}`).set(auth()).expect(204);
      const after = (await http().get(`/v1/titles/${id}`).set(auth()).expect(200)).body;
      expect(after.genres).toEqual([]);
      await http().delete(`/v1/genres/${drama}`).set(auth()).expect(404);
      const entry = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'genre.delete' },
      });
      expect(entry.metadata).toEqual({ name: 'Drama', titles: 1 });
    });

    it('must exist to be given to a title', async () => {
      const id = await title('MOVIE', 'The Long Road');
      const refused = await patch(`/v1/titles/${id}`, {
        genreIds: ['0192f0c0-0000-7000-8000-000000000000'],
      }).expect(400);
      expect(refused.body.message).toMatch(/genres does not exist/);
    });
  });

  describe('people', () => {
    it('are made with a slug of their own, found by name, and changed', async () => {
      const first = await post('/v1/people', { name: 'Ana García', knownFor: 'Acting' }).expect(
        201,
      );
      expect(first.body).toMatchObject({
        name: 'Ana García',
        slug: 'ana-garcia',
        knownFor: 'Acting',
        portrait: null,
        metadata: null,
        creditCount: 0,
      });
      // Two people can share a name.
      const second = await post('/v1/people', { name: 'Ana García' }).expect(201);
      expect(second.body.slug).toBe('ana-garcia-2');
      await person('Ben Okafor');

      const found = await http().get('/v1/people?q=garc').set(auth()).expect(200);
      expect(found.body.total).toBe(2);
      const all = await http().get('/v1/people?sort=name&order=desc').set(auth()).expect(200);
      expect(all.body.items[0].name).toBe('Ben Okafor');

      const portrait = await upload('PORTRAIT');
      const changed = await patch(`/v1/people/${first.body.id}`, {
        biography: 'Born in Vigo.',
        portraitId: portrait,
      }).expect(200);
      expect(changed.body).toMatchObject({ biography: 'Born in Vigo.' });
      expect(changed.body.portrait).toMatchObject({ kind: 'PORTRAIT', width: 600 });
      await patch(`/v1/people/${second.body.id}`, { slug: 'ana-garcia' }).expect(409);
      await patch(`/v1/people/${first.body.id}`, {
        portraitId: '0192f0c0-0000-7000-8000-000000000000',
      }).expect(400);
    });

    it('show everything they have a part in, newest first', async () => {
      const ana = await person('Ana García');
      const old = await title('MOVIE', 'First Light');
      const recent = await title('SERIES', 'Deep Water');
      await patch(`/v1/titles/${old}`, { releaseYear: 2001 }).expect(200);
      await patch(`/v1/titles/${recent}`, { releaseYear: 2021 }).expect(200);
      for (const [id, role] of [
        [old, 'Marta'],
        [recent, 'The Captain'],
      ] as const) {
        await http()
          .put(`/v1/titles/${id}/credits`)
          .set(auth())
          .send({ credits: [{ personId: ana, kind: 'CAST', role }] })
          .expect(200);
      }
      const detail = (await http().get(`/v1/people/${ana}`).set(auth()).expect(200)).body;
      expect(detail.creditCount).toBe(2);
      expect(
        detail.credits.map((credit: { role: string; title: { name: string; type: string } }) => [
          credit.title.name,
          credit.title.type,
          credit.role,
        ]),
      ).toEqual([
        ['Deep Water', 'SERIES', 'The Captain'],
        ['First Light', 'MOVIE', 'Marta'],
      ]);
      const byCredits = await http()
        .get('/v1/people?sort=credits&order=desc')
        .set(auth())
        .expect(200);
      expect(byCredits.body.items[0]).toMatchObject({ id: ana, creditCount: 2 });
    });

    it('take their parts with them when they are deleted', async () => {
      const ana = await person('Ana García');
      const id = await title('MOVIE', 'First Light');
      await http()
        .put(`/v1/titles/${id}/credits`)
        .set(auth())
        .send({ credits: [{ personId: ana, kind: 'CAST', role: 'Marta' }] })
        .expect(200);
      await http().delete(`/v1/people/${ana}`).set(auth()).expect(204);
      expect((await http().get(`/v1/titles/${id}`).set(auth()).expect(200)).body.credits).toEqual(
        [],
      );
      await http().get(`/v1/people/${ana}`).set(auth()).expect(404);
    });
  });

  describe('cast and crew', () => {
    it('are kept in the order given, the cast before the crew', async () => {
      const [ana, ben, cleo] = await Promise.all([person('Ana'), person('Ben'), person('Cleo')]);
      const id = await title('MOVIE', 'First Light');
      const saved = await http()
        .put(`/v1/titles/${id}/credits`)
        .set(auth())
        .send({
          credits: [
            { personId: cleo, kind: 'CREW', role: 'Director' },
            { personId: ben, kind: 'CAST', role: 'Jonas' },
            { personId: ana, kind: 'CAST', role: 'Marta' },
            // One person can have several parts.
            { personId: ana, kind: 'CREW', role: 'Writer' },
            { personId: ben, kind: 'CAST', role: '' },
          ],
        })
        .expect(200);
      const lines = (credits: { kind: string; role: string | null; person: { name: string } }[]) =>
        credits.map((credit) => `${credit.kind} ${credit.person.name}: ${credit.role}`);
      expect(lines(saved.body)).toEqual([
        'CAST Ben: Jonas',
        'CAST Ana: Marta',
        'CAST Ben: null',
        'CREW Cleo: Director',
        'CREW Ana: Writer',
      ]);
      // The title page shows the same.
      const detail = (await http().get(`/v1/titles/${id}`).set(auth()).expect(200)).body;
      expect(lines(detail.credits)).toEqual(lines(saved.body));

      // Saving again replaces the list.
      const shorter = await http()
        .put(`/v1/titles/${id}/credits`)
        .set(auth())
        .send({ credits: [{ personId: ana, kind: 'CAST', role: 'Marta' }] })
        .expect(200);
      expect(shorter.body).toHaveLength(1);
      const entry = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'title.credits' },
        orderBy: { createdAt: 'desc' },
      });
      expect(entry.metadata).toEqual({ cast: 1, crew: 0 });
    });

    it('refuse people who do not exist and the same part twice', async () => {
      const ana = await person('Ana');
      const id = await title('MOVIE', 'First Light');
      const put = (credits: object[]) =>
        http().put(`/v1/titles/${id}/credits`).set(auth()).send({ credits });
      await put([
        { personId: '0192f0c0-0000-7000-8000-000000000000', kind: 'CAST', role: null },
      ]).expect(400);
      const twice = await put([
        { personId: ana, kind: 'CAST', role: 'Marta' },
        { personId: ana, kind: 'CAST', role: 'marta' },
      ]).expect(400);
      expect(twice.body.message).toMatch(/listed twice/);
      await put([{ personId: ana, kind: 'EXTRA', role: null }]).expect(400);
      await http()
        .put('/v1/titles/0192f0c0-0000-7000-8000-000000000000/credits')
        .set(auth())
        .send({ credits: [] })
        .expect(404);
    });
  });

  describe('seasons and episodes', () => {
    it('have a poster, days they were shown and a length', async () => {
      const id = await title('SERIES', 'Deep Water');
      const created = await post(`/v1/titles/${id}/seasons`, {}).expect(201);
      const seasonId = created.body.seasons[0].id as string;
      const poster = await upload('POSTER');

      const withSeason = await patch(`/v1/seasons/${seasonId}`, {
        airDate: '2021-09-05',
        posterId: poster,
      }).expect(200);
      expect(withSeason.body.seasons[0]).toMatchObject({ airDate: '2021-09-05' });
      expect(withSeason.body.seasons[0].poster).toMatchObject({ kind: 'POSTER' });
      await patch(`/v1/seasons/${seasonId}`, { airDate: '2021-13-05' }).expect(400);
      await patch(`/v1/seasons/${seasonId}`, {
        posterId: '0192f0c0-0000-7000-8000-000000000000',
      }).expect(400);

      const episode = await post(`/v1/seasons/${seasonId}/episodes`, { name: 'The Shelf' }).expect(
        201,
      );
      expect(episode.body).toMatchObject({ airDate: null, runtimeMinutes: null });
      const changed = await patch(`/v1/episodes/${episode.body.id}`, {
        airDate: '2021-09-05',
        runtimeMinutes: 47,
      }).expect(200);
      expect(changed.body).toMatchObject({ airDate: '2021-09-05', runtimeMinutes: 47 });
      const cleared = await patch(`/v1/episodes/${episode.body.id}`, { airDate: null }).expect(200);
      expect(cleared.body.airDate).toBeNull();

      // A poster in use by a season is not deleted from under it.
      await http().delete(`/v1/images/${poster}`).set(auth()).expect(409);
    });
  });

  describe('the lists', () => {
    it('filter by genre, by person and by how a series stands', async () => {
      const [drama, ana] = await Promise.all([genre('Drama'), person('Ana')]);
      const movie = await title('MOVIE', 'First Light');
      const running = await title('SERIES', 'Deep Water');
      const ended = await title('SERIES', 'Old Harbour');
      await patch(`/v1/titles/${movie}`, { genreIds: [drama] }).expect(200);
      await patch(`/v1/titles/${running}`, { genreIds: [drama], seriesStatus: 'RUNNING' }).expect(
        200,
      );
      await patch(`/v1/titles/${ended}`, { seriesStatus: 'ENDED' }).expect(200);
      await http()
        .put(`/v1/titles/${ended}/credits`)
        .set(auth())
        .send({ credits: [{ personId: ana, kind: 'CREW', role: 'Director' }] })
        .expect(200);

      expect(await names(`genreId=${drama}`)).toEqual(['Deep Water', 'First Light']);
      expect(await names(`genreId=${drama}&type=SERIES`)).toEqual(['Deep Water']);
      expect(await names(`personId=${ana}`)).toEqual(['Old Harbour']);
      expect(await names('seriesStatus=ENDED')).toEqual(['Old Harbour']);
      expect(await names('type=MOVIE')).toEqual(['First Light']);
    });

    it('find what still lacks its video, and count the episodes that have one', async () => {
      const withVideo = await title('MOVIE', 'First Light');
      await title('MOVIE', 'No Video Yet');
      const processing = await title('MOVIE', 'Still Processing');
      await patch(`/v1/titles/${withVideo}`, { assetId: await asset('first-light') }).expect(200);
      await patch(`/v1/titles/${processing}`, { assetId: await asset('processing', false) }).expect(
        200,
      );

      const complete = await title('SERIES', 'Complete Series');
      const partial = await title('SERIES', 'Partial Series');
      await title('SERIES', 'Empty Series');
      for (const [series, ready] of [
        [complete, [true, true]],
        [partial, [true, false]],
      ] as const) {
        const seasonId = (await post(`/v1/titles/${series}/seasons`, {}).expect(201)).body
          .seasons[0].id;
        for (const [index, isReady] of ready.entries()) {
          await post(`/v1/seasons/${seasonId}/episodes`, {
            name: `Episode ${index + 1}`,
            assetId: isReady ? await asset(`${series}-${index}`) : null,
          }).expect(201);
        }
      }

      expect(await names('video=ready')).toEqual(['Complete Series', 'First Light']);
      expect(await names('video=missing')).toEqual([
        'Empty Series',
        'No Video Yet',
        'Partial Series',
        'Still Processing',
      ]);
      expect(await names('video=missing&type=SERIES')).toEqual(['Empty Series', 'Partial Series']);

      const series = (
        await http().get('/v1/titles?type=SERIES&sort=name&order=asc').set(auth()).expect(200)
      ).body.items as { name: string; episodeCount: number; readyEpisodeCount: number }[];
      expect(series.map((item) => [item.name, item.readyEpisodeCount, item.episodeCount])).toEqual([
        ['Complete Series', 2, 2],
        ['Empty Series', 0, 0],
        ['Partial Series', 1, 2],
      ]);
      const detail = (await http().get(`/v1/titles/${partial}`).set(auth()).expect(200)).body;
      expect(detail.readyEpisodeCount).toBe(1);
    });

    it('sort by rating, by premiere and by length, with what is unknown last', async () => {
      const [a, b, c] = [
        await title('MOVIE', 'A'),
        await title('MOVIE', 'B'),
        await title('MOVIE', 'C'),
      ];
      await testApp.prisma.title.update({ where: { id: a }, data: { rating: 6.1 } });
      await testApp.prisma.title.update({ where: { id: b }, data: { rating: 8.4 } });
      await patch(`/v1/titles/${a}`, { releaseDate: '2020-01-01', runtimeMinutes: 90 }).expect(200);
      await patch(`/v1/titles/${c}`, { releaseDate: '2010-01-01', runtimeMinutes: 150 }).expect(
        200,
      );
      const order = async (query: string) =>
        (
          (await http().get(`/v1/titles?${query}`).set(auth()).expect(200)).body.items as {
            name: string;
          }[]
        ).map((item) => item.name);

      expect(await order('sort=rating&order=desc')).toEqual(['B', 'A', 'C']);
      expect(await order('sort=releaseDate&order=asc')).toEqual(['C', 'A', 'B']);
      expect(await order('sort=runtimeMinutes&order=desc')).toEqual(['C', 'A', 'B']);
      await http().get('/v1/titles?sort=popularity').set(auth()).expect(400);
    });
  });

  describe('permissions', () => {
    it('let those who only read see, and nobody else change', async () => {
      await post('/v1/admins', EDITOR).expect(201);
      const reader = testApp.bearer(await testApp.login(EDITOR.email, EDITOR.password));
      const ana = await person('Ana');
      const id = await title('MOVIE', 'First Light');

      await http().get('/v1/genres').set(reader).expect(200);
      await http().get('/v1/people').set(reader).expect(200);
      await http().get(`/v1/people/${ana}`).set(reader).expect(200);
      await http().post('/v1/genres').set(reader).send({ name: 'Drama' }).expect(403);
      await http().post('/v1/people').set(reader).send({ name: 'Ben' }).expect(403);
      await http().delete(`/v1/people/${ana}`).set(reader).expect(403);
      await http().put(`/v1/titles/${id}/credits`).set(reader).send({ credits: [] }).expect(403);
      await http().get('/v1/people').expect(401);
    });
  });
});
