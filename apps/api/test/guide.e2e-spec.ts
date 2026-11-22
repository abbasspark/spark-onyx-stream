// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the programme guide: its sources, importing XMLTV,
// programmes entered by hand, and what viewers are told.
//
// Skipped unless TEST_DATABASE_URL is set.
import { gzipSync } from 'node:zlib';
import { AdminsModule } from '../src/admins/admins.module.js';
import { BillingModule } from '../src/billing/billing.module.js';
import { GuideModule, GuideSchedulerModule } from '../src/guide/guide.module.js';
import { GuideImportService, unpack } from '../src/guide/guide-import.service.js';
import { GuideRefreshService } from '../src/guide/guide-refresh.service.js';
import { LiveModule } from '../src/live/live.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const HOUR = 3_600_000;
const SOURCE_URL = 'https://user:secret@guide.example.com/files/guide.xml.gz?token=abc';
const EDITOR = {
  email: 'editor@example.com',
  displayName: 'Eddie Editor',
  password: 'editor-password-123',
  role: 'EDITOR',
};

/** A time as XMLTV writes it, in UTC. */
const stamp = (date: Date) => `${date.toISOString().replace(/[-:T]/g, '').slice(0, 14)} +0000`;

function xmltv(programmes: { channel: string; title: string; from: Date; to: Date }[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="news.example"><display-name>News 24</display-name></channel>
  <channel id="kids.example"><display-name>Kids &amp; Co</display-name></channel>
  <channel id="other.example"><display-name>Other</display-name></channel>
  ${programmes
    .map(
      (item) =>
        `<programme start="${stamp(item.from)}" stop="${stamp(item.to)}" channel="${item.channel}">
          <title>${item.title}</title><desc>About ${item.title}</desc><category>Talk</category>
        </programme>`,
    )
    .join('\n')}
</tv>`;
}

describe.skipIf(!TEST_DATABASE_URL)('Programme guide (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  /** What the guide source "serves" in a test, or the error it fails with. */
  let served: Buffer | Error = Buffer.from('');
  let fetched: string[] = [];
  // Whole hours make the expected times easy to read.
  const base = new Date(Math.floor(Date.now() / HOUR) * HOUR);
  const at = (hours: number) => new Date(base.getTime() + hours * HOUR);

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);

  async function createChannel(body: Record<string, unknown> = {}) {
    const response = await http()
      .post('/v1/channels')
      .set(admin())
      .send({ name: 'News 24', source: 'https://cdn.example.com/live.m3u8', ...body })
      .expect(201);
    return response.body as { id: string; slug: string };
  }
  async function createSource(body: Record<string, unknown> = {}) {
    const response = await http()
      .post('/v1/guide/sources')
      .set(admin())
      .send({ name: 'Main guide', url: SOURCE_URL, ...body })
      .expect(201);
    return response.body as { id: string };
  }
  const runImport = (id: string) =>
    http().post(`/v1/guide/sources/${id}/import`).set(admin()).expect(200);
  const programmesOf = (channelId: string, from = at(-24), to = at(48)) =>
    http()
      .get(`/v1/channels/${channelId}/programmes`)
      .query({ from: from.toISOString(), to: to.toISOString() })
      .set(admin());

  beforeAll(async () => {
    testApp = await createTestApp(
      [AdminsModule, ViewersModule, BillingModule, LiveModule, GuideModule, GuideSchedulerModule],
      { INGEST_API_URL: 'http://127.0.0.1:1', GUIDE_REFRESH_HOURS: '6' },
    );
    const fetcher = async (url: string) => {
      fetched.push(url);
      if (served instanceof Error) {
        throw served;
      }
      const body = served;
      return unpack(
        (async function* () {
          yield new Uint8Array(body);
        })(),
      );
    };
    // The API and the scheduler each have their own importer.
    const importers = testApp.app.get(GuideImportService, {
      each: true,
      strict: false,
    }) as unknown as GuideImportService[];
    for (const importer of importers) {
      importer.fetcher = fetcher;
    }
  });
  afterAll(() => testApp.close());

  beforeEach(async () => {
    await testApp.resetDatabase();
    testApp.redis.clear();
    ownerToken = await testApp.setupOwner();
    served = Buffer.from(xmltv([]));
    fetched = [];
  });

  describe('sources', () => {
    it('keeps the address of a source to those who may change the guide', async () => {
      const created = await http()
        .post('/v1/guide/sources')
        .set(admin())
        .send({ name: ' Main  guide ', url: SOURCE_URL })
        .expect(201);
      expect(created.body).toMatchObject({
        name: 'Main guide',
        url: 'https://guide.example.com/files/guide.xml.gz',
        enabled: true,
        lastRun: null,
        programmes: 0,
        channels: 0,
      });

      const stored = await testApp.prisma.guideSource.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(stored.urlEncrypted).not.toContain('secret');
      const full = await http()
        .get(`/v1/guide/sources/${created.body.id}/url`)
        .set(admin())
        .expect(200);
      expect(full.body).toEqual({ url: SOURCE_URL });

      await http().post('/v1/admins').set(admin()).send(EDITOR).expect(201);
      const editor = testApp.bearer(await testApp.login(EDITOR.email, EDITOR.password));
      const list = await http().get('/v1/guide/sources').set(editor).expect(200);
      expect(JSON.stringify(list.body)).not.toContain('secret');
      await http().get(`/v1/guide/sources/${created.body.id}/url`).set(editor).expect(403);
      await http().post(`/v1/guide/sources/${created.body.id}/import`).set(editor).expect(403);
      await http()
        .post('/v1/guide/sources')
        .set(editor)
        .send({ name: 'X', url: SOURCE_URL })
        .expect(403);

      const audit = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'guide-source.create' },
      });
      expect(JSON.stringify(audit.metadata)).not.toContain('secret');
    });

    it.each(['file:///etc/passwd', 'ftp://example.com/guide.xml', 'guide.xml', ''])(
      'refuses "%s" as an address',
      async (url) => {
        const response = await http()
          .post('/v1/guide/sources')
          .set(admin())
          .send({ name: 'Bad', url })
          .expect(400);
        expect(response.body.issues[0].field).toBe('url');
      },
    );

    it('changes and deletes a source, and refuses a name twice', async () => {
      const source = await createSource();
      await http()
        .post('/v1/guide/sources')
        .set(admin())
        .send({ name: 'Main guide', url: SOURCE_URL })
        .expect(409);

      const changed = await http()
        .patch(`/v1/guide/sources/${source.id}`)
        .set(admin())
        .send({ enabled: false, url: 'http://other.example.com/tv.xml?key=1' })
        .expect(200);
      expect(changed.body).toMatchObject({
        enabled: false,
        url: 'http://other.example.com/tv.xml',
      });

      await http().delete(`/v1/guide/sources/${source.id}`).set(admin()).expect(204);
      await http().delete(`/v1/guide/sources/${source.id}`).set(admin()).expect(404);
    });
  });

  describe('importing', () => {
    it('files programmes under the channels that are linked, and lists what the file knows', async () => {
      const news = await createChannel({ guideId: 'news.example' });
      const unlinked = await createChannel({ name: 'Sports' });
      const source = await createSource();
      served = gzipSync(
        xmltv([
          { channel: 'news.example', title: 'Morning Show', from: at(0), to: at(2) },
          { channel: 'news.example', title: 'Noon Report', from: at(2), to: at(3) },
          { channel: 'kids.example', title: 'Cartoon Hour', from: at(0), to: at(1) },
          // Long over, and far ahead: neither is kept.
          { channel: 'news.example', title: 'Last Week', from: at(-200), to: at(-199) },
          { channel: 'news.example', title: 'Next Month', from: at(700), to: at(701) },
        ]),
      );

      const result = await runImport(source.id);
      expect(result.body).toEqual({
        ok: true,
        message: '2 programmes for 1 of your channels',
        programmes: 2,
        channels: 3,
        linked: 1,
      });
      // The file is fetched from the full address, with its token.
      expect(fetched).toEqual([SOURCE_URL]);

      const listed = await programmesOf(news.id).expect(200);
      expect(listed.body).toEqual([
        {
          id: expect.any(String),
          channelId: news.id,
          title: 'Morning Show',
          subtitle: null,
          description: 'About Morning Show',
          category: 'Talk',
          startsAt: at(0).toISOString(),
          endsAt: at(2).toISOString(),
          source: { id: source.id, name: 'Main guide' },
        },
        expect.objectContaining({ title: 'Noon Report' }),
      ]);
      expect((await programmesOf(unlinked.id).expect(200)).body).toEqual([]);

      const shown = await http().get('/v1/guide/sources').set(admin()).expect(200);
      expect(shown.body[0]).toMatchObject({
        programmes: 2,
        channels: 3,
        lastRun: { ok: true, message: '2 programmes for 1 of your channels' },
      });

      const known = await http().get('/v1/guide/channels').query({ q: 'kids' }).set(admin());
      expect(known.body).toEqual([
        { guideId: 'kids.example', name: 'Kids & Co', source: 'Main guide' },
      ]);
      const all = await http().get('/v1/guide/channels').set(admin()).expect(200);
      expect(all.body).toHaveLength(3);
    });

    it('replaces what a source brought before, and leaves the rest alone', async () => {
      const news = await createChannel({ guideId: 'news.example' });
      const source = await createSource();
      await http()
        .post(`/v1/channels/${news.id}/programmes`)
        .set(admin())
        .send({ title: 'By hand', startsAt: at(5).toISOString(), endsAt: at(6).toISOString() })
        .expect(201);

      served = Buffer.from(
        xmltv([{ channel: 'news.example', title: 'Old Plan', from: at(0), to: at(1) }]),
      );
      await runImport(source.id);
      served = Buffer.from(
        xmltv([{ channel: 'news.example', title: 'New Plan', from: at(0), to: at(1) }]),
      );
      await runImport(source.id);

      const titles = (await programmesOf(news.id).expect(200)).body.map(
        (item: { title: string }) => item.title,
      );
      expect(titles).toEqual(['New Plan', 'By hand']);
    });

    it('keeps the last good guide when an import fails, and says why', async () => {
      const news = await createChannel({ guideId: 'news.example' });
      const source = await createSource();
      served = Buffer.from(
        xmltv([{ channel: 'news.example', title: 'Morning Show', from: at(0), to: at(1) }]),
      );
      await runImport(source.id);

      served = Buffer.from('<html><body>Service unavailable</body></html>');
      const notGuide = await runImport(source.id);
      expect(notGuide.body).toMatchObject({ ok: false });
      expect(notGuide.body.message).toContain('not an XMLTV guide');

      served = Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      const unreachable = await runImport(source.id);
      expect(unreachable.body.message).toBe('The file could not be fetched: ENOTFOUND');

      expect((await programmesOf(news.id).expect(200)).body).toHaveLength(1);
      const shown = await http().get('/v1/guide/sources').set(admin()).expect(200);
      expect(shown.body[0]).toMatchObject({
        programmes: 1,
        lastRun: { ok: false, message: 'The file could not be fetched: ENOTFOUND' },
      });
    });

    it('says so when no channel is linked to the file yet', async () => {
      await createChannel();
      const source = await createSource();
      served = Buffer.from(
        xmltv([{ channel: 'news.example', title: 'Morning Show', from: at(0), to: at(1) }]),
      );
      const result = await runImport(source.id);
      expect(result.body.message).toBe(
        'The file lists 3 channels. None of your channels is linked to one of them yet',
      );
    });

    it('imports by itself what is due, and deletes what is long over', async () => {
      const news = await createChannel({ guideId: 'news.example' });
      const due = await createSource({ name: 'Due' });
      const fresh = await createSource({ name: 'Fresh' });
      const off = await createSource({ name: 'Off', enabled: false });
      await testApp.prisma.guideSource.update({
        where: { id: fresh.id },
        data: { lastRunAt: new Date(Date.now() - HOUR), lastOk: true },
      });
      await testApp.prisma.guideSource.update({
        where: { id: due.id },
        data: { lastRunAt: new Date(Date.now() - 7 * HOUR), lastOk: true },
      });
      await testApp.prisma.programme.create({
        data: { channelId: news.id, title: 'Ancient', startsAt: at(-100), endsAt: at(-99) },
      });
      served = Buffer.from(
        xmltv([{ channel: 'news.example', title: 'Morning Show', from: at(0), to: at(1) }]),
      );

      const imported = await testApp.app.get(GuideRefreshService).refresh();
      expect(imported).toBe(1);
      const runs = await testApp.prisma.guideSource.findMany({ orderBy: { name: 'asc' } });
      expect(runs.map((source) => [source.name, source.lastProgrammes])).toEqual([
        ['Due', 1],
        ['Fresh', null],
        ['Off', null],
      ]);
      expect(off.id).toBeDefined();
      const titles = (await programmesOf(news.id, at(-200)).expect(400)).body;
      expect(titles.message).toBe('Validation failed');
      expect(
        (await testApp.prisma.programme.findMany()).map((programme) => programme.title),
      ).toEqual(['Morning Show']);
    });
  });

  describe('programmes entered by hand', () => {
    it('adds, changes and deletes them', async () => {
      const news = await createChannel();
      const created = await http()
        .post(`/v1/channels/${news.id}/programmes`)
        .set(admin())
        .send({
          title: '  Town Hall  ',
          description: 'Questions from viewers.',
          startsAt: at(1).toISOString(),
          endsAt: at(2).toISOString(),
        })
        .expect(201);
      expect(created.body).toMatchObject({ title: 'Town Hall', subtitle: null, source: null });

      const moved = await http()
        .patch(`/v1/programmes/${created.body.id}`)
        .set(admin())
        .send({ endsAt: at(3).toISOString(), subtitle: 'Live' })
        .expect(200);
      expect(moved.body).toMatchObject({ endsAt: at(3).toISOString(), subtitle: 'Live' });

      await http()
        .patch(`/v1/programmes/${created.body.id}`)
        .set(admin())
        .send({ endsAt: at(0).toISOString() })
        .expect(400);
      await http().delete(`/v1/programmes/${created.body.id}`).set(admin()).expect(204);
      expect((await programmesOf(news.id).expect(200)).body).toEqual([]);
    });

    it('refuses times that cannot be right', async () => {
      const news = await createChannel();
      const send = (startsAt: Date, endsAt: Date) =>
        http()
          .post(`/v1/channels/${news.id}/programmes`)
          .set(admin())
          .send({ title: 'X', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
      const backwards = await send(at(2), at(1)).expect(400);
      expect(backwards.body.issues[0]).toEqual({
        field: 'endsAt',
        message: 'The end must be after the start',
      });
      await send(at(0), at(30)).expect(400);
      await http()
        .post(`/v1/channels/${news.id}/programmes`)
        .set(admin())
        .send({ title: 'X', startsAt: 'tomorrow', endsAt: at(1).toISOString() })
        .expect(400);
    });

    it('leaves imported programmes to their source', async () => {
      const news = await createChannel({ guideId: 'news.example' });
      const source = await createSource();
      served = Buffer.from(
        xmltv([{ channel: 'news.example', title: 'Morning Show', from: at(0), to: at(1) }]),
      );
      await runImport(source.id);
      const [imported] = (await programmesOf(news.id).expect(200)).body as { id: string }[];

      const refused = await http()
        .patch(`/v1/programmes/${imported?.id}`)
        .set(admin())
        .send({ title: 'Mine' })
        .expect(400);
      expect(refused.body.message).toContain('comes from "Main guide"');
      await http().delete(`/v1/programmes/${imported?.id}`).set(admin()).expect(400);

      // Deleting the source takes its programmes with it.
      await http().delete(`/v1/guide/sources/${source.id}`).set(admin()).expect(204);
      expect((await programmesOf(news.id).expect(200)).body).toEqual([]);
    });
  });

  describe('for viewers', () => {
    it('says what is on now and next, and gives the guide of published channels', async () => {
      const news = await createChannel({ published: true, number: 1 });
      const hidden = await createChannel({ name: 'Internal' });
      const empty = await createChannel({ name: 'Sports', published: true, number: 2 });
      const add = (channelId: string, title: string, from: Date, to: Date) =>
        testApp.prisma.programme.create({
          data: { channelId, title, startsAt: from, endsAt: to },
        });
      await add(news.id, 'Earlier', at(-3), at(-1));
      await add(news.id, 'On Now', at(-1), at(1));
      await add(news.id, 'Up Next', at(1), at(2));
      await add(news.id, 'Later', at(2), at(3));
      await add(hidden.id, 'Secret', at(-1), at(1));

      const list = await http().get('/v1/catalog/channels').expect(200);
      expect(list.body[0]).toMatchObject({
        slug: news.slug,
        now: {
          title: 'On Now',
          startsAt: at(-1).toISOString(),
          endsAt: at(1).toISOString(),
          description: null,
        },
        next: { title: 'Up Next' },
      });
      expect(list.body[1]).toMatchObject({ slug: empty.slug, now: null, next: null });
      expect(JSON.stringify(list.body)).not.toContain('Secret');

      const guide = await http()
        .get('/v1/catalog/guide')
        .query({ from: at(-2).toISOString(), hours: 4 })
        .expect(200);
      expect(guide.headers['cache-control']).toBe('public, max-age=60');
      expect(guide.body.from).toBe(at(-2).toISOString());
      expect(guide.body.to).toBe(at(2).toISOString());
      expect(
        guide.body.channels.map((row: { slug: string; programmes: { title: string }[] }) => [
          row.slug,
          row.programmes.map((programme) => programme.title),
        ]),
      ).toEqual([
        [news.slug, ['Earlier', 'On Now', 'Up Next']],
        [empty.slug, []],
      ]);

      // Without a start, the guide begins an hour ago at the full hour.
      const usual = await http().get('/v1/catalog/guide').expect(200);
      expect(new Date(usual.body.to).getTime() - new Date(usual.body.from).getTime()).toBe(
        24 * HOUR,
      );
      await http().get('/v1/catalog/guide').query({ hours: 500 }).expect(400);
    });

    it('shows one programme per slot when two sources describe the same one', async () => {
      const news = await createChannel({ published: true });
      await testApp.prisma.programme.createMany({
        data: [
          { channelId: news.id, title: 'First', startsAt: at(-1), endsAt: at(1) },
          { channelId: news.id, title: 'Same slot', startsAt: at(0), endsAt: at(1) },
          { channelId: news.id, title: 'After', startsAt: at(1), endsAt: at(2) },
        ],
      });
      const list = await http().get('/v1/catalog/channels').expect(200);
      expect(list.body[0]).toMatchObject({ now: { title: 'First' }, next: { title: 'After' } });
    });
  });
});
