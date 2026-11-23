// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of collections, of the extra videos of a title, and of the
// dates between which a title is shown: in the panel's API and in what
// viewers get.
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
const HOUR = 3_600_000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe.skipIf(!TEST_DATABASE_URL)('Collections, extras and availability (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let workDirectory: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const get = (url: string) => http().get(url).set(auth());
  const post = (url: string, body: object) => http().post(url).set(auth()).send(body);
  const put = (url: string, body: object) => http().put(url).set(auth()).send(body);
  const patch = (url: string, body: object) => http().patch(url).set(auth()).send(body);

  async function asset(name: string, ready = true): Promise<string> {
    const response = await post('/v1/assets', { title: name }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: ready
        ? {
            status: 'READY',
            manifestPath: `assets/${id}/hls/master.m3u8`,
            readyAt: new Date(),
            durationMs: 90_000,
          }
        : { status: 'PROCESSING' },
    });
    return id;
  }
  const draft = async (name: string) =>
    (await post('/v1/titles', { type: 'MOVIE', name }).expect(201)).body as {
      id: string;
      slug: string;
    };
  /** A movie viewers can see. */
  async function movie(name: string): Promise<{ id: string; slug: string }> {
    const title = await draft(name);
    await patch(`/v1/titles/${title.id}`, { assetId: await asset(name) }).expect(200);
    await put(`/v1/titles/${title.id}/status`, { status: 'PUBLISHED' }).expect(200);
    return title;
  }
  const publicNames = async () =>
    (
      (await http().get('/v1/catalog/titles?sort=name').expect(200)).body.items as {
        name: string;
      }[]
    ).map((item) => item.name);

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-collections-'));
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

  describe('collections', () => {
    it('are made with their titles in order, and changed', async () => {
      const [one, two, three] = [await draft('One'), await draft('Two'), await draft('Three')];

      const created = await post('/v1/collections', {
        name: 'The Numbers',
        titleIds: [two.id, one.id],
      }).expect(201);
      expect(created.body).toMatchObject({
        slug: 'the-numbers',
        visible: true,
        position: 0,
        titleCount: 2,
        metadataSource: null,
      });
      expect(created.body.titles.map((title: { name: string }) => title.name)).toEqual([
        'Two',
        'One',
      ]);
      const id = created.body.id as string;

      const changed = await patch(`/v1/collections/${id}`, {
        name: 'Numbers',
        synopsis: 'Counting films.',
        visible: false,
      }).expect(200);
      expect(changed.body).toMatchObject({
        name: 'Numbers',
        slug: 'the-numbers',
        synopsis: 'Counting films.',
        visible: false,
      });

      const ordered = await put(`/v1/collections/${id}/titles`, {
        titleIds: [one.id, three.id, two.id],
      }).expect(200);
      expect(ordered.body.titles.map((title: { name: string }) => title.name)).toEqual([
        'One',
        'Three',
        'Two',
      ]);

      const list = await get('/v1/collections').expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ name: 'Numbers', titleCount: 3 });
      expect(list.body[0]).not.toHaveProperty('titles');
    });

    it('are checked', async () => {
      const one = await draft('One');
      await post('/v1/collections', { name: ' ' }).expect(400);
      await post('/v1/collections', {
        name: 'Ghosts',
        titleIds: ['01900000-0000-7000-8000-000000000000'],
      }).expect(400);
      const first = await post('/v1/collections', { name: 'Twins' }).expect(201);
      const second = await post('/v1/collections', { name: 'Twins' }).expect(201);
      expect(second.body.slug).toBe('twins-2');
      await patch(`/v1/collections/${second.body.id}`, { slug: 'twins' }).expect(409);
      await put(`/v1/collections/${first.body.id}/titles`, { titleIds: [one.id, one.id] }).expect(
        400,
      );
      await patch(`/v1/collections/${first.body.id}`, {
        posterId: '01900000-0000-7000-8000-000000000000',
      }).expect(400);
      await get('/v1/collections/01900000-0000-7000-8000-000000000000').expect(404);
    });

    it('have an order of their own', async () => {
      const ids: string[] = [];
      for (const name of ['A', 'B', 'C']) {
        ids.push((await post('/v1/collections', { name }).expect(201)).body.id);
      }
      const [a, b, c] = ids as [string, string, string];
      const reordered = await put('/v1/collections/order', { ids: [c, a, b] }).expect(200);
      expect(reordered.body.map((item: { name: string }) => item.name)).toEqual(['C', 'A', 'B']);
      await put('/v1/collections/order', { ids: [c, a] }).expect(400);
      await put('/v1/collections/order', { ids: [c, a, a] }).expect(400);
    });

    it('are chosen from a title, which keeps its place where it stays', async () => {
      const [one, two] = [await draft('One'), await draft('Two')];
      const first = (await post('/v1/collections', { name: 'First', titleIds: [one.id, two.id] }))
        .body.id as string;
      const second = (await post('/v1/collections', { name: 'Second', titleIds: [two.id] })).body
        .id as string;

      const joined = await patch(`/v1/titles/${one.id}`, {
        collectionIds: [first, second],
      }).expect(200);
      expect(joined.body.collections.map((item: { name: string }) => item.name)).toEqual([
        'First',
        'Second',
      ]);
      const names = async (id: string) =>
        ((await get(`/v1/collections/${id}`).expect(200)).body.titles as { name: string }[]).map(
          (title) => title.name,
        );
      // Still first in the one it was in, last in the one it joined.
      expect(await names(first)).toEqual(['One', 'Two']);
      expect(await names(second)).toEqual(['Two', 'One']);

      await patch(`/v1/titles/${one.id}`, { collectionIds: [] }).expect(200);
      expect(await names(first)).toEqual(['Two']);
      await patch(`/v1/titles/${one.id}`, {
        collectionIds: ['01900000-0000-7000-8000-000000000000'],
      }).expect(400);

      const listed = await get(`/v1/titles?collectionId=${second}`).expect(200);
      expect(listed.body.items.map((item: { name: string }) => item.name)).toEqual(['Two']);
    });

    it('leave their titles behind when they are deleted', async () => {
      const one = await draft('One');
      const id = (await post('/v1/collections', { name: 'Gone', titleIds: [one.id] })).body
        .id as string;
      await http().delete(`/v1/collections/${id}`).set(auth()).expect(204);
      await get(`/v1/collections/${id}`).expect(404);
      const title = await get(`/v1/titles/${one.id}`).expect(200);
      expect(title.body.collections).toEqual([]);
    });

    it('show viewers what is visible, in the order of the collection', async () => {
      const [one, two] = [await movie('One'), await movie('Two')];
      const hiddenTitle = await draft('Draft');
      const shown = (
        await post('/v1/collections', {
          name: 'Shown',
          synopsis: 'Two films.',
          titleIds: [two.id, hiddenTitle.id, one.id],
        })
      ).body as { id: string; slug: string };
      await post('/v1/collections', { name: 'Hidden', visible: false, titleIds: [one.id] });
      await post('/v1/collections', { name: 'Only drafts', titleIds: [hiddenTitle.id] });

      const list = await http().get('/v1/catalog/collections').expect(200);
      expect(list.body).toEqual([
        {
          slug: 'shown',
          name: 'Shown',
          synopsis: 'Two films.',
          poster: null,
          backdrop: null,
          titleCount: 2,
        },
      ]);

      const detail = await http().get(`/v1/catalog/collections/${shown.slug}`).expect(200);
      expect(detail.body.titles.map((title: { name: string }) => title.name)).toEqual([
        'Two',
        'One',
      ]);
      await http().get('/v1/catalog/collections/hidden').expect(404);

      const title = await http().get(`/v1/catalog/titles/${one.slug}`).expect(200);
      expect(title.body.collections).toEqual([{ slug: 'shown', name: 'Shown' }]);
    });
  });

  describe('extras', () => {
    it('are added, renamed, ordered and taken out', async () => {
      const title = await draft('Feature');
      const [teaser, clip] = [await asset('Teaser'), await asset('Clip')];

      await post(`/v1/titles/${title.id}/extras`, { name: 'Teaser', assetId: teaser }).expect(201);
      const added = await post(`/v1/titles/${title.id}/extras`, {
        kind: 'BEHIND_THE_SCENES',
        name: 'On set',
        assetId: clip,
      }).expect(201);
      expect(added.body).toMatchObject([
        { kind: 'TRAILER', name: 'Teaser', position: 0, asset: { id: teaser, playable: true } },
        { kind: 'BEHIND_THE_SCENES', name: 'On set', position: 1, asset: { id: clip } },
      ]);
      const [first, second] = added.body as [{ id: string }, { id: string }];

      const renamed = await patch(`/v1/extras/${first.id}`, { kind: 'TEASER' }).expect(200);
      expect(renamed.body[0]).toMatchObject({ kind: 'TEASER', name: 'Teaser' });

      const ordered = await put(`/v1/titles/${title.id}/extras/order`, {
        ids: [second.id, first.id],
      }).expect(200);
      expect(ordered.body.map((extra: { name: string }) => extra.name)).toEqual([
        'On set',
        'Teaser',
      ]);
      const detail = await get(`/v1/titles/${title.id}`).expect(200);
      expect(detail.body.extras.map((extra: { name: string }) => extra.name)).toEqual([
        'On set',
        'Teaser',
      ]);

      await http().delete(`/v1/extras/${first.id}`).set(auth()).expect(204);
      const left = await get(`/v1/titles/${title.id}`).expect(200);
      expect(left.body.extras).toHaveLength(1);
      // The video itself stays in the library.
      await get(`/v1/assets/${teaser}`).expect(200);
    });

    it('are checked', async () => {
      const title = await draft('Feature');
      const video = await asset('Teaser');
      const url = `/v1/titles/${title.id}/extras`;
      await post(url, { name: '', assetId: video }).expect(400);
      await post(url, { name: 'X', kind: 'SONG', assetId: video }).expect(400);
      await post(url, { name: 'X', assetId: '01900000-0000-7000-8000-000000000000' }).expect(400);
      await post('/v1/titles/01900000-0000-7000-8000-000000000000/extras', {
        name: 'X',
        assetId: video,
      }).expect(404);
      const added = await post(url, { name: 'Teaser', assetId: video }).expect(201);
      await post(url, { name: 'Again', assetId: video }).expect(409);
      await put(`${url}/order`, { ids: [] }).expect(400);
      await patch(`/v1/extras/${added.body[0].id}`, {}).expect(400);
      await patch('/v1/extras/01900000-0000-7000-8000-000000000000', { name: 'Y' }).expect(404);
    });

    it('reach viewers only when they play, and play without paying', async () => {
      const title = await movie('Feature');
      await patch(`/v1/titles/${title.id}`, { access: 'PAID' }).expect(200);
      const [ready, working] = [await asset('Making of'), await asset('Raw', false)];
      const url = `/v1/titles/${title.id}/extras`;
      await post(url, { kind: 'FEATURETTE', name: 'Making of', assetId: ready }).expect(201);
      const extras = (await post(url, { kind: 'CLIP', name: 'Raw', assetId: working }).expect(201))
        .body as { id: string }[];

      const shown = await http().get(`/v1/catalog/titles/${title.slug}`).expect(200);
      expect(shown.body.extras).toEqual([
        { id: extras[0]?.id, kind: 'FEATURETTE', name: 'Making of', durationMs: 90_000 },
      ]);

      const play = (id: string | undefined, slug = title.slug) =>
        http().post(`/v1/catalog/titles/${slug}/extras/${id}/playback`);
      const playback = await play(extras[0]?.id).expect(200);
      expect(playback.body.manifestUrl).toContain(ready);
      await play(extras[1]?.id).expect(404);
      // An extra belongs to its title.
      const other = await movie('Other');
      await play(extras[0]?.id, other.slug).expect(404);
      // And goes with it when the title is taken from viewers.
      await put(`/v1/titles/${title.id}/status`, { status: 'DRAFT' }).expect(200);
      await play(extras[0]?.id).expect(404);
    });
  });

  describe('availability', () => {
    it('shows a published title only between its dates', async () => {
      const [always, soon, over, running] = [
        await movie('Always'),
        await movie('Soon'),
        await movie('Over'),
        await movie('Running'),
      ];
      await patch(`/v1/titles/${soon.id}`, { availableFrom: inHours(2) }).expect(200);
      await patch(`/v1/titles/${over.id}`, {
        availableFrom: inHours(-48),
        availableUntil: inHours(-1),
      }).expect(200);
      const set = await patch(`/v1/titles/${running.id}`, {
        availableFrom: inHours(-1),
        availableUntil: inHours(24),
      }).expect(200);
      expect(set.body.availableUntil).toEqual(expect.any(String));

      expect(await publicNames()).toEqual(['Always', 'Running']);
      await http().get(`/v1/catalog/titles/${soon.slug}`).expect(404);
      await http().post(`/v1/catalog/titles/${over.slug}/playback`).expect(404);
      await http().post(`/v1/catalog/titles/${always.slug}/playback`).expect(200);

      const list = async (query: string) =>
        (
          (await get(`/v1/titles?sort=name&order=asc&${query}`).expect(200)).body.items as {
            name: string;
          }[]
        ).map((item) => item.name);
      expect(await list('availability=scheduled')).toEqual(['Soon']);
      expect(await list('availability=ended')).toEqual(['Over']);
      expect(await list('availability=current')).toEqual(['Always', 'Running']);

      // Taking the dates away shows the title again.
      await patch(`/v1/titles/${soon.id}`, { availableFrom: null }).expect(200);
      expect(await publicNames()).toEqual(['Always', 'Running', 'Soon']);
    });

    it('wants the end after the start, also when one of them is sent alone', async () => {
      const title = await draft('Window');
      const url = `/v1/titles/${title.id}`;
      await patch(url, { availableFrom: inHours(5), availableUntil: inHours(1) }).expect(400);
      await patch(url, { availableFrom: 'tomorrow' }).expect(400);
      await patch(url, { availableFrom: inHours(5) }).expect(200);
      await patch(url, { availableUntil: inHours(1) }).expect(400);
      await patch(url, { availableUntil: inHours(6) }).expect(200);
      await patch(url, { availableFrom: inHours(7) }).expect(400);
    });

    it('holds the episodes of a series back with the series', async () => {
      const series = (await post('/v1/titles', { type: 'SERIES', name: 'Show' }).expect(201))
        .body as { id: string; slug: string };
      const season = await post(`/v1/titles/${series.id}/seasons`, {}).expect(201);
      const seasonId = (season.body.seasons as { id: string }[])[0]?.id;
      const withEpisode = await post(`/v1/seasons/${seasonId}/episodes`, {
        name: 'Pilot',
        assetId: await asset('Pilot'),
      }).expect(201);
      const episodeId = withEpisode.body.id as string;
      await patch(`/v1/episodes/${episodeId}`, { status: 'PUBLISHED' }).expect(200);
      await put(`/v1/titles/${series.id}/status`, { status: 'PUBLISHED' }).expect(200);

      await http().post(`/v1/catalog/episodes/${episodeId}/playback`).expect(200);
      await patch(`/v1/titles/${series.id}`, { availableFrom: inHours(3) }).expect(200);
      await http().post(`/v1/catalog/episodes/${episodeId}/playback`).expect(404);
      expect(await publicNames()).toEqual([]);
    });
  });

  it('lets those who only read see, and nobody else change', async () => {
    await post('/v1/admins', READER).expect(201);
    const reader = testApp.bearer(await testApp.login(READER.email, READER.password));
    const title = await draft('One');
    const id = (await post('/v1/collections', { name: 'Kept' }).expect(201)).body.id as string;

    await http().get('/v1/collections').set(reader).expect(200);
    await http().get(`/v1/collections/${id}`).set(reader).expect(200);
    await http().post('/v1/collections').set(reader).send({ name: 'Mine' }).expect(403);
    await http().patch(`/v1/collections/${id}`).set(reader).send({ name: 'Mine' }).expect(403);
    await http().put(`/v1/collections/${id}/titles`).set(reader).send({ titleIds: [] }).expect(403);
    await http().delete(`/v1/collections/${id}`).set(reader).expect(403);
    await http()
      .post(`/v1/titles/${title.id}/extras`)
      .set(reader)
      .send({ name: 'X', assetId: id })
      .expect(403);
    await http().get('/v1/collections').expect(401);
  });
});
