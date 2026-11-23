// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of "My list": what a viewer saves to watch later, per
// profile, what an admin sees of it, and the figures of what is saved.
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
import { WatchlistModule } from '../src/watchlist/watchlist.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [
  AssetsModule,
  AdminsModule,
  CatalogModule,
  ViewersModule,
  WatchingModule,
  WatchlistModule,
];
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

describe.skipIf(!TEST_DATABASE_URL)('My list (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function register(viewer = ANNA) {
    const response = await http().post('/v1/viewer/register').send(viewer).expect(201);
    return { id: response.body.viewer.id as string, cookie: cookieOf(response) };
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
    const asset = await http().post('/v1/assets').set(admin()).send({ title: name }).expect(201);
    const assetId = asset.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id: assetId },
      data: {
        status: 'READY',
        manifestPath: `assets/${assetId}/hls/master.m3u8`,
        durationMs: 90_000,
      },
    });
    await http().patch(`/v1/titles/${id}`).set(admin()).send({ assetId }).expect(200);
    if (publish) {
      await setStatus(id, 'PUBLISHED');
    }
    return { id, slug: created.body.slug as string };
  }

  const add = (cookie: string, slug: string) =>
    http().put(`/v1/viewer/list/${slug}`).set('Cookie', cookie);
  const remove = (cookie: string, slug: string) =>
    http().delete(`/v1/viewer/list/${slug}`).set('Cookie', cookie);
  const list = async (cookie: string) =>
    (await http().get('/v1/viewer/list').set('Cookie', cookie).expect(200)).body as {
      items: { title: { id: string; slug: string; name: string }; addedAt: string }[];
      room: number;
    };
  const names = async (cookie: string) => (await list(cookie)).items.map((item) => item.title.name);
  const ids = async (cookie: string) =>
    (await http().get('/v1/viewer/list/ids').set('Cookie', cookie).expect(200)).body
      .ids as string[];

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-watchlist-'));
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
    await http().get('/v1/viewer/list').expect(401);
    await http().get('/v1/viewer/list/ids').expect(401);
    await http().get('/v1/viewer/list').set(admin()).expect(401);
    await http().put('/v1/viewer/list/anything').expect(401);
    await http().delete('/v1/viewer/list/anything').expect(401);
    await http().delete('/v1/viewer/list').expect(401);
  });

  it('keeps what a viewer adds, the last added first, and is never cached', async () => {
    const anna = await register();
    const first = await createMovie('Glass Tide');
    const second = await createMovie('Night Train');

    expect((await list(anna.cookie)).items).toEqual([]);
    const added = await add(anna.cookie, first.slug).expect(200);
    expect(added.body).toEqual({ id: first.id, saved: true });
    expect(added.headers['cache-control']).toBe('no-store');
    await add(anna.cookie, second.slug).expect(200);

    const answer = await http().get('/v1/viewer/list').set('Cookie', anna.cookie).expect(200);
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(await names(anna.cookie)).toEqual(['Night Train', 'Glass Tide']);
    expect(await ids(anna.cookie)).toEqual([second.id, first.id]);
    // A card, as everywhere else in the public catalog.
    expect(answer.body.items[0].title).toMatchObject({ slug: second.slug, type: 'MOVIE' });
    expect(answer.body.room).toBe(498);
  });

  it('changes nothing when a title is added twice or removed twice', async () => {
    const anna = await register();
    const movie = await createMovie('Glass Tide');

    await add(anna.cookie, movie.slug).expect(200);
    const before = (await list(anna.cookie)).items[0]?.addedAt;
    await add(anna.cookie, movie.slug).expect(200);
    const after = await list(anna.cookie);
    expect(after.items).toHaveLength(1);
    expect(after.items[0]?.addedAt).toBe(before);

    expect((await remove(anna.cookie, movie.slug).expect(200)).body).toEqual({
      id: movie.id,
      saved: false,
    });
    await remove(anna.cookie, movie.slug).expect(200);
    expect(await names(anna.cookie)).toEqual([]);
  });

  it('takes only titles viewers can see', async () => {
    const anna = await register();
    const draft = await createMovie('Unfinished', false);

    await add(anna.cookie, draft.slug).expect(404);
    await add(anna.cookie, 'no-such-title').expect(404);
    await remove(anna.cookie, 'no-such-title').expect(404);
    expect(await names(anna.cookie)).toEqual([]);
  });

  it('hides a title that was unpublished, and brings it back with it', async () => {
    const anna = await register();
    const movie = await createMovie('Glass Tide');
    const other = await createMovie('Night Train');
    await add(anna.cookie, movie.slug).expect(200);
    await add(anna.cookie, other.slug).expect(200);

    await setStatus(movie.id, 'DRAFT');
    expect(await names(anna.cookie)).toEqual(['Night Train']);
    expect(await ids(anna.cookie)).toEqual([other.id]);

    await setStatus(movie.id, 'PUBLISHED');
    expect(await names(anna.cookie)).toEqual(['Night Train', 'Glass Tide']);
  });

  it('drops a title from every list when it is deleted', async () => {
    const anna = await register();
    const movie = await createMovie('Glass Tide');
    await add(anna.cookie, movie.slug).expect(200);

    await testApp.prisma.title.delete({ where: { id: movie.id } });
    expect(await names(anna.cookie)).toEqual([]);
    expect(await testApp.prisma.watchlistItem.count()).toBe(0);
  });

  it('keeps a list per profile, and none is seen by another account', async () => {
    const anna = await register();
    const ben = await register(BEN);
    const movie = await createMovie('Glass Tide');
    const other = await createMovie('Night Train');
    await add(anna.cookie, movie.slug).expect(200);

    expect(await names(ben.cookie)).toEqual([]);

    const kid = await http()
      .post('/v1/viewer/profiles')
      .set('Cookie', anna.cookie)
      .send({ name: 'Kid' })
      .expect(201);
    await http()
      .post(`/v1/viewer/profiles/${kid.body.id}/select`)
      .set('Cookie', anna.cookie)
      .expect(200);
    expect(await names(anna.cookie)).toEqual([]);
    await add(anna.cookie, other.slug).expect(200);
    expect(await names(anna.cookie)).toEqual(['Night Train']);

    // Deleting the profile takes its list along, and leaves the other one.
    const profiles = (
      await http().get('/v1/viewer/profiles').set('Cookie', anna.cookie).expect(200)
    ).body as { profiles?: { id: string; isMain: boolean }[] } | { id: string; isMain: boolean }[];
    const all = Array.isArray(profiles) ? profiles : (profiles.profiles ?? []);
    const main = all.find((profile) => profile.isMain);
    await http()
      .post(`/v1/viewer/profiles/${main?.id}/select`)
      .set('Cookie', anna.cookie)
      .expect(200);
    await http()
      .delete(`/v1/viewer/profiles/${kid.body.id}`)
      .set('Cookie', anna.cookie)
      .expect((response) => expect(response.status).toBeLessThan(300));
    expect(await names(anna.cookie)).toEqual(['Glass Tide']);
    expect(await testApp.prisma.watchlistItem.count()).toBe(1);
  });

  it('empties the list on request', async () => {
    const anna = await register();
    await add(anna.cookie, (await createMovie('Glass Tide')).slug).expect(200);
    await add(anna.cookie, (await createMovie('Night Train')).slug).expect(200);

    const cleared = await http().delete('/v1/viewer/list').set('Cookie', anna.cookie).expect(200);
    expect(cleared.body).toEqual({ removed: 2 });
    expect((await list(anna.cookie)).room).toBe(500);
  });

  it('holds 500 titles and says so when it is full', async () => {
    const anna = await register();
    const movie = await createMovie('Glass Tide');
    const extra = await createMovie('Night Train');
    const profile = await testApp.prisma.viewerProfile.findFirstOrThrow({
      where: { viewerId: anna.id },
    });
    // Filling a list through the API would take 500 titles: the rows are made directly.
    const filler = await testApp.prisma.title.createManyAndReturn({
      data: Array.from({ length: 499 }, (_, index) => ({
        type: 'MOVIE' as const,
        name: `Filler ${index}`,
        slug: `filler-${index}`,
      })),
      select: { id: true },
    });
    await testApp.prisma.watchlistItem.createMany({
      data: filler.map((title) => ({
        viewerId: anna.id,
        profileId: profile.id,
        titleId: title.id,
      })),
    });

    await add(anna.cookie, movie.slug).expect(200);
    expect((await list(anna.cookie)).room).toBe(0);
    const full = await add(anna.cookie, extra.slug).expect(409);
    expect(full.body.message).toContain('500');
    // What is on the list already can still be confirmed.
    await add(anna.cookie, movie.slug).expect(200);
  });

  it('shows an admin what a viewer saved, with what they began since', async () => {
    const anna = await register();
    const movie = await createMovie('Glass Tide');
    const other = await createMovie('Night Train');
    await add(anna.cookie, movie.slug).expect(200);
    await add(anna.cookie, other.slug).expect(200);
    await http()
      .put('/v1/viewer/watching')
      .set('Cookie', anna.cookie)
      .send({ items: [{ title: movie.slug, position: 30, duration: 90 }] })
      .expect(200);
    await setStatus(other.id, 'DRAFT');

    const view = (await http().get(`/v1/viewers/${anna.id}/list`).set(admin()).expect(200)).body;
    expect(view.total).toBe(2);
    expect(
      view.items.map((item: { title: { name: string; status: string }; started: boolean }) => [
        item.title.name,
        item.title.status,
        item.started,
      ]),
    ).toEqual([
      ['Night Train', 'DRAFT', false],
      ['Glass Tide', 'PUBLISHED', true],
    ]);
    expect(view.items[0].profile.name).toBe('Anna');

    await http().get(`/v1/viewers/${anna.id}/list`).expect(401);
    await http()
      .get('/v1/viewers/00000000-0000-7000-8000-000000000000/list')
      .set(admin())
      .expect(404);
  });

  it('counts what stands on lists, and how much of it was begun', async () => {
    const anna = await register();
    const ben = await register(BEN);
    const wanted = await createMovie('Glass Tide');
    const other = await createMovie('Night Train');
    await createMovie('Nobody Saved This');
    await add(anna.cookie, wanted.slug).expect(200);
    await add(ben.cookie, wanted.slug).expect(200);
    await add(ben.cookie, other.slug).expect(200);
    await http()
      .put('/v1/viewer/watching')
      .set('Cookie', ben.cookie)
      .send({ items: [{ title: wanted.slug, position: 30, duration: 90 }] })
      .expect(200);
    // One of the saves is from long ago.
    await testApp.prisma.watchlistItem.updateMany({
      where: { viewerId: anna.id },
      data: { createdAt: new Date(Date.now() - 90 * 86_400_000) },
    });

    const figures = (await http().get('/v1/analytics/saved?days=30').set(admin()).expect(200)).body;
    expect(figures).toMatchObject({ days: 30, saves: 3, recent: 2, lists: 2, titles: 2 });
    expect(
      figures.top.map(
        (row: { title: { name: string }; saves: number; recent: number; started: number }) => [
          row.title.name,
          row.saves,
          row.recent,
          row.started,
        ],
      ),
    ).toEqual([
      ['Glass Tide', 2, 1, 1],
      ['Night Train', 1, 1, 0],
    ]);

    await http().get('/v1/analytics/saved').expect(401);
    await http().get('/v1/analytics/saved?days=0').set(admin()).expect(400);
  });
});
