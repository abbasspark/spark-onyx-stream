// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the emails of viewer accounts: confirming an address,
// setting a new password, what admins can send, and playback that needs a
// confirmed address. Emails end in a list in memory.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AdminsModule } from '../src/admins/admins.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { hashToken } from '../src/auth/tokens.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { MaintenanceModule } from '../src/maintenance/maintenance.module.js';
import { MaintenanceService } from '../src/maintenance/maintenance.service.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MODULES = [AssetsModule, AdminsModule, CatalogModule, ViewersModule, MaintenanceModule];
const ANNA = { email: 'anna@example.com', displayName: 'Anna', password: 'correct-horse' };
const MAIL_ON = {
  SMTP_URL: 'smtps://mailer:secret-password@smtp.example.com:465',
  MAIL_FROM: 'Night Cinema <no-reply@example.com>',
  SITE_URL: 'https://watch.example.com',
  SITE_NAME: 'Night Cinema',
};

function cookieOf(response: Response): string {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((value) => value.startsWith('onyx_viewer='));
  if (!cookie) {
    throw new Error('The response set no session cookie');
  }
  return cookie.split(';')[0] as string;
}

/** The token in the link of an email, as the page the link opens would read it. */
function tokenIn(message: { text: string }, page: string): string {
  const match = new RegExp(
    `https://watch\\.example\\.com${page}#token=(onyx_mail_[A-Za-z0-9_-]+)`,
  ).exec(message.text);
  if (!match?.[1]) {
    throw new Error(`The email has no link to ${page}`);
  }
  return match[1];
}

