// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of notifications: devices register, messages an admin
// writes reach browsers and apps, viewers are told of new episodes and
// titles by themselves, and each viewer has a list of what was sent.
//
// Push services, Google's token service and Firebase are stood in for by a
// local server. Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { BillingModule } from '../src/billing/billing.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { AnnouncerService, SETTLE_MS } from '../src/push/announcer.service.js';
import { CampaignsService } from '../src/push/campaigns.service.js';
import { NotificationRunner } from '../src/push/notification-runner.service.js';
import { PushModule } from '../src/push/push.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { type FakePush, startFakePush } from './support/fake-push.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [
  AssetsModule,
  AdminsModule,
  CatalogModule,
  ViewersModule,
  BillingModule,
  PushModule,
];
const PASSWORD = 'correct-horse';

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Notifications (e2e)', () => {
  let testApp: TestApp;
  let push: FakePush;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);
  const runner = () => testApp.app.get(NotificationRunner);
  /** What the runner does in a round, at once. */
  const round = async () => {
    // As if what was just published had stood long enough to be told of.
    await testApp.app.get(AnnouncerService).announce(new Date(Date.now() + SETTLE_MS + 1000));
    await testApp.app.get(CampaignsService).sendDue();
    return runner().push();
  };

  async function register(name: string) {
    const response = await http()
      .post('/v1/viewer/register')
      .send({ email: `${name.toLowerCase()}@example.com`, displayName: name, password: PASSWORD })
      .expect(201);
    return { id: response.body.viewer.id as string, cookie: cookieOf(response) };
  }

  const subscribe = (cookie: string, body: Record<string, unknown>) =>
    http().put('/v1/viewer/push/devices').set('Cookie', cookie).send(body);

  const inbox = async (cookie: string) =>
    (await http().get('/v1/viewer/notifications').set('Cookie', cookie).expect(200)).body as {
      items: {
        id: string;
        title: string;
        body: string;
        link: string | null;
        read: boolean;
        topic: string;
        data: Record<string, string>;
      }[];
      unread: number;
      next: string | null;
    };

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
        durationMs: 60_000,
      },
    });
    await http().patch(`/v1/titles/${id}`).set(admin()).send({ assetId }).expect(200);
    if (publish) {
      await http()
        .put(`/v1/titles/${id}/status`)
        .set(admin())
        .send({ status: 'PUBLISHED' })
        .expect(200);
    }
    return { id, slug: created.body.slug as string };
  }

  beforeAll(async () => {
    push = await startFakePush();
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-push-'));
    testApp = await createTestApp(MODULES, {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      PUSH_SERVICE_HOSTS: push.hosts,
      PUSH_CONTACT: 'mailto:ops@example.com',
      SITE_URL: 'https://watch.example.com',
    });
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
    push.fcm.length = 0;
    push.fcmAnswers = {};
    push.refuseKey = false;
  });

  afterAll(async () => {
    await testApp.resetDatabase();
    await testApp.close();
    await push.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  it('tells clients how to subscribe, and registers browsers and apps', async () => {
    const config = await http().get('/v1/push/config').expect(200);
    expect(config.body.fcm).toBeNull();
    expect(config.body.topics).toEqual(['NEW_EPISODES', 'NEW_TITLES', 'ANNOUNCEMENTS']);
    expect(Buffer.from(config.body.web.publicKey as string, 'base64url')).toHaveLength(65);
    // The key is made once and stays.
    expect((await http().get('/v1/push/config').expect(200)).body.web.publicKey).toBe(
      config.body.web.publicKey,
    );

    const anna = await register('Anna');
    const browser = push.browser();
    await http().put('/v1/viewer/push/devices').send({}).expect(401);
    const device = await subscribe(anna.cookie, {
      provider: 'WEB',
      subscription: browser.subscription,
      platform: 'web',
      language: 'de',
    }).expect(200);
    // The same browser again is the same device.
    const again = await subscribe(anna.cookie, {
      provider: 'WEB',
      subscription: browser.subscription,
      platform: 'web',
    }).expect(200);
    expect(again.body.id).toBe(device.body.id);
    await subscribe(anna.cookie, {
      provider: 'FCM',
      token: 'fcm-token-of-annas-television-0001',
      platform: 'android-tv',
      appVersion: '2.4.0',
    }).expect(200);

    // A viewer cannot make the server call an address of their choice.
    for (const endpoint of [
      'https://169.254.169.254/latest/meta-data',
      'http://localhost:5432/',
      'https://evil.example.com/hook',
    ]) {
      await subscribe(anna.cookie, {
        provider: 'WEB',
        subscription: { ...browser.subscription, endpoint },
        platform: 'web',
      }).expect(400);
    }
    await subscribe(anna.cookie, {
      provider: 'WEB',
      subscription: {
        endpoint: browser.subscription.endpoint,
        keys: { p256dh: 'A'.repeat(87), auth: browser.subscription.keys.auth },
      },
      platform: 'web',
    }).expect(400);

    const settings = await http()
      .get('/v1/viewer/notifications/settings')
      .set('Cookie', anna.cookie)
      .expect(200);
    expect(settings.body).toEqual({
      topics: { NEW_EPISODES: true, NEW_TITLES: true, ANNOUNCEMENTS: true },
      devices: 2,
      thisDevice: true,
    });

    await http()
      .delete(`/v1/viewer/push/devices/${device.body.id}`)
      .set('Cookie', anna.cookie)
      .expect(204);
    await http()
      .post('/v1/viewer/push/devices/forget')
      .set('Cookie', anna.cookie)
      .send({ provider: 'FCM', token: 'fcm-token-of-annas-television-0001' })
      .expect(204);
    expect(await testApp.prisma.pushDevice.count()).toBe(0);
  });

  it('sends a message an admin writes to browsers and apps, and counts what became of it', async () => {
    const anna = await register('Anna');
    const ben = await register('Ben');
    const cleo = await register('Cleo');
    const movie = await createMovie('Glass Tide');
    await testApp.prisma.title.updateMany({ data: { announcedAt: new Date() } });

    // Firebase is set up by pasting the key of a service account, which is tried at once.
    await http().put('/v1/notifications/firebase').send({ serviceAccount: '{}' }).expect(401);
    await http()
      .put('/v1/notifications/firebase')
      .set(admin())
      .send({ serviceAccount: '{"type":"x"}' })
      .expect(400);
    push.refuseKey = true;
    const refused = await http()
      .put('/v1/notifications/firebase')
      .set(admin())
      .send({ serviceAccount: push.serviceAccount })
      .expect(400);
    expect(refused.body.message).toContain('Nothing was stored');
    push.refuseKey = false;
    const setup = await http()
      .put('/v1/notifications/firebase')
      .set(admin())
      .send({ serviceAccount: push.serviceAccount })
      .expect(200);
    expect(setup.body.fcm).toMatchObject({
      projectId: 'test',
      clientEmail: 'push@test.iam.gserviceaccount.com',
    });
    // The key is never answered back, and is not readable where it is kept.
    expect(JSON.stringify(setup.body)).not.toContain('PRIVATE KEY');
    const stored = await testApp.prisma.setting.findUniqueOrThrow({ where: { key: 'push' } });
    expect(JSON.stringify(stored.value)).not.toContain('PRIVATE KEY');
    expect((await http().get('/v1/push/config').expect(200)).body.fcm).toEqual({
      projectId: 'test',
    });

    const browser = push.browser();
    await subscribe(anna.cookie, {
      provider: 'WEB',
      subscription: browser.subscription,
      platform: 'web',
    }).expect(200);
    await subscribe(ben.cookie, {
      provider: 'FCM',
      token: 'fcm-token-of-bens-phone-000000001',
      platform: 'android',
    }).expect(200);
    // Cleo wants no announcements.
    await http()
      .patch('/v1/viewer/notifications/settings')
      .set('Cookie', cleo.cookie)
      .send({ topics: { ANNOUNCEMENTS: false } })
      .expect(200);

    await http().post('/v1/notifications/campaigns').send({ title: 'x', body: 'y' }).expect(401);
    await http()
      .post('/v1/notifications/campaigns')
      .set(admin())
      .send({ title: 'x', body: 'y', link: 'https://evil.example.com' })
      .expect(400);
    await http()
      .post('/v1/notifications/campaigns')
      .set(admin())
      .send({ title: 'x', body: 'y', audience: 'PLAN' })
      .expect(400);
    const draft = await http()
      .post('/v1/notifications/campaigns')
      .set(admin())
      .send({
        title: 'Glass Tide is here',
        body: 'The film of the winter, from tonight.',
        titleId: movie.id,
      })
      .expect(201);
    expect(draft.body).toMatchObject({ status: 'DRAFT', audience: 'EVERYONE', recipients: 0 });
    expect(draft.body.linked.slug).toBe(movie.slug);
    const id = draft.body.id as string;

    const reach = await http()
      .get('/v1/notifications/campaigns/reach?audience=EVERYONE')
      .set(admin())
      .expect(200);
    expect(reach.body).toEqual({ viewers: 2, withDevice: 2 });
    expect(
      (
        await http()
          .get('/v1/notifications/campaigns/reach?audience=SUBSCRIBERS')
          .set(admin())
          .expect(200)
      ).body.viewers,
    ).toBe(0);

    // Nothing is sent while it is a draft.
    await round();
    expect((await inbox(anna.cookie)).items).toEqual([]);

    const sending = await http()
      .post(`/v1/notifications/campaigns/${id}/send`)
      .set(admin())
      .expect(200);
    expect(sending.body.status).toBe('SENDING');
    const pushed = await round();
    expect(pushed).toMatchObject({ taken: 2, sent: 2 });

    // The browser got it encrypted and could read it.
    expect(browser.received).toHaveLength(1);
    expect(browser.received[0]).toMatchObject({
      topic: 'ANNOUNCEMENTS',
      title: 'Glass Tide is here',
      body: 'The film of the winter, from tonight.',
      link: `https://watch.example.com/title/${movie.slug}`,
      data: { type: 'title', slug: movie.slug },
    });
    expect(push.lastHeaders['content-encoding']).toBe('aes128gcm');
    expect(push.lastHeaders.ttl).toBe('86400');
    expect(String(push.lastHeaders.authorization)).toMatch(
      /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/,
    );
    // The app got it through Firebase.
    expect(push.fcm).toHaveLength(1);
    expect(push.fcm[0]).toMatchObject({
      token: 'fcm-token-of-bens-phone-000000001',
      notification: { title: 'Glass Tide is here', body: 'The film of the winter, from tonight.' },
      data: {
        type: 'title',
        slug: movie.slug,
        topic: 'ANNOUNCEMENTS',
        link: `https://watch.example.com/title/${movie.slug}`,
      },
    });
    expect(push.tokenRequests).toBeGreaterThanOrEqual(1);

    // Both have it in their list. Cleo, who turned announcements off, has not.
    const annas = await inbox(anna.cookie);
    expect(annas.unread).toBe(1);
    expect(annas.items).toMatchObject([
      {
        title: 'Glass Tide is here',
        link: `/title/${movie.slug}`,
        read: false,
        topic: 'ANNOUNCEMENTS',
      },
    ]);
    expect((await inbox(cleo.cookie)).items).toEqual([]);

    // Sending again changes nothing: a sent message is sent.
    await http().post(`/v1/notifications/campaigns/${id}/send`).set(admin()).expect(409);
    await http()
      .patch(`/v1/notifications/campaigns/${id}`)
      .set(admin())
      .send({ title: 'Other' })
      .expect(409);
    await round();
    expect(browser.received).toHaveLength(1);

    // Anna opens it from the notification, Ben only sees it in the list.
    const notificationId = annas.items[0]?.id as string;
    await http()
      .post(`/v1/viewer/notifications/${notificationId}/opened`)
      .set('Cookie', anna.cookie)
      .expect(204);
    await http()
      .post(`/v1/viewer/notifications/${notificationId}/opened`)
      .set('Cookie', ben.cookie)
      .expect(404);
    expect(
      (
        await http()
          .post('/v1/viewer/notifications/read')
          .set('Cookie', ben.cookie)
          .send({})
          .expect(200)
      ).body,
    ).toEqual({ read: 1 });
    expect(
      (await http().get('/v1/viewer/notifications/unread').set('Cookie', ben.cookie).expect(200))
        .body,
    ).toEqual({ unread: 0 });

    const sent = await http().get(`/v1/notifications/campaigns/${id}`).set(admin()).expect(200);
    expect(sent.body).toMatchObject({
      status: 'SENT',
      recipients: 2,
      pushed: 2,
      read: 2,
      opened: 1,
      waiting: 0,
    });
    const list = await http()
      .get('/v1/notifications/campaigns?status=SENT')
      .set(admin())
      .expect(200);
    expect(list.body.total).toBe(1);

    // A test goes to one viewer and is not counted.
    await http()
      .post(`/v1/notifications/campaigns/${id}/test`)
      .set(admin())
      .send({ email: 'nobody@example.com' })
      .expect(404);
    expect(
      (
        await http()
          .post(`/v1/notifications/campaigns/${id}/test`)
          .set(admin())
          .send({ email: 'ANNA@example.com' })
          .expect(200)
      ).body,
    ).toEqual({ devices: 1 });
    await round();
    expect(browser.received[1]).toMatchObject({ title: '[Test] Glass Tide is here' });
    expect(
      (await http().get(`/v1/notifications/campaigns/${id}`).set(admin()).expect(200)).body
        .recipients,
    ).toBe(2);

    const overview = await http().get('/v1/notifications/setup').set(admin()).expect(200);
    expect(overview.body).toMatchObject({
      reachable: 2,
      viewers: 3,
      automatic: { newEpisodes: true, newTitles: false },
    });
    expect(overview.body.devices).toEqual(
      expect.arrayContaining([
        { platform: 'web', provider: 'WEB', count: 1 },
        { platform: 'android', provider: 'FCM', count: 1 },
      ]),
    );
  });

  it('waits for the time of a scheduled message, which can be held back', async () => {
    const anna = await register('Anna');
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const created = await http()
      .post('/v1/notifications/campaigns')
      .set(admin())
      .send({
        title: 'Tonight at eight',
        body: 'The final, live.',
        link: '/live',
        scheduledAt: soon,
      })
      .expect(201);
    const id = created.body.id as string;
    expect(
      (await http().post(`/v1/notifications/campaigns/${id}/send`).set(admin()).expect(200)).body
        .status,
    ).toBe('SCHEDULED');
    await round();
    expect((await inbox(anna.cookie)).items).toEqual([]);

    expect(
      (await http().post(`/v1/notifications/campaigns/${id}/cancel`).set(admin()).expect(200)).body
        .status,
    ).toBe('DRAFT');
    await http().post(`/v1/notifications/campaigns/${id}/cancel`).set(admin()).expect(409);

    // Its time has come.
    await http()
      .patch(`/v1/notifications/campaigns/${id}`)
      .set(admin())
      .send({ scheduledAt: new Date(Date.now() + 1500).toISOString() })
      .expect(200);
    await http().post(`/v1/notifications/campaigns/${id}/send`).set(admin()).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 1700));
    await round();
    const got = await inbox(anna.cookie);
    expect(got.items).toMatchObject([
      { title: 'Tonight at eight', link: '/live', data: { type: 'link', path: '/live' } },
    ]);
    // No device: it is in the list and nowhere else.
    const row = await testApp.prisma.notification.findFirstOrThrow();
    expect(row.pushState).toBe('NONE');

    await http().delete(`/v1/notifications/campaigns/${id}`).set(admin()).expect(204);
    // What viewers got stays in their lists.
    expect((await inbox(anna.cookie)).items).toHaveLength(1);
    await http()
      .delete(`/v1/viewer/notifications/${got.items[0]?.id}`)
      .set('Cookie', anna.cookie)
      .expect(204);
    expect((await inbox(anna.cookie)).items).toEqual([]);
  });

  it('forgets devices that are gone, tries again when a push service is down, and stops at sign-out', async () => {
    const anna = await register('Anna');
    const gone = push.browser();
    const down = push.browser();
    gone.answer = 410;
    down.answer = 503;
    await subscribe(anna.cookie, {
      provider: 'WEB',
      subscription: gone.subscription,
      platform: 'web',
    }).expect(200);
    await subscribe(anna.cookie, {
      provider: 'WEB',
      subscription: down.subscription,
      platform: 'web',
    }).expect(200);

    const send = async (title: string) => {
      const created = await http()
        .post('/v1/notifications/campaigns')
        .set(admin())
        .send({ title, body: 'x' })
        .expect(201);
      await http()
        .post(`/v1/notifications/campaigns/${created.body.id}/send`)
        .set(admin())
        .expect(200);
      return round();
    };
    expect(await send('First')).toMatchObject({ taken: 1, sent: 0, forgotten: 1 });
    expect(await testApp.prisma.pushDevice.count()).toBe(1);
    let row = await testApp.prisma.notification.findFirstOrThrow();
    expect(row).toMatchObject({ pushState: 'PENDING', pushAttempts: 1 });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000);

    // The push service is back when the next try is due.
    down.answer = 201;
    await testApp.prisma.notification.updateMany({
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    expect(await runner().push()).toMatchObject({ taken: 1, sent: 1 });
    row = await testApp.prisma.notification.findFirstOrThrow();
    expect(row).toMatchObject({ pushState: 'SENT', devices: 1 });
    expect(down.received).toHaveLength(1);

    // After signing out, the device gets nothing more.
    await http().post('/v1/viewer/logout').set('Cookie', anna.cookie);
    await send('Second');
    expect(down.received).toHaveLength(1);
  });

  it('tells followers of new episodes and, when switched on, everybody of new titles', async () => {
    const anna = await register('Anna');
    const ben = await register('Ben');
    const browser = push.browser();
    await subscribe(anna.cookie, {
      provider: 'WEB',
      subscription: browser.subscription,
      platform: 'web',
    }).expect(200);

    // A series with one episode out. Anna has it on her list.
    const series = await http()
      .post('/v1/titles')
      .set(admin())
      .send({ type: 'SERIES', name: 'Signal Fires' })
      .expect(201);
    const seriesId = series.body.id as string;
    const season = await http()
      .post(`/v1/titles/${seriesId}/seasons`)
      .set(admin())
      .send({ number: 1 })
      .expect(201);
    const episode = async (number: number, name: string) => {
      const created = await http()
        .post(`/v1/seasons/${season.body.seasons[0].id}/episodes`)
        .set(admin())
        .send({ number, name })
        .expect(201);
      const asset = await http().post('/v1/assets').set(admin()).send({ title: name }).expect(201);
      const assetId = asset.body.asset.id as string;
      await testApp.prisma.asset.update({
        where: { id: assetId },
        data: {
          status: 'READY',
          manifestPath: `assets/${assetId}/hls/master.m3u8`,
          durationMs: 60_000,
        },
      });
      await http()
        .patch(`/v1/episodes/${created.body.id}`)
        .set(admin())
        .send({ assetId })
        .expect(200);
      await http()
        .patch(`/v1/episodes/${created.body.id}`)
        .set(admin())
        .send({ status: 'PUBLISHED' })
        .expect(200);
      return created.body.id as string;
    };
    await episode(1, 'Arrival');
    await http()
      .put(`/v1/titles/${seriesId}/status`)
      .set(admin())
      .send({ status: 'PUBLISHED' })
      .expect(200);

    // A new series is not "new episodes", and new titles are not told of unless switched on.
    await round();
    expect((await inbox(anna.cookie)).items).toEqual([]);
    expect(
      (await testApp.prisma.title.findUniqueOrThrow({ where: { id: seriesId } })).announcedAt,
    ).not.toBeNull();

    const profile = await testApp.prisma.viewerProfile.findFirstOrThrow({
      where: { viewerId: anna.id },
    });
    await testApp.prisma.watchlistItem.create({
      data: { viewerId: anna.id, profileId: profile.id, titleId: seriesId },
    });

    // Two episodes arrive together: one notification, for the follower only.
    await episode(2, 'The Trench');
    await episode(3, 'Episode 3');
    // Too fresh: an editor may still be publishing.
    await testApp.app.get(AnnouncerService).announce();
    expect((await inbox(anna.cookie)).items).toEqual([]);
    await round();
    const annas = await inbox(anna.cookie);
    expect(annas.items).toMatchObject([
      {
        topic: 'NEW_EPISODES',
        title: '2 new episodes of Signal Fires',
        body: 'Season 1, episodes 2 to 3.',
        link: `/title/${series.body.slug}`,
        data: { type: 'episode', slug: series.body.slug },
      },
    ]);
    expect(browser.received).toHaveLength(1);
    expect((await inbox(ben.cookie)).items).toEqual([]);
    // Told once.
    await round();
    expect((await inbox(anna.cookie)).items).toHaveLength(1);

    // Whoever turned the kind off is not told.
    await http()
      .patch('/v1/viewer/notifications/settings')
      .set('Cookie', anna.cookie)
      .send({ topics: { NEW_EPISODES: false } })
      .expect(200);
    await episode(4, 'Low Tide');
    await round();
    expect((await inbox(anna.cookie)).items).toHaveLength(1);

    // New titles, once the operator switches them on.
    const automatic = await http()
      .patch('/v1/notifications/automatic')
      .set(admin())
      .send({ newTitles: true })
      .expect(200);
    expect(automatic.body).toEqual({ newEpisodes: true, newTitles: true });
    const movie = await createMovie('Glass Tide');
    await createMovie('Draft', false);
    await round();
    expect((await inbox(ben.cookie)).items).toMatchObject([
      {
        topic: 'NEW_TITLES',
        title: 'New: Glass Tide',
        body: 'A new movie to watch.',
        link: `/title/${movie.slug}`,
      },
    ]);
    // Many at once are one notification.
    for (const name of ['One', 'Two', 'Three', 'Four']) {
      await createMovie(name);
    }
    await round();
    const bens = await inbox(ben.cookie);
    expect(bens.items[0]).toMatchObject({
      title: '4 new titles',
      body: 'One, Two, Three and 1 more.',
      link: '/browse',
    });
    expect(bens.items).toHaveLength(2);
    expect(bens.unread).toBe(2);
  });

  it('makes a new key for browsers on request, which forgets the browsers', async () => {
    const anna = await register('Anna');
    const browser = push.browser();
    await subscribe(anna.cookie, {
      provider: 'WEB',
      subscription: browser.subscription,
      platform: 'web',
    }).expect(200);
    const before = (await http().get('/v1/push/config').expect(200)).body.web.publicKey as string;
    const renewed = await http().post('/v1/notifications/web-key/renew').set(admin()).expect(200);
    expect(renewed.body.web.publicKey).not.toBe(before);
    expect(await testApp.prisma.pushDevice.count()).toBe(0);
    await http().delete('/v1/notifications/firebase').set(admin()).expect(200);
  });
});
