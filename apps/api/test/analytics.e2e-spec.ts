// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the viewing statistics: how plays are recorded, and the
// figures the panel gets from them.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AnalyticsModule } from '../src/analytics/analytics.module.js';
import { PlaysService } from '../src/analytics/plays.service.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [AssetsModule, AdminsModule, CatalogModule, AnalyticsModule];
const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1';

describe.skipIf(!TEST_DATABASE_URL)('Viewing statistics (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let workDirectory: string;
  let env: Record<string, string>;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const get = (url: string) => http().get(url).set(auth());
  const post = (url: string, body: object = {}) => http().post(url).set(auth()).send(body);
  const patch = (url: string, body: object) => http().patch(url).set(auth()).send(body);
  const put = (url: string, body: object) => http().put(url).set(auth()).send(body);

  /** A video of ten minutes that plays. */
  async function asset(name: string, durationMs = 600_000): Promise<string> {
    const response = await post('/v1/assets', { title: name }).expect(201);
    const id = response.body.asset.id as string;
    await testApp.prisma.asset.update({
      where: { id },
      data: {
        status: 'READY',
        manifestPath: `assets/${id}/hls/master.m3u8`,
        readyAt: new Date(),
        durationMs,
      },
    });
    return id;
  }
  async function movie(name: string, fields: Record<string, unknown> = {}) {
    const title = (await post('/v1/titles', { type: 'MOVIE', name }).expect(201)).body;
    await patch(`/v1/titles/${title.id}`, { assetId: await asset(name), ...fields }).expect(200);
    await put(`/v1/titles/${title.id}/status`, { status: 'PUBLISHED' }).expect(200);
    return { id: title.id as string, slug: title.slug as string };
  }
  async function series(name: string) {
    const title = (await post('/v1/titles', { type: 'SERIES', name }).expect(201)).body;
    const season = await post(`/v1/titles/${title.id}/seasons`).expect(201);
    const episodes: string[] = [];
    for (const episodeName of ['One', 'Two']) {
      const episode = await post(`/v1/seasons/${season.body.seasons[0].id}/episodes`, {
        name: episodeName,
        assetId: await asset(`${name} ${episodeName}`),
      }).expect(201);
      await patch(`/v1/episodes/${episode.body.id}`, { status: 'PUBLISHED' }).expect(200);
      episodes.push(episode.body.id);
    }
    await put(`/v1/titles/${title.id}/status`, { status: 'PUBLISHED' }).expect(200);
    return { id: title.id as string, episodes: episodes as [string, string] };
  }
  /** Writes a play as the player would have left it. */
  const play = (
    titleId: string,
    startedAt: string,
    values: Partial<{
      watched: number;
      position: number;
      duration: number;
      viewerId: string | null;
      visitor: string;
      device: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'TV' | 'OTHER';
      kind: 'MAIN' | 'TRAILER' | 'EXTRA';
      episodeId: string;
      paid: boolean;
    }> = {},
  ) =>
    testApp.prisma.play.create({
      data: {
        titleId,
        episodeId: values.episodeId,
        kind: values.kind ?? 'MAIN',
        viewerId: values.viewerId ?? null,
        visitorKey: values.viewerId ? null : (values.visitor ?? 'visitor-a'),
        device: values.device ?? 'DESKTOP',
        paid: values.paid ?? false,
        durationSeconds: values.duration ?? 600,
        watchedSeconds: values.watched ?? 300,
        positionSeconds: values.position ?? values.watched ?? 300,
        startedAt: new Date(startedAt),
        lastBeatAt: new Date(startedAt),
      },
    });
  const RANGE = 'from=2026-12-08&to=2026-12-10&timezone=UTC';

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-analytics-'));
    env = {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
    };
    testApp = await createTestApp(MODULES, env);
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
    it('notes a play when a video is handed out, without keeping who asked', async () => {
      const film = await movie('Night Ferry');
      const answer = await http()
        .post(`/v1/catalog/titles/${film.slug}/playback`)
        .set('User-Agent', PHONE)
        .expect(200);
      expect(answer.body.playId).toMatch(/^[0-9a-f-]{36}$/);
      expect(answer.body.manifestUrl).toContain('master.m3u8');

      const row = await testApp.prisma.play.findUniqueOrThrow({
        where: { id: answer.body.playId },
      });
      expect(row).toMatchObject({
        kind: 'MAIN',
        titleId: film.id,
        episodeId: null,
        viewerId: null,
        device: 'MOBILE',
        paid: false,
        durationSeconds: 600,
        watchedSeconds: 0,
        positionSeconds: 0,
      });
      // A mark for counting, from which the address cannot be read back.
      expect(row.visitorKey).toMatch(/^[0-9a-f]{32}$/);
      expect(JSON.stringify(row)).not.toContain('127.0.0.1');
      expect(JSON.stringify(row)).not.toContain('iPhone');

      // The same device on the same day is the same visitor.
      const again = await http()
        .post(`/v1/catalog/titles/${film.slug}/playback`)
        .set('User-Agent', PHONE)
        .expect(200);
      const second = await testApp.prisma.play.findUniqueOrThrow({
        where: { id: again.body.playId },
      });
      expect(second.visitorKey).toBe(row.visitorKey);
    });

    it('tells the movie from its trailer and from an episode', async () => {
      const film = await movie('Night Ferry');
      await patch(`/v1/titles/${film.id}`, {
        trailerAssetId: await asset('Trailer', 60_000),
      }).expect(200);
      const show = await series('Deep Water');

      const trailer = await http()
        .post(`/v1/catalog/titles/${film.slug}/trailer/playback`)
        .expect(200);
      const episode = await http()
        .post(`/v1/catalog/episodes/${show.episodes[1]}/playback`)
        .expect(200);
      expect(
        await testApp.prisma.play.findUniqueOrThrow({ where: { id: trailer.body.playId } }),
      ).toMatchObject({ kind: 'TRAILER', titleId: film.id, durationSeconds: 60 });
      expect(
        await testApp.prisma.play.findUniqueOrThrow({ where: { id: episode.body.playId } }),
      ).toMatchObject({ kind: 'MAIN', titleId: show.id, episodeId: show.episodes[1] });
    });

    it('takes the reports of the player, and does not believe more than can be true', async () => {
      const film = await movie('Night Ferry');
      const { playId } = (await http().post(`/v1/catalog/titles/${film.slug}/playback`).expect(200))
        .body;
      const beat = (body: object) => http().post(`/v1/catalog/plays/${playId}/beat`).send(body);
      const row = () => testApp.prisma.play.findUniqueOrThrow({ where: { id: playId } });
      const earlier = (seconds: number) =>
        testApp.prisma.play.update({
          where: { id: playId },
          data: { lastBeatAt: new Date(Date.now() - seconds * 1000) },
        });

      await earlier(30);
      await beat({ position: 30, watched: 30 }).expect(204);
      expect(await row()).toMatchObject({ watchedSeconds: 30, positionSeconds: 30 });

      // Right after, a second report cannot add half a minute again.
      await beat({ position: 400, watched: 30 }).expect(204);
      const quick = await row();
      expect(quick.watchedSeconds).toBeLessThanOrEqual(36);
      expect(quick.positionSeconds).toBe(400);

      // After a long pause, one report still adds a minute at most, and the point stays in the video.
      await earlier(7200);
      await beat({ position: 99_999, watched: 5000 }).expect(204);
      const late = await row();
      expect(late.watchedSeconds).toBe(quick.watchedSeconds + 60);
      expect(late.positionSeconds).toBe(600);

      await beat({ position: -1, watched: 1 }).expect(400);
      await beat({ watched: 1 }).expect(400);
      // Unknown plays and old plays answer like any other, and change nothing.
      await http()
        .post('/v1/catalog/plays/01a1fdfd-0000-7000-8000-000000000000/beat')
        .send({ position: 1, watched: 1 })
        .expect(204);
      await testApp.prisma.play.update({
        where: { id: playId },
        data: { startedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      });
      await beat({ position: 500, watched: 20 }).expect(204);
      expect((await row()).watchedSeconds).toBe(late.watchedSeconds);
    });

    it('clears away plays that never began, and those older than they are kept', async () => {
      const film = await movie('Night Ferry');
      const days = (count: number) => new Date(Date.now() - count * 86_400_000).toISOString();
      await play(film.id, days(3), { watched: 0 });
      await play(film.id, days(1), { watched: 0 });
      await play(film.id, days(3), { watched: 120 });
      await play(film.id, days(800), { watched: 120 });

      expect(await testApp.app.get(PlaysService).purge()).toBe(2);
      const left = await testApp.prisma.play.findMany({ orderBy: { startedAt: 'asc' } });
      expect(left.map((row) => row.watchedSeconds)).toEqual([120, 0]);
    });
  });

  describe('the figures', () => {
    it('count views, viewers, time and endings, and compare with the days before', async () => {
      const film = await movie('Night Ferry');
      const other = await movie('Harvest', { access: 'PAID' });
      // Inside the range.
      await play(film.id, '2026-12-08T10:00:00Z', { watched: 600, visitor: 'a' });
      await play(film.id, '2026-12-08T21:00:00Z', { watched: 300, visitor: 'a', device: 'MOBILE' });
      await play(film.id, '2026-12-09T21:30:00Z', { watched: 550, visitor: 'b', device: 'MOBILE' });
      await play(other.id, '2026-12-10T08:00:00Z', {
        watched: 40,
        visitor: 'c',
        paid: true,
        device: 'TV',
      });
      // Too short to be a view, but it was watched.
      await play(film.id, '2026-12-10T09:00:00Z', { watched: 10, visitor: 'd' });
      // A trailer is not a view of the title.
      await play(film.id, '2026-12-10T09:00:00Z', { watched: 60, kind: 'TRAILER', visitor: 'e' });
      // The days before, and a day after.
      await play(film.id, '2026-12-06T10:00:00Z', { watched: 100, visitor: 'z' });
      await play(film.id, '2026-12-11T00:00:00Z', { watched: 100, visitor: 'y' });

      const summary = (await get(`/v1/analytics/summary?${RANGE}`).expect(200)).body;
      expect(summary.recording).toBe(true);
      expect(summary.totals).toEqual({
        views: 4,
        viewers: 3,
        watchSeconds: 1500,
        completionRate: 0.5,
        averageSeconds: 373,
      });
      expect(summary.previous).toMatchObject({ views: 1, viewers: 1, watchSeconds: 100 });
      expect(summary.days).toEqual([
        { day: '2026-12-08', views: 2, viewers: 1, watchSeconds: 900 },
        { day: '2026-12-09', views: 1, viewers: 1, watchSeconds: 550 },
        { day: '2026-12-10', views: 1, viewers: 1, watchSeconds: 50 },
      ]);
      expect(summary.devices).toEqual([
        { device: 'MOBILE', views: 2, watchSeconds: 850 },
        { device: 'DESKTOP', views: 1, watchSeconds: 600 },
        { device: 'TV', views: 1, watchSeconds: 40 },
      ]);
      expect(summary.audience).toEqual({ signedIn: 0, visitors: 4, paid: 1, free: 3 });
      expect(summary.hours).toHaveLength(24);
      expect([summary.hours[8], summary.hours[10], summary.hours[21]]).toEqual([1, 1, 2]);
    });

    it('count days as the time zone of the admin does', async () => {
      const film = await movie('Night Ferry');
      // 23:30 in UTC is half past midnight of the next day in Berlin.
      await play(film.id, '2026-12-08T23:30:00Z', { watched: 100 });

      const utc = (
        await get('/v1/analytics/summary?from=2026-12-08&to=2026-12-08&timezone=UTC').expect(200)
      ).body;
      expect(utc.totals.views).toBe(1);
      expect(utc.hours[23]).toBe(1);
      const berlin = (
        await get(
          '/v1/analytics/summary?from=2026-12-08&to=2026-12-09&timezone=Europe/Berlin',
        ).expect(200)
      ).body;
      expect(berlin.days).toEqual([
        { day: '2026-12-08', views: 0, viewers: 0, watchSeconds: 0 },
        { day: '2026-12-09', views: 1, viewers: 1, watchSeconds: 100 },
      ]);
      expect(berlin.hours[0]).toBe(1);
    });

    it('rank the titles, and narrow to movies or series', async () => {
      const film = await movie('Night Ferry');
      const quiet = await movie('Harvest');
      const show = await series('Deep Water');
      await play(film.id, '2026-12-08T10:00:00Z', { watched: 100, visitor: 'a' });
      await play(film.id, '2026-12-09T10:00:00Z', { watched: 100, visitor: 'b' });
      await play(quiet.id, '2026-12-09T10:00:00Z', { watched: 600, visitor: 'a' });
      await play(show.id, '2026-12-09T10:00:00Z', {
        watched: 580,
        visitor: 'a',
        episodeId: show.episodes[0],
      });
      await play(show.id, '2026-12-09T11:00:00Z', {
        watched: 590,
        visitor: 'a',
        episodeId: show.episodes[1],
      });
      await play(show.id, '2026-12-10T11:00:00Z', {
        watched: 200,
        visitor: 'b',
        episodeId: show.episodes[0],
      });

      const ranked = async (query: string) =>
        (await get(`/v1/analytics/titles?${RANGE}${query}`).expect(200)).body as {
          total: number;
          items: { title: { name: string } | null; views: number; viewers: number }[];
        };
      const byViews = await ranked('');
      expect(byViews.total).toBe(3);
      expect(byViews.items.map((item) => [item.title?.name, item.views, item.viewers])).toEqual([
        ['Deep Water', 3, 2],
        ['Night Ferry', 2, 2],
        ['Harvest', 1, 1],
      ]);
      expect((await ranked('&sort=completion')).items.map((item) => item.title?.name)).toEqual([
        'Harvest',
        'Deep Water',
        'Night Ferry',
      ]);
      expect((await ranked('&type=MOVIE')).items.map((item) => item.title?.name)).toEqual([
        'Night Ferry',
        'Harvest',
      ]);
      expect((await ranked('&pageSize=1&page=2')).items.map((item) => item.title?.name)).toEqual([
        'Night Ferry',
      ]);
      const movies = (await get(`/v1/analytics/summary?${RANGE}&type=MOVIE`).expect(200)).body;
      expect(movies.totals.views).toBe(3);

      // The figures outlive the title.
      await put(`/v1/titles/${quiet.id}/status`, { status: 'DRAFT' }).expect(200);
      await http().delete(`/v1/titles/${quiet.id}`).set(auth()).expect(204);
      const after = await ranked('');
      expect(after.items.map((item) => item.title?.name ?? null)).toEqual([
        'Deep Water',
        'Night Ferry',
        null,
      ]);
      expect((await get(`/v1/analytics/summary?${RANGE}`).expect(200)).body.totals.views).toBe(6);
    });

    it('show one title: its days, its episodes and how far viewers get', async () => {
      const show = await series('Deep Water');
      const [one, two] = show.episodes;
      await play(show.id, '2026-12-08T10:00:00Z', {
        watched: 600,
        position: 600,
        visitor: 'a',
        episodeId: one,
      });
      await play(show.id, '2026-12-08T11:00:00Z', {
        watched: 320,
        position: 330,
        visitor: 'b',
        episodeId: one,
      });
      await play(show.id, '2026-12-09T10:00:00Z', {
        watched: 60,
        position: 70,
        visitor: 'c',
        episodeId: one,
      });
      await play(show.id, '2026-12-09T12:00:00Z', {
        watched: 590,
        position: 600,
        visitor: 'a',
        episodeId: two,
      });
      await play(show.id, '2026-12-09T12:00:00Z', { watched: 50, kind: 'TRAILER' });
      await play(show.id, '2026-12-09T12:00:00Z', { watched: 50, kind: 'EXTRA' });
      await play(show.id, '2026-12-09T12:00:00Z', { watched: 0, kind: 'EXTRA' });

      const detail = (await get(`/v1/analytics/titles/${show.id}?${RANGE}`).expect(200)).body;
      expect(detail.title).toMatchObject({ id: show.id, name: 'Deep Water', type: 'SERIES' });
      expect(detail.totals).toMatchObject({
        views: 4,
        viewers: 3,
        watchSeconds: 1570,
        completionRate: 0.5,
      });
      expect(detail.days.map((day: { views: number }) => day.views)).toEqual([2, 2, 0]);
      expect(
        detail.episodes.map((episode: { name: string; views: number; completionRate: number }) => [
          episode.name,
          episode.views,
          episode.completionRate,
        ]),
      ).toEqual([
        ['One', 3, 1 / 3],
        ['Two', 1, 1],
      ]);
      // Of four views: all got past 10 %, three past 50 %, two to the end.
      expect(detail.reach).toEqual([1, 0.75, 0.75, 0.75, 0.75, 0.5, 0.5, 0.5, 0.5, 0.5]);
      expect(detail).toMatchObject({ trailerPlays: 1, extraPlays: 1 });
      await get(`/v1/analytics/titles/01a1fdfd-0000-7000-8000-000000000000?${RANGE}`).expect(404);
    });

    it('count a signed-in viewer once over the days, and say who is watching now', async () => {
      const film = await movie('Night Ferry');
      const viewer = await testApp.prisma.viewer.create({
        data: { email: 'v@example.com', passwordHash: 'x', displayName: 'Vera' },
      });
      await play(film.id, '2026-12-08T10:00:00Z', { watched: 100, viewerId: viewer.id });
      await play(film.id, '2026-12-09T10:00:00Z', { watched: 100, viewerId: viewer.id });
      // A visitor is another one each day: nothing ties the days together.
      await play(film.id, '2026-12-08T10:00:00Z', { watched: 100, visitor: 'day-one' });
      await play(film.id, '2026-12-09T10:00:00Z', { watched: 100, visitor: 'day-two' });

      const summary = (await get(`/v1/analytics/summary?${RANGE}`).expect(200)).body;
      expect(summary.totals).toMatchObject({ views: 4, viewers: 3 });
      expect(summary.audience).toMatchObject({ signedIn: 2, visitors: 2 });

      expect((await get('/v1/analytics/now').expect(200)).body).toEqual({
        watching: 0,
        titles: [],
      });
      const playing = await play(film.id, new Date().toISOString(), { watched: 45 });
      await testApp.prisma.play.update({
        where: { id: playing.id },
        data: { lastBeatAt: new Date() },
      });
      const now = (await get('/v1/analytics/now').expect(200)).body;
      expect(now.watching).toBe(1);
      expect(now.titles).toMatchObject([{ title: { name: 'Night Ferry' }, watching: 1 }]);

      // Deleting the account keeps the figures and lets go of the person.
      await testApp.prisma.viewer.delete({ where: { id: viewer.id } });
      expect((await get(`/v1/analytics/summary?${RANGE}`).expect(200)).body.totals.views).toBe(4);
    });

    it('check what is asked, and who asks', async () => {
      await get('/v1/analytics/summary?from=2026-12-10&to=2026-12-08').expect(400);
      await get('/v1/analytics/summary?from=2025-01-01&to=2026-12-08').expect(400);
      await get('/v1/analytics/summary?from=2026-12-08&to=2026-12-10&timezone=Mars/Olympus').expect(
        400,
      );
      await get('/v1/analytics/summary?from=yesterday&to=today').expect(400);
      await http().get(`/v1/analytics/summary?${RANGE}`).expect(401);
      await http().get('/v1/analytics/now').expect(401);

      await post('/v1/admins', {
        email: 'reader@example.com',
        displayName: 'Rita Reader',
        password: 'reader-password-123',
        role: 'VIEWER',
      }).expect(201);
      const reader = testApp.bearer(
        await testApp.login('reader@example.com', 'reader-password-123'),
      );
      await http().get(`/v1/analytics/summary?${RANGE}`).set(reader).expect(200);
    });
  });

  describe('switched off', () => {
    let quietApp: TestApp;
    afterAll(async () => {
      await quietApp?.close();
    });

    it('records nothing and says so', async () => {
      const film = await movie('Night Ferry');
      const existing = await play(film.id, '2026-12-08T10:00:00Z', { watched: 100 });
      quietApp = await createTestApp(MODULES, { ...env, VIEWING_STATISTICS: 'off' });

      const answer = await quietApp
        .http()
        .post(`/v1/catalog/titles/${film.slug}/playback`)
        .expect(200);
      expect(answer.body.playId).toBeNull();
      expect(answer.body.manifestUrl).toContain('master.m3u8');
      await quietApp
        .http()
        .post(`/v1/catalog/plays/${existing.id}/beat`)
        .send({ position: 500, watched: 30 })
        .expect(204);
      expect(await testApp.prisma.play.count()).toBe(1);
      expect(
        (await testApp.prisma.play.findUniqueOrThrow({ where: { id: existing.id } }))
          .watchedSeconds,
      ).toBe(100);

      const summary = await quietApp
        .http()
        .get(`/v1/analytics/summary?${RANGE}`)
        .set(quietApp.bearer(ownerToken))
        .expect(200);
      expect(summary.body.recording).toBe(false);
    });
  });
});
