// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of watch history: positions a player reports, the
// "Continue watching" row built from them, and what an admin sees.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { WatchingModule } from '../src/watching/watching.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [AssetsModule, AdminsModule, CatalogModule, ViewersModule, WatchingModule];
const ANNA = { email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' };
const BEN = { email: 'ben@example.com', displayName: 'Ben', password: 'battery-staple' };

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Watch history (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function register(viewer = ANNA) {
    const response = await http().post('/v1/viewer/register').send(viewer).expect(201);
    return {
      id: response.body.viewer.id as string,
      token: response.body.token as string,
      cookie: cookieOf(response),
    };
  }

  async function createAsset(title: string): Promise<string> {
    const response = await http().post('/v1/assets').set(admin()).send({ title }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: { status: 'READY', manifestPath: `assets/${id}/hls/master.m3u8`, durationMs: 90_000 },
    });
    return id;
  }

  const setStatus = (titleId: string, status: 'PUBLISHED' | 'DRAFT') =>
    http().put(`/v1/titles/${titleId}/status`).set(admin()).send({ status }).expect(200);

  async function createMovie(name: string, publish = true) {
    const created = await http()
      .post('/v1/titles')
      .set(admin())
      .send({ type: 'MOVIE', name })
      .expect(201);
    const id = created.body.id as string;
    const assetId = await createAsset(`${name} master`);
    await http().patch(`/v1/titles/${id}`).set(admin()).send({ assetId }).expect(200);
    if (publish) {
      await setStatus(id, 'PUBLISHED');
    }
    return { id, slug: created.body.slug as string };
  }

  /** A published series with one season: two published episodes and a draft. */
  async function createSeries(name: string) {
    const created = await http()
      .post('/v1/titles')
      .set(admin())
      .send({ type: 'SERIES', name })
      .expect(201);
    const id = created.body.id as string;
    const season = await http().post(`/v1/titles/${id}/seasons`).set(admin()).send({}).expect(201);
    const seasonId = season.body.seasons[0].id as string;

    const episode = async (episodeName: string, publish: boolean) => {
      const assetId = await createAsset(`${name} ${episodeName}`);
      const response = await http()
        .post(`/v1/seasons/${seasonId}/episodes`)
        .set(admin())
        .send({ name: episodeName, assetId })
        .expect(201);
      if (publish) {
        await http()
          .patch(`/v1/episodes/${response.body.id}`)
          .set(admin())
          .send({ status: 'PUBLISHED' })
          .expect(200);
      }
      return response.body.id as string;
    };
    const pilot = await episode('Pilot', true);
    const second = await episode('The Trench', true);
    const draft = await episode('Unfinished', false);
    await setStatus(id, 'PUBLISHED');
    return { id, slug: created.body.slug as string, pilot, second, draft };
  }

  const report = (cookie: string, items: Record<string, unknown>[]) =>
    http().put('/v1/viewer/watching').set('Cookie', cookie).send({ items });

  const watching = async (cookie: string) =>
    (await http().get('/v1/viewer/watching').set('Cookie', cookie).expect(200)).body.items as {
      id: string;
      title: { slug: string; name: string; type: string };
      episode: { id: string; seasonNumber: number; number: number; name: string } | null;
      position: number;
      duration: number;
      watchedAt: string;
    }[];

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-watching-'));
    testApp = await createTestApp(MODULES, {
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

  it('is only for signed-in viewers, and admin credentials do not open it', async () => {
    await http().get('/v1/viewer/watching').expect(401);
    await http().get('/v1/viewer/watching').set(admin()).expect(401);
    await http()
      .put('/v1/viewer/watching')
      .send({ items: [{ title: 'x', position: 30, duration: 90 }] })
      .expect(401);
    await http().delete('/v1/viewer/watching').expect(401);
  });

  it('refuses a cookie-authenticated write that comes from another website', async () => {
    const movie = await createMovie('Night Train');
    const { cookie } = await register();
    const items = [{ title: movie.slug, position: 30, duration: 90 }];

    await http()
      .put('/v1/viewer/watching')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({ items })
      .expect(403);
    await http()
      .delete('/v1/viewer/watching')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(await watching(cookie)).toEqual([]);
  });

  it('remembers where a movie stopped and shows it in the row', async () => {
    const movie = await createMovie('Night Train');
    const { cookie } = await register();
    expect(await watching(cookie)).toEqual([]);

    const saved = await report(cookie, [
      { title: movie.slug, position: 42.7, duration: 90.2 },
    ]).expect(200);
    expect(saved.body).toEqual({ saved: 1 });
    expect(saved.headers['cache-control']).toBe('no-store');

    const items = await watching(cookie);
    expect(items).toEqual([
      {
        id: movie.id,
        title: { slug: movie.slug, name: 'Night Train', type: 'MOVIE' },
        episode: null,
        image: null,
        position: 42,
        duration: 90,
        watchedAt: expect.any(String),
      },
    ]);

    // The same video again moves the position. There is still one entry.
    await report(cookie, [{ title: movie.slug, position: 60, duration: 90 }]).expect(200);
    const again = await watching(cookie);
    expect(again).toHaveLength(1);
    expect(again[0]?.position).toBe(60);
  });

  it('keeps each viewer’s history apart', async () => {
    const movie = await createMovie('Night Train');
    const anna = await register();
    const ben = await register(BEN);
    await report(anna.cookie, [{ title: movie.slug, position: 40, duration: 90 }]).expect(200);

    expect(await watching(ben.cookie)).toEqual([]);
    await http().delete(`/v1/viewer/watching/${movie.id}`).set('Cookie', ben.cookie).expect(404);
    expect(await watching(anna.cookie)).toHaveLength(1);
  });

  it('accepts the token of an app in place of the cookie', async () => {
    const movie = await createMovie('Night Train');
    const { token } = await register();
    await http()
      .put('/v1/viewer/watching')
      .set(testApp.bearer(token))
      .send({ items: [{ title: movie.slug, position: 40, duration: 90 }] })
      .expect(200);
    const list = await http().get('/v1/viewer/watching').set(testApp.bearer(token)).expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it('orders the row by what was watched last, with the episode named', async () => {
    const movie = await createMovie('Night Train');
    const series = await createSeries('Deep Water');
    const { cookie } = await register();

    await report(cookie, [
      {
        title: movie.slug,
        position: 30,
        duration: 90,
        watchedAt: '2026-11-01T10:00:00Z',
      },
      {
        title: series.slug,
        episodeId: series.second,
        position: 50,
        duration: 90,
        watchedAt: '2026-11-02T10:00:00Z',
      },
    ]).expect(200);

    const items = await watching(cookie);
    expect(items.map((item) => item.id)).toEqual([series.second, movie.id]);
    expect(items[0]).toMatchObject({
      title: { slug: series.slug, name: 'Deep Water', type: 'SERIES' },
      episode: { id: series.second, seasonNumber: 1, number: 2, name: 'The Trench' },
      watchedAt: '2026-11-02T10:00:00.000Z',
    });
  });

  it('lets the later report win, whichever arrives first', async () => {
    const movie = await createMovie('Night Train');
    const { cookie } = await register();

    await report(cookie, [
      { title: movie.slug, position: 70, duration: 90, watchedAt: '2026-11-10T10:00:00Z' },
    ]).expect(200);
    // A device that was offline hands over an older position afterwards.
    await report(cookie, [
      { title: movie.slug, position: 20, duration: 90, watchedAt: '2026-11-05T10:00:00Z' },
    ]).expect(200);
    expect((await watching(cookie))[0]?.position).toBe(70);

    // A clock that runs ahead does not lock the entry against later reports.
    await report(cookie, [
      { title: movie.slug, position: 30, duration: 90, watchedAt: '2099-01-01T00:00:00Z' },
    ]).expect(200);
    await report(cookie, [{ title: movie.slug, position: 55, duration: 90 }]).expect(200);
    const [entry] = await watching(cookie);
    expect(entry?.position).toBe(55);
    expect(new Date(entry?.watchedAt ?? 0).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('takes a finished video out of the row and remembers that it was watched', async () => {
    const series = await createSeries('Deep Water');
    const { cookie } = await register();
    const state = async () =>
      (
        await http()
          .get(`/v1/viewer/watching/titles/${series.slug}`)
          .set('Cookie', cookie)
          .expect(200)
      ).body.items as { id: string; position: number; completed: boolean }[];

    await report(cookie, [
      { title: series.slug, episodeId: series.pilot, position: 88, duration: 90 },
      { title: series.slug, episodeId: series.second, position: 30, duration: 90 },
    ]).expect(200);

    expect((await watching(cookie)).map((item) => item.id)).toEqual([series.second]);
    expect(await state()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: series.pilot, position: 0, completed: true }),
        expect.objectContaining({ id: series.second, position: 30, completed: false }),
      ]),
    );

    // Watching it again brings it back into the row. It stays watched.
    await report(cookie, [
      { title: series.slug, episodeId: series.pilot, position: 40, duration: 90 },
    ]).expect(200);
    expect((await watching(cookie)).map((item) => item.id)).toEqual([series.pilot, series.second]);
    expect(await state()).toContainEqual(
      expect.objectContaining({ id: series.pilot, position: 40, completed: true }),
    );

    // Back at the start: nothing to resume, still watched.
    await report(cookie, [
      { title: series.slug, episodeId: series.pilot, position: 2, duration: 90 },
    ]).expect(200);
    expect(await state()).toContainEqual(
      expect.objectContaining({ id: series.pilot, position: 0, completed: true }),
    );
  });

  it('forgets a video that was begun and is back at its start', async () => {
    const movie = await createMovie('Night Train');
    const { id, cookie } = await register();
    await report(cookie, [{ title: movie.slug, position: 40, duration: 90 }]).expect(200);
    await report(cookie, [{ title: movie.slug, position: 3, duration: 90 }]).expect(200);

    expect(await watching(cookie)).toEqual([]);
    expect(await testApp.prisma.watchProgress.count({ where: { viewerId: id } })).toBe(0);

    // The first seconds of a video never create an entry.
    await report(cookie, [{ title: movie.slug, position: 5, duration: 90 }]).expect(200);
    expect(await testApp.prisma.watchProgress.count({ where: { viewerId: id } })).toBe(0);
  });

  it('leaves out what viewers cannot watch, without an error', async () => {
    const movie = await createMovie('Night Train');
    const draftMovie = await createMovie('Not Yet', false);
    const series = await createSeries('Deep Water');
    const other = await createSeries('Other Show');
    const { id, cookie } = await register();

    const saved = await report(cookie, [
      { title: movie.slug, position: 40, duration: 90 },
      { title: draftMovie.slug, position: 40, duration: 90 },
      { title: 'no-such-title', position: 40, duration: 90 },
      // A draft episode, an episode of another series, a series without an
      // episode, and a movie with one.
      { title: series.slug, episodeId: series.draft, position: 40, duration: 90 },
      { title: series.slug, episodeId: other.pilot, position: 40, duration: 90 },
      { title: series.slug, position: 40, duration: 90 },
      { title: movie.slug, episodeId: series.pilot, position: 50, duration: 90 },
    ]).expect(200);

    expect(saved.body).toEqual({ saved: 1 });
    expect(await testApp.prisma.watchProgress.count({ where: { viewerId: id } })).toBe(1);
    expect((await watching(cookie))[0]?.position).toBe(40);
  });

  it('hides an entry while its title is unpublished, and brings it back', async () => {
    const movie = await createMovie('Night Train');
    const { cookie } = await register();
    await report(cookie, [{ title: movie.slug, position: 40, duration: 90 }]).expect(200);

    await setStatus(movie.id, 'DRAFT');
    expect(await watching(cookie)).toEqual([]);
    await http().get(`/v1/viewer/watching/titles/${movie.slug}`).set('Cookie', cookie).expect(404);

    await setStatus(movie.id, 'PUBLISHED');
    expect(await watching(cookie)).toHaveLength(1);
  });

  it('checks what a player sends', async () => {
    const { cookie } = await register();
    const bad = async (body: unknown) => {
      await http()
        .put('/v1/viewer/watching')
        .set('Cookie', cookie)
        .send(body as object)
        .expect(400);
    };

    await bad({});
    await bad({ items: [] });
    await bad({ items: [{ title: 'a', position: -1, duration: 90 }] });
    await bad({ items: [{ title: 'a', position: 10, duration: 0 }] });
    await bad({ items: [{ title: 'a', episodeId: 'not-an-id', position: 10, duration: 90 }] });
    await bad({ items: [{ title: 'a', position: 10, duration: 90, watchedAt: 'yesterday' }] });
    await bad({
      items: Array.from({ length: 51 }, () => ({ title: 'a', position: 10, duration: 90 })),
    });
  });

  it('forgets one video, or everything, when the viewer asks', async () => {
    const movie = await createMovie('Night Train');
    const series = await createSeries('Deep Water');
    const { id, cookie } = await register();
    await report(cookie, [
      { title: movie.slug, position: 40, duration: 90 },
      { title: series.slug, episodeId: series.pilot, position: 40, duration: 90 },
      { title: series.slug, episodeId: series.second, position: 89, duration: 90 },
    ]).expect(200);

    await http().delete(`/v1/viewer/watching/${movie.id}`).set('Cookie', cookie).expect(204);
    await http().delete(`/v1/viewer/watching/${movie.id}`).set('Cookie', cookie).expect(404);
    await http().delete('/v1/viewer/watching/not-an-id').set('Cookie', cookie).expect(400);
    expect((await watching(cookie)).map((item) => item.id)).toEqual([series.pilot]);

    const cleared = await http().delete('/v1/viewer/watching').set('Cookie', cookie).expect(200);
    expect(cleared.body).toEqual({ removed: 2 });
    expect(await testApp.prisma.watchProgress.count({ where: { viewerId: id } })).toBe(0);
  });

  it('goes away with the account, the title or the episode', async () => {
    const movie = await createMovie('Night Train');
    const series = await createSeries('Deep Water');
    const anna = await register();
    const ben = await register(BEN);
    const items = [
      { title: movie.slug, position: 40, duration: 90 },
      { title: series.slug, episodeId: series.pilot, position: 40, duration: 90 },
    ];
    await report(anna.cookie, items).expect(200);
    await report(ben.cookie, items).expect(200);
    const count = () => testApp.prisma.watchProgress.count();
    expect(await count()).toBe(4);

    await http()
      .post('/v1/viewer/delete')
      .set('Cookie', ben.cookie)
      .send({ password: BEN.password })
      .expect(204);
    expect(await count()).toBe(2);

    await http().delete(`/v1/episodes/${series.pilot}`).set(admin()).expect(200);
    expect(await count()).toBe(1);

    await setStatus(movie.id, 'DRAFT');
    await http().delete(`/v1/titles/${movie.id}`).set(admin()).expect(204);
    expect(await count()).toBe(0);
  });

  describe('for admins', () => {
    it('shows what a viewer watched, including what is no longer published', async () => {
      const movie = await createMovie('Night Train');
      const series = await createSeries('Deep Water');
      const { id, cookie } = await register();
      await report(cookie, [
        { title: movie.slug, position: 40, duration: 90, watchedAt: '2026-11-01T10:00:00Z' },
        {
          title: series.slug,
          episodeId: series.pilot,
          position: 89,
          duration: 90,
          watchedAt: '2026-11-02T10:00:00Z',
        },
      ]).expect(200);
      await setStatus(movie.id, 'DRAFT');

      const response = await http().get(`/v1/viewers/${id}/watching`).set(admin()).expect(200);
      expect(response.body).toEqual({
        total: 2,
        completed: 1,
        items: [
          {
            id: series.pilot,
            title: { id: series.id, name: 'Deep Water', type: 'SERIES' },
            episode: { id: series.pilot, seasonNumber: 1, number: 1, name: 'Pilot' },
            position: 0,
            duration: 90,
            completedAt: '2026-11-02T10:00:00.000Z',
            watchedAt: '2026-11-02T10:00:00.000Z',
          },
          {
            id: movie.id,
            title: { id: movie.id, name: 'Night Train', type: 'MOVIE' },
            episode: null,
            position: 40,
            duration: 90,
            completedAt: null,
            watchedAt: '2026-11-01T10:00:00.000Z',
          },
        ],
      });
    });

    it('needs the permission to see viewers', async () => {
      const { id, cookie, token } = await register();
      await http().get(`/v1/viewers/${id}/watching`).expect(401);
      await http().get(`/v1/viewers/${id}/watching`).set('Cookie', cookie).expect(401);
      await http().get(`/v1/viewers/${id}/watching`).set(testApp.bearer(token)).expect(401);
      await http()
        .get('/v1/viewers/00000000-0000-7000-8000-000000000000/watching')
        .set(admin())
        .expect(404);
    });
  });
});
