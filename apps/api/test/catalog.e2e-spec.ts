// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the catalog: categories, titles, seasons, episodes,
// artwork and the rules for publishing.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { MAX_IMAGE_BYTES } from '../src/catalog/images.service.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

/** The start of a PNG file, which is all the server reads to recognize it. */
function png(width: number, height: number, padding = 100): Buffer {
  const data = Buffer.alloc(33 + padding);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write('IHDR', 12, 'latin1');
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

describe.skipIf(!TEST_DATABASE_URL)('Catalog (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);

  async function createTitle(
    type: 'MOVIE' | 'SERIES',
    name: string,
  ): Promise<{ id: string; slug: string }> {
    const response = await http().post('/v1/titles').set(auth()).send({ type, name }).expect(201);
    return response.body as { id: string; slug: string };
  }

  /** Creates an asset and puts it into the given state, as processing would. */
  async function createAsset(
    title: string,
    status: 'READY' | 'PROCESSING' = 'READY',
  ): Promise<string> {
    const response = await http().post('/v1/assets').set(auth()).send({ title }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: {
        status,
        // Processing leaves a stream behind. Without one a video cannot be played.
        manifestPath: status === 'READY' ? `assets/${id}/hls/master.m3u8` : null,
        durationMs: 90_000,
        height: 1080,
        readyAt: status === 'READY' ? new Date() : null,
      },
    });
    return id;
  }

  function uploadImage(kind: string, data: Buffer = png(1000, 1500)) {
    return http()
      .post(`/v1/images?kind=${kind}`)
      .set(auth())
      .set('Content-Type', 'application/octet-stream')
      .send(data);
  }

  const setStatus = (id: string, status: string) =>
    http().put(`/v1/titles/${id}/status`).set(auth()).send({ status });

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-catalog-'));
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

  describe('categories', () => {
    it('creates categories with a slug and keeps them in order', async () => {
      const drama = await http()
        .post('/v1/categories')
        .set(auth())
        .send({ name: 'Drama' })
        .expect(201);
      const scifi = await http()
        .post('/v1/categories')
        .set(auth())
        .send({ name: 'Science Fiction', description: 'Futures and far places' })
        .expect(201);

      expect(drama.body).toMatchObject({
        name: 'Drama',
        slug: 'drama',
        sortOrder: 0,
        titleCount: 0,
      });
      expect(scifi.body).toMatchObject({ slug: 'science-fiction', sortOrder: 1 });

      const reordered = await http()
        .put('/v1/categories/order')
        .set(auth())
        .send({ ids: [scifi.body.id, drama.body.id] })
        .expect(200);
      expect(reordered.body.map((category: { name: string }) => category.name)).toEqual([
        'Science Fiction',
        'Drama',
      ]);
    });

    it('refuses duplicates and incomplete orders', async () => {
      const drama = await http()
        .post('/v1/categories')
        .set(auth())
        .send({ name: 'Drama' })
        .expect(201);
      await http().post('/v1/categories').set(auth()).send({ name: 'Drama' }).expect(409);
      await http()
        .post('/v1/categories')
        .set(auth())
        .send({ name: 'Other', slug: 'drama' })
        .expect(409);
      await http()
        .post('/v1/categories')
        .set(auth())
        .send({ name: 'X', slug: 'Not A Slug' })
        .expect(400);

      await http().post('/v1/categories').set(auth()).send({ name: 'Comedy' }).expect(201);
      await http()
        .put('/v1/categories/order')
        .set(auth())
        .send({ ids: [drama.body.id] })
        .expect(400);
      await http()
        .put('/v1/categories/order')
        .set(auth())
        .send({ ids: [drama.body.id, drama.body.id] })
        .expect(400);
    });

    it('renames and deletes a category without touching its titles', async () => {
      const category = await http()
        .post('/v1/categories')
        .set(auth())
        .send({ name: 'Drma' })
        .expect(201);
      const title = await createTitle('MOVIE', 'The Film');
      await http()
        .patch(`/v1/titles/${title.id}`)
        .set(auth())
        .send({ categoryIds: [category.body.id] })
        .expect(200);

      const renamed = await http()
        .patch(`/v1/categories/${category.body.id}`)
        .set(auth())
        .send({ name: 'Drama' })
        .expect(200);
      expect(renamed.body).toMatchObject({ name: 'Drama', titleCount: 1 });

      await http().delete(`/v1/categories/${category.body.id}`).set(auth()).expect(204);
      const after = await http().get(`/v1/titles/${title.id}`).set(auth()).expect(200);
      expect(after.body.categories).toEqual([]);
    });
  });

  describe('titles', () => {
    it('creates titles with unique slugs', async () => {
      const first = await createTitle('MOVIE', 'The Long Road');
      const second = await createTitle('MOVIE', 'The Long Road');
      const arabic = await createTitle('SERIES', 'الطريق الطويل');

      expect(first.slug).toBe('the-long-road');
      expect(second.slug).toBe('the-long-road-2');
      expect(arabic.slug).toBe('الطريق-الطويل');

      await http()
        .patch(`/v1/titles/${second.id}`)
        .set(auth())
        .send({ slug: 'the-long-road' })
        .expect(409);
    });

    it('updates details and normalizes empty text to nothing', async () => {
      const title = await createTitle('MOVIE', 'The Film');
      const updated = await http()
        .patch(`/v1/titles/${title.id}`)
        .set(auth())
        .send({
          tagline: '  Every road ends.  ',
          synopsis: '',
          releaseYear: 2024,
          ageRating: '12',
          originalLanguage: 'en',
          isFeatured: true,
        })
        .expect(200);

      expect(updated.body).toMatchObject({
        tagline: 'Every road ends.',
        synopsis: null,
        releaseYear: 2024,
        ageRating: '12',
        originalLanguage: 'en',
        isFeatured: true,
      });

      await http()
        .patch(`/v1/titles/${title.id}`)
        .set(auth())
        .send({ releaseYear: 1700 })
        .expect(400);
      await http()
        .patch(`/v1/titles/${title.id}`)
        .set(auth())
        .send({ originalLanguage: 'english!' })
        .expect(400);
      await http().patch(`/v1/titles/${title.id}`).set(auth()).send({}).expect(400);
    });

    it('filters, searches and orders the list', async () => {
      const drama = await http()
        .post('/v1/categories')
        .set(auth())
        .send({ name: 'Drama' })
        .expect(201);
      const alpha = await createTitle('MOVIE', 'Alpha');
      await createTitle('MOVIE', 'Beta');
      await createTitle('SERIES', 'Gamma Show');
      await http()
        .patch(`/v1/titles/${alpha.id}`)
        .set(auth())
        .send({ categoryIds: [drama.body.id], originalName: 'Erste', releaseYear: 1999 })
        .expect(200);

      const names = async (query: string) =>
        (await http().get(`/v1/titles?${query}`).set(auth()).expect(200)).body.items.map(
          (item: { name: string }) => item.name,
        );

      expect(await names('sort=name&order=asc')).toEqual(['Alpha', 'Beta', 'Gamma Show']);
      expect(await names('type=SERIES')).toEqual(['Gamma Show']);
      expect(await names(`categoryId=${drama.body.id}`)).toEqual(['Alpha']);
      expect(await names('q=erste')).toEqual(['Alpha']);
      expect(await names('q=GAMMA')).toEqual(['Gamma Show']);
      expect(await names('status=PUBLISHED')).toEqual([]);
      // Titles without a year come last, whichever way the list is ordered.
      expect((await names('sort=releaseYear&order=asc'))[0]).toBe('Alpha');
      expect((await names('sort=releaseYear&order=desc'))[0]).toBe('Alpha');

      await http().get('/v1/titles?sort=password').set(auth()).expect(400);
    });

    it('publishes a movie only with a video that is ready', async () => {
      const title = await createTitle('MOVIE', 'The Film');

      const noVideo = await setStatus(title.id, 'PUBLISHED').expect(409);
      expect(noVideo.body.message).toContain('a video is attached');

      const processing = await createAsset('Film master', 'PROCESSING');
      await http()
        .patch(`/v1/titles/${title.id}`)
        .set(auth())
        .send({ assetId: processing })
        .expect(200);
      const notReady = await setStatus(title.id, 'PUBLISHED').expect(409);
      expect(notReady.body.message).toContain('ready to play');

      // A video stored without processing is ready, but has no stream to play.
      await testApp.prisma.asset.update({ where: { id: processing }, data: { status: 'READY' } });
      const noStream = await setStatus(title.id, 'PUBLISHED').expect(409);
      expect(noStream.body.message).toContain('ready to play');

      await testApp.prisma.asset.update({
        where: { id: processing },
        data: { status: 'READY', manifestPath: `assets/${processing}/hls/master.m3u8` },
      });
      const published = await setStatus(title.id, 'PUBLISHED').expect(200);
      expect(published.body).toMatchObject({ status: 'PUBLISHED' });
      expect(published.body.publishedAt).not.toBeNull();
      expect(published.body.asset).toMatchObject({
        id: processing,
        status: 'READY',
        durationMs: 90_000,
      });
      expect(
        published.body.checklist.filter((item: { required: boolean }) => item.required),
      ).toEqual([
        expect.objectContaining({ key: 'video', done: true }),
        expect.objectContaining({ key: 'video-ready', done: true }),
      ]);

      // The first publication date survives unpublishing and publishing again.
      await setStatus(title.id, 'DRAFT').expect(200);
      const again = await setStatus(title.id, 'PUBLISHED').expect(200);
      expect(again.body.publishedAt).toBe(published.body.publishedAt);
    });

    it('keeps a published movie playable', async () => {
      const title = await createTitle('MOVIE', 'The Film');
      const ready = await createAsset('Master');
      const unfinished = await createAsset('New cut', 'PROCESSING');
      await http().patch(`/v1/titles/${title.id}`).set(auth()).send({ assetId: ready }).expect(200);
      await setStatus(title.id, 'PUBLISHED').expect(200);

      await http().patch(`/v1/titles/${title.id}`).set(auth()).send({ assetId: null }).expect(409);
      await http().delete(`/v1/titles/${title.id}`).set(auth()).expect(409);

      // A video that is not ready is refused, and the refusal changes nothing.
      await http()
        .patch(`/v1/titles/${title.id}`)
        .set(auth())
        .send({ assetId: unfinished, tagline: 'Never saved' })
        .expect(409);
      const unchanged = await http().get(`/v1/titles/${title.id}`).set(auth()).expect(200);
      expect(unchanged.body).toMatchObject({ status: 'PUBLISHED', tagline: null });
      expect(unchanged.body.asset.id).toBe(ready);

      await setStatus(title.id, 'ARCHIVED').expect(200);
      await http().delete(`/v1/titles/${title.id}`).set(auth()).expect(204);
      await http().get(`/v1/titles/${title.id}`).set(auth()).expect(404);
      // Deleting a title never deletes its video.
      await http().get(`/v1/assets/${ready}`).set(auth()).expect(200);
    });

    it('rejects videos, pictures and categories that do not exist', async () => {
      const title = await createTitle('MOVIE', 'The Film');
      const missing = '00000000-0000-7000-8000-000000000000';

      for (const body of [
        { assetId: missing },
        { trailerAssetId: missing },
        { posterId: missing },
        { categoryIds: [missing] },
      ]) {
        await http().patch(`/v1/titles/${title.id}`).set(auth()).send(body).expect(400);
      }
    });
  });

  describe('series', () => {
    it('numbers seasons and episodes and refuses duplicates', async () => {
      const series = await createTitle('SERIES', 'The Show');

      await http().post(`/v1/titles/${series.id}/seasons`).set(auth()).send({}).expect(201);
      const two = await http()
        .post(`/v1/titles/${series.id}/seasons`)
        .set(auth())
        .send({ name: 'The Return' })
        .expect(201);
      expect(two.body.seasons.map((season: { number: number }) => season.number)).toEqual([1, 2]);
      await http()
        .post(`/v1/titles/${series.id}/seasons`)
        .set(auth())
        .send({ number: 2 })
        .expect(409);

      const seasonId = two.body.seasons[0].id as string;
      const first = await http()
        .post(`/v1/seasons/${seasonId}/episodes`)
        .set(auth())
        .send({ name: 'Pilot' })
        .expect(201);
      const second = await http()
        .post(`/v1/seasons/${seasonId}/episodes`)
        .set(auth())
        .send({ name: 'The Day After' })
        .expect(201);
      expect([first.body.number, second.body.number]).toEqual([1, 2]);
      await http()
        .post(`/v1/seasons/${seasonId}/episodes`)
        .set(auth())
        .send({ name: 'Again', number: 1 })
        .expect(409);
      await http()
        .patch(`/v1/episodes/${second.body.id}`)
        .set(auth())
        .send({ number: 1 })
        .expect(409);

      const detail = await http().get(`/v1/titles/${series.id}`).set(auth()).expect(200);
      expect(detail.body).toMatchObject({ seasonCount: 2, episodeCount: 2 });
    });

    it('keeps movies and series apart', async () => {
      const movie = await createTitle('MOVIE', 'The Film');
      const series = await createTitle('SERIES', 'The Show');
      const asset = await createAsset('Master');

      await http().post(`/v1/titles/${movie.id}/seasons`).set(auth()).send({}).expect(400);
      await http()
        .patch(`/v1/titles/${series.id}`)
        .set(auth())
        .send({ assetId: asset })
        .expect(400);
    });

    it('publishes a series through its episodes', async () => {
      const series = await createTitle('SERIES', 'The Show');
      const withSeason = await http()
        .post(`/v1/titles/${series.id}/seasons`)
        .set(auth())
        .send({})
        .expect(201);
      const seasonId = withSeason.body.seasons[0].id as string;
      const episode = await http()
        .post(`/v1/seasons/${seasonId}/episodes`)
        .set(auth())
        .send({ name: 'Pilot' })
        .expect(201);
      const publishEpisode = (status: string) =>
        http().patch(`/v1/episodes/${episode.body.id}`).set(auth()).send({ status });

      const blocked = await setStatus(series.id, 'PUBLISHED').expect(409);
      expect(blocked.body.message).toContain('at least one episode is published');

      // An episode needs a video that is ready.
      await publishEpisode('PUBLISHED').expect(409);
      const processing = await createAsset('Pilot master', 'PROCESSING');
      await http()
        .patch(`/v1/episodes/${episode.body.id}`)
        .set(auth())
        .send({ assetId: processing })
        .expect(200);
      await publishEpisode('PUBLISHED').expect(409);
      await testApp.prisma.asset.update({
        where: { id: processing },
        data: { status: 'READY', manifestPath: `assets/${processing}/hls/master.m3u8` },
      });
      const published = await publishEpisode('PUBLISHED').expect(200);
      expect(published.body).toMatchObject({ status: 'PUBLISHED' });

      await setStatus(series.id, 'PUBLISHED').expect(200);

      // Without any published episode there is nothing to watch, so the series goes back to draft.
      await publishEpisode('DRAFT').expect(200);
      const after = await http().get(`/v1/titles/${series.id}`).set(auth()).expect(200);
      expect(after.body.status).toBe('DRAFT');
    });

    it('deletes seasons with their episodes', async () => {
      const series = await createTitle('SERIES', 'The Show');
      const withSeason = await http()
        .post(`/v1/titles/${series.id}/seasons`)
        .set(auth())
        .send({})
        .expect(201);
      const seasonId = withSeason.body.seasons[0].id as string;
      const episode = await http()
        .post(`/v1/seasons/${seasonId}/episodes`)
        .set(auth())
        .send({ name: 'Pilot' })
        .expect(201);

      const afterEpisode = await http()
        .delete(`/v1/episodes/${episode.body.id}`)
        .set(auth())
        .expect(200);
      expect(afterEpisode.body.episodeCount).toBe(0);
      const afterSeason = await http().delete(`/v1/seasons/${seasonId}`).set(auth()).expect(200);
      expect(afterSeason.body.seasons).toEqual([]);
    });
  });

  describe('artwork', () => {
    it('stores a picture, serves it to everyone and uses it as a poster', async () => {
      const data = png(1000, 1500);
      const uploaded = await uploadImage('POSTER', data).expect(201);
      expect(uploaded.body).toMatchObject({
        kind: 'POSTER',
        width: 1000,
        height: 1500,
        bytes: data.length,
      });
      expect(uploaded.body.url).toMatch(/^\/v1\/artwork\/[0-9a-f-]{36}\.png$/);

      // No token: artwork is public.
      const served = await http().get(uploaded.body.url).expect(200);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(served.headers['access-control-allow-origin']).toBeUndefined();
      expect(Buffer.compare(served.body as Buffer, data)).toBe(0);

      const title = await createTitle('MOVIE', 'The Film');
      const withPoster = await http()
        .patch(`/v1/titles/${title.id}`)
        .set(auth())
        .send({ posterId: uploaded.body.id })
        .expect(200);
      expect(withPoster.body.poster.url).toBe(uploaded.body.url);

      const list = await http().get('/v1/titles').set(auth()).expect(200);
      expect(list.body.items[0].poster.url).toBe(uploaded.body.url);

      const pool = await testApp.prisma.storagePool.findFirstOrThrow();
      expect(pool.usedBytes).toBe(BigInt(data.length));
    });

    it('accepts only real pictures of a sane size', async () => {
      await uploadImage('POSTER', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')).expect(
        400,
      );
      await uploadImage('POSTER', Buffer.from('<html><script>alert(1)</script></html>')).expect(
        400,
      );
      await uploadImage('POSTER', Buffer.alloc(0)).expect(400);
      await uploadImage('POSTER', png(20_000, 100)).expect(400);
      await uploadImage('POSTER', png(100, 100, MAX_IMAGE_BYTES)).expect(413);
      await uploadImage('BANNER').expect(400);

      expect(await testApp.prisma.image.count()).toBe(0);
    });

    it('answers unknown and malformed artwork addresses with 404', async () => {
      await http().get('/v1/artwork/00000000-0000-7000-8000-000000000000.png').expect(404);
      await http().get('/v1/artwork/..%2F..%2Fetc%2Fpasswd').expect(404);
      await http().get('/v1/artwork/not-an-id.png').expect(404);
    });

    it('deletes a picture only when nothing uses it', async () => {
      const uploaded = await uploadImage('BACKDROP', png(1920, 1080)).expect(201);
      const title = await createTitle('MOVIE', 'The Film');
      await http()
        .patch(`/v1/titles/${title.id}`)
        .set(auth())
        .send({ backdropId: uploaded.body.id })
        .expect(200);

      await http().delete(`/v1/images/${uploaded.body.id}`).set(auth()).expect(409);
      await http()
        .patch(`/v1/titles/${title.id}`)
        .set(auth())
        .send({ backdropId: null })
        .expect(200);
      await http().delete(`/v1/images/${uploaded.body.id}`).set(auth()).expect(204);

      await http().get(uploaded.body.url).expect(404);
      expect((await testApp.prisma.storagePool.findFirstOrThrow()).usedBytes).toBe(0n);
    });
  });

  describe('permissions', () => {
    it('lets a viewer read the catalog but not change it', async () => {
      const title = await createTitle('MOVIE', 'The Film');
      await http()
        .post('/v1/admins')
        .set(auth())
        .send({
          email: 'viewer@example.com',
          displayName: 'Viewer',
          password: 'viewer-password-1',
          role: 'VIEWER',
        })
        .expect(201);
      const login = await http()
        .post('/v1/auth/login')
        .send({ email: 'viewer@example.com', password: 'viewer-password-1' })
        .expect(200);
      const viewer = testApp.bearer(login.body.token as string);

      await http().get('/v1/titles').set(viewer).expect(200);
      await http().get(`/v1/titles/${title.id}`).set(viewer).expect(200);
      await http().get('/v1/categories').set(viewer).expect(200);

      await http().post('/v1/titles').set(viewer).send({ type: 'MOVIE', name: 'X' }).expect(403);
      await http().patch(`/v1/titles/${title.id}`).set(viewer).send({ name: 'X' }).expect(403);
      await http().delete(`/v1/titles/${title.id}`).set(viewer).expect(403);
      await http().post('/v1/categories').set(viewer).send({ name: 'X' }).expect(403);
      await http().post('/v1/images?kind=POSTER').set(viewer).send(png(10, 10)).expect(403);
    });

    it('needs a sign-in for everything but artwork', async () => {
      await http().get('/v1/titles').expect(401);
      await http().get('/v1/categories').expect(401);
      await http().post('/v1/images?kind=POSTER').send(png(10, 10)).expect(401);
    });

    it('records catalog changes in the audit log', async () => {
      const title = await createTitle('MOVIE', 'The Film');
      const asset = await createAsset('Master');
      await http().patch(`/v1/titles/${title.id}`).set(auth()).send({ assetId: asset }).expect(200);
      await setStatus(title.id, 'PUBLISHED').expect(200);

      const actions = (
        await testApp.prisma.auditLog.findMany({
          where: { entityType: 'Title' },
          orderBy: { createdAt: 'asc' },
        })
      ).map((entry) => entry.action);
      expect(actions).toEqual(['title.create', 'title.update', 'title.publish']);
    });
  });
});
