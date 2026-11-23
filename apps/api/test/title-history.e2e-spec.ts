// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the history of a title: what is recorded after each
// kind of change, how it reads, and bringing an earlier version back.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { BulkModule } from '../src/bulk/bulk.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { MAX_REVISIONS, TitleHistoryService } from '../src/history/title-history.service.js';
import { createTestApp, OWNER, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

interface Change {
  group: string;
  field: string;
  label: string;
  kind: string;
  before?: string | null;
  after?: string | null;
  added?: string[];
  removed?: string[];
}
interface Revision {
  id: string;
  action: string;
  admin: { displayName: string } | null;
  changes: Change[];
  changeCount: number;
  first: boolean;
}

describe.skipIf(!TEST_DATABASE_URL)('Title history (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let workDirectory: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const get = (url: string) => http().get(url).set(auth());
  const post = (url: string, body: object = {}) => http().post(url).set(auth()).send(body);
  const put = (url: string, body: object) => http().put(url).set(auth()).send(body);
  const patch = (url: string, body: object) => http().patch(url).set(auth()).send(body);
  const created = async (url: string, body: object) =>
    (await post(url, body).expect(201)).body as { id: string; slug: string };

  async function asset(name: string): Promise<string> {
    const response = await post('/v1/assets', { title: name }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: { status: 'READY', manifestPath: `assets/${id}/hls/master.m3u8`, readyAt: new Date() },
    });
    return id;
  }
  const history = async (titleId: string, query = '') =>
    (await get(`/v1/titles/${titleId}/history${query}`).expect(200)).body as {
      items: Revision[];
      total: number;
    };
  /** The newest revision. */
  const latest = async (titleId: string) => (await history(titleId)).items[0] as Revision;

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-history-'));
    testApp = await createTestApp([AssetsModule, AdminsModule, CatalogModule, BulkModule], {
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

  describe('recording', () => {
    it('starts with the title and adds a revision for every change that changes something', async () => {
      const film = await created('/v1/titles', { type: 'MOVIE', name: 'Harbour Lights' });
      const start = await history(film.id);
      expect(start.items).toMatchObject([
        {
          action: 'create',
          first: true,
          changes: [],
          admin: { displayName: OWNER.displayName },
        },
      ]);

      await patch(`/v1/titles/${film.id}`, {
        synopsis: 'A port town in winter.',
        releaseYear: 2024,
        rentAmount: 399,
      }).expect(200);
      const edited = await latest(film.id);
      expect(edited).toMatchObject({ action: 'update', first: false, changeCount: 3 });
      expect(edited.changes).toEqual([
        {
          group: 'texts',
          field: 'synopsis',
          label: 'Synopsis',
          kind: 'text',
          before: null,
          after: 'A port town in winter.',
        },
        {
          group: 'facts',
          field: 'releaseYear',
          label: 'Year',
          kind: 'value',
          before: null,
          after: '2024',
        },
        {
          group: 'access',
          field: 'rentAmount',
          label: 'Rental price',
          kind: 'value',
          format: 'money',
          before: null,
          after: '399',
        },
      ]);

      // Saving the same again writes nothing.
      await patch(`/v1/titles/${film.id}`, { releaseYear: 2024 }).expect(200);
      expect((await history(film.id)).total).toBe(2);
    });

    it('follows genres, people, videos, translations and publishing', async () => {
      const drama = await created('/v1/genres', { name: 'Drama' });
      const mira = await created('/v1/people', { name: 'Mira Castell' });
      const film = await created('/v1/titles', { type: 'MOVIE', name: 'Harbour Lights' });
      const video = await asset('Film');
      const teaser = await asset('Teaser file');

      await patch(`/v1/titles/${film.id}`, { genreIds: [drama.id], assetId: video }).expect(200);
      expect((await latest(film.id)).changes).toMatchObject([
        { field: 'genres', added: ['Drama'], removed: [] },
        { field: 'video', before: null, after: 'Film' },
      ]);

      await put(`/v1/titles/${film.id}/credits`, {
        credits: [{ personId: mira.id, kind: 'CAST', role: 'Greta Holm' }],
      }).expect(200);
      expect(await latest(film.id)).toMatchObject({
        action: 'credits',
        changes: [{ group: 'people', field: 'cast', added: ['Mira Castell (Greta Holm)'] }],
      });

      await post(`/v1/titles/${film.id}/extras`, { name: 'Teaser', assetId: teaser }).expect(201);
      expect(await latest(film.id)).toMatchObject({
        action: 'extras',
        changes: [{ field: 'extras', added: ['Teaser'] }],
      });

      await put(`/v1/titles/${film.id}/translations/de`, { name: 'Hafenlichter' }).expect(200);
      expect(await latest(film.id)).toMatchObject({
        action: 'translation',
        changes: [{ field: 'languages', added: ['de'] }],
      });
      await put(`/v1/titles/${film.id}/translations/de`, {
        name: 'Hafenlichter',
        synopsis: 'Eine Hafenstadt.',
      }).expect(200);
      expect((await latest(film.id)).changes).toMatchObject([
        { field: 'translation:de:synopsis', before: null, after: 'Eine Hafenstadt.' },
      ]);

      await put(`/v1/titles/${film.id}/status`, { status: 'PUBLISHED' }).expect(200);
      expect(await latest(film.id)).toMatchObject({
        action: 'publish',
        changes: [{ group: 'publishing', field: 'status', before: 'DRAFT', after: 'PUBLISHED' }],
      });

      const publishing = await history(film.id, '?group=publishing');
      expect(publishing.items.map((revision) => revision.action)).toEqual(['publish']);
      expect((await history(film.id, '?group=people')).total).toBe(1);
      await get(`/v1/titles/${film.id}/history?group=nonsense`).expect(400);
    });

    it('follows seasons and episodes of a series', async () => {
      const show = await created('/v1/titles', { type: 'SERIES', name: 'Tide Tables' });
      const detail = await post(`/v1/titles/${show.id}/seasons`, { number: 1 }).expect(201);
      const seasonId = detail.body.seasons[0].id as string;
      expect(await latest(show.id)).toMatchObject({
        action: 'season',
        changes: [{ field: 'seasons', added: ['Season 1'] }],
      });

      const episode = await post(`/v1/seasons/${seasonId}/episodes`, {
        number: 1,
        name: 'Low water',
      }).expect(201);
      expect(await latest(show.id)).toMatchObject({
        action: 'episode',
        changes: [{ field: 'season:1:episodes', added: ['1. Low water'] }],
      });

      await patch(`/v1/episodes/${episode.body.id}`, {
        name: 'Low tide',
        assetId: await asset('E1'),
        status: 'PUBLISHED',
      }).expect(200);
      expect((await latest(show.id)).changes).toMatchObject([
        { field: 'season:1:episode:1:name', before: 'Low water', after: 'Low tide' },
        { field: 'season:1:episode:1:status', before: 'DRAFT', after: 'PUBLISHED' },
        { field: 'season:1:episode:1:video', before: null, after: 'A video' },
      ]);

      await http().delete(`/v1/episodes/${episode.body.id}`).set(auth()).expect(200);
      expect((await latest(show.id)).changes).toMatchObject([
        { field: 'season:1:episodes', removed: ['1. Low tide'] },
      ]);
    });

    it('records a copy as its own beginning, and many titles changed at once', async () => {
      const one = await created('/v1/titles', { type: 'MOVIE', name: 'Alpha' });
      const two = await created('/v1/titles', { type: 'MOVIE', name: 'Beta' });
      const copy = (await post(`/v1/titles/${one.id}/duplicate`).expect(201)).body.title;
      expect((await history(copy.id)).items).toMatchObject([{ action: 'duplicate', first: true }]);

      await post('/v1/titles/bulk', {
        ids: [one.id, two.id],
        action: { type: 'feature', value: true },
      }).expect(200);
      for (const id of [one.id, two.id]) {
        expect(await latest(id)).toMatchObject({
          action: 'bulk',
          changes: [{ field: 'isFeatured', format: 'yesno', before: 'false', after: 'true' }],
        });
      }
    });

    it('picks up a change that came another way with the next revision', async () => {
      const film = await created('/v1/titles', { type: 'MOVIE', name: 'Alpha' });
      await testApp.prisma.title.update({ where: { id: film.id }, data: { tagline: 'By hand' } });
      await patch(`/v1/titles/${film.id}`, { releaseYear: 2020 }).expect(200);
      expect((await latest(film.id)).changes.map((change) => change.field)).toEqual([
        'tagline',
        'releaseYear',
      ]);
    });

    it('gives titles from before history was kept a first revision', async () => {
      const old = await testApp.prisma.title.create({
        data: { type: 'MOVIE', name: 'From before', slug: 'from-before', synopsis: 'Old text.' },
      });
      const service = testApp.app.get(TitleHistoryService);
      expect(await service.backfill()).toBe(1);
      expect(await service.backfill()).toBe(0);
      expect((await history(old.id)).items).toMatchObject([
        { action: 'baseline', first: true, admin: null, changes: [] },
      ]);

      // The first change now has something to be compared with.
      await patch(`/v1/titles/${old.id}`, { synopsis: 'New text.' }).expect(200);
      expect((await latest(old.id)).changes).toMatchObject([
        { field: 'synopsis', before: 'Old text.', after: 'New text.' },
      ]);
    });

    it('keeps the newest hundred and goes with the title', async () => {
      const film = await created('/v1/titles', { type: 'MOVIE', name: 'Alpha' });
      const snapshot = (await testApp.prisma.titleRevision.findFirstOrThrow()).snapshot as object;
      await testApp.prisma.titleRevision.createMany({
        data: Array.from({ length: MAX_REVISIONS + 5 }, (_, index) => ({
          titleId: film.id,
          action: 'update',
          changes: [],
          snapshot,
          createdAt: new Date(Date.now() - (index + 1) * 60_000),
        })),
      });
      await patch(`/v1/titles/${film.id}`, { releaseYear: 2020 }).expect(200);
      expect(await testApp.prisma.titleRevision.count({ where: { titleId: film.id } })).toBe(
        MAX_REVISIONS,
      );
      expect((await latest(film.id)).action).toBe('update');

      await http().delete(`/v1/titles/${film.id}`).set(auth()).expect(204);
      expect(await testApp.prisma.titleRevision.count()).toBe(0);
    });
  });

  describe('bringing a version back', () => {
    async function story() {
      const drama = await created('/v1/genres', { name: 'Drama' });
      const crime = await created('/v1/genres', { name: 'Crime' });
      const mira = await created('/v1/people', { name: 'Mira Castell' });
      const leni = await created('/v1/people', { name: 'Leni Hartwig' });
      const film = await created('/v1/titles', { type: 'MOVIE', name: 'Harbour Lights' });
      await patch(`/v1/titles/${film.id}`, {
        synopsis: 'A port town in winter.',
        keywords: ['harbour'],
        genreIds: [drama.id],
        assetId: await asset('Film'),
      }).expect(200);
      await put(`/v1/titles/${film.id}/credits`, {
        credits: [{ personId: mira.id, kind: 'CAST', role: 'Greta Holm' }],
      }).expect(200);
      await put(`/v1/titles/${film.id}/translations/de`, { name: 'Hafenlichter' }).expect(200);
      const good = (await latest(film.id)).id;

      // Then things went wrong.
      await patch(`/v1/titles/${film.id}`, {
        name: 'Harbor Lites',
        synopsis: 'tbd',
        keywords: [],
        genreIds: [crime.id],
        rentAmount: 999,
      }).expect(200);
      await put(`/v1/titles/${film.id}/credits`, {
        credits: [{ personId: leni.id, kind: 'CREW', role: 'Director' }],
      }).expect(200);
      await put(`/v1/titles/${film.id}/translations/fr`, { name: 'Lumières' }).expect(200);
      await http().delete(`/v1/titles/${film.id}/translations/de`).set(auth()).expect(204);
      await put(`/v1/titles/${film.id}/status`, { status: 'PUBLISHED' }).expect(200);
      return { film, good, drama, mira };
    }

    it('says what would change, changes it, and leaves publishing and videos alone', async () => {
      const { film, good } = await story();

      const preview = await get(`/v1/titles/${film.id}/history/${good}`).expect(200);
      expect(preview.body.restore.map((change: Change) => change.field)).toEqual([
        'name',
        'synopsis',
        'rentAmount',
        'genres',
        'keywords',
        'cast',
        'crew',
        'languages',
      ]);
      expect(preview.body.restore[0]).toMatchObject({
        before: 'Harbor Lites',
        after: 'Harbour Lights',
      });

      const result = await post(`/v1/titles/${film.id}/history/${good}/restore`).expect(201);
      expect(result.body).toEqual({ restored: 8, left: [] });
      const entry = await testApp.prisma.auditLog.findFirst({ where: { action: 'title.restore' } });
      expect(entry?.metadata).toMatchObject({ revision: good, restored: 8, left: 0 });

      const title = (await get(`/v1/titles/${film.id}`).expect(200)).body;
      expect(title).toMatchObject({
        name: 'Harbour Lights',
        synopsis: 'A port town in winter.',
        keywords: ['harbour'],
        rentAmount: null,
        translations: ['de'],
        // Not brought back: it stays published, at its address, with its video.
        status: 'PUBLISHED',
        slug: 'harbour-lights',
      });
      expect(title.asset).not.toBeNull();
      expect(title.genres.map((genre: { name: string }) => genre.name)).toEqual(['Drama']);
      expect(title.credits).toMatchObject([{ kind: 'CAST', role: 'Greta Holm' }]);

      expect(await latest(film.id)).toMatchObject({ action: 'restore', changeCount: 8 });
      const after = await get(`/v1/titles/${film.id}/history/${good}`).expect(200);
      expect(after.body.restore).toEqual([]);
      // Asking again changes nothing and writes nothing.
      const again = await post(`/v1/titles/${film.id}/history/${good}/restore`).expect(201);
      expect(again.body).toEqual({ restored: 0, left: [] });
    });

    it('leaves out what no longer exists, and says so', async () => {
      const { film, good, drama, mira } = await story();
      await http().delete(`/v1/genres/${drama.id}`).set(auth()).expect(204);
      await testApp.prisma.person.delete({ where: { id: mira.id } });

      const result = await post(`/v1/titles/${film.id}/history/${good}/restore`).expect(201);
      expect(result.body.restored).toBe(6);
      expect(result.body.left).toMatchObject([
        { field: 'genres', added: ['Drama'] },
        { field: 'cast', added: ['Mira Castell (Greta Holm)'] },
      ]);
      const title = (await get(`/v1/titles/${film.id}`).expect(200)).body;
      expect(title).toMatchObject({ name: 'Harbour Lights', genres: [], credits: [] });
    });

    it('needs the permission to change the catalog, and a version of this title', async () => {
      const { film, good } = await story();
      const other = await created('/v1/titles', { type: 'MOVIE', name: 'Other' });
      await post('/v1/admins', {
        email: 'viewer@example.com',
        displayName: 'Vera Viewer',
        password: 'another-long-password',
        role: 'VIEWER',
      }).expect(201);
      const viewer = testApp.bearer(
        await testApp.login('viewer@example.com', 'another-long-password'),
      );

      await http().get(`/v1/titles/${film.id}/history`).set(viewer).expect(200);
      await http()
        .post(`/v1/titles/${film.id}/history/${good}/restore`)
        .set(viewer)
        .send({})
        .expect(403);
      await post(`/v1/titles/${other.id}/history/${good}/restore`).expect(404);
      await get(`/v1/titles/${other.id}/history/${good}`).expect(404);
      await get('/v1/titles/01900000-0000-7000-8000-000000000000/history').expect(404);
    });
  });
});
