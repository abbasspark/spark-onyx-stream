// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of similar titles: what is found by comparing titles,
// what watching adds, what an editor pins and hides, what viewers get of it,
// and the rows made for a profile.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { CoWatchService } from '../src/similar/co-watch.service.js';
import { SimilarModule } from '../src/similar/similar.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [AssetsModule, AdminsModule, CatalogModule, ViewersModule, SimilarModule];
const PASSWORD = 'correct-horse';

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

interface Movie {
  id: string;
  slug: string;
}

interface AdminItem {
  title: { id: string; name: string; status: string };
  pinned: boolean;
  score: number | null;
  signals: { signal: string; points: number; count: number; names: string[] }[];
  rank: number | null;
  unseen: string | null;
}

describe.skipIf(!TEST_DATABASE_URL)('Similar titles (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function register(name: string) {
    const response = await http()
      .post('/v1/viewer/register')
      .send({ email: `${name.toLowerCase()}@example.com`, displayName: name, password: PASSWORD })
      .expect(201);
    const id = response.body.viewer.id as string;
    const profile = await testApp.prisma.viewerProfile.findFirstOrThrow({
      where: { viewerId: id },
    });
    return { id, profileId: profile.id, cookie: cookieOf(response) };
  }

  const setStatus = (titleId: string, status: 'PUBLISHED' | 'DRAFT') =>
    http().put(`/v1/titles/${titleId}/status`).set(admin()).send({ status }).expect(200);

  async function createMovie(
    name: string,
    details: Record<string, unknown> = {},
    publish = true,
  ): Promise<Movie> {
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
        durationMs: 5_400_000,
      },
    });
    await http()
      .patch(`/v1/titles/${id}`)
      .set(admin())
      .send({ assetId, ...details })
      .expect(200);
    if (publish) {
      await setStatus(id, 'PUBLISHED');
    }
    return { id, slug: created.body.slug as string };
  }

  async function genre(name: string): Promise<string> {
    const created = await http().post('/v1/genres').set(admin()).send({ name }).expect(201);
    return created.body.id as string;
  }

  /** Puts a person among the first of the cast or crew of titles. */
  async function credit(name: string, kind: 'CAST' | 'CREW', titles: Movie[]): Promise<void> {
    const person = await testApp.prisma.person.create({
      data: { name, slug: name.toLowerCase().replaceAll(' ', '-') },
    });
    await testApp.prisma.credit.createMany({
      data: titles.map((title) => ({ titleId: title.id, personId: person.id, kind, position: 0 })),
    });
  }

  /** Says a profile watched movies to the end, the first named first. */
  async function watched(viewer: { id: string; profileId: string }, titles: Movie[]) {
    const now = Date.now();
    await testApp.prisma.watchProgress.createMany({
      data: titles.map((title, index) => ({
        viewerId: viewer.id,
        profileId: viewer.profileId,
        titleId: title.id,
        itemId: title.id,
        positionSeconds: 0,
        durationSeconds: 5400,
        completedAt: new Date(now - (titles.length - index) * 60_000),
        watchedAt: new Date(now - (titles.length - index) * 60_000),
      })),
    });
  }

  const similar = async (slug: string, query = '') =>
    (
      (await http().get(`/v1/catalog/titles/${slug}/similar${query}`).expect(200)).body as {
        items: { id: string; name: string }[];
      }
    ).items.map((item) => item.name);

  const panel = async (id: string) =>
    (await http().get(`/v1/titles/${id}/similar`).set(admin()).expect(200)).body as {
      items: AdminItem[];
      hidden: AdminItem[];
      shownByDefault: number;
      weights: Record<string, number>;
      watching: { pairs: number; minimumAccounts: number } | null;
    };

  const choose = (id: string, pinned: string[], hidden: string[]) =>
    http().put(`/v1/titles/${id}/similar`).set(admin()).send({ pinned, hidden });

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-similar-'));
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

  it('finds titles by what they share, most alike first, and says why in the panel', async () => {
    const [crime, drama, comedy] = await Promise.all([
      genre('Crime'),
      genre('Drama'),
      genre('Comedy'),
    ]);
    const source = await createMovie('Harbour Lights', {
      genreIds: [crime, drama],
      keywords: ['harbour', 'smuggling', 'night'],
      releaseYear: 2015,
    });
    const twin = await createMovie('Harbour Nights', {
      genreIds: [crime, drama],
      keywords: ['harbour', 'smuggling'],
      releaseYear: 2016,
    });
    await createMovie('Cold Quay', { genreIds: [crime, drama] });
    const colleague = await createMovie('Paper Moon Cafe', { genreIds: [comedy] });
    await createMovie('Laugh Track', { genreIds: [comedy] });
    await createMovie('Draft Harbour', { genreIds: [crime, drama] }, false);
    await credit('Ines Vale', 'CREW', [source, colleague]);
    await credit('Tom Reed', 'CAST', [source, twin]);

    // The comedy shares only its director. One shared person of the crew is 4 of 100: too little.
    expect(await similar(source.slug)).toEqual(['Harbour Nights', 'Cold Quay']);
    // Nothing is alike a title that shares nothing.
    const lonely = await createMovie('Alone');
    expect(await similar(lonely.slug)).toEqual([]);
    await http().get('/v1/catalog/titles/nothing-here/similar').expect(404);

    const answer = await http().get(`/v1/catalog/titles/${source.slug}/similar`).expect(200);
    expect(answer.headers['cache-control']).toBe('public, max-age=30');
    expect(answer.body.items[0]).toMatchObject({ slug: twin.slug, type: 'MOVIE' });
    expect(await similar(source.slug, '?limit=1')).toEqual(['Harbour Nights']);
    await http().get(`/v1/catalog/titles/${source.slug}/similar?limit=31`).expect(400);

    const view = await panel(source.id);
    expect(view.shownByDefault).toBe(12);
    expect(view.weights.genres).toBe(22);
    expect(view.watching).toBeNull();
    expect(view.items.map((item) => [item.title.name, item.rank])).toEqual([
      ['Harbour Nights', 1],
      ['Cold Quay', 2],
    ]);
    const [first] = view.items;
    expect(first?.signals.slice(0, 3)).toEqual([
      { signal: 'genres', points: 22, count: 2, names: ['Crime', 'Drama'] },
      { signal: 'keywords', points: 6, count: 2, names: ['harbour', 'smuggling'] },
      { signal: 'cast', points: 3.3, count: 1, names: ['Tom Reed'] },
    ]);
    // Genres, keywords and an actor, and on top: both are movies, a year apart.
    expect(first?.score).toBe(35.2);
  });

  it('lets an editor pin titles to the front and take titles out', async () => {
    const drama = await genre('Drama');
    const source = await createMovie('North Wind', { genreIds: [drama] });
    const alike = await createMovie('South Wind', { genreIds: [drama] });
    const other = await createMovie('East Wind', { genreIds: [drama] });
    // Between equals, the better rated one leads.
    await testApp.prisma.title.update({ where: { id: other.id }, data: { rating: 9 } });
    const unrelated = await createMovie('Cooking With Fire');
    const draft = await createMovie('West Wind', {}, false);

    expect(await similar(source.slug)).toEqual(['East Wind', 'South Wind']);

    await http()
      .put(`/v1/titles/${source.id}/similar`)
      .send({ pinned: [], hidden: [] })
      .expect(401);
    await choose(source.id, [source.id], []).expect(400);
    await choose(source.id, [alike.id], [alike.id]).expect(400);
    await choose(source.id, [alike.id, alike.id], []).expect(400);
    await choose(source.id, ['01900000-0000-7000-8000-000000000000'], []).expect(400);

    const saved = await choose(source.id, [unrelated.id, draft.id, alike.id], [other.id]).expect(
      200,
    );
    const items = saved.body.items as AdminItem[];
    expect(
      items.map((item) => [item.title.name, item.pinned, item.rank, item.unseen, item.score]),
    ).toEqual([
      ['Cooking With Fire', true, 1, null, null],
      ['West Wind', true, null, 'draft', null],
      ['South Wind', true, 2, null, 24],
    ]);
    expect((saved.body.hidden as AdminItem[]).map((item) => item.title.name)).toEqual([
      'East Wind',
    ]);
    // Viewers get the pinned titles in the editor's order, without the draft and the hidden one.
    expect(await similar(source.slug)).toEqual(['Cooking With Fire', 'South Wind']);
    // It holds in one direction only.
    expect(await similar(alike.slug)).toEqual(['East Wind', 'North Wind']);

    // A pinned draft appears once it is published.
    await setStatus(draft.id, 'PUBLISHED');
    expect(await similar(source.slug)).toEqual(['Cooking With Fire', 'West Wind', 'South Wind']);

    const log = await testApp.prisma.auditLog.findFirstOrThrow({
      where: { action: 'title.similar.update' },
    });
    expect(log.metadata).toMatchObject({ pinned: 3, hidden: 1, before: { pinned: 0, hidden: 0 } });

    // Deleting a title takes it out of every choice.
    await testApp.prisma.title.delete({ where: { id: unrelated.id } });
    expect(await similar(source.slug)).toEqual(['West Wind', 'South Wind']);
    await choose(source.id, [], []).expect(200);
    expect(await similar(source.slug)).toEqual(['East Wind', 'South Wind']);
  });

  it('counts what the same people watch, from three accounts on', async () => {
    const source = await createMovie('Deep Field');
    const partner = await createMovie('Far Signal');
    const rare = await createMovie('Odd One');
    const anna = await register('Anna');
    const ben = await register('Ben');
    const cleo = await register('Cleo');

    await watched(anna, [source, partner, rare]);
    await watched(ben, [source, partner, rare]);
    const coWatch = testApp.app.get(CoWatchService);

    // Two accounts are not an audience: nothing can be read out of them.
    let state = await coWatch.rebuild();
    expect(state.pairs).toBe(0);
    expect(await similar(source.slug)).toEqual([]);

    await watched(cleo, [source, partner]);
    // Somebody who only looked in for a minute does not count.
    const dora = await register('Dora');
    await testApp.prisma.watchProgress.create({
      data: {
        viewerId: dora.id,
        profileId: dora.profileId,
        titleId: rare.id,
        itemId: rare.id,
        positionSeconds: 60,
        durationSeconds: 5400,
        watchedAt: new Date(),
      },
    });

    const rebuilt = await http().post('/v1/similar/watching/rebuild').set(admin()).expect(200);
    expect(rebuilt.body.minimumAccounts).toBe(3);
    expect(rebuilt.body.state).toMatchObject({ pairs: 1, titles: 2, profiles: 4 });
    state = (await http().get('/v1/similar/watching').set(admin()).expect(200)).body.state;
    expect(state.pairs).toBe(1);

    expect(await similar(source.slug)).toEqual(['Far Signal']);
    const view = await panel(source.id);
    expect(view.watching).toMatchObject({ pairs: 1, minimumAccounts: 3 });
    // All three who watched one watched the other: the overlap is complete.
    expect(view.items[0]?.signals[0]).toEqual({
      signal: 'watched',
      points: 20,
      count: 3,
      names: [],
    });

    // The scheduler leaves a fresh count alone and repeats an old one.
    expect(await coWatch.rebuildIfDue()).toBeNull();
    const later = new Date(Date.now() + 7 * 60 * 60 * 1000);
    expect((await coWatch.rebuildIfDue(later))?.pairs).toBe(1);
  });

  it('makes rows for a profile from what it watched, without what it started', async () => {
    const [crime, comedy] = await Promise.all([genre('Crime'), genre('Comedy')]);
    const crimes: Movie[] = [];
    for (const name of ['Alibi', 'Bail', 'Cell', 'Docket', 'Evidence', 'Felony']) {
      crimes.push(await createMovie(name, { genreIds: [crime] }));
    }
    const comedies: Movie[] = [];
    for (const name of ['Giggle', 'Howl', 'Irony', 'Jest', 'Knock Knock']) {
      comedies.push(await createMovie(name, { genreIds: [comedy] }));
    }
    const [alibi, bail] = crimes as [Movie, Movie];
    const [giggle] = comedies as [Movie];
    const anna = await register('Anna');

    await http().get('/v1/viewer/recommendations').expect(401);
    const rows = async () => {
      const answer = await http()
        .get('/v1/viewer/recommendations')
        .set('Cookie', anna.cookie)
        .expect(200);
      expect(answer.headers['cache-control']).toBe('no-store');
      return (answer.body.rows as { because: { name: string }; titles: { name: string }[] }[]).map(
        (row) => [row.because.name, row.titles.map((title) => title.name).sort()],
      );
    };
    expect(await rows()).toEqual([]);

    // Watched last comes first. What was watched is in no row.
    await watched(anna, [alibi, bail, giggle]);
    expect(await rows()).toEqual([
      ['Giggle', ['Howl', 'Irony', 'Jest', 'Knock Knock']],
      // Bail is the newer of the two crime films, and its row takes them all.
      ['Bail', ['Cell', 'Docket', 'Evidence', 'Felony']],
    ]);

    // The home page says where the rows go.
    const home = await http().get('/v1/catalog/home').expect(200);
    const kinds = (home.body.rows as { kind: string; name: string }[]).map((row) => row.kind);
    expect(kinds).toContain('recommended');
    expect(
      (home.body.rows as { kind: string; name: string }[]).find((row) => row.kind === 'recommended')
        ?.name,
    ).toBe('Because you watched');
  });

  it('gives a profile with an age limit only what suits it', async () => {
    const family = await genre('Family');
    const source = await createMovie('Little Boat', { genreIds: [family], minAge: 6 });
    await createMovie('Little Train', { genreIds: [family], minAge: 6 });
    await createMovie('Big Storm', { genreIds: [family], minAge: 16 });
    await createMovie('No Rating', { genreIds: [family] });

    // Next to a film for children, the film from 16 falls away by itself.
    expect((await similar(source.slug)).sort()).toEqual(['Little Train', 'No Rating']);

    const anna = await register('Anna');
    await testApp.prisma.viewerProfile.update({
      where: { id: anna.profileId },
      data: { maxAge: 12, isKids: true },
    });
    await http()
      .post(`/v1/viewer/profiles/${anna.profileId}/select`)
      .set('Cookie', anna.cookie)
      .send({})
      .expect(200);
    const answer = await http()
      .get(`/v1/catalog/titles/${source.slug}/similar`)
      .set('Cookie', anna.cookie)
      .expect(200);
    expect((answer.body.items as { name: string }[]).map((item) => item.name)).toEqual([
      'Little Train',
    ]);
    expect(answer.headers['cache-control']).toBe('private, no-store');
  });
});