describe.skipIf(!TEST_DATABASE_URL)('Viewer emails (e2e)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let env: Record<string, string>;

  const http = () => testApp.http();
  const outbox = async () => {
    await testApp.mailSettled();
    return testApp.mail.outbox;
  };

  async function register(app: TestApp = testApp, viewer = ANNA) {
    const response = await app.http().post('/v1/viewer/register').send(viewer).expect(201);
    await app.mailSettled();
    return { id: response.body.viewer.id as string, cookie: cookieOf(response) };
  }

  /** Makes the latest link of a viewer old enough for another email to be sent. */
  const ageLinks = (viewerId: string, seconds = 300) =>
    testApp.prisma.viewerToken.updateMany({
      where: { viewerId },
      data: { createdAt: new Date(Date.now() - seconds * 1000) },
    });

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-viewer-email-'));
    env = {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
    };
    testApp = await createTestApp(MODULES, { ...env, ...MAIL_ON });
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp.resetDatabase();
    await testApp.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  it('tells clients that email works', async () => {
    const config = await http().get('/v1/viewer/config').expect(200);
    expect(config.body).toMatchObject({ email: true, verification: 'optional' });
  });

  describe('confirming the address', () => {
    it('sends a link at sign-up that confirms the address once', async () => {
      const { id, cookie } = await register();

      const [message] = await outbox();
      expect(await outbox()).toHaveLength(1);
      expect(message).toMatchObject({
        from: 'Night Cinema <no-reply@example.com>',
        to: 'anna@example.com',
        subject: 'Confirm your email address for Night Cinema',
      });
      expect(message?.text).toContain('Hello Anna,');
      expect(message?.html).toContain('https://watch.example.com/verify-email#token=onyx_mail_');
      const token = tokenIn(message as { text: string }, '/verify-email');

      // Only a hash of the token is stored.
      const stored = await testApp.prisma.viewerToken.findFirstOrThrow({ where: { viewerId: id } });
      expect(stored.tokenHash).toBe(hashToken(token));
      expect(stored.kind).toBe('EMAIL_VERIFICATION');

      const me = () => http().get('/v1/viewer/me').set('Cookie', cookie).expect(200);
      expect((await me()).body.emailVerified).toBe(false);

      // No sign-in needed: the link is often opened on another device.
      const verified = await http().post('/v1/viewer/email/verify').send({ token }).expect(200);
      expect(verified.body).toEqual({ email: 'anna@example.com' });
      expect(verified.headers['cache-control']).toBe('no-store');
      expect((await me()).body.emailVerified).toBe(true);

      await http().post('/v1/viewer/email/verify').send({ token }).expect(400);
      expect(await testApp.prisma.viewerToken.count()).toBe(0);
    });

    it('sends the link again when asked, and only the latest link works', async () => {
      const { id, cookie } = await register();
      const first = tokenIn((await outbox())[0] as { text: string }, '/verify-email');

      // Right after the first email another one is refused.
      const tooSoon = await http().post('/v1/viewer/email/send').set('Cookie', cookie).expect(429);
      expect(tooSoon.body.retryAfterSeconds).toBeGreaterThan(0);
      expect(await outbox()).toHaveLength(1);

      await ageLinks(id);
      await http().post('/v1/viewer/email/send').set('Cookie', cookie).expect(204);
      const messages = await outbox();
      expect(messages).toHaveLength(2);
      const second = tokenIn(messages[1] as { text: string }, '/verify-email');

      await http().post('/v1/viewer/email/verify').send({ token: first }).expect(400);
      await http().post('/v1/viewer/email/verify').send({ token: second }).expect(200);

      // Nothing to confirm any more.
      await http().post('/v1/viewer/email/send').set('Cookie', cookie).expect(409);
    });

    it('needs a signed-in viewer from this site to send the link again', async () => {
      const { cookie } = await register();
      await http().post('/v1/viewer/email/send').expect(401);
      await http()
        .post('/v1/viewer/email/send')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .expect(403);
    });

    it('refuses links that are made up, expired, or of another kind', async () => {
      const { id } = await register();
      const token = tokenIn((await outbox())[0] as { text: string }, '/verify-email');
      const verify = (value: string) =>
        http().post('/v1/viewer/email/verify').send({ token: value });

      await verify('short').expect(400);
      await verify(`onyx_mail_${'x'.repeat(43)}`).expect(400);
      await verify(`onyx_view_${'x'.repeat(43)}`).expect(400);
      // A link to confirm an address does not set a password.
      await http()
        .post('/v1/viewer/password/reset')
        .send({ token, newPassword: 'another-horse' })
        .expect(400);

      await testApp.prisma.viewerToken.updateMany({
        where: { viewerId: id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await verify(token).expect(400);
      expect(expired.body.message).toBe(
        'This link has expired or was already used. Ask for a new one.',
      );
    });

    it('stops working when the address was changed after it was sent', async () => {
      const ownerToken = await testApp.setupOwner();
      const { id } = await register();
      const token = tokenIn((await outbox())[0] as { text: string }, '/verify-email');

      await http()
        .patch(`/v1/viewers/${id}`)
        .set(testApp.bearer(ownerToken))
        .send({ email: 'anna.new@example.com' })
        .expect(200);
      await http().post('/v1/viewer/email/verify').send({ token }).expect(400);
    });
  });

  describe('changing the address', () => {
    const NEW = 'anna.new@example.com';
    const ask = (cookie: string, body: object = { newEmail: NEW, password: ANNA.password }) =>
      http().post('/v1/viewer/email/change').set('Cookie', cookie).send(body);
    const me = (cookie: string) => http().get('/v1/viewer/me').set('Cookie', cookie).expect(200);

    it('sends a link to the new address, and changes nothing until it is opened', async () => {
      const { id, cookie } = await register();
      await ageLinks(id);
      const before = (await outbox()).length;

      const answer = await ask(cookie).expect(200);
      expect(answer.body).toEqual({ status: 'confirmation_sent', email: NEW });
      expect(answer.headers['cache-control']).toBe('no-store');

      const messages = await outbox();
      expect(messages).toHaveLength(before + 1);
      const message = messages[before] as { to: string; subject: string; text: string };
      expect(message.to).toBe(NEW);
      expect(message.subject).toBe('Confirm your new email address for Night Cinema');
      const token = tokenIn(message, '/confirm-email-change');

      // The token is stored as a hash, for the new address.
      const stored = await testApp.prisma.viewerToken.findFirstOrThrow({
        where: { viewerId: id, kind: 'EMAIL_CHANGE' },
      });
      expect(stored.tokenHash).toBe(hashToken(token));
      expect(stored.email).toBe(NEW);
      expect((await me(cookie)).body.email).toBe(ANNA.email);

      // Opened on another device: no sign-in needed.
      const done = await http().post('/v1/viewer/email/change/confirm').send({ token }).expect(200);
      expect(done.body).toEqual({ email: NEW });
      expect(done.headers['cache-control']).toBe('no-store');

      const after = (await me(cookie)).body;
      expect(after.email).toBe(NEW);
      expect(after.emailVerified).toBe(true);
      // Still signed in. The new address signs in, the old one does not.
      await http()
        .post('/v1/viewer/login')
        .send({ email: NEW, password: ANNA.password })
        .expect(200);
      await http()
        .post('/v1/viewer/login')
        .send({ email: ANNA.email, password: ANNA.password })
        .expect(401);

      // The old address hears of it.
      const notice = (await outbox()).at(-1) as { to: string; subject: string; text: string };
      expect(notice.to).toBe(ANNA.email);
      expect(notice.subject).toBe('The email address of your Night Cinema account was changed');
      expect(notice.text).toContain(NEW);

      // The link works once, and leaves no other links behind.
      await http().post('/v1/viewer/email/change/confirm').send({ token }).expect(400);
      expect(await testApp.prisma.viewerToken.count()).toBe(0);
    });

    it('needs the password, a new address, and a signed-in viewer', async () => {
      const { id, cookie } = await register();
      await ageLinks(id);
      const sent = (await outbox()).length;

      const wrong = await ask(cookie, { newEmail: NEW, password: 'not-the-password' }).expect(400);
      expect(wrong.body.message).toBe('Password is incorrect');
      await ask(cookie, { newEmail: ANNA.email, password: ANNA.password }).expect(400);
      await ask(cookie, { newEmail: 'not an address', password: ANNA.password }).expect(400);
      await ask(cookie, { newEmail: NEW }).expect(400);
      await http()
        .post('/v1/viewer/email/change')
        .send({ newEmail: NEW, password: ANNA.password })
        .expect(401);

      expect(await outbox()).toHaveLength(sent);
      expect(await testApp.prisma.viewerToken.count({ where: { kind: 'EMAIL_CHANGE' } })).toBe(0);
    });

    it('does not take an address another viewer uses, when asking or when confirming', async () => {
      const anna = await register();
      await register(testApp, {
        email: 'bea@example.com',
        displayName: 'Bea',
        password: 'correct-horse',
      });
      await ageLinks(anna.id);

      const taken = await ask(anna.cookie, {
        newEmail: 'bea@example.com',
        password: ANNA.password,
      }).expect(409);
      expect(taken.body.message).toBe('Another viewer already uses this email address');

      // Free when asked for, taken before the link is opened.
      await ask(anna.cookie).expect(200);
      const token = tokenIn((await outbox()).at(-1) as { text: string }, '/confirm-email-change');
      await register(testApp, { email: NEW, displayName: 'Cy', password: 'correct-horse' });
      await http().post('/v1/viewer/email/change/confirm').send({ token }).expect(409);
      expect((await me(anna.cookie)).body.email).toBe(ANNA.email);
    });

    it('sends one link at a time, and only the latest works', async () => {
      const { id, cookie } = await register();
      await ageLinks(id);
      await ask(cookie).expect(200);
      const first = tokenIn((await outbox()).at(-1) as { text: string }, '/confirm-email-change');

      const tooSoon = await ask(cookie, {
        newEmail: 'other@example.com',
        password: ANNA.password,
      }).expect(429);
      expect(tooSoon.body.code).toBe('mail_recently_sent');

      await ageLinks(id);
      await ask(cookie, { newEmail: 'other@example.com', password: ANNA.password }).expect(200);
      const second = tokenIn((await outbox()).at(-1) as { text: string }, '/confirm-email-change');

      await http().post('/v1/viewer/email/change/confirm').send({ token: first }).expect(400);
      const done = await http()
        .post('/v1/viewer/email/change/confirm')
        .send({ token: second })
        .expect(200);
      expect(done.body.email).toBe('other@example.com');
    });

    it('refuses a link that expired, is made up, or is of another kind', async () => {
      const { id, cookie } = await register();
      await ageLinks(id);
      await ask(cookie).expect(200);
      const token = tokenIn((await outbox()).at(-1) as { text: string }, '/confirm-email-change');
      const confirm = (value: string) =>
        http().post('/v1/viewer/email/change/confirm').send({ token: value });

      await confirm('onyx_mail_' + 'x'.repeat(40)).expect(400);
      await confirm('short').expect(400);

      // A link to confirm an address is not a link to change it, and the other way round.
      const verification = tokenIn((await outbox())[0] as { text: string }, '/verify-email');
      await confirm(verification).expect(400);
      await http().post('/v1/viewer/email/verify').send({ token }).expect(400);

      await testApp.prisma.viewerToken.updateMany({
        where: { viewerId: id, kind: 'EMAIL_CHANGE' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await confirm(token).expect(400);
      expect((await me(cookie)).body.email).toBe(ANNA.email);
    });
  });

  describe('forgot password', () => {
    const forgot = (email: string) => http().post('/v1/viewer/password/forgot').send({ email });

    it('answers the same for a known and an unknown address', async () => {
      await register();
      testApp.mail.clear();

      const known = await forgot(ANNA.email).expect(204);
      const unknown = await forgot('nobody@example.com').expect(204);
      expect(known.body).toEqual(unknown.body);

      const messages = await outbox();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        to: 'anna@example.com',
        subject: 'Set a new password for Night Cinema',
      });
      expect(messages[0]?.text).toContain('The link works once, for 1 hour.');
    });

    it('sets the new password, signs out everywhere and tells the viewer', async () => {
      const { id, cookie } = await register();
      testApp.mail.clear();
      await forgot('Anna@Example.com').expect(204);
      const token = tokenIn((await outbox())[0] as { text: string }, '/reset-password');

      await http()
        .post('/v1/viewer/password/reset')
        .send({ token, newPassword: 'short' })
        .expect(400);
      await http()
        .post('/v1/viewer/password/reset')
        .send({ token, newPassword: 'another-horse' })
        .expect(204);

      // The old session is over, the old password too.
      await http().get('/v1/viewer/me').set('Cookie', cookie).expect(401);
      await http().post('/v1/viewer/login').send(ANNA).expect(401);
      const signedIn = await http()
        .post('/v1/viewer/login')
        .send({ email: ANNA.email, password: 'another-horse' })
        .expect(200);
      // Whoever used the link reads the mail of this address.
      expect(signedIn.body.viewer.emailVerified).toBe(true);

      const messages = await outbox();
      expect(messages.at(-1)).toMatchObject({
        to: 'anna@example.com',
        subject: 'Your password for Night Cinema was changed',
      });
      expect(JSON.stringify(messages)).not.toContain('another-horse');

      // The link worked once.
      await http()
        .post('/v1/viewer/password/reset')
        .send({ token, newPassword: 'third-horse-here' })
        .expect(400);
      expect(await testApp.prisma.viewerToken.count({ where: { viewerId: id } })).toBe(0);
    });

    it('does not fill an inbox: one email per viewer in a short time', async () => {
      const { id } = await register();
      testApp.mail.clear();

      await forgot(ANNA.email).expect(204);
      await forgot(ANNA.email).expect(204);
      await forgot(ANNA.email).expect(204);
      expect(await outbox()).toHaveLength(1);

      await ageLinks(id);
      await forgot(ANNA.email).expect(204);
      expect(await outbox()).toHaveLength(2);
    });

    it('limits how often one address may ask', async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await forgot(`someone${attempt}@example.com`).expect(204);
      }
      const refused = await forgot('someone9@example.com').expect(429);
      expect(refused.headers['retry-after']).toBeDefined();
    });

    it('sends nothing to a disabled account', async () => {
      const ownerToken = await testApp.setupOwner();
      const { id } = await register();
      testApp.mail.clear();
      await http()
        .patch(`/v1/viewers/${id}`)
        .set(testApp.bearer(ownerToken))
        .send({ status: 'DISABLED' })
        .expect(200);

      await forgot(ANNA.email).expect(204);
      expect(await outbox()).toHaveLength(0);
    });

    it('checks what is sent', async () => {
      await http().post('/v1/viewer/password/forgot').send({}).expect(400);
      await forgot('not-an-address').expect(400);
      await http().post('/v1/viewer/password/reset').send({ token: 'x' }).expect(400);
    });
  });

  describe('a mail server that is down', () => {
    it('does not break sign-up, and is tried again', async () => {
      testApp.mail.failWith = 'connect ECONNREFUSED 203.0.113.5:465';
      const response = await http().post('/v1/viewer/register').send(ANNA).expect(201);
      expect(response.body.viewer.email).toBe(ANNA.email);
      await testApp.mailSettled();
      expect(testApp.mail.outbox).toHaveLength(0);

      const ownerToken = await testApp.setupOwner();
      const status = await http().get('/v1/mail').set(testApp.bearer(ownerToken)).expect(200);
      expect(status.body.lastDelivery.error).toBe('connect ECONNREFUSED 203.0.113.5:465');
    });
  });

  describe('for admins', () => {
    let ownerToken: string;
    const admin = () => testApp.bearer(ownerToken);

    beforeEach(async () => {
      ownerToken = await testApp.setupOwner();
    });

    it('shows how email is set up without the password of the mail server', async () => {
      const status = await http().get('/v1/mail').set(admin()).expect(200);
      expect(status.body).toEqual({
        // What this process sent last, which earlier tests decide.
        lastDelivery: expect.toSatisfy(
          (value: unknown) => value === null || typeof value === 'object',
        ),
        enabled: true,
        server: { host: 'smtp.example.com', port: 465, secure: true, user: 'mailer' },
        from: 'Night Cinema <no-reply@example.com>',
        siteUrl: 'https://watch.example.com',
        siteName: 'Night Cinema',
        verification: 'optional',
      });
      expect(JSON.stringify(status.body)).not.toContain('secret-password');
      await http().get('/v1/mail').expect(401);
    });

    it('sends a test email and reports what the mail server said', async () => {
      await http().post('/v1/mail/test').set(admin()).send({ to: 'abbas@example.com' }).expect(204);
      expect(testApp.mail.outbox[0]).toMatchObject({
        to: 'abbas@example.com',
        subject: 'Test email from Night Cinema',
      });
      const ok = await http().get('/v1/mail').set(admin()).expect(200);
      expect(ok.body.lastDelivery).toEqual({ at: expect.any(String), error: null });

      testApp.mail.failWith = 'Invalid login: 535 Authentication failed';
      const failed = await http()
        .post('/v1/mail/test')
        .set(admin())
        .send({ to: 'abbas@example.com' })
        .expect(502);
      expect(failed.body.message).toBe(
        'The mail server did not take the message: Invalid login: 535 Authentication failed',
      );

      await http().post('/v1/mail/test').set(admin()).send({ to: 'nope' }).expect(400);

      // The audit log names the test, not the address.
      const entry = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'mail.test' },
      });
      expect(JSON.stringify(entry)).not.toContain('abbas@example.com');
    });

    it('creates a viewer whose address counts as confirmed, unless told otherwise', async () => {
      const vouched = await http().post('/v1/viewers').set(admin()).send(ANNA).expect(201);
      expect(vouched.body.emailVerifiedAt).toEqual(expect.any(String));

      const open = await http()
        .post('/v1/viewers')
        .set(admin())
        .send({ ...ANNA, email: 'ben@example.com', emailVerified: false })
        .expect(201);
      expect(open.body.emailVerifiedAt).toBeNull();
      // Creating a viewer in the panel sends nothing by itself.
      expect(await outbox()).toHaveLength(0);
    });

    it('marks an address as confirmed or not, and a new address as not confirmed', async () => {
      const { id } = await register();
      const patch = (body: Record<string, unknown>) =>
        http().patch(`/v1/viewers/${id}`).set(admin()).send(body).expect(200);

      expect((await patch({ emailVerified: true })).body.emailVerifiedAt).toEqual(
        expect.any(String),
      );
      const changed = await patch({ email: 'anna.new@example.com' });
      expect(changed.body.emailVerifiedAt).toBeNull();
      const vouched = await patch({ email: 'anna@example.com', emailVerified: true });
      expect(vouched.body.emailVerifiedAt).toEqual(expect.any(String));
      expect((await patch({ emailVerified: false })).body.emailVerifiedAt).toBeNull();

      const entries = await testApp.prisma.auditLog.findMany({
        where: { action: 'viewer.update', entityId: id },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries.map((entry) => (entry.metadata as { changed: string[] }).changed)).toEqual([
        ['emailVerified'],
        ['email', 'emailVerified'],
        ['email', 'emailVerified'],
        ['emailVerified'],
      ]);
    });

    it('emails a viewer the link for a new password or to confirm', async () => {
      const { id } = await register();
      testApp.mail.clear();
      await ageLinks(id);

      await http().post(`/v1/viewers/${id}/password-email`).set(admin()).expect(204);
      await http().post(`/v1/viewers/${id}/verification-email`).set(admin()).expect(204);
      const subjects = (await outbox()).map((message) => message.subject);
      expect(subjects).toEqual([
        'Set a new password for Night Cinema',
        'Confirm your email address for Night Cinema',
      ]);

      // Sent a moment ago: the admin is told, unlike a stranger who asks.
      await http().post(`/v1/viewers/${id}/password-email`).set(admin()).expect(429);

      const actions = (await testApp.prisma.auditLog.findMany({ where: { entityId: id } })).map(
        (entry) => entry.action,
      );
      expect(actions).toEqual(
        expect.arrayContaining(['viewer.password_email', 'viewer.verification_email']),
      );

      await http()
        .post('/v1/viewers/00000000-0000-7000-8000-000000000000/password-email')
        .set(admin())
        .expect(404);
      await http().post(`/v1/viewers/${id}/password-email`).expect(401);
    });
  });

  describe('cleaning up', () => {
    it('deletes links that expired', async () => {
      const { id } = await register();
      const maintenance = testApp.app.get(MaintenanceService);
      expect(await maintenance.purgeExpiredViewerTokens()).toBe(0);

      await testApp.prisma.viewerToken.updateMany({
        where: { viewerId: id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await maintenance.purgeExpiredViewerTokens()).toBe(1);
      expect(await testApp.prisma.viewerToken.count()).toBe(0);
    });

    it('deletes the links with the account', async () => {
      const { cookie } = await register();
      await http()
        .post('/v1/viewer/delete')
        .set('Cookie', cookie)
        .send({ password: ANNA.password })
        .expect(204);
      expect(await testApp.prisma.viewerToken.count()).toBe(0);
    });
  });

  describe('with email off', () => {
    let plainApp: TestApp;

    beforeAll(async () => {
      plainApp = await createTestApp(MODULES, env);
    });

    afterAll(async () => {
      await plainApp.close();
    });

    it('changes the address at once, unconfirmed, when email is off', async () => {
      const { cookie } = await register(plainApp);
      const ask = (body: object) =>
        plainApp.http().post('/v1/viewer/email/change').set('Cookie', cookie).send(body);

      await ask({ newEmail: 'anna.new@example.com', password: 'wrong-password' }).expect(400);
      const answer = await ask({
        newEmail: 'anna.new@example.com',
        password: ANNA.password,
      }).expect(200);
      expect(answer.body).toEqual({ status: 'changed', email: 'anna.new@example.com' });

      const me = await plainApp.http().get('/v1/viewer/me').set('Cookie', cookie).expect(200);
      expect(me.body).toMatchObject({ email: 'anna.new@example.com', emailVerified: false });
      expect(plainApp.mail.outbox).toHaveLength(0);
      await plainApp.resetDatabase();
    });

    it('says so, sends nothing, and still creates accounts', async () => {
      const config = await plainApp.http().get('/v1/viewer/config').expect(200);
      expect(config.body).toMatchObject({ email: false, verification: 'optional' });

      const { id, cookie } = await register(plainApp);
      expect(plainApp.mail.outbox).toHaveLength(0);
      expect(await plainApp.prisma.viewerToken.count()).toBe(0);

      const refused = await plainApp
        .http()
        .post('/v1/viewer/password/forgot')
        .send({ email: ANNA.email })
        .expect(503);
      expect(refused.body.message).toBe('Email is not set up on this site');
      await plainApp.http().post('/v1/viewer/email/send').set('Cookie', cookie).expect(503);

      const ownerToken = await plainApp.setupOwner();
      const status = await plainApp
        .http()
        .get('/v1/mail')
        .set(plainApp.bearer(ownerToken))
        .expect(200);
      expect(status.body).toMatchObject({ enabled: false, server: null, from: null });
      await plainApp
        .http()
        .post('/v1/mail/test')
        .set(plainApp.bearer(ownerToken))
        .send({ to: 'abbas@example.com' })
        .expect(409);
      await plainApp
        .http()
        .post(`/v1/viewers/${id}/password-email`)
        .set(plainApp.bearer(ownerToken))
        .expect(503);
    });
  });

  describe('when watching needs a confirmed address', () => {
    let strictApp: TestApp;

    beforeAll(async () => {
      strictApp = await createTestApp(MODULES, {
        ...env,
        ...MAIL_ON,
        CATALOG_PLAYBACK: 'viewers',
        VIEWER_EMAIL_VERIFICATION: 'required',
      });
    });

    afterAll(async () => {
      await strictApp.close();
    });

    it('lets a viewer watch only after they confirmed', async () => {
      const ownerToken = await strictApp.setupOwner();
      const admin = strictApp.bearer(ownerToken);
      const created = await strictApp
        .http()
        .post('/v1/titles')
        .set(admin)
        .send({ type: 'MOVIE', name: 'Night Train' })
        .expect(201);
      const asset = await strictApp
        .http()
        .post('/v1/assets')
        .set(admin)
        .send({ title: 'Night Train master' })
        .expect(201);
      const assetId = asset.body.asset.id as string;
      await strictApp.prisma.asset.update({
        where: { id: assetId },
        data: { status: 'READY', manifestPath: `assets/${assetId}/hls/master.m3u8` },
      });
      await strictApp
        .http()
        .patch(`/v1/titles/${created.body.id}`)
        .set(admin)
        .send({ assetId })
        .expect(200);
      await strictApp
        .http()
        .put(`/v1/titles/${created.body.id}/status`)
        .set(admin)
        .send({ status: 'PUBLISHED' })
        .expect(200);
      const play = (cookie?: string) => {
        const request = strictApp.http().post(`/v1/catalog/titles/${created.body.slug}/playback`);
        return cookie ? request.set('Cookie', cookie) : request;
      };

      expect((await strictApp.http().get('/v1/viewer/config').expect(200)).body).toMatchObject({
        playback: 'viewers',
        verification: 'required',
      });
      await play().expect(401);

      const { cookie } = await register(strictApp);
      const refused = await play(cookie).expect(403);
      expect(refused.body).toMatchObject({
        message: 'Confirm your email address to watch',
        code: 'email_unverified',
      });

      const token = tokenIn(strictApp.mail.outbox[0] as { text: string }, '/verify-email');
      await strictApp.http().post('/v1/viewer/email/verify').send({ token }).expect(200);
      const allowed = await play(cookie).expect(200);
      expect(allowed.body.manifestUrl ?? allowed.body.hls ?? allowed.body).toBeTruthy();

      await strictApp.resetDatabase();
    });
  });
});
