// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the import of details and artwork. The Movie Database
// is played by a small server on this machine.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { ApiKeysModule } from '../src/api-keys/api-keys.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { MetadataModule } from '../src/metadata/metadata.module.js';
import { type FakeTmdb, png, startFakeTmdb } from './support/fake-tmdb.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [AssetsModule, AdminsModule, ApiKeysModule, CatalogModule, MetadataModule];

describe.skipIf(!TEST_DATABASE_URL)('Metadata import (e2e)', () => {
  let testApp: TestApp;
  let tmdb: FakeTmdb;
  let workDirectory: string;
  let env: Record<string, string>;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);
  const importNew = (body: Record<string, unknown>) =>
    http().post('/v1/metadata/import').set(admin()).send(body);
  const apply = (titleId: string, body: Record<string, unknown>) =>
    http().post(`/v1/titles/${titleId}/metadata`).set(admin()).send(body);
  const pictureRequests = () => tmdb.requests.filter((line) => line.includes('/t/p/'));

  beforeAll(async () => {
    tmdb = await startFakeTmdb();
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-metadata-'));
    env = {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      TMDB_API_URL: tmdb.apiUrl,
      TMDB_IMAGE_URL: tmdb.imageUrl,
    };
    testApp = await createTestApp(MODULES, { ...env, TMDB_API_TOKEN: 'a-read-access-token' });
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    tmdb.reset();
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp.resetDatabase();
    await testApp.close();
    await tmdb.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  it('says whether the import is set up, with its defaults', async () => {
    const status = await http().get('/v1/metadata').set(admin()).expect(200);
    expect(status.body).toEqual({ enabled: true, source: 'tmdb', language: 'en-US', region: 'US' });
    await http().get('/v1/metadata').expect(401);
  });

  describe('searching', () => {
    it('offers what the source has, leaving out what cannot be used', async () => {
      const response = await http()
        .get('/v1/metadata/search?type=MOVIE&q=matrix&year=1999')
        .set(admin())
        .expect(200);

      expect(response.body).toEqual([
        {
          id: 'movie:603',
          type: 'MOVIE',
          name: 'The Matrix',
          originalName: null,
          releaseYear: 1999,
          overview: 'A computer hacker learns what the world really is.',
          posterUrl: `${tmdb.imageUrl}/w185/poster.jpg`,
          existingTitleId: null,
        },
        {
          id: 'movie:604',
          type: 'MOVIE',
          name: 'The Matrix Reloaded',
          originalName: null,
          releaseYear: 2003,
          overview: null,
          posterUrl: null,
          existingTitleId: null,
        },
      ]);
      expect(tmdb.requests[0]).toBe(
        'GET /3/search/movie?query=matrix&language=en-US&include_adult=false&page=1&year=1999',
      );
      // The token travels in a header, never in the address.
      expect(tmdb.authorizations).toEqual(['Bearer a-read-access-token']);
    });

    it('searches series in the language asked for', async () => {
      const response = await http()
        .get('/v1/metadata/search?type=SERIES&q=deep&year=2021&language=de-DE')
        .set(admin())
        .expect(200);
      expect(response.body[0]).toMatchObject({
        id: 'tv:1399',
        type: 'SERIES',
        name: 'Deep Water',
        originalName: 'Tiefes Wasser',
      });
      expect(tmdb.requests[0]).toContain('/3/search/tv?query=deep&language=de-DE');
      expect(tmdb.requests[0]).toContain('first_air_date_year=2021');
    });

    it('marks what is in the catalog already', async () => {
      const imported = await importNew({ id: 'movie:603' }).expect(201);
      const response = await http()
        .get('/v1/metadata/search?type=MOVIE&q=matrix')
        .set(admin())
        .expect(200);
      expect(response.body[0].existingTitleId).toBe(imported.body.title.id);
      expect(response.body[1].existingTitleId).toBeNull();
    });

    it('checks the query', async () => {
      await http().get('/v1/metadata/search?type=MOVIE').set(admin()).expect(400);
      await http().get('/v1/metadata/search?type=FILM&q=x').set(admin()).expect(400);
      await http()
        .get('/v1/metadata/search?type=MOVIE&q=x&language=english')
        .set(admin())
        .expect(400);
      await http().get('/v1/metadata/preview?id=movie:abc').set(admin()).expect(400);
      await http().get('/v1/metadata/preview?id=person:5').set(admin()).expect(400);
    });
  });

  it('previews what an import would bring, without changing anything', async () => {
    const category = await http()
      .post('/v1/categories')
      .set(admin())
      .send({ name: 'Science fiction' })
      .expect(201);

    const movie = await http().get('/v1/metadata/preview?id=movie:603').set(admin()).expect(200);
    expect(movie.body).toEqual({
      id: 'movie:603',
      type: 'MOVIE',
      language: 'en-US',
      name: 'The Matrix',
      originalName: null,
      tagline: 'Free your mind.',
      synopsis: 'A computer hacker learns what the world really is.\n\nAnd takes a side.',
      releaseYear: 1999,
      // The first release of the country that has a rating.
      ageRating: 'R',
      originalLanguage: 'en',
      genres: [
        { name: 'Action', categoryId: null },
        // The same name apart from capital letters is the same category.
        { name: 'Science Fiction', categoryId: category.body.id },
      ],
      artwork: {
        poster: `${tmdb.imageUrl}/w342/poster.jpg`,
        backdrop: `${tmdb.imageUrl}/w780/backdrop.jpg`,
        // English before another language, and a drawing as a PNG.
        logo: `${tmdb.imageUrl}/w300/logo-en.png`,
      },
      seasons: [],
      existingTitleId: null,
      releaseDate: '1999-03-31',
      runtimeMinutes: 136,
      countries: ['US', 'AU'],
      studios: ['Village Roadshow Pictures', 'Silver Pictures'],
      keywords: ['hacker', 'dystopia'],
      imdbId: 'tt0133093',
      rating: 8.2,
      ratingCount: 26_000,
      seriesStatus: null,
      lastAirDate: null,
      // How many people would come, and the first of them to recognize the title by.
      cast: 2,
      crew: 2,
      leads: ['Keanu Reeves', 'Carrie-Anne Moss'],
      collection: 'The Matrix Collection',
    });
    expect(tmdb.requests[0]).toBe(
      'GET /3/movie/603?language=en-US&append_to_response=release_dates%2Cimages%2Ccredits%2Ckeywords%2Cexternal_ids&include_image_language=en%2Cnull',
    );

    const series = await http()
      .get('/v1/metadata/preview?id=tv:1399&specials=true')
      .set(admin())
      .expect(200);
    expect(series.body.ageRating).toBe('TV-PG');
    // Seasons without episodes are left out. "Season 1" is not a name.
    expect(series.body.seasons).toEqual([
      { number: 0, name: 'Specials', episodeCount: 1, airDate: null, poster: null },
      {
        number: 1,
        name: null,
        episodeCount: 2,
        airDate: '2021-09-05',
        poster: '/season-1.jpg',
      },
      { number: 2, name: 'The Abyss', episodeCount: 1, airDate: '2022-03-13', poster: null },
    ]);

    expect(await testApp.prisma.title.count()).toBe(0);
    expect(await testApp.prisma.image.count()).toBe(0);
  });

  describe('importing a new title', () => {
    it('creates a draft movie with text, categories and artwork', async () => {
      const response = await importNew({ id: 'movie:603' }).expect(201);
      const { title, report } = response.body;

      expect(title).toMatchObject({
        type: 'MOVIE',
        status: 'DRAFT',
        slug: 'the-matrix',
        name: 'The Matrix',
        tagline: 'Free your mind.',
        synopsis: 'A computer hacker learns what the world really is.\n\nAnd takes a side.',
        releaseYear: 1999,
        ageRating: 'R',
        originalLanguage: 'en',
        poster: { width: 1000, height: 1500 },
        backdrop: { width: 1920, height: 1080 },
        logo: { width: 500, height: 200 },
        metadata: {
          source: 'tmdb',
          id: 'movie:603',
          language: 'en-US',
          syncedAt: expect.any(String),
        },
      });
      expect(title.categories.map((category: { name: string }) => category.name).sort()).toEqual([
        'Action',
        'Science Fiction',
      ]);
      expect(report).toEqual({
        fields: expect.arrayContaining([
          'tagline',
          'synopsis',
          'releaseYear',
          'ageRating',
          'originalLanguage',
          'poster',
          'backdrop',
          'logo',
          'categories',
        ]),
        categoriesCreated: ['Action', 'Science Fiction'],
        genresCreated: ['Action', 'Science Fiction'],
        collection: 'The Matrix Collection',
        peopleCreated: 3,
        credits: 4,
        seasonsCreated: 0,
        episodesCreated: 0,
        episodesUpdated: 0,
        // Poster, backdrop and logo, and the two people who have a picture at the source.
        picturesAdded: 5,
        warnings: [],
      });

      // The pictures are in the catalog's own storage and served from there.
      const poster = await http().get(new URL(title.poster.url, 'http://x').pathname).expect(200);
      expect(poster.headers['content-type']).toBe('image/png');
      expect(pictureRequests()).toEqual(
        expect.arrayContaining(['GET /t/p/original/poster.jpg', 'GET /t/p/original/logo-en.png']),
      );

      const audit = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'title.import' },
      });
      expect(audit.entityId).toBe(title.id);
      expect(audit.metadata).toMatchObject({ source: 'tmdb', sourceId: 'movie:603' });
    });

    it('creates a series with its seasons, episodes and stills', async () => {
      const response = await importNew({ id: 'tv:1399' }).expect(201);
      const { title, report } = response.body;

      expect(title).toMatchObject({
        type: 'SERIES',
        name: 'Deep Water',
        originalName: 'Tiefes Wasser',
        tagline: null,
        ageRating: 'TV-PG',
        originalLanguage: 'de',
        backdrop: null,
      });
      // Specials are left out unless asked for.
      expect(
        title.seasons.map(
          (season: { number: number; name: string | null; synopsis: string | null }) => [
            season.number,
            season.name,
            season.synopsis,
          ],
        ),
      ).toEqual([
        [1, null, 'The first dives.'],
        [2, 'The Abyss', null],
      ]);
      const [first, second] = title.seasons;
      expect(
        first.episodes.map((episode: Record<string, unknown>) => ({
          number: episode.number,
          name: episode.name,
          synopsis: episode.synopsis,
          status: episode.status,
          still: episode.still !== null,
        })),
      ).toEqual([
        { number: 1, name: 'The Shelf', synopsis: 'Sunlit.', status: 'DRAFT', still: true },
        { number: 2, name: 'Midnight Zone', synopsis: 'No light.', status: 'DRAFT', still: false },
      ]);
      // An episode without a name gets one. Its missing still is no reason to warn.
      expect(second.episodes).toMatchObject([{ number: 1, name: 'Episode 1', still: null }]);
      expect(report).toMatchObject({
        seasonsCreated: 2,
        episodesCreated: 3,
        // The poster, one still, the poster of the first season and one person.
        picturesAdded: 4,
        warnings: [],
      });
    });

    it('brings the facts, the genres and the people of a movie', async () => {
      const response = await importNew({ id: 'movie:603' }).expect(201);
      const title = response.body.title;
      expect(title).toMatchObject({
        releaseDate: '1999-03-31',
        runtimeMinutes: 136,
        countries: ['US', 'AU'],
        studios: ['Village Roadshow Pictures', 'Silver Pictures'],
        keywords: ['hacker', 'dystopia'],
        imdbId: 'tt0133093',
        rating: 8.2,
        ratingCount: 26_000,
        seriesStatus: null,
        lastAirDate: null,
      });
      expect(title.genres.map((genre: { name: string }) => genre.name)).toEqual([
        'Action',
        'Science Fiction',
      ]);
      expect(
        title.credits.map(
          (credit: { kind: string; role: string; person: { name: string } }) =>
            `${credit.kind} ${credit.person.name}: ${credit.role}`,
        ),
      ).toEqual([
        'CAST Keanu Reeves: Neo',
        'CAST Carrie-Anne Moss: Trinity',
        'CREW Lana Wachowski: Director',
        'CREW Lana Wachowski: Screenplay',
      ]);
      // A picture for those who have one at the source.
      expect(title.credits[0].person.portrait).toMatchObject({ kind: 'PORTRAIT', width: 421 });
      expect(title.credits[1].person.portrait).toBeNull();
      expect(response.body.report).toMatchObject({
        genresCreated: ['Action', 'Science Fiction'],
        collection: 'The Matrix Collection',
        peopleCreated: 3,
        credits: 4,
      });
      expect(await testApp.prisma.person.count()).toBe(3);
    });

    it('knows a person again in the next title, and does not fetch their picture twice', async () => {
      await importNew({ id: 'movie:603' }).expect(201);
      const before = pictureRequests().filter((line) => line.includes('keanu')).length;
      const series = await importNew({ id: 'tv:1399' }).expect(201);

      expect(series.body.report).toMatchObject({
        peopleCreated: 2,
        genresCreated: ['Documentary'],
        collection: null,
      });
      expect(pictureRequests().filter((line) => line.includes('keanu'))).toHaveLength(before);
      const keanu = await testApp.prisma.person.findFirstOrThrow({
        where: { name: 'Keanu Reeves' },
        include: { credits: true },
      });
      expect(keanu.credits).toHaveLength(2);
      expect(await testApp.prisma.person.count()).toBe(5);

      expect(
        series.body.title.credits.map(
          (credit: { role: string; person: { name: string } }) =>
            `${credit.person.name}: ${credit.role}`,
        ),
      ).toEqual(['Keanu Reeves: The Narrator', 'Ada Creator: Creator', 'Dee Director: Director']);
    });

    it('brings the dates, the lengths and the season posters of a series', async () => {
      const response = await importNew({ id: 'tv:1399' }).expect(201);
      const title = response.body.title;
      expect(title).toMatchObject({
        releaseDate: '2021-09-05',
        lastAirDate: '2022-03-13',
        seriesStatus: 'RUNNING',
        runtimeMinutes: 48,
        imdbId: 'tt7654321',
        rating: 7.4,
      });
      const [first, second] = title.seasons;
      expect(first).toMatchObject({ number: 1, airDate: '2021-09-05' });
      expect(first.poster).toMatchObject({ kind: 'POSTER', width: 1000 });
      expect(second).toMatchObject({ number: 2, airDate: '2022-03-13', poster: null });
      expect(
        first.episodes.map((episode: Record<string, unknown>) => [
          episode.airDate,
          episode.runtimeMinutes,
        ]),
      ).toEqual([
        ['2021-09-05', 47],
        ['2021-09-12', 51],
      ]);
    });

    it('leaves people and genres out when asked to', async () => {
      const response = await importNew({ id: 'movie:603', people: false, genres: false }).expect(
        201,
      );
      expect(response.body.title.credits).toEqual([]);
      expect(response.body.title.genres).toEqual([]);
      expect(await testApp.prisma.person.count()).toBe(0);
      expect(await testApp.prisma.genre.count()).toBe(0);

      const withoutPictures = await importNew({
        id: 'movie:603',
        allowDuplicate: true,
        portraits: false,
      }).expect(201);
      expect(withoutPictures.body.title.credits[0].person.portrait).toBeNull();
    });

    it('brings only the parts that were asked for', async () => {
      const response = await importNew({
        id: 'tv:1399',
        categories: false,
        artwork: false,
        stills: false,
        portraits: false,
        specials: true,
      }).expect(201);
      const { title, report } = response.body;

      expect(title.poster).toBeNull();
      expect(title.categories).toEqual([]);
      expect(title.seasons.map((season: { number: number }) => season.number)).toEqual([0, 1, 2]);
      expect(report.picturesAdded).toBe(0);
      expect(pictureRequests()).toEqual([]);
      expect(await testApp.prisma.category.count()).toBe(0);

      const textOnly = await importNew({
        id: 'tv:1399',
        allowDuplicate: true,
        episodes: false,
        artwork: false,
        createCategories: false,
      }).expect(201);
      expect(textOnly.body.title.seasons).toEqual([]);
      expect(textOnly.body.title.slug).toBe('deep-water-2');
      // Genres without a category of that name are left out.
      expect(textOnly.body.title.categories).toEqual([]);
    });

    it('refuses an entry that is in the catalog already, unless a duplicate is wanted', async () => {
      const first = await importNew({ id: 'movie:603' }).expect(201);
      const refused = await importNew({ id: 'movie:603' }).expect(409);
      expect(refused.body).toMatchObject({
        message: '"The Matrix" is in the catalog already',
        existingTitleId: first.body.title.id,
      });
      expect(await testApp.prisma.title.count()).toBe(1);

      await importNew({ id: 'movie:603', allowDuplicate: true }).expect(201);
      expect(await testApp.prisma.title.count()).toBe(2);
    });

    it('imports in another language and remembers which', async () => {
      const response = await importNew({ id: 'movie:603', language: 'fr-FR' }).expect(201);
      expect(response.body.title.metadata.language).toBe('fr-FR');
      expect(tmdb.requests[0]).toContain('language=fr-FR');
      expect(tmdb.requests[0]).toContain('include_image_language=fr%2Cen%2Cnull');
      // The logo in the language asked for wins.
      expect(pictureRequests()).toContain('GET /t/p/original/logo-fr.png');
    });

    it('falls back to a smaller size, and goes on without a picture that cannot be had', async () => {
      // Too many pixels at full size, fine at the next one. The fake serves one file per path,
      // so the first answer is replaced after it was refused.
      tmdb.pictures['/poster.jpg'] = png(9000, 13500);
      delete tmdb.pictures['/backdrop.jpg'];

      const response = await importNew({ id: 'movie:603' }).expect(201);
      expect(response.body.title.poster).toBeNull();
      expect(response.body.title.backdrop).toBeNull();
      expect(response.body.title.logo).not.toBeNull();
      expect(response.body.report.warnings).toEqual(
        expect.arrayContaining([
          'The poster could not be downloaded',
          'The backdrop could not be downloaded',
        ]),
      );
      expect(pictureRequests()).toEqual(
        expect.arrayContaining([
          'GET /t/p/original/poster.jpg',
          'GET /t/p/w780/poster.jpg',
          'GET /t/p/original/backdrop.jpg',
          'GET /t/p/w1280/backdrop.jpg',
        ]),
      );
    });

    it('never downloads from an address the source made up', async () => {
      tmdb.json['/3/movie/603'] = {
        id: 603,
        title: 'The Matrix',
        poster_path: '/../../../etc/passwd',
        backdrop_path: 'http://169.254.169.254/latest/meta-data',
        images: { logos: [{ file_path: '//evil.example/x.png', iso_639_1: 'en' }] },
      };
      const response = await importNew({ id: 'movie:603' }).expect(201);
      expect(response.body.title).toMatchObject({ poster: null, backdrop: null, logo: null });
      expect(pictureRequests()).toEqual([]);
    });

    it('leaves nothing behind when the source fails halfway', async () => {
      tmdb.json['/3/tv/1399'] = 'not json';
      await importNew({ id: 'tv:1399' }).expect(502);
      expect(await testApp.prisma.title.count()).toBe(0);

      const missing = await importNew({ id: 'movie:999' }).expect(404);
      expect(missing.body.message).toBe('TMDB has no such title');
    });

    it('imports the rest when one season cannot be read', async () => {
      delete tmdb.json['/3/tv/1399/season/2'];
      const response = await importNew({ id: 'tv:1399' }).expect(201);
      expect(
        response.body.title.seasons.map((season: { number: number }) => season.number),
      ).toEqual([1]);
      expect(response.body.report.warnings).toEqual(['Season 2 could not be read from TMDB']);
    });
  });

  describe('bringing details into an existing title', () => {
    async function createSeries() {
      const created = await http()
        .post('/v1/titles')
        .set(admin())
        .send({ type: 'SERIES', name: 'My Dives' })
        .expect(201);
      const id = created.body.id as string;
      await http()
        .patch(`/v1/titles/${id}`)
        .set(admin())
        .send({ synopsis: 'Written by hand.', releaseYear: 2020 })
        .expect(200);
      const withSeason = await http()
        .post(`/v1/titles/${id}/seasons`)
        .set(admin())
        .send({ name: 'My first season' })
        .expect(201);
      const seasonId = withSeason.body.seasons[0].id as string;
      const asset = await http()
        .post('/v1/assets')
        .set(admin())
        .send({ title: 'Episode master' })
        .expect(201);
      const assetId = asset.body.asset.id as string;
      await testApp.prisma.asset.update({
        where: { id: assetId },
        data: { status: 'READY', manifestPath: `assets/${assetId}/hls/master.m3u8` },
      });
      const episode = await http()
        .post(`/v1/seasons/${seasonId}/episodes`)
        .set(admin())
        .send({ name: 'Episode 1', assetId })
        .expect(201);
      await http()
        .patch(`/v1/episodes/${episode.body.id}`)
        .set(admin())
        .send({ status: 'PUBLISHED' })
        .expect(200);
      return { id, episodeId: episode.body.id as string, assetId };
    }

    it('fills what is empty and adds what is missing, and keeps what was typed', async () => {
      const series = await createSeries();
      const response = await apply(series.id, { id: 'tv:1399' }).expect(201);
      const { title, report } = response.body;

      expect(title).toMatchObject({
        name: 'My Dives',
        slug: 'my-dives',
        synopsis: 'Written by hand.',
        releaseYear: 2020,
        originalName: 'Tiefes Wasser',
        ageRating: 'TV-PG',
        metadata: { id: 'tv:1399' },
      });
      expect(report.fields).not.toContain('name');
      expect(report.fields).not.toContain('synopsis');
      expect(report.fields).toEqual(
        expect.arrayContaining(['originalName', 'ageRating', 'originalLanguage', 'poster']),
      );

      const [first, second] = title.seasons;
      expect(first).toMatchObject({
        number: 1,
        name: 'My first season',
        synopsis: 'The first dives.',
      });
      // The placeholder name gives way. The video and the publication stay.
      expect(first.episodes).toMatchObject([
        {
          id: series.episodeId,
          number: 1,
          name: 'The Shelf',
          synopsis: 'Sunlit.',
          status: 'PUBLISHED',
          asset: { id: series.assetId },
        },
        { number: 2, name: 'Midnight Zone', status: 'DRAFT', asset: null },
      ]);
      expect(first.episodes[0].still).not.toBeNull();
      expect(second.number).toBe(2);
      expect(report).toMatchObject({ seasonsCreated: 1, episodesCreated: 2, episodesUpdated: 1 });

      // Again changes nothing more.
      const again = await apply(series.id, { id: 'tv:1399' }).expect(201);
      expect(again.body.report).toMatchObject({
        fields: [],
        seasonsCreated: 0,
        episodesCreated: 0,
        episodesUpdated: 0,
        picturesAdded: 0,
      });
    });

    it('replaces what the title has when asked to, and deletes the pictures it replaced', async () => {
      const series = await createSeries();
      await apply(series.id, { id: 'tv:1399' }).expect(201);
      const before = await testApp.prisma.image.findMany({ select: { id: true } });
      await http()
        .patch(`/v1/episodes/${series.episodeId}`)
        .set(admin())
        .send({ name: 'My own name' })
        .expect(200);

      const kept = await apply(series.id, { id: 'tv:1399' }).expect(201);
      expect(kept.body.title.seasons[0].episodes[0].name).toBe('My own name');

      const response = await apply(series.id, { id: 'tv:1399', overwrite: true }).expect(201);
      const { title, report } = response.body;
      expect(title).toMatchObject({
        name: 'Deep Water',
        // The address of the title stays, so links keep working.
        slug: 'my-dives',
        synopsis: 'Three dives, each deeper than the last.',
        releaseYear: 2021,
      });
      expect(title.seasons[0].name).toBe('My first season');
      expect(title.seasons[0].episodes[0]).toMatchObject({
        name: 'The Shelf',
        status: 'PUBLISHED',
      });
      expect(report.fields).toEqual(expect.arrayContaining(['name', 'synopsis', 'releaseYear']));

      const after = await testApp.prisma.image.findMany({ select: { id: true } });
      expect(after).toHaveLength(before.length);
      expect(after.map((image) => image.id)).not.toEqual(
        expect.arrayContaining(before.map((image) => image.id)),
      );

      const audit = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'title.metadata_update' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit.metadata).toMatchObject({ overwrite: true, sourceId: 'tv:1399' });
    });

    it('keeps facts and credits that were set by hand, and replaces them when asked to', async () => {
      const created = await http()
        .post('/v1/titles')
        .set(admin())
        .send({ type: 'MOVIE', name: 'The Matrix' })
        .expect(201);
      const id = created.body.id as string;
      const person = await http()
        .post('/v1/people')
        .set(admin())
        .send({ name: 'My Cousin' })
        .expect(201);
      await http()
        .patch(`/v1/titles/${id}`)
        .set(admin())
        .send({ runtimeMinutes: 140, studios: ['My Studio'], releaseDate: '1999-06-17' })
        .expect(200);
      await http()
        .put(`/v1/titles/${id}/credits`)
        .set(admin())
        .send({ credits: [{ personId: person.body.id, kind: 'CAST', role: 'Extra' }] })
        .expect(200);

      const filled = await apply(id, { id: 'movie:603' }).expect(201);
      expect(filled.body.title).toMatchObject({
        runtimeMinutes: 140,
        studios: ['My Studio'],
        releaseDate: '1999-06-17',
        // What was empty is filled.
        countries: ['US', 'AU'],
        imdbId: 'tt0133093',
        // The rating describes the world, not the admin's choice.
        rating: 8.2,
      });
      expect(filled.body.title.credits).toHaveLength(1);

      const replaced = await apply(id, { id: 'movie:603', overwrite: true }).expect(201);
      expect(replaced.body.title).toMatchObject({
        runtimeMinutes: 136,
        studios: ['Village Roadshow Pictures', 'Silver Pictures'],
        releaseDate: '1999-03-31',
      });
      expect(replaced.body.title.credits).toHaveLength(4);
      // The person added by hand is still a person, only no longer in this title.
      expect(await testApp.prisma.person.count({ where: { name: 'My Cousin' } })).toBe(1);
    });

    it('adds categories to the ones a title has, or replaces them', async () => {
      const own = await http()
        .post('/v1/categories')
        .set(admin())
        .send({ name: 'Staff picks' })
        .expect(201);
      const created = await http()
        .post('/v1/titles')
        .set(admin())
        .send({ type: 'MOVIE', name: 'Matrix' })
        .expect(201);
      await http()
        .patch(`/v1/titles/${created.body.id}`)
        .set(admin())
        .send({ categoryIds: [own.body.id] })
        .expect(200);
      const names = (body: { title: { categories: { name: string }[] } }) =>
        body.title.categories.map((category) => category.name).sort();

      const added = await apply(created.body.id, { id: 'movie:603', artwork: false }).expect(201);
      expect(names(added.body)).toEqual(['Action', 'Science Fiction', 'Staff picks']);

      const replaced = await apply(created.body.id, {
        id: 'movie:603',
        artwork: false,
        overwrite: true,
      }).expect(201);
      expect(names(replaced.body)).toEqual(['Action', 'Science Fiction']);
      expect(replaced.body.report.categoriesCreated).toEqual([]);
    });

    it('does not mix movies and series, and needs an existing title', async () => {
      const created = await http()
        .post('/v1/titles')
        .set(admin())
        .send({ type: 'MOVIE', name: 'A movie' })
        .expect(201);
      const refused = await apply(created.body.id, { id: 'tv:1399' }).expect(400);
      expect(refused.body.message).toBe(
        'This title is a movie. Choose a movie to take the details from.',
      );
      await apply('00000000-0000-7000-8000-000000000000', { id: 'movie:603' }).expect(404);
      await apply(created.body.id, { id: 'nonsense' }).expect(400);
    });
  });

  describe('when the source has trouble', () => {
    it('explains a refused token and other errors', async () => {
      tmdb.failWith = 401;
      const refused = await http()
        .get('/v1/metadata/search?type=MOVIE&q=matrix')
        .set(admin())
        .expect(502);
      expect(refused.body.message).toBe(
        'TMDB did not accept the access token. Check TMDB_API_TOKEN.',
      );

      tmdb.failWith = 500;
      const broken = await http()
        .get('/v1/metadata/search?type=MOVIE&q=matrix')
        .set(admin())
        .expect(502);
      expect(broken.body.message).toBe('TMDB answered with an error (500)');
    });

    it('waits and tries once more when the source is busy', async () => {
      tmdb.busyOnce = true;
      const response = await http()
        .get('/v1/metadata/search?type=MOVIE&q=matrix')
        .set(admin())
        .expect(200);
      expect(response.body).toHaveLength(2);
      expect(tmdb.requests.filter((line) => line.includes('/search/movie'))).toHaveLength(2);
    });
  });

  describe('permissions', () => {
    it('reads the texts of an imported series in another language, and changes nothing', async () => {
      const imported = await importNew({ id: 'tv:1399' }).expect(201);
      const title = imported.body.title;
      const source = () => http().get(`/v1/titles/${title.id}/translations/DE/source`).set(admin());

      // Without a translation the source answers in its own language: nothing to offer.
      const same = await source().expect(200);
      expect(same.body).toEqual({
        language: 'de',
        name: null,
        tagline: null,
        synopsis: null,
        seasons: [],
        episodes: [],
        warnings: [],
      });
      expect(tmdb.requests.at(-1)).toContain('language=de');

      const details = tmdb.json['/3/tv/1399'] as Record<string, unknown>;
      tmdb.json['/3/tv/1399'] = {
        ...details,
        name: 'Tiefes Wasser',
        overview: 'Drei Tauchgänge, jeder tiefer als der letzte.',
      };
      const season = tmdb.json['/3/tv/1399/season/1'] as Record<string, unknown>;
      tmdb.json['/3/tv/1399/season/1'] = {
        ...season,
        name: 'Staffel 1',
        overview: 'Die ersten Tauchgänge.',
        episodes: [
          { episode_number: 1, name: 'Der Schelf', overview: 'Im Sonnenlicht.' },
          // A placeholder of the source is not a name, and the same synopsis is no translation.
          { episode_number: 2, name: 'Folge 2', overview: 'No light.' },
          { episode_number: 9, name: 'Nicht im Katalog', overview: 'Fehlt.' },
        ],
      };
      const german = await source().expect(200);
      const first = title.seasons[0];
      expect(german.body).toMatchObject({
        name: 'Tiefes Wasser',
        tagline: null,
        synopsis: 'Drei Tauchgänge, jeder tiefer als der letzte.',
        seasons: [{ id: first.id, name: null, synopsis: 'Die ersten Tauchgänge.' }],
        episodes: [
          {
            id: first.episodes.find((episode: { number: number }) => episode.number === 1).id,
            name: 'Der Schelf',
            synopsis: 'Im Sonnenlicht.',
          },
        ],
        warnings: [],
      });
      expect(await testApp.prisma.titleTranslation.count()).toBe(0);

      // A title typed by hand has no source, and a tag must be one.
      const typed = await http()
        .post('/v1/titles')
        .set(admin())
        .send({ type: 'MOVIE', name: 'Typed' })
        .expect(201);
      await http()
        .get(`/v1/titles/${typed.body.id}/translations/de/source`)
        .set(admin())
        .expect(409);
      await http()
        .get(`/v1/titles/${title.id}/translations/german/source`)
        .set(admin())
        .expect(400);
    });

    it('puts a movie into the series of films it is part of, once', async () => {
      const first = await importNew({ id: 'movie:603' }).expect(201);
      expect(first.body.title.collections).toMatchObject([{ name: 'The Matrix Collection' }]);
      const collections = await http().get('/v1/collections').set(admin()).expect(200);
      expect(collections.body).toMatchObject([
        { name: 'The Matrix Collection', slug: 'the-matrix-collection', metadataSource: 'tmdb' },
      ]);

      // A copy of the film joins the same collection and makes no second one.
      const copy = await importNew({ id: 'movie:603', allowDuplicate: true }).expect(201);
      expect(copy.body.report.collection).toBe('The Matrix Collection');
      expect(await testApp.prisma.collection.count()).toBe(1);
      const detail = await http()
        .get(`/v1/collections/${collections.body[0].id}`)
        .set(admin())
        .expect(200);
      expect(detail.body.titles).toHaveLength(2);

      // Updating a title that is in it already changes nothing there.
      const again = await apply(first.body.title.id, { id: 'movie:603' }).expect(201);
      expect(again.body.report.collection).toBeNull();

      // And the part can be left out.
      await testApp.prisma.collection.deleteMany();
      const without = await importNew({
        id: 'movie:603',
        allowDuplicate: true,
        collection: false,
      }).expect(201);
      expect(without.body.title.collections).toEqual([]);
    });

    it('lets only people who edit the catalog search and import', async () => {
      await http().get('/v1/metadata/search?type=MOVIE&q=matrix').expect(401);
      await http().post('/v1/metadata/import').send({ id: 'movie:603' }).expect(401);

      const created = await http()
        .post('/v1/api-keys')
        .set(admin())
        .send({ name: 'Read only', scopes: ['catalog:read'] })
        .expect(201);
      const reader = testApp.bearer(created.body.key as string);
      await http().get('/v1/metadata').set(reader).expect(200);
      await http().get('/v1/metadata/search?type=MOVIE&q=matrix').set(reader).expect(403);
      await http().post('/v1/metadata/import').set(reader).send({ id: 'movie:603' }).expect(403);
    });
  });

  describe('with an API key in place of the access token', () => {
    let keyApp: TestApp;

    beforeAll(async () => {
      keyApp = await createTestApp(MODULES, {
        ...env,
        TMDB_API_TOKEN: '0123456789abcdef'.repeat(2),
      });
    });

    afterAll(async () => {
      await keyApp.close();
    });

    it('sends the key the way the source expects it', async () => {
      // The applications share the database, so the owner's session works in both.
      await keyApp.http().get('/v1/metadata/search?type=MOVIE&q=matrix').set(admin()).expect(200);
      expect(tmdb.requests[0]).toContain('api_key=0123456789abcdef0123456789abcdef');
      expect(tmdb.authorizations).toEqual([undefined]);
    });
  });

  describe('when the import is not set up', () => {
    let plainApp: TestApp;

    beforeAll(async () => {
      plainApp = await createTestApp(MODULES, env);
    });

    afterAll(async () => {
      await plainApp.close();
    });

    it('says so and asks the source nothing', async () => {
      const bearer = admin();
      const status = await plainApp.http().get('/v1/metadata').set(bearer).expect(200);
      expect(status.body.enabled).toBe(false);

      const refused = await plainApp
        .http()
        .get('/v1/metadata/search?type=MOVIE&q=matrix')
        .set(bearer)
        .expect(503);
      expect(refused.body.message).toBe(
        'The import is not set up. Set TMDB_API_TOKEN to turn it on.',
      );
      await plainApp
        .http()
        .post('/v1/metadata/import')
        .set(bearer)
        .send({ id: 'movie:603' })
        .expect(503);
      expect(tmdb.requests).toEqual([]);
    });
  });
});
