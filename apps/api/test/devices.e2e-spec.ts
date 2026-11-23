// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of devices: signing a television in with a code, and the
// list of apps a viewer is signed in on.
//
// Skipped unless TEST_DATABASE_URL is set.
import { AdminsModule } from '../src/admins/admins.module.js';
import { ApiKeysModule } from '../src/api-keys/api-keys.module.js';
import { DeviceCodesService } from '../src/viewers/device-codes.service.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const TV = {
  installationId: '5b0f6d0c-2f4e-4c1b-9d6a-3e7f8a9b0c1d',
  name: 'Living room TV',
  kind: 'TV',
  platform: 'android-tv',
  model: 'Chromecast with Google TV',
  appVersion: '1.4.0',
};
const PHONE = {
  installationId: 'phone-installation-0001',
  name: "Anna's phone",
  kind: 'MOBILE',
  platform: 'android',
};

describe.skipIf(!TEST_DATABASE_URL)('Devices (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let anna: { token: string; id: string };

  const http = () => testApp.http();
  const as = (token: string) => testApp.bearer(token);
  const signUp = async (email: string, device?: object) => {
    const response = await http()
      .post('/v1/viewer/register')
      .send({ email, displayName: email.split('@')[0], password: 'correct-horse', device })
      .expect(201);
    return { token: response.body.token as string, id: response.body.viewer.id as string };
  };
  const start = async (device: object = TV) =>
    (await http().post('/v1/viewer/device-codes').send({ device }).expect(201)).body as {
      deviceCode: string;
      userCode: string;
      verificationUrl: string;
      verificationUrlComplete: string;
      expiresIn: number;
      interval: number;
    };
  const poll = (deviceCode: string) =>
    http().post('/v1/viewer/device-codes/token').send({ deviceCode });
  /** Lets the device ask again at once, as if the seconds between had passed. */
  const wait = () => testApp.prisma.deviceCode.updateMany({ data: { lastPolledAt: null } });

  beforeAll(async () => {
    testApp = await createTestApp([AdminsModule, ApiKeysModule, ViewersModule], {
      SITE_URL: 'https://tv.example.com',
    });
  });
  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
    anna = await signUp('anna@example.com');
  });
  afterAll(async () => {
    await testApp?.close();
  });

  describe('signing in with a code', () => {
    it('gives the device a code to show and a secret to ask with', async () => {
      const started = await start();
      expect(started.userCode).toMatch(/^[CDFGHJKMNPQRTVWX34679]{4}-[CDFGHJKMNPQRTVWX34679]{4}$/);
      expect(started.deviceCode.length).toBeGreaterThanOrEqual(40);
      expect(started).toMatchObject({
        verificationUrl: 'https://tv.example.com/activate',
        verificationUrlComplete: `https://tv.example.com/activate?code=${started.userCode}`,
        expiresIn: 600,
        interval: 5,
      });
      // The secret is kept as a hash, the code without its hyphen.
      const stored = await testApp.prisma.deviceCode.findFirstOrThrow();
      expect(stored.deviceCodeHash).not.toContain(started.deviceCode);
      expect(stored.userCode).toBe(started.userCode.replace('-', ''));
      expect(stored.status).toBe('PENDING');
    });

    it('signs the device in once the viewer says yes', async () => {
      const started = await start();
      expect((await poll(started.deviceCode).expect(200)).body).toEqual({ status: 'pending' });

      // The viewer types the code, however they type it, and sees who asks.
      const typed = started.userCode.toLowerCase().replace('-', ' ');
      const request = await http()
        .get(`/v1/viewer/device-codes/${encodeURIComponent(typed)}`)
        .set(as(anna.token))
        .expect(200);
      expect(request.body).toMatchObject({
        userCode: started.userCode,
        device: {
          name: 'Living room TV',
          kind: 'TV',
          platform: 'android-tv',
          model: 'Chromecast with Google TV',
        },
      });
      await http()
        .post(`/v1/viewer/device-codes/${started.userCode}/approve`)
        .set(as(anna.token))
        .expect(200);

      await wait();
      const done = await poll(started.deviceCode).expect(200);
      expect(done.headers['cache-control']).toBe('no-store');
      expect(done.body).toMatchObject({
        status: 'approved',
        viewer: { id: anna.id, email: 'anna@example.com' },
        profile: { isMain: true },
        device: { name: 'Living room TV' },
      });
      expect(done.body.token).toMatch(/^onyx_/);

      // The token is a sign-in like any other, and it is known as that device.
      const me = await http().get('/v1/viewer/me').set(as(done.body.token)).expect(200);
      expect(me.body.id).toBe(anna.id);
      const devices = await http().get('/v1/viewer/devices').set(as(done.body.token)).expect(200);
      expect(devices.body).toMatchObject([
        {
          id: done.body.device.id,
          name: 'Living room TV',
          kind: 'TV',
          platform: 'android-tv',
          model: 'Chromecast with Google TV',
          appVersion: '1.4.0',
          signedIn: true,
          current: true,
        },
      ]);
      // From the browser it is somebody else's device.
      const fromBrowser = await http().get('/v1/viewer/devices').set(as(anna.token)).expect(200);
      expect(fromBrowser.body[0].current).toBe(false);
    });

    it('hands the sign-in out once', async () => {
      const started = await start();
      await http()
        .post(`/v1/viewer/device-codes/${started.userCode}/approve`)
        .set(as(anna.token))
        .expect(200);
      expect((await poll(started.deviceCode).expect(200)).body.status).toBe('approved');
      expect((await poll(started.deviceCode).expect(200)).body).toEqual({ status: 'expired' });
      // And the code cannot be answered a second time.
      await http()
        .post(`/v1/viewer/device-codes/${started.userCode}/approve`)
        .set(as(anna.token))
        .expect(404);
      expect(await testApp.prisma.viewerSession.count({ where: { deviceId: { not: null } } })).toBe(
        1,
      );
    });

    it('tells the device when the viewer says no', async () => {
      const started = await start();
      await http()
        .post(`/v1/viewer/device-codes/${started.userCode}/deny`)
        .set(as(anna.token))
        .expect(200);
      expect((await poll(started.deviceCode).expect(200)).body).toEqual({ status: 'denied' });
      // The first answer stands.
      await http()
        .post(`/v1/viewer/device-codes/${started.userCode}/approve`)
        .set(as(anna.token))
        .expect(404);
      expect(await testApp.prisma.viewerDevice.count()).toBe(0);
    });

    it('ends after ten minutes, for the device and for the viewer', async () => {
      const started = await start();
      await testApp.prisma.deviceCode.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await poll(started.deviceCode).expect(200)).body).toEqual({ status: 'expired' });
      const gone = await http()
        .get(`/v1/viewer/device-codes/${started.userCode}`)
        .set(as(anna.token))
        .expect(404);
      expect(gone.body.message).toMatch(/not valid/);
      await http()
        .post(`/v1/viewer/device-codes/${started.userCode}/approve`)
        .set(as(anna.token))
        .expect(404);
    });

    it('needs a signed-in viewer to answer, and says nothing about codes that do not exist', async () => {
      const started = await start();
      await http().get(`/v1/viewer/device-codes/${started.userCode}`).expect(401);
      await http().post(`/v1/viewer/device-codes/${started.userCode}/approve`).expect(401);
      // An admin is not a viewer.
      await http()
        .post(`/v1/viewer/device-codes/${started.userCode}/approve`)
        .set(as(ownerToken))
        .expect(401);
      for (const code of ['CDFG-HJKM', 'ABCD-EFGH', 'x', 'CDFGHJKMN']) {
        await http().get(`/v1/viewer/device-codes/${code}`).set(as(anna.token)).expect(404);
      }
      expect((await poll('a-secret-nobody-was-ever-given-0000')).body).toEqual({
        status: 'expired',
      });
    });

    it('tells a device that asks too often to slow down', async () => {
      const started = await start();
      await poll(started.deviceCode).expect(200);
      const hasty = await poll(started.deviceCode).expect(429);
      expect(hasty.body).toMatchObject({ code: 'slow_down', interval: 5 });
      await wait();
      await poll(started.deviceCode).expect(200);
    });

    it('does not sign a device in for a viewer who was disabled meanwhile', async () => {
      const started = await start();
      await http()
        .post(`/v1/viewer/device-codes/${started.userCode}/approve`)
        .set(as(anna.token))
        .expect(200);
      await testApp.prisma.viewer.update({ where: { id: anna.id }, data: { status: 'DISABLED' } });
      expect((await poll(started.deviceCode).expect(200)).body).toEqual({ status: 'expired' });
      expect(await testApp.prisma.viewerSession.count({ where: { deviceId: { not: null } } })).toBe(
        0,
      );
    });

    it('refuses a device that does not say what it is', async () => {
      await http().post('/v1/viewer/device-codes').send({}).expect(400);
      await http()
        .post('/v1/viewer/device-codes')
        .send({ device: { ...TV, installationId: 'short' } })
        .expect(400);
      await http()
        .post('/v1/viewer/device-codes')
        .send({ device: { ...TV, platform: 'Android TV' } })
        .expect(400);
      await http()
        .post('/v1/viewer/device-codes')
        .send({ device: { ...TV, name: '   ' } })
        .expect(400);
    });

    it('clears out codes that have been over for a day', async () => {
      await start();
      await start({ ...TV, installationId: 'another-television-01' });
      await testApp.prisma.deviceCode.updateMany({
        where: { installationId: TV.installationId },
        data: { expiresAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      });
      expect(await testApp.app.get(DeviceCodesService).prune()).toBe(1);
      expect(await testApp.prisma.deviceCode.count()).toBe(1);
    });
  });

  describe('devices of an account', () => {
    it('knows an app that signs in with a password as a device', async () => {
      const login = await http()
        .post('/v1/viewer/login')
        .send({ email: 'anna@example.com', password: 'correct-horse', device: PHONE })
        .expect(200);
      const sessions = await http()
        .get('/v1/viewer/sessions')
        .set(as(login.body.token))
        .expect(200);
      const mine = sessions.body.find((session: { current: boolean }) => session.current);
      expect(mine.device).toMatchObject({
        name: "Anna's phone",
        kind: 'MOBILE',
        platform: 'android',
      });
      // The browser the account was made in has no device.
      const other = sessions.body.find((session: { current: boolean }) => !session.current);
      expect(other.device).toBeNull();
    });

    it('stays the same device across sign-ins, and keeps the name the viewer gave it', async () => {
      const first = await http()
        .post('/v1/viewer/login')
        .send({ email: 'anna@example.com', password: 'correct-horse', device: PHONE })
        .expect(200);
      const [device] = (
        await http().get('/v1/viewer/devices').set(as(first.body.token)).expect(200)
      ).body;
      const renamed = await http()
        .patch(`/v1/viewer/devices/${device.id}`)
        .set(as(first.body.token))
        .send({ name: '  Work   phone ' })
        .expect(200);
      expect(renamed.body).toEqual({ id: device.id, name: 'Work phone' });

      await http().post('/v1/viewer/logout').set(as(first.body.token)).expect(204);
      const signedOut = (await http().get('/v1/viewer/devices').set(as(anna.token)).expect(200))
        .body;
      expect(signedOut).toMatchObject([{ id: device.id, name: 'Work phone', signedIn: false }]);

      // The app proposes its own name again and reports a newer version.
      const again = await http()
        .post('/v1/viewer/login')
        .send({
          email: 'anna@example.com',
          password: 'correct-horse',
          device: { ...PHONE, appVersion: '2.0.0' },
        })
        .expect(200);
      const after = (await http().get('/v1/viewer/devices').set(as(again.body.token)).expect(200))
        .body;
      expect(after).toMatchObject([
        { id: device.id, name: 'Work phone', appVersion: '2.0.0', signedIn: true, current: true },
      ]);
    });

    it('keeps the version of the app up to date from what the app says', async () => {
      const login = await http()
        .post('/v1/viewer/login')
        .send({ email: 'anna@example.com', password: 'correct-horse', device: PHONE })
        .expect(200);
      // Long enough ago for the next request to be noted.
      await testApp.prisma.viewerSession.updateMany({
        where: { deviceId: { not: null } },
        data: { lastUsedAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
      await http()
        .get('/v1/viewer/me')
        .set(as(login.body.token))
        .set('X-Onyx-Client', 'android/2.3.1')
        .expect(200);
      const stored = await testApp.prisma.viewerDevice.findFirstOrThrow();
      expect(stored.appVersion).toBe('2.3.1');
    });

    it('signs a device out when it is removed, and only the viewer it belongs to can', async () => {
      const login = await http()
        .post('/v1/viewer/login')
        .send({ email: 'anna@example.com', password: 'correct-horse', device: PHONE })
        .expect(200);
      const [device] = (await http().get('/v1/viewer/devices').set(as(anna.token)).expect(200))
        .body;

      const ben = await signUp('ben@example.com');
      await http().delete(`/v1/viewer/devices/${device.id}`).set(as(ben.token)).expect(404);
      await http()
        .patch(`/v1/viewer/devices/${device.id}`)
        .set(as(ben.token))
        .send({ name: 'Mine now' })
        .expect(404);
      expect((await http().get('/v1/viewer/devices').set(as(ben.token)).expect(200)).body).toEqual(
        [],
      );

      await http().delete(`/v1/viewer/devices/${device.id}`).set(as(anna.token)).expect(204);
      await http().get('/v1/viewer/me').set(as(login.body.token)).expect(401);
      expect((await http().get('/v1/viewer/devices').set(as(anna.token)).expect(200)).body).toEqual(
        [],
      );
      // The browser stays signed in.
      await http().get('/v1/viewer/me').set(as(anna.token)).expect(200);
    });

    it('forgets the devices unused for the longest when there are more than thirty', async () => {
      const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
      await testApp.prisma.viewerDevice.createMany({
        data: Array.from({ length: 30 }, (_, index) => ({
          viewerId: anna.id,
          installationId: `old-installation-${index}`,
          name: `Old device ${index}`,
          platform: 'android',
          lastSeenAt: new Date(old.getTime() + index * 1000),
        })),
      });
      await http()
        .post('/v1/viewer/login')
        .send({ email: 'anna@example.com', password: 'correct-horse', device: PHONE })
        .expect(200);
      const names = (
        await testApp.prisma.viewerDevice.findMany({ where: { viewerId: anna.id } })
      ).map((device) => device.name);
      expect(names).toHaveLength(30);
      expect(names).toContain("Anna's phone");
      expect(names).not.toContain('Old device 0');
      expect(names).toContain('Old device 1');
    });
  });

  describe('in the panel', () => {
    it('shows the devices of a viewer, and removes one', async () => {
      const login = await http()
        .post('/v1/viewer/login')
        .send({ email: 'anna@example.com', password: 'correct-horse', device: TV })
        .expect(200);
      const detail = await http().get(`/v1/viewers/${anna.id}`).set(as(ownerToken)).expect(200);
      expect(detail.body.devices).toMatchObject([
        { name: 'Living room TV', kind: 'TV', appVersion: '1.4.0', signedIn: true },
      ]);
      expect(detail.body.devices[0]).not.toHaveProperty('current');
      expect(
        detail.body.sessions.filter((session: { device: unknown }) => session.device !== null),
      ).toHaveLength(1);

      const deviceId = detail.body.devices[0].id as string;
      await http()
        .delete(`/v1/viewers/${anna.id}/devices/${deviceId}`)
        .set(as(ownerToken))
        .expect(204);
      await http().get('/v1/viewer/me').set(as(login.body.token)).expect(401);
      const entry = await testApp.prisma.auditLog.findFirst({
        where: { action: 'viewer.device_remove' },
      });
      expect(entry?.metadata).toEqual({ device: 'Living room TV' });
      await http()
        .delete(`/v1/viewers/${anna.id}/devices/${deviceId}`)
        .set(as(ownerToken))
        .expect(404);
    });
  });
});
