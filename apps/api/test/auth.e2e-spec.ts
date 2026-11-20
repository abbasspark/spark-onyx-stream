// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of authentication, admin management, API keys and the
// audit log against a real PostgreSQL database.
//
// They run only when TEST_DATABASE_URL is set, and they delete all admin data
// in that database. See the README for how to prepare it.
import { AdminsModule } from '../src/admins/admins.module.js';
import { ApiKeysModule } from '../src/api-keys/api-keys.module.js';
import { MAX_FAILED_LOGINS } from '../src/auth/login-throttle.service.js';
import { createTestApp, OWNER, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const EDITOR = {
  email: 'editor@example.com',
  displayName: 'Eddie Editor',
  password: 'editor-password-123',
  role: 'EDITOR',
};

describe.skipIf(!TEST_DATABASE_URL)('Authentication (e2e, real database)', () => {
  let testApp: TestApp;

  const http = () => testApp.http();
  const bearer = (token: string) => testApp.bearer(token);
  const login = (email: string, password: string) => testApp.login(email, password);

  beforeAll(async () => {
    testApp = await createTestApp([AdminsModule, ApiKeysModule]);
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp?.close();
  });

  describe('first-run setup', () => {
    it('is required on an empty installation and creates the owner once', async () => {
      await http().get('/v1/auth/setup').expect(200, { required: true });

      const created = await http().post('/v1/auth/setup').send(OWNER).expect(201);
      expect(created.body).toMatchObject({ email: OWNER.email, role: 'OWNER', isActive: true });
      expect(created.body).not.toHaveProperty('passwordHash');

      await http().get('/v1/auth/setup').expect(200, { required: false });
      await http()
        .post('/v1/auth/setup')
        .send({ ...OWNER, email: 'second@example.com' })
        .expect(409);
    });

    it('rejects a short password and an invalid email with field details', async () => {
      const response = await http()
        .post('/v1/auth/setup')
        .send({ email: 'not-an-email', displayName: 'X', password: 'short' })
        .expect(400);

      const fields = response.body.issues.map((issue: { field: string }) => issue.field);
      expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
    });
  });

  describe('sessions', () => {
    beforeEach(async () => {
      await http().post('/v1/auth/setup').send(OWNER).expect(201);
    });

    it('rejects requests without credentials', async () => {
      await http().get('/v1/auth/me').expect(401);
      await http().get('/v1/admins').expect(401);
      await http().get('/v1/auth/me').set(bearer('not-a-real-token')).expect(401);
    });

    it('signs in, identifies the caller and signs out', async () => {
      const token = await login(OWNER.email, OWNER.password);

      const me = await http().get('/v1/auth/me').set(bearer(token)).expect(200);
      expect(me.body).toMatchObject({ type: 'admin', email: OWNER.email, role: 'OWNER' });
      expect(me.body.permissions).toContain('admins:write');

      await http().post('/v1/auth/logout').set(bearer(token)).expect(204);
      await http().get('/v1/auth/me').set(bearer(token)).expect(401);
    });

    it('accepts the email in any letter case', async () => {
      await login('OWNER@Example.com', OWNER.password);
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const wrongPassword = await http()
        .post('/v1/auth/login')
        .send({ email: OWNER.email, password: 'wrong-password-123' })
        .expect(401);
      const unknownEmail = await http()
        .post('/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password-123' })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('stores only a hash of the session token', async () => {
      const token = await login(OWNER.email, OWNER.password);

      const sessions = await testApp.prisma.adminSession.findMany();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.tokenHash).not.toBe(token);
      expect(JSON.stringify(sessions)).not.toContain(token);
    });

    it('locks sign-in after repeated failures, even with the right password', async () => {
      for (let attempt = 0; attempt < MAX_FAILED_LOGINS; attempt += 1) {
        await http()
          .post('/v1/auth/login')
          .send({ email: OWNER.email, password: 'wrong-password-123' })
          .expect(401);
      }

      const blocked = await http()
        .post('/v1/auth/login')
        .send({ email: OWNER.email, password: OWNER.password })
        .expect(429);
      expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('changes the password and signs out the other sessions', async () => {
      const first = await login(OWNER.email, OWNER.password);
      const second = await login(OWNER.email, OWNER.password);
      const newPassword = 'a-brand-new-password-456';

      await http()
        .post('/v1/auth/password')
        .set(bearer(first))
        .send({ currentPassword: 'wrong-password-123', newPassword })
        .expect(400);

      await http()
        .post('/v1/auth/password')
        .set(bearer(first))
        .send({ currentPassword: OWNER.password, newPassword })
        .expect(204);

      await http().get('/v1/auth/me').set(bearer(first)).expect(200);
      await http().get('/v1/auth/me').set(bearer(second)).expect(401);
      await http()
        .post('/v1/auth/login')
        .send({ email: OWNER.email, password: OWNER.password })
        .expect(401);
      await login(OWNER.email, newPassword);
    });
  });

  describe('admin management', () => {
    let ownerToken: string;

    beforeEach(async () => {
      await http().post('/v1/auth/setup').send(OWNER).expect(201);
      ownerToken = await login(OWNER.email, OWNER.password);
    });

    it('creates an admin and rejects a duplicate email', async () => {
      const created = await http()
        .post('/v1/admins')
        .set(bearer(ownerToken))
        .send(EDITOR)
        .expect(201);
      expect(created.body).toMatchObject({ email: EDITOR.email, role: 'EDITOR' });
      expect(created.body).not.toHaveProperty('passwordHash');

      await http().post('/v1/admins').set(bearer(ownerToken)).send(EDITOR).expect(409);

      const list = await http().get('/v1/admins').set(bearer(ownerToken)).expect(200);
      expect(list.body.total).toBe(2);
      expect(JSON.stringify(list.body)).not.toContain('passwordHash');
    });

    it('keeps editors out of admin management', async () => {
      await http().post('/v1/admins').set(bearer(ownerToken)).send(EDITOR).expect(201);
      const editorToken = await login(EDITOR.email, EDITOR.password);

      await http().get('/v1/admins').set(bearer(editorToken)).expect(403);
      await http()
        .post('/v1/admins')
        .set(bearer(editorToken))
        .send({ ...EDITOR, email: 'another@example.com' })
        .expect(403);
      await http().get('/v1/audit-logs').set(bearer(editorToken)).expect(403);
    });

    it('lets only an owner create or change an owner', async () => {
      const adminAccount = {
        email: 'admin@example.com',
        displayName: 'Ada Admin',
        password: 'admin-password-123',
        role: 'ADMIN',
      };
      await http().post('/v1/admins').set(bearer(ownerToken)).send(adminAccount).expect(201);
      const adminToken = await login(adminAccount.email, adminAccount.password);
      const owner = await testApp.prisma.adminUser.findUniqueOrThrow({
        where: { email: OWNER.email },
      });

      await http()
        .post('/v1/admins')
        .set(bearer(adminToken))
        .send({ ...EDITOR, role: 'OWNER' })
        .expect(403);
      await http()
        .patch(`/v1/admins/${owner.id}`)
        .set(bearer(adminToken))
        .send({ role: 'VIEWER' })
        .expect(403);
      await http().delete(`/v1/admins/${owner.id}`).set(bearer(adminToken)).expect(403);
    });

    it('stops admins from deactivating or demoting themselves', async () => {
      const owner = await testApp.prisma.adminUser.findUniqueOrThrow({
        where: { email: OWNER.email },
      });

      await http().delete(`/v1/admins/${owner.id}`).set(bearer(ownerToken)).expect(403);
      await http()
        .patch(`/v1/admins/${owner.id}`)
        .set(bearer(ownerToken))
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('signs an admin out when they are deactivated', async () => {
      const created = await http()
        .post('/v1/admins')
        .set(bearer(ownerToken))
        .send(EDITOR)
        .expect(201);
      const editorToken = await login(EDITOR.email, EDITOR.password);
      await http().get('/v1/auth/me').set(bearer(editorToken)).expect(200);

      const deactivated = await http()
        .delete(`/v1/admins/${created.body.id}`)
        .set(bearer(ownerToken))
        .expect(200);
      expect(deactivated.body.isActive).toBe(false);

      await http().get('/v1/auth/me').set(bearer(editorToken)).expect(401);
      await http()
        .post('/v1/auth/login')
        .send({ email: EDITOR.email, password: EDITOR.password })
        .expect(401);
    });

    it('returns 404 for an unknown admin and 400 for a malformed id', async () => {
      await http()
        .get('/v1/admins/019a0000-0000-7000-8000-000000000000')
        .set(bearer(ownerToken))
        .expect(404);
      await http().get('/v1/admins/not-a-uuid').set(bearer(ownerToken)).expect(400);
    });
  });

  describe('API keys', () => {
    let ownerToken: string;

    beforeEach(async () => {
      await http().post('/v1/auth/setup').send(OWNER).expect(201);
      ownerToken = await login(OWNER.email, OWNER.password);
    });

    it('creates a key that works with its scopes and nothing more', async () => {
      const created = await http()
        .post('/v1/api-keys')
        .set(bearer(ownerToken))
        .send({ name: 'CI', scopes: ['admins:read'] })
        .expect(201);
      const key = created.body.key as string;
      expect(key.startsWith(created.body.prefix)).toBe(true);

      const me = await http().get('/v1/auth/me').set(bearer(key)).expect(200);
      expect(me.body).toMatchObject({ type: 'apiKey', name: 'CI', permissions: ['admins:read'] });

      await http().get('/v1/admins').set(bearer(key)).expect(200);
      await http().get('/v1/api-keys').set(bearer(key)).expect(403);
      await http().post('/v1/admins').set(bearer(key)).send(EDITOR).expect(403);
      await http().post('/v1/auth/logout').set(bearer(key)).expect(403);
    });

    it('never returns or stores the key after creation', async () => {
      const created = await http()
        .post('/v1/api-keys')
        .set(bearer(ownerToken))
        .send({ name: 'CI', scopes: ['assets:read'] })
        .expect(201);

      const list = await http().get('/v1/api-keys').set(bearer(ownerToken)).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).not.toHaveProperty('key');
      expect(list.body[0]).not.toHaveProperty('keyHash');

      const stored = await testApp.prisma.apiKey.findMany();
      expect(JSON.stringify(stored)).not.toContain(created.body.key);
    });

    it('refuses scopes that cannot be delegated', async () => {
      await http()
        .post('/v1/api-keys')
        .set(bearer(ownerToken))
        .send({ name: 'Too powerful', scopes: ['admins:write'] })
        .expect(400);
    });

    it('does not let an editor create keys', async () => {
      await http().post('/v1/admins').set(bearer(ownerToken)).send(EDITOR).expect(201);
      const editorToken = await login(EDITOR.email, EDITOR.password);

      await http()
        .post('/v1/api-keys')
        .set(bearer(editorToken))
        .send({ name: 'Editor key', scopes: ['assets:read'] })
        .expect(403);
    });

    it('stops working once revoked', async () => {
      const created = await http()
        .post('/v1/api-keys')
        .set(bearer(ownerToken))
        .send({ name: 'CI', scopes: ['admins:read'] })
        .expect(201);
      const key = created.body.key as string;

      await http().delete(`/v1/api-keys/${created.body.id}`).set(bearer(ownerToken)).expect(204);
      await http().get('/v1/admins').set(bearer(key)).expect(401);
    });
  });

  describe('audit log', () => {
    it('records sign-ins and admin changes without secrets', async () => {
      await http().post('/v1/auth/setup').send(OWNER).expect(201);
      await http()
        .post('/v1/auth/login')
        .send({ email: OWNER.email, password: 'wrong-password-123' })
        .expect(401);
      const ownerToken = await login(OWNER.email, OWNER.password);
      await http().post('/v1/admins').set(bearer(ownerToken)).send(EDITOR).expect(201);

      const log = await http().get('/v1/audit-logs').set(bearer(ownerToken)).expect(200);
      const actions = log.body.items.map((entry: { action: string }) => entry.action);

      expect(actions).toEqual(
        expect.arrayContaining(['auth.setup', 'auth.login_failed', 'auth.login', 'admin.create']),
      );
      const serialized = JSON.stringify(log.body);
      expect(serialized).not.toContain(OWNER.password);
      expect(serialized).not.toContain(EDITOR.password);
      expect(serialized).not.toContain(ownerToken);

      const filtered = await http()
        .get('/v1/audit-logs?action=admin.create')
        .set(bearer(ownerToken))
        .expect(200);
      expect(filtered.body.total).toBe(1);
    });
  });
});
