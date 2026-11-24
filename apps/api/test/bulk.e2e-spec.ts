// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of actions on many titles at once, and of the job that
// translates titles from the source of their details.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { BulkModule } from '../src/bulk/bulk.module.js';
import { TRANSLATION_LOCK, TranslationJobsService } from '../src/bulk/translation-jobs.service.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { MetadataModule } from '../src/metadata/metadata.module.js';
import { type FakeTmdb, startFakeTmdb } from './support/fake-tmdb.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [AssetsModule, AdminsModule, CatalogModule, MetadataModule, BulkModule];
const READER = {
  email: 'viewer-admin@example.com',
  displayName: 'Vera Viewer',
  password: 'viewer-password-123',
  role: 'VIEWER',
};

describe.skipIf(!TEST_DATABASE_URL)('Bulk actions (e2e)', () => {
  let testApp: TestApp;
  let tmdb: FakeTmdb;
  let workDirectory: string;
  let env: Record<string, string>;
  let ownerToken: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const get = (url: string) => http().get(url).set(auth());
  const post = (url: string, body: object) => http().post(url).set(auth()).send(body);
  const patch = (url: string, body: object) => http().patch(url).set(auth()).send(body);
  const bulk = (body: object) => post('/v1/titles/bulk', body);
  const runner = () => testApp.app.get(TranslationJobsService);

  async function asset(name: string): Promise<string> {
    const response = await post('/v1/assets', { title: name }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: { status: 'READY', manifestPath: `assets/${id}/hls/master.m3u8`, readyAt: new Date() },
    });
    return id;
  }
  /** A draft movie. With a video it can be published. */
  async function movie(name: string, withVideo = true): Promise<string> {
    const title = (await post('/v1/titles', { type: 'MOVIE', name }).expect(201)).body;
    if (withVideo) {
      await patch(`/v1/titles/${title.id}`, { assetId: await asset(name) }).expect(200);
    }
    return title.id as string;
  }
  const named = async (kind: 'categories' | 'genres' | 'collections', name: string) =>
    (await post(`/v1/${kind}`, { name }).expect(201)).body.id as string;
  const detail = async (id: string) => (await get(`/v1/titles/${id}`).expect(200)).body;
  const idsOf = (items: { id: string }[]) => items.map((item) => item.id).sort();
  /** Looks until no job waits or runs. */
  async function finish(): Promise<void> {
    for (let look = 0; look < 20; look += 1) {
      await runner().look();
      const open = await testApp.prisma.translationJob.count({
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
      });
      if (open === 0) {
        return;
      }
    }
    throw new Error('The job did not end');
  }
  /** What the source says about The Matrix when asked in German. */
  function germanMatrix(): void {
    tmdb.json['/3/movie/603'] = {
      ...(tmdb.json['/3/movie/603'] as object),
      title: 'Matrix',
      tagline: 'Befreie deinen Geist.',
      overview: 'Ein Hacker erfährt, was die Welt wirklich ist.',
    };
  }

  beforeAll(async () => {
    tmdb = await startFakeTmdb();
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-bulk-'));
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
    await testApp.redis.del(TRANSLATION_LOCK);
    ownerToken = await testApp.setupOwner();
  });
  afterAll(async () => {
    await testApp.resetDatabase();
    await testApp.close();
    await tmdb.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  describe('on chosen titles', () => {
    it('publishes what is ready and names what is not, with its reason', async () => {
      const ready = await movie('Harbour Lights');
      const second = await movie('Night Ferry');
      const empty = await movie('No Video Yet', false);
      await http()
        .put(`/v1/titles/${second}/status`)
        .set(auth())
        .send({ status: 'PUBLISHED' })
        .expect(200);

      const response = await bulk({
        ids: [ready, second, empty],
        action: { type: 'publish' },
      }).expect(200);

      expect(response.body).toMatchObject({
        action: 'publish',
        matched: 3,
        changed: 1,
        unchanged: 1,
        failed: 1,
        job: null,
      });
      expect(response.body.failures).toHaveLength(1);
      expect(response.body.failures[0]).toMatchObject({ titleId: empty, name: 'No Video Yet' });
      expect(response.body.failures[0].reason).toMatch(/video/i);
      expect((await detail(ready)).status).toBe('PUBLISHED');
      expect((await detail(empty)).status).toBe('DRAFT');
    });

    it('unpublishes, archives and deletes, and keeps published titles from being deleted', async () => {
      const first = await movie('One');
      const second = await movie('Two');
      await bulk({ ids: [first, second], action: { type: 'publish' } }).expect(200);

      const refused = await bulk({ ids: [first, second], action: { type: 'delete' } }).expect(200);
      expect(refused.body).toMatchObject({ changed: 0, failed: 2 });
      expect(refused.body.failures[0].reason).toBe('Unpublish the title before deleting it');

      const archived = await bulk({ ids: [first], action: { type: 'archive' } }).expect(200);
      expect(archived.body).toMatchObject({ changed: 1, failed: 0 });
      expect((await detail(first)).status).toBe('ARCHIVED');
      await bulk({ ids: [second], action: { type: 'unpublish' } }).expect(200);
      expect((await detail(second)).status).toBe('DRAFT');

      const deleted = await bulk({ ids: [first, second], action: { type: 'delete' } }).expect(200);
      expect(deleted.body).toMatchObject({ matched: 2, changed: 2, failed: 0 });
      expect(await testApp.prisma.title.count()).toBe(0);
    });

    it('features titles and says which were featured already', async () => {
      const first = await movie('One');
      const second = await movie('Two');
      await patch(`/v1/titles/${first}`, { isFeatured: true }).expect(200);

      const response = await bulk({
        ids: [first, second],
        action: { type: 'feature', value: true },
      }).expect(200);
      expect(response.body).toMatchObject({ changed: 1, unchanged: 1 });
      expect((await detail(second)).isFeatured).toBe(true);
    });

    it('says from which age many titles suit, and finds the ones nobody rated', async () => {
      const first = await movie('One');
      const second = await movie('Two');
      const third = await movie('Three');
      await patch(`/v1/titles/${first}`, { ageRating: 'FSK 12' }).expect(200);

      const unrated = await testApp
        .http()
        .get('/v1/titles?rated=no&sort=name&order=asc')
        .set(testApp.bearer(ownerToken))
        .expect(200);
      expect(unrated.body.items.map((item: { name: string }) => item.name)).toEqual([
        'Three',
        'Two',
      ]);

      // Everything nobody rated, in one go.
      const response = await bulk({
        filter: { rated: 'no' },
        action: { type: 'age', minAge: 6 },
      }).expect(200);
      expect(response.body).toMatchObject({ matched: 2, changed: 2, unchanged: 0 });
      expect((await detail(second)).minAge).toBe(6);
      expect((await detail(third)).minAge).toBe(6);
      // The one that was rated keeps its age, and the rating as written stays.
      expect(await detail(first)).toMatchObject({ minAge: 12, ageRating: 'FSK 12' });

      const again = await bulk({
        ids: [first, second],
        action: { type: 'age', minAge: 12 },
      }).expect(200);
      expect(again.body).toMatchObject({ changed: 1, unchanged: 1 });

      const cleared = await bulk({ ids: [second], action: { type: 'age', minAge: null } }).expect(
        200,
      );
      expect(cleared.body.changed).toBe(1);
      expect((await detail(second)).minAge).toBeNull();
      await bulk({ ids: [first], action: { type: 'age', minAge: 30 } }).expect(400);
    });

    it('adds and removes categories, genres and collections without touching the others', async () => {
      const first = await movie('One');
      const second = await movie('Two');
      const drama = await named('categories', 'Drama night');
      const family = await named('categories', 'Family');
      const kids = await named('categories', 'Kids');
      const thriller = await named('genres', 'Thriller');
      const saga = await named('collections', 'The Saga');
      await patch(`/v1/titles/${first}`, { categoryIds: [drama, kids] }).expect(200);
      await patch(`/v1/titles/${second}`, { categoryIds: [family] }).expect(200);

      const response = await bulk({
        ids: [first, second],
        action: { type: 'categories', add: [family], remove: [kids] },
      }).expect(200);
      expect(response.body).toMatchObject({ changed: 1, unchanged: 1, failed: 0 });
      expect(idsOf((await detail(first)).categories)).toEqual([drama, family].sort());
      expect(idsOf((await detail(second)).categories)).toEqual([family]);

      await bulk({ ids: [first, second], action: { type: 'genres', add: [thriller] } }).expect(200);
      expect(idsOf((await detail(second)).genres)).toEqual([thriller]);

      const collected = await bulk({
        ids: [first, second],
        action: { type: 'collections', add: [saga] },
      }).expect(200);
      expect(collected.body.changed).toBe(2);
      const members = await testApp.prisma.collectionTitle.findMany({
        where: { collectionId: saga },
        orderBy: { position: 'asc' },
      });
      expect(members.map((member) => member.titleId)).toEqual([first, second]);

      const removed = await bulk({
        ids: [first, second],
        action: { type: 'collections', remove: [saga] },
      }).expect(200);
      expect(removed.body.changed).toBe(2);
      expect(await testApp.prisma.collectionTitle.count()).toBe(0);
    });

    it('refuses a shelf that does not exist, and an action that changes nothing', async () => {
      const first = await movie('One');
      const missing = '01a1fdfd-0000-7000-8000-000000000000';
      const response = await bulk({
        ids: [first],
        action: { type: 'genres', add: [missing] },
      }).expect(400);
      expect(response.body.message).toBe('One of the chosen genres does not exist');
      await bulk({ ids: [first], action: { type: 'categories' } }).expect(400);
    });

    it('sets the dates of availability, one of them or both', async () => {
      const first = await movie('One');
      const second = await movie('Two');
      const from = '2030-01-01T00:00:00.000Z';
      const until = '2030-06-01T00:00:00.000Z';

      await bulk({
        ids: [first, second],
        action: { type: 'availability', availableFrom: from, availableUntil: until },
      }).expect(200);
      expect(await detail(first)).toMatchObject({ availableFrom: from, availableUntil: until });

      // Only the end is cleared: the start stays.
      const cleared = await bulk({
        ids: [first],
        action: { type: 'availability', availableUntil: null },
      }).expect(200);
      expect(cleared.body.changed).toBe(1);
      expect(await detail(first)).toMatchObject({ availableFrom: from, availableUntil: null });

      // An end before the start a title has is that title's failure.
      const wrong = await bulk({
        ids: [first, second],
        action: { type: 'availability', availableUntil: '2029-01-01T00:00:00.000Z' },
      }).expect(200);
      expect(wrong.body).toMatchObject({ changed: 0, failed: 2 });
      expect(wrong.body.failures[0].reason).toBe(
        'The end of the availability must come after its start',
      );
    });
  });

  describe('on everything the filters match', () => {
    it('changes the titles of all pages, and only those that match', async () => {
      const movies = [await movie('Alpha'), await movie('Beta'), await movie('Gamma')];
      const show = (await post('/v1/titles', { type: 'SERIES', name: 'A Series' }).expect(201)).body
        .id as string;

      const response = await bulk({
        filter: { type: 'MOVIE' },
        action: { type: 'feature', value: true },
      }).expect(200);
      expect(response.body).toMatchObject({ matched: 3, changed: 3 });
      expect((await detail(show)).isFeatured).toBe(false);

      const searched = await bulk({
        filter: { type: 'MOVIE', q: 'gamma' },
        action: { type: 'feature', value: false },
      }).expect(200);
      expect(searched.body).toMatchObject({ matched: 1, changed: 1 });
      expect((await detail(movies[2] as string)).isFeatured).toBe(false);
      expect((await detail(movies[0] as string)).isFeatured).toBe(true);
    });

    it('answers with nothing done when nothing matches', async () => {
      const response = await bulk({
        filter: { q: 'no such title' },
        action: { type: 'archive' },
      }).expect(200);
      expect(response.body).toMatchObject({ matched: 0, changed: 0, failed: 0 });
    });

    it('wants titles named by ids or by filters, not both and not neither', async () => {
      const first = await movie('One');
      await bulk({ action: { type: 'publish' } }).expect(400);
      await bulk({ ids: [first], filter: {}, action: { type: 'publish' } }).expect(400);
      await bulk({ ids: [], action: { type: 'publish' } }).expect(400);
      await bulk({ ids: [first], action: { type: 'explode' } }).expect(400);
    });
  });

  describe('translating', () => {
    const importMovie = async () =>
      (await post('/v1/metadata/import', { id: 'movie:603' }).expect(201)).body.title.id as string;

    it('fills in a language for imported titles, in the background', async () => {
      const matrix = await importMovie();
      const manual = await movie('Made By Hand');
      germanMatrix();

      const started = await bulk({
        filter: { type: 'MOVIE' },
        action: { type: 'translate', language: 'DE' },
      }).expect(200);
      expect(started.body).toMatchObject({ action: 'translate', matched: 2, changed: 0 });
      expect(started.body.job).toMatchObject({
        language: 'de',
        overwrite: false,
        status: 'QUEUED',
        total: 2,
        done: 0,
      });
      // Nothing is translated by the request itself.
      expect(await testApp.prisma.titleTranslation.count()).toBe(0);
      expect((await get('/v1/translation-jobs?active=true').expect(200)).body).toHaveLength(1);

      await finish();

      const [job] = (await get('/v1/translation-jobs').expect(200)).body;
      expect(job).toMatchObject({
        status: 'COMPLETED',
        total: 2,
        done: 2,
        translated: 1,
        unchanged: 0,
        skipped: 1,
        failed: 0,
        failures: [],
      });
      expect(job.createdBy.displayName).toBeTruthy();
      expect(job.finishedAt).not.toBeNull();
      const translations = (await get(`/v1/titles/${matrix}/translations`).expect(200)).body;
      expect(translations).toHaveLength(1);
      expect(translations[0]).toMatchObject({
        language: 'de',
        name: 'Matrix',
        tagline: 'Befreie deinen Geist.',
        synopsis: 'Ein Hacker erfährt, was die Welt wirklich ist.',
      });
      expect((await get(`/v1/titles/${manual}/translations`).expect(200)).body).toEqual([]);
      expect((await get('/v1/translation-jobs?active=true').expect(200)).body).toEqual([]);
    });

    it('keeps what an admin wrote, unless told to replace it', async () => {
      const matrix = await importMovie();
      germanMatrix();
      await http()
        .put(`/v1/titles/${matrix}/translations/de`)
        .set(auth())
        .send({ name: 'Die Matrix' })
        .expect(200);

      await bulk({ ids: [matrix], action: { type: 'translate', language: 'de' } }).expect(200);
      await finish();
      let [translation] = (await get(`/v1/titles/${matrix}/translations`).expect(200)).body;
      expect(translation).toMatchObject({ name: 'Die Matrix', tagline: 'Befreie deinen Geist.' });

      // A second run has nothing new.
      await bulk({ ids: [matrix], action: { type: 'translate', language: 'de' } }).expect(200);
      await finish();
      expect((await get('/v1/translation-jobs').expect(200)).body[0]).toMatchObject({
        translated: 0,
        unchanged: 1,
      });

      await bulk({
        ids: [matrix],
        action: { type: 'translate', language: 'de', overwrite: true },
      }).expect(200);
      await finish();
      [translation] = (await get(`/v1/titles/${matrix}/translations`).expect(200)).body;
      expect(translation.name).toBe('Matrix');
    });

    it('names a title the source does not know, and goes on', async () => {
      const matrix = await importMovie();
      const lost = await movie('Lost At The Source');
      await testApp.prisma.title.update({
        where: { id: lost },
        data: { metadataSource: 'tmdb', metadataId: 'movie:999999' },
      });
      germanMatrix();

      await bulk({ ids: [lost, matrix], action: { type: 'translate', language: 'de' } }).expect(
        200,
      );
      await finish();
      const [job] = (await get('/v1/translation-jobs').expect(200)).body;
      expect(job).toMatchObject({ status: 'COMPLETED', translated: 1, failed: 1 });
      expect(job.failures).toEqual([
        { titleId: lost, name: 'Lost At The Source', reason: 'TMDB has no such title' },
      ]);
    });

    it('waits when the source does not answer, and gives up after some tries', async () => {
      const matrix = await importMovie();
      germanMatrix();
      await bulk({ ids: [matrix], action: { type: 'translate', language: 'de' } }).expect(200);

      tmdb.failWith = 500;
      await runner().look();
      let [job] = (await get('/v1/translation-jobs').expect(200)).body;
      expect(job).toMatchObject({ status: 'RUNNING', done: 0, failed: 0 });

      // It answers again: the title is not lost.
      tmdb.failWith = null;
      await finish();
      [job] = (await get('/v1/translation-jobs').expect(200)).body;
      expect(job).toMatchObject({ status: 'COMPLETED', translated: 1 });

      await bulk({
        ids: [matrix],
        action: { type: 'translate', language: 'fr' },
      }).expect(200);
      tmdb.failWith = 500;
      await finish();
      [job] = (await get('/v1/translation-jobs').expect(200)).body;
      expect(job).toMatchObject({
        status: 'FAILED',
        done: 0,
        note: 'TMDB answered with an error (500)',
      });
    });

    it('can be stopped, and keeps what it did', async () => {
      const matrix = await importMovie();
      const started = await bulk({
        ids: [matrix],
        action: { type: 'translate', language: 'de' },
      }).expect(200);
      const id = started.body.job.id as string;

      const stopped = await post(`/v1/translation-jobs/${id}/cancel`, {}).expect(200);
      expect(stopped.body.status).toBe('CANCELLED');
      await post(`/v1/translation-jobs/${id}/cancel`, {}).expect(409);
      await post('/v1/translation-jobs/01a1fdfd-0000-7000-8000-000000000000/cancel', {}).expect(
        404,
      );

      await runner().look();
      expect(await testApp.prisma.titleTranslation.count()).toBe(0);
      expect((await get('/v1/translation-jobs').expect(200)).body[0].status).toBe('CANCELLED');
    });

    it('runs one job after the other, the oldest first', async () => {
      const matrix = await importMovie();
      germanMatrix();
      await bulk({ ids: [matrix], action: { type: 'translate', language: 'de' } }).expect(200);
      await bulk({ ids: [matrix], action: { type: 'translate', language: 'fr' } }).expect(200);

      await runner().look();
      const jobs = (await get('/v1/translation-jobs').expect(200)).body;
      expect(
        jobs.map((job: { language: string; status: string }) => [job.language, job.status]),
      ).toEqual([
        ['fr', 'QUEUED'],
        ['de', 'COMPLETED'],
      ]);
    });

    it('does nothing while another process holds the lock', async () => {
      const matrix = await importMovie();
      await bulk({ ids: [matrix], action: { type: 'translate', language: 'de' } }).expect(200);
      await testApp.redis.set(TRANSLATION_LOCK, 'someone-else');
      await runner().look();
      expect((await get('/v1/translation-jobs').expect(200)).body[0].status).toBe('QUEUED');
    });

    it('refuses a language that is not a tag', async () => {
      const first = await movie('One');
      await bulk({ ids: [first], action: { type: 'translate', language: 'german!' } }).expect(400);
    });
  });

  describe('access and the log', () => {
    it('writes one line to the log for the whole action', async () => {
      const first = await movie('One');
      const second = await movie('Two');
      await bulk({ ids: [first, second], action: { type: 'feature', value: true } }).expect(200);

      const entry = await testApp.prisma.auditLog.findFirst({
        where: { action: 'title.bulk.feature' },
      });
      expect(entry?.metadata).toMatchObject({
        type: 'feature',
        value: true,
        selection: 'chosen',
        matched: 2,
        changed: 2,
        failed: 0,
      });
    });

    it('needs the right to write the catalog', async () => {
      const first = await movie('One');
      await http()
        .post('/v1/titles/bulk')
        .send({ ids: [first], action: { type: 'publish' } })
        .expect(401);
      await post('/v1/admins', READER).expect(201);
      const reader = testApp.bearer(await testApp.login(READER.email, READER.password));
      await http()
        .post('/v1/titles/bulk')
        .set(reader)
        .send({ ids: [first], action: { type: 'publish' } })
        .expect(403);
      await http().get('/v1/translation-jobs').set(reader).expect(200);
    });
  });

  describe('without the import set up', () => {
    let plainApp: TestApp;
    afterAll(async () => {
      await plainApp?.close();
    });

    it('says that translations need TMDB, and still does the other actions', async () => {
      plainApp = await createTestApp(MODULES, env);
      await plainApp.resetDatabase();
      const token = await plainApp.setupOwner();
      const created = await plainApp
        .http()
        .post('/v1/titles')
        .set(plainApp.bearer(token))
        .send({ type: 'MOVIE', name: 'One' })
        .expect(201);
      const send = (action: object) =>
        plainApp
          .http()
          .post('/v1/titles/bulk')
          .set(plainApp.bearer(token))
          .send({ ids: [created.body.id], action });

      const refused = await send({ type: 'translate', language: 'de' }).expect(503);
      expect(refused.body.message).toMatch(/TMDB_API_TOKEN/);
      await send({ type: 'feature', value: true }).expect(200);
    });
  });
});
