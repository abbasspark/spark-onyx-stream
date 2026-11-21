// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of viewer accounts: what viewers do with their own account,
// how admins manage them, and playback that needs a signed-in viewer.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { MAX_FAILED_LOGINS } from '../src/auth/login-throttle.service.js';
import { hashToken } from '../src/auth/tokens.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { StatsModule } from '../src/stats/stats.module.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [AssetsModule, AdminsModule, CatalogModule, ViewersModule, StatsModule];
const ANNA = { email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' };

/** The session cookie a response set, as "name=value" for the Cookie header. */
function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

describe.skipIf(!TEST_DATABASE_URL)('Viewer accounts (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let env: Record<string, string>;

  const http = () => testApp.http();

  async function register(viewer = ANNA) {
    const response = await http().post('/v1/viewer/register').send(viewer).expect(201);
    return {
      id: response.body.viewer.id as string,
      token: response.body.token as string,
      cookie: cookieOf(response),
    };
  }

  async function signIn(email: string, password: string) {
    const response = await http().post('/v1/viewer/login').send({ email, password }).expect(200);
    return { token: response.body.token as string, cookie: cookieOf(response) };
  }

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-viewers-'));
    env = {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
    };
    testApp = await createTestApp(MODULES, env);
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp.resetDatabase();
    await testApp.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  describe('creating an account', () => {
    it('tells clients what is open on this installation', async () => {
      const config = await http().get('/v1/viewer/config').expect(200);
      expect(config.body).toEqual({
        registration: 'open',
        playback: 'open',
        email: false,
        verification: 'optional',
      });
    });

    it('creates the viewer, signs them in and never returns the password', async () => {
      const response = await http().post('/v1/viewer/register').send(ANNA).expect(201);

      expect(response.body.viewer).toEqual({
        id: expect.any(String),
        email: 'anna@example.com',
        displayName: 'Anna',
        emailVerified: false,
        createdAt: expect.any(String),
      });
      expect(response.body.token).toMatch(/^onyx_view_/);
      expect(JSON.stringify(response.body)).not.toContain('correct-horse');
      expect(response.headers['cache-control']).toBe('no-store');

      const stored = await testApp.prisma.viewer.findUniqueOrThrow({
        where: { email: ANNA.email },
      });
      expect(stored.passwordHash).not.toContain(ANNA.password);
      expect(stored.lastLoginAt).not.toBeNull();
    });

    it('sets a cookie that scripts and other websites cannot use', async () => {
      const response = await http().post('/v1/viewer/register').send(ANNA).expect(201);
      const cookie = (response.headers['set-cookie'] as unknown as string[])[0] as string;

      expect(cookie).toMatch(/^onyx_viewer=onyx_view_/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toMatch(/Expires=/);
      // Plain HTTP in this test. Over HTTPS the cookie is marked Secure.
      expect(cookie).not.toContain('Secure');
    });

    it('stores only a hash of the session token', async () => {
      const { token } = await register();
      const sessions = await testApp.prisma.viewerSession.findMany();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.tokenHash).toBe(hashToken(token));
      expect(JSON.stringify(sessions)).not.toContain(token);
    });

    it('refuses an email address that is taken, in any letter case', async () => {
      await register();
      const again = await http()
        .post('/v1/viewer/register')
        .send({ ...ANNA, email: 'ANNA@Example.com' })
        .expect(409);
      expect(again.body.message).toContain('already exists');
    });

    it('validates what is sent', async () => {
      const short = await http()
        .post('/v1/viewer/register')
        .send({ ...ANNA, password: 'short' })
        .expect(400);
      expect(JSON.stringify(short.body)).toContain('at least 8 characters');
      await http()
        .post('/v1/viewer/register')
        .send({ ...ANNA, email: 'not-an-email' })
        .expect(400);
      await http()
        .post('/v1/viewer/register')
        .send({ ...ANNA, displayName: '  ' })
        .expect(400);
      expect(await testApp.prisma.viewer.count()).toBe(0);
    });
  });

  describe('signing in', () => {
    it('accepts the cookie or the token, and nothing without them', async () => {
      await register();
      const { token, cookie } = await signIn('Anna@Example.com', ANNA.password);

      const byCookie = await http().get('/v1/viewer/me').set('Cookie', cookie).expect(200);
      expect(byCookie.body.email).toBe(ANNA.email);
      expect(byCookie.headers['cache-control']).toBe('no-store');
      await http().get('/v1/viewer/me').set(testApp.bearer(token)).expect(200);

      await http().get('/v1/viewer/me').expect(401);
      await http().get('/v1/viewer/me').set('Cookie', 'onyx_viewer=onyx_view_made-up').expect(401);

      // "session" answers the same question without an error for a visitor.
      const visitor = await http().get('/v1/viewer/session').expect(200);
      expect(visitor.body).toEqual({ viewer: null });
      expect(visitor.headers['cache-control']).toBe('no-store');
      const known = await http().get('/v1/viewer/session').set('Cookie', cookie).expect(200);
      expect(known.body.viewer).toMatchObject({ email: ANNA.email, displayName: 'Anna' });
      const forged = await http()
        .get('/v1/viewer/session')
        .set('Cookie', 'onyx_viewer=onyx_view_made-up')
        .expect(200);
      expect(forged.body).toEqual({ viewer: null });
    });

    it('gives the same answer for a wrong password and an unknown address', async () => {
      await register();
      const wrong = await http()
        .post('/v1/viewer/login')
        .send({ email: ANNA.email, password: 'not-the-password' })
        .expect(401);
      const unknown = await http()
        .post('/v1/viewer/login')
        .send({ email: 'nobody@example.com', password: 'not-the-password' })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('locks the address after repeated failures, even for the right password', async () => {
      await register();
      for (let attempt = 0; attempt < MAX_FAILED_LOGINS; attempt += 1) {
        await http()
          .post('/v1/viewer/login')
          .send({ email: ANNA.email, password: 'guess-number-one' })
          .expect(401);
      }
      const locked = await http()
        .post('/v1/viewer/login')
        .send({ email: ANNA.email, password: ANNA.password })
        .expect(429);
      expect(locked.body.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('keeps viewers and admins strictly apart', async () => {
      const ownerToken = await testApp.setupOwner();
      const viewer = await register();

      // An admin is not a viewer.
      await http().get('/v1/viewer/me').set(testApp.bearer(ownerToken)).expect(401);
      // A viewer opens nothing of the panel, whichever way the token is sent.
      await http().get('/v1/assets').set(testApp.bearer(viewer.token)).expect(401);
      await http().get('/v1/assets').set('Cookie', viewer.cookie).expect(401);
      await http().get('/v1/viewers').set(testApp.bearer(viewer.token)).expect(401);
      await http().get('/v1/auth/me').set(testApp.bearer(viewer.token)).expect(401);
    });

    it('signs out: the cookie is cleared and the token stops working', async () => {
      const { token, cookie } = await register();
      const out = await http().post('/v1/viewer/logout').set('Cookie', cookie).expect(204);
      expect((out.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^onyx_viewer=;/);

      await http().get('/v1/viewer/me').set('Cookie', cookie).expect(401);
      await http().get('/v1/viewer/me').set(testApp.bearer(token)).expect(401);
    });
  });

  describe('requests from other websites', () => {
    it('does not let another website act with the cookie', async () => {
      const { cookie } = await register();
      const change = () =>
        http().patch('/v1/viewer/me').set('Cookie', cookie).send({ displayName: 'Changed' });

      const refused = await change().set('Origin', 'https://evil.example').expect(403);
      expect(refused.body.message).toContain('did not come from this site');
      await http()
        .post('/v1/viewer/logout')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .expect(403);

      const me = await http().get('/v1/viewer/me').set('Cookie', cookie).expect(200);
      expect(me.body.displayName).toBe('Anna');
    });

    it('lets the site itself and apps through', async () => {
      const { cookie, token } = await register();

      // The website: the origin is the host the request went to.
      const own = await http()
        .patch('/v1/viewer/me')
        .set('Cookie', cookie)
        .set('Host', 'watch.example.org')
        .set('Origin', 'https://watch.example.org')
        .send({ displayName: 'Anna B.' })
        .expect(200);
      expect(own.body.displayName).toBe('Anna B.');

      // An app sends the token itself, which another website cannot do.
      await http()
        .patch('/v1/viewer/me')
        .set(testApp.bearer(token))
        .set('Origin', 'https://some-app.example')
        .send({ displayName: 'Anna C.' })
        .expect(200);
    });
  });

  describe('the viewer’s own account', () => {
    it('changes the password and signs out the other devices', async () => {
      const first = await register();
      const second = await signIn(ANNA.email, ANNA.password);

      await http()
        .post('/v1/viewer/password')
        .set(testApp.bearer(first.token))
        .send({ currentPassword: 'wrong-password', newPassword: 'another-horse' })
        .expect(400);
      await http()
        .post('/v1/viewer/password')
        .set(testApp.bearer(first.token))
        .send({ currentPassword: ANNA.password, newPassword: ANNA.password })
        .expect(400);
      await http()
        .post('/v1/viewer/password')
        .set(testApp.bearer(first.token))
        .send({ currentPassword: ANNA.password, newPassword: 'another-horse' })
        .expect(204);

      await http().get('/v1/viewer/me').set(testApp.bearer(first.token)).expect(200);
      await http().get('/v1/viewer/me').set(testApp.bearer(second.token)).expect(401);
      await http()
        .post('/v1/viewer/login')
        .send({ email: ANNA.email, password: ANNA.password })
        .expect(401);
      await signIn(ANNA.email, 'another-horse');
    });

    it('lists the devices and signs one of them out', async () => {
      const first = await register();
      await http()
        .post('/v1/viewer/login')
        .set('User-Agent', 'Living room TV')
        .send({ email: ANNA.email, password: ANNA.password })
        .expect(200);

      const list = await http()
        .get('/v1/viewer/sessions')
        .set(testApp.bearer(first.token))
        .expect(200);
      expect(list.body).toHaveLength(2);
      const tv = (list.body as { id: string; userAgent: string; current: boolean }[]).find(
        (session) => session.userAgent === 'Living room TV',
      );
      expect(tv?.current).toBe(false);
      expect((list.body as { current: boolean }[]).filter((item) => item.current)).toHaveLength(1);
      expect(JSON.stringify(list.body)).not.toContain('ipAddress');

      await http()
        .delete(`/v1/viewer/sessions/${tv?.id}`)
        .set(testApp.bearer(first.token))
        .expect(204);
      const after = await http()
        .get('/v1/viewer/sessions')
        .set(testApp.bearer(first.token))
        .expect(200);
      expect(after.body).toHaveLength(1);
    });

    it('cannot touch the session of someone else', async () => {
      const anna = await register();
      const ben = await register({ ...ANNA, email: 'ben@example.com', displayName: 'Ben' });
      const bensSession = await testApp.prisma.viewerSession.findFirstOrThrow({
        where: { viewerId: ben.id },
      });

      await http()
        .delete(`/v1/viewer/sessions/${bensSession.id}`)
        .set(testApp.bearer(anna.token))
        .expect(404);
      await http().get('/v1/viewer/me').set(testApp.bearer(ben.token)).expect(200);
    });

    it('deletes the account with everything stored about it, after asking for the password', async () => {
      const { token } = await register();
      await http()
        .post('/v1/viewer/delete')
        .set(testApp.bearer(token))
        .send({ password: 'wrong-password' })
        .expect(400);
      expect(await testApp.prisma.viewer.count()).toBe(1);

      await http()
        .post('/v1/viewer/delete')
        .set(testApp.bearer(token))
        .send({ password: ANNA.password })
        .expect(204);
      expect(await testApp.prisma.viewer.count()).toBe(0);
      expect(await testApp.prisma.viewerSession.count()).toBe(0);
      await http().get('/v1/viewer/me').set(testApp.bearer(token)).expect(401);
    });
  });

  describe('management by admins', () => {
    let ownerToken: string;
    const admin = () => testApp.bearer(ownerToken);

    beforeEach(async () => {
      ownerToken = await testApp.setupOwner();
    });

    it('lists, searches, filters and sorts viewers', async () => {
      await register();
      await register({
        email: 'ben@example.com',
        displayName: 'Ben Okafor',
        password: 'pass-word-1',
      });
      const created = await http()
        .post('/v1/viewers')
        .set(admin())
        .send({ email: 'Cleo@Example.com', displayName: 'Cleo', password: 'pass-word-2' })
        .expect(201);
      expect(created.body).toMatchObject({
        email: 'cleo@example.com',
        status: 'ACTIVE',
        lastLoginAt: null,
        activeSessions: 0,
      });
      expect(created.body).not.toHaveProperty('passwordHash');

      const names = async (query: string) =>
        (
          (await http().get(`/v1/viewers?${query}`).set(admin()).expect(200)).body.items as {
            displayName: string;
          }[]
        ).map((item) => item.displayName);

      expect(await names('sort=displayName&order=asc')).toEqual(['Anna', 'Ben Okafor', 'Cleo']);
      expect(await names('q=OKAFOR')).toEqual(['Ben Okafor']);
      expect(await names('q=cleo@')).toEqual(['Cleo']);
      // Cleo never signed in and comes last in both directions.
      expect((await names('sort=lastLoginAt&order=desc')).at(-1)).toBe('Cleo');
      expect((await names('sort=lastLoginAt&order=asc')).at(-1)).toBe('Cleo');

      await http()
        .patch(`/v1/viewers/${created.body.id}`)
        .set(admin())
        .send({ status: 'DISABLED' });
      expect(await names('status=DISABLED')).toEqual(['Cleo']);
      expect(await names('status=ACTIVE&sort=email&order=asc')).toEqual(['Anna', 'Ben Okafor']);

      const list = await http().get('/v1/viewers?sort=email&order=asc').set(admin()).expect(200);
      expect(list.body.total).toBe(3);
      expect(list.body.items[0]).toMatchObject({ email: ANNA.email, activeSessions: 1 });
    });

    it('shows a viewer with the devices they are signed in on', async () => {
      const anna = await register();
      const detail = await http().get(`/v1/viewers/${anna.id}`).set(admin()).expect(200);
      expect(detail.body).toMatchObject({ email: ANNA.email, activeSessions: 1 });
      expect(detail.body.sessions).toHaveLength(1);
      expect(detail.body.sessions[0]).toHaveProperty('ipAddress');
      expect(JSON.stringify(detail.body)).not.toContain('tokenHash');

      await http().get('/v1/viewers/01900000-0000-7000-8000-000000000000').set(admin()).expect(404);
      await http().get('/v1/viewers/not-an-id').set(admin()).expect(400);
    });

    it('disables a viewer, which signs them out at once, and enables them again', async () => {
      const anna = await register();
      const disabled = await http()
        .patch(`/v1/viewers/${anna.id}`)
        .set(admin())
        .send({ status: 'DISABLED' })
        .expect(200);
      expect(disabled.body).toMatchObject({ status: 'DISABLED', activeSessions: 0 });

      await http().get('/v1/viewer/me').set(testApp.bearer(anna.token)).expect(401);
      const refused = await http()
        .post('/v1/viewer/login')
        .send({ email: ANNA.email, password: ANNA.password })
        .expect(401);
      expect(refused.body.message).toBe('Email or password is incorrect');

      await http()
        .patch(`/v1/viewers/${anna.id}`)
        .set(admin())
        .send({ status: 'ACTIVE' })
        .expect(200);
      // The old session stays ended. The viewer signs in again.
      await http().get('/v1/viewer/me').set(testApp.bearer(anna.token)).expect(401);
      await signIn(ANNA.email, ANNA.password);
    });

    it('changes name and email, and refuses an address that is taken', async () => {
      const anna = await register();
      await register({ ...ANNA, email: 'ben@example.com' });

      const changed = await http()
        .patch(`/v1/viewers/${anna.id}`)
        .set(admin())
        .send({ displayName: 'Anna Berg', email: 'Anna.Berg@Example.com' })
        .expect(200);
      expect(changed.body).toMatchObject({
        displayName: 'Anna Berg',
        email: 'anna.berg@example.com',
        activeSessions: 1,
      });

      const taken = await http()
        .patch(`/v1/viewers/${anna.id}`)
        .set(admin())
        .send({ email: 'ben@example.com' })
        .expect(409);
      expect(taken.body.message).toContain('already uses this email');
      await http().patch(`/v1/viewers/${anna.id}`).set(admin()).send({}).expect(400);
    });

    it('sets a new password and signs the viewer out everywhere', async () => {
      const anna = await register();
      await http()
        .post(`/v1/viewers/${anna.id}/password`)
        .set(admin())
        .send({ newPassword: 'short' })
        .expect(400);
      await http()
        .post(`/v1/viewers/${anna.id}/password`)
        .set(admin())
        .send({ newPassword: 'chosen-by-admin' })
        .expect(204);

      await http().get('/v1/viewer/me').set(testApp.bearer(anna.token)).expect(401);
      await http()
        .post('/v1/viewer/login')
        .send({ email: ANNA.email, password: ANNA.password })
        .expect(401);
      await signIn(ANNA.email, 'chosen-by-admin');
    });

    it('signs a viewer out everywhere and deletes a viewer', async () => {
      const anna = await register();
      await signIn(ANNA.email, ANNA.password);

      const out = await http().post(`/v1/viewers/${anna.id}/sign-out`).set(admin()).expect(200);
      expect(out.body).toEqual({ sessionsEnded: 2 });
      await http().get('/v1/viewer/me').set(testApp.bearer(anna.token)).expect(401);

      await http().delete(`/v1/viewers/${anna.id}`).set(admin()).expect(204);
      await http().delete(`/v1/viewers/${anna.id}`).set(admin()).expect(404);
      expect(await testApp.prisma.viewer.count()).toBe(0);
    });

    it('is closed to editors and needs a sign-in', async () => {
      const anna = await register();
      await http()
        .post('/v1/admins')
        .set(admin())
        .send({
          email: 'editor@example.com',
          displayName: 'Editor',
          password: 'editor-password-1',
          role: 'EDITOR',
        })
        .expect(201);
      const editor = testApp.bearer(await testApp.login('editor@example.com', 'editor-password-1'));

      await http().get('/v1/viewers').set(editor).expect(403);
      await http().get(`/v1/viewers/${anna.id}`).set(editor).expect(403);
      await http().delete(`/v1/viewers/${anna.id}`).set(editor).expect(403);
      await http().get('/v1/viewers').expect(401);
    });

    it('records what admins did, without personal data', async () => {
      const anna = await register();
      await http().patch(`/v1/viewers/${anna.id}`).set(admin()).send({ status: 'DISABLED' });
      await http().patch(`/v1/viewers/${anna.id}`).set(admin()).send({ displayName: 'A.' });
      await http()
        .post(`/v1/viewers/${anna.id}/password`)
        .set(admin())
        .send({ newPassword: 'chosen-by-admin' });
      await http().delete(`/v1/viewers/${anna.id}`).set(admin());

      const entries = await testApp.prisma.auditLog.findMany({
        where: { entityType: 'Viewer' },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries.map((entry) => entry.action)).toEqual([
        'viewer.disable',
        'viewer.update',
        'viewer.password_reset',
        'viewer.delete',
      ]);
      expect(entries[0]?.metadata).toEqual({ changed: ['status'], sessionsEnded: 1 });
      const text = JSON.stringify(entries);
      expect(text).not.toContain(ANNA.email);
      expect(text).not.toContain('chosen-by-admin');
    });

    it('counts viewers for the dashboard', async () => {
      await register();
      await http()
        .post('/v1/viewers')
        .set(admin())
        .send({ email: 'cleo@example.com', displayName: 'Cleo', password: 'pass-word-2' })
        .expect(201);
      const stats = await http().get('/v1/stats/overview').set(admin()).expect(200);
      expect(stats.body.viewers).toEqual({ total: 2, newLast7Days: 2, activeLast30Days: 1 });
    });
  });

  describe('with registration closed', () => {
    let closedApp: TestApp;

    beforeAll(async () => {
      closedApp = await createTestApp(MODULES, { ...env, VIEWER_REGISTRATION: 'closed' });
    });

    afterAll(async () => {
      await closedApp.close();
    });

    it('lets only admins create viewers', async () => {
      const config = await closedApp.http().get('/v1/viewer/config').expect(200);
      expect(config.body.registration).toBe('closed');

      const refused = await closedApp.http().post('/v1/viewer/register').send(ANNA).expect(403);
      expect(refused.body.message).toContain('cannot be created');

      const ownerToken = await closedApp.setupOwner();
      await closedApp
        .http()
        .post('/v1/viewers')
        .set(closedApp.bearer(ownerToken))
        .send(ANNA)
        .expect(201);
      await closedApp
        .http()
        .post('/v1/viewer/login')
        .send({ email: ANNA.email, password: ANNA.password })
        .expect(200);
    });
  });

  describe('with playback for signed-in viewers only', () => {
    let gatedApp: TestApp;

    beforeAll(async () => {
      gatedApp = await createTestApp(MODULES, { ...env, CATALOG_PLAYBACK: 'viewers' });
    });

    afterAll(async () => {
      await gatedApp.close();
    });

    it('shows the catalog to everyone and plays only for viewers', async () => {
      const ownerToken = await gatedApp.setupOwner();
      const admin = gatedApp.bearer(ownerToken);
      const asset = await gatedApp.http().post('/v1/assets').set(admin).send({ title: 'Master' });
      const assetId = asset.body.asset.id as string;
      await gatedApp.prisma.asset.update({
        where: { id: assetId },
        data: { status: 'READY', manifestPath: `assets/${assetId}/hls/master.m3u8` },
      });
      const title = await gatedApp
        .http()
        .post('/v1/titles')
        .set(admin)
        .send({ type: 'MOVIE', name: 'Night Train' })
        .expect(201);
      await gatedApp.http().patch(`/v1/titles/${title.body.id}`).set(admin).send({ assetId });
      await gatedApp
        .http()
        .put(`/v1/titles/${title.body.id}/status`)
        .set(admin)
        .send({ status: 'PUBLISHED' })
        .expect(200);

      const config = await gatedApp.http().get('/v1/viewer/config').expect(200);
      expect(config.body.playback).toBe('viewers');
      await gatedApp.http().get('/v1/catalog/titles/night-train').expect(200);

      const play = () => gatedApp.http().post('/v1/catalog/titles/night-train/playback');
      const refused = await play().expect(401);
      expect(refused.body.message).toBe('Sign in to watch');
      // Being an admin is not being a viewer.
      await play().set(admin).expect(401);

      const signUp = await gatedApp.http().post('/v1/viewer/register').send(ANNA).expect(201);
      const byCookie = await play().set('Cookie', cookieOf(signUp)).expect(200);
      expect(byCookie.body.manifestUrl).toContain(`/v1/media/${assetId}/`);
      await play()
        .set(gatedApp.bearer(signUp.body.token as string))
        .expect(200);

      // A disabled viewer is signed out and cannot play.
      await gatedApp
        .http()
        .patch(`/v1/viewers/${signUp.body.viewer.id}`)
        .set(admin)
        .send({ status: 'DISABLED' })
        .expect(200);
      await play().set('Cookie', cookieOf(signUp)).expect(401);
    });
  });
});
