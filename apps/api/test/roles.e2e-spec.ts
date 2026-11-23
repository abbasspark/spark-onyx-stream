// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of custom roles: making, changing and deleting them,
// giving them to admins, what their holders may and may not do, and the rules
// that keep anyone from handing out more than they hold.
//
// Skipped unless TEST_DATABASE_URL is set.
import { AdminsModule } from '../src/admins/admins.module.js';
import { ApiKeysModule } from '../src/api-keys/api-keys.module.js';
import { PERMISSIONS } from '../src/auth/permissions.js';
import { ViewersModule } from '../src/viewers/viewers.module.js';
import { createTestApp, OWNER, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const PASSWORD = 'another-long-password';

describe.skipIf(!TEST_DATABASE_URL)('Custom roles (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;

  const http = () => testApp.http();
  const as = (token: string) => testApp.bearer(token);

  async function createRole(body: Record<string, unknown>, token = ownerToken): Promise<string> {
    const created = await http().post('/v1/roles').set(as(token)).send(body).expect(201);
    return created.body.id as string;
  }

  /** Creates an admin with a role and signs them in. */
  async function createAdmin(
    email: string,
    role: Record<string, unknown>,
    token = ownerToken,
  ): Promise<{ id: string; token: string }> {
    const created = await http()
      .post('/v1/admins')
      .set(as(token))
      .send({ email, displayName: email.split('@')[0], password: PASSWORD, ...role })
      .expect(201);
    return { id: created.body.id as string, token: await testApp.login(email, PASSWORD) };
  }

  const support = { name: 'Support', permissions: ['viewers:read', 'viewers:write'] };
  /** May manage admins and see viewers, and nothing else. */
  const hr = { name: 'People team', permissions: ['admins:write', 'viewers:read'] };

  beforeAll(async () => {
    testApp = await createTestApp([AdminsModule, ApiKeysModule, ViewersModule]);
  });
  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });
  afterAll(async () => {
    await testApp.resetDatabase();
    await testApp.close();
  });

  describe('the list', () => {
    it('starts with the four built-in roles and explains every permission', async () => {
      const overview = await http().get('/v1/roles').set(as(ownerToken)).expect(200);

      expect(overview.body.roles.map((role: { key: string }) => role.key)).toEqual([
        'OWNER',
        'ADMIN',
        'EDITOR',
        'VIEWER',
      ]);
      expect(overview.body.roles[0]).toMatchObject({
        id: null,
        builtIn: true,
        name: 'Owner',
        adminCount: 1,
        permissions: [...PERMISSIONS],
      });
      const explained = overview.body.catalog.flatMap(
        (section: {
          areas: { read: { permission: string }; write: { permission: string } | null }[];
        }) =>
          section.areas.flatMap((area) =>
            area.write ? [area.read.permission, area.write.permission] : [area.read.permission],
          ),
      );
      expect([...explained].sort()).toEqual([...PERMISSIONS].sort());
    });

    it('lists custom roles after them with how many admins hold each', async () => {
      const id = await createRole({ ...support, description: 'Helps viewers', color: 'teal' });
      await createAdmin('sam@example.com', { role: 'CUSTOM', customRoleId: id });

      const overview = await http().get('/v1/roles').set(as(ownerToken)).expect(200);
      expect(overview.body.roles).toHaveLength(5);
      expect(overview.body.roles[4]).toMatchObject({
        id,
        key: 'CUSTOM',
        builtIn: false,
        name: 'Support',
        description: 'Helps viewers',
        color: 'teal',
        permissions: ['viewers:read', 'viewers:write'],
        adminCount: 1,
        like: null,
      });

      const detail = await http().get(`/v1/roles/${id}`).set(as(ownerToken)).expect(200);
      expect(detail.body.admins).toEqual([
        expect.objectContaining({ email: 'sam@example.com', isActive: true }),
      ]);
    });

    it('is closed to admins who may not see admins', async () => {
      const editor = await createAdmin('edith@example.com', { role: 'EDITOR' });
      await http().get('/v1/roles').set(as(editor.token)).expect(403);
    });
  });

  describe('making a role', () => {
    it('adds seeing an area to changing it', async () => {
      const created = await http()
        .post('/v1/roles')
        .set(as(ownerToken))
        .send({ name: 'Money', permissions: ['billing:write'] })
        .expect(201);
      expect(created.body.permissions).toEqual(['billing:read', 'billing:write']);
      expect(created.body.color).toBe('slate');
    });

    it('says which built-in role it covers', async () => {
      const created = await http()
        .post('/v1/roles')
        .set(as(ownerToken))
        .send({
          name: 'Content with viewers',
          permissions: [
            'catalog:write',
            'assets:write',
            'jobs:write',
            'encoding-profiles:write',
            'analytics:read',
            'storage:read',
            'live:read',
            'viewers:read',
          ],
        })
        .expect(201);
      expect(created.body.like).toBe('EDITOR');
    });

    it('refuses a role without a permission, an unknown permission and a built-in name', async () => {
      const empty = await http()
        .post('/v1/roles')
        .set(as(ownerToken))
        .send({ name: 'Nothing', permissions: [] })
        .expect(400);
      expect(JSON.stringify(empty.body)).toContain('at least one thing');

      const unknown = await http()
        .post('/v1/roles')
        .set(as(ownerToken))
        .send({ name: 'Typo', permissions: ['viewers:read', 'viewer:write'] })
        .expect(400);
      expect(JSON.stringify(unknown.body)).toContain('viewer:write');

      await http()
        .post('/v1/roles')
        .set(as(ownerToken))
        .send({ name: ' editor ', permissions: ['viewers:read'] })
        .expect(400);
    });

    it('refuses a name that is taken, whatever its capitals', async () => {
      await createRole(support);
      await http()
        .post('/v1/roles')
        .set(as(ownerToken))
        .send({ ...support, name: 'SUPPORT' })
        .expect(409);
    });

    it('cannot be done with an API key', async () => {
      const key = await http()
        .post('/v1/api-keys')
        .set(as(ownerToken))
        .send({ name: 'Script', scopes: ['admins:read'] })
        .expect(201);
      const apiKey = key.body.key as string;

      await http().get('/v1/roles').set(as(apiKey)).expect(200);
      await http().post('/v1/roles').set(as(apiKey)).send(support).expect(403);
    });

    it('is written to the audit log', async () => {
      const id = await createRole(support);
      const entry = await testApp.prisma.auditLog.findFirst({ where: { action: 'role.create' } });
      expect(entry).toMatchObject({
        entityType: 'AdminCustomRole',
        entityId: id,
        metadata: { name: 'Support', permissions: ['viewers:read', 'viewers:write'] },
      });
    });
  });

  describe('holding a role', () => {
    it('opens what the role names and nothing else', async () => {
      const id = await createRole(support);
      const sam = await createAdmin('sam@example.com', { role: 'CUSTOM', customRoleId: id });

      const me = await http().get('/v1/auth/me').set(as(sam.token)).expect(200);
      expect(me.body).toMatchObject({
        role: 'CUSTOM',
        customRole: { id, name: 'Support', color: 'slate' },
        permissions: ['viewers:read', 'viewers:write'],
      });

      await http().get('/v1/viewers').set(as(sam.token)).expect(200);
      await http().get('/v1/admins').set(as(sam.token)).expect(403);
      await http().get('/v1/roles').set(as(sam.token)).expect(403);
    });

    it('shows on the admin, and needs the id of the role', async () => {
      const id = await createRole(support);
      const sam = await createAdmin('sam@example.com', { role: 'CUSTOM', customRoleId: id });

      const admin = await http().get(`/v1/admins/${sam.id}`).set(as(ownerToken)).expect(200);
      expect(admin.body).toMatchObject({
        role: 'CUSTOM',
        customRole: { id, name: 'Support', color: 'slate' },
      });

      const body = { email: 'x@example.com', displayName: 'X', password: PASSWORD };
      await http()
        .post('/v1/admins')
        .set(as(ownerToken))
        .send({ ...body, role: 'CUSTOM' })
        .expect(400);
      await http()
        .post('/v1/admins')
        .set(as(ownerToken))
        .send({ ...body, role: 'EDITOR', customRoleId: id })
        .expect(400);
      await http()
        .post('/v1/admins')
        .set(as(ownerToken))
        .send({ ...body, role: 'CUSTOM', customRoleId: '019a0000-0000-7000-8000-000000000000' })
        .expect(400);
    });

    it('follows a change of the role at once, without signing in again', async () => {
      const id = await createRole(support);
      const sam = await createAdmin('sam@example.com', { role: 'CUSTOM', customRoleId: id });
      await http().get('/v1/audit-logs').set(as(sam.token)).expect(403);

      const updated = await http()
        .patch(`/v1/roles/${id}`)
        .set(as(ownerToken))
        .send({ permissions: ['viewers:read', 'audit:read'] })
        .expect(200);
      expect(updated.body).toMatchObject({
        permissions: ['audit:read', 'viewers:read'],
        adminCount: 1,
      });

      await http().get('/v1/audit-logs').set(as(sam.token)).expect(200);
      const viewers = await http()
        .post('/v1/viewers')
        .set(as(sam.token))
        .send({ email: 'v@example.com', password: PASSWORD });
      expect(viewers.status).toBe(403);

      const entry = await testApp.prisma.auditLog.findFirst({ where: { action: 'role.update' } });
      expect(entry?.metadata).toMatchObject({
        name: 'Support',
        added: ['audit:read'],
        removed: ['viewers:write'],
        admins: 1,
      });
    });

    it('moves between a custom and a built-in role, and signs the admin out', async () => {
      const id = await createRole(support);
      const sam = await createAdmin('sam@example.com', { role: 'EDITOR' });

      const moved = await http()
        .patch(`/v1/admins/${sam.id}`)
        .set(as(ownerToken))
        .send({ role: 'CUSTOM', customRoleId: id })
        .expect(200);
      expect(moved.body.customRole).toMatchObject({ name: 'Support' });
      await http().get('/v1/auth/me').set(as(sam.token)).expect(401);

      const back = await http()
        .patch(`/v1/admins/${sam.id}`)
        .set(as(ownerToken))
        .send({ role: 'VIEWER' })
        .expect(200);
      expect(back.body).toMatchObject({ role: 'VIEWER', customRole: null });

      const entries = await testApp.prisma.auditLog.findMany({
        where: { action: 'admin.update' },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries.map((entry) => (entry.metadata as { role: unknown }).role)).toEqual([
        { from: 'EDITOR', to: 'Support' },
        { from: 'Support', to: 'VIEWER' },
      ]);
    });

    it('limits the API keys of its holder to what the role still names', async () => {
      const id = await createRole(support);
      const sam = await createAdmin('sam@example.com', { role: 'CUSTOM', customRoleId: id });
      // A role without the permission to make API keys cannot make one.
      await http()
        .post('/v1/api-keys')
        .set(as(sam.token))
        .send({ name: 'Mine', scopes: ['viewers:read'] })
        .expect(403);

      await http()
        .patch(`/v1/roles/${id}`)
        .set(as(ownerToken))
        .send({ permissions: ['viewers:read', 'viewers:write', 'api-keys:write'] })
        .expect(200);
      const key = await http()
        .post('/v1/api-keys')
        .set(as(sam.token))
        .send({ name: 'Mine', scopes: ['viewers:read'] })
        .expect(201);
      const apiKey = key.body.key as string;
      await http().get('/v1/viewers').set(as(apiKey)).expect(200);

      await http()
        .patch(`/v1/roles/${id}`)
        .set(as(ownerToken))
        .send({ permissions: ['api-keys:write'] })
        .expect(200);
      await http().get('/v1/viewers').set(as(apiKey)).expect(403);
    });
  });

  describe('nobody hands out more than they hold', () => {
    let hrRoleId: string;
    let supportRoleId: string;
    let pat: { id: string; token: string };

    beforeEach(async () => {
      hrRoleId = await createRole(hr);
      supportRoleId = await createRole(support);
      pat = await createAdmin('pat@example.com', { role: 'CUSTOM', customRoleId: hrRoleId });
    });

    it('lets them create admins with a role no bigger than their own', async () => {
      const reader = await createRole({ name: 'Reader', permissions: ['viewers:read'] });
      await createAdmin('new@example.com', { role: 'CUSTOM', customRoleId: reader }, pat.token);
      await createAdmin('peer@example.com', { role: 'CUSTOM', customRoleId: hrRoleId }, pat.token);

      for (const role of [
        { role: 'ADMIN' },
        { role: 'EDITOR' },
        { role: 'VIEWER' },
        { role: 'CUSTOM', customRoleId: supportRoleId },
      ]) {
        const refused = await http()
          .post('/v1/admins')
          .set(as(pat.token))
          .send({ email: 'big@example.com', displayName: 'Big', password: PASSWORD, ...role })
          .expect(403);
        expect(refused.body.message).toMatch(/more than your own/);
      }
    });

    it('keeps them away from admins who may do more', async () => {
      const editor = await createAdmin('edith@example.com', { role: 'EDITOR' });

      const reset = await http()
        .patch(`/v1/admins/${editor.id}`)
        .set(as(pat.token))
        .send({ password: 'a-password-of-my-choice' })
        .expect(403);
      expect(reset.body.message).toMatch(/more than you/);
      await http().delete(`/v1/admins/${editor.id}`).set(as(pat.token)).expect(403);
      await http().delete(`/v1/admins/${editor.id}/two-factor`).set(as(pat.token)).expect(403);
      // The editor is untouched and still signed in.
      await http().get('/v1/auth/me').set(as(editor.token)).expect(200);
    });

    it('lets them build only roles made of their own permissions', async () => {
      const refused = await http()
        .post('/v1/roles')
        .set(as(pat.token))
        .send({ name: 'Sneaky', permissions: ['viewers:read', 'billing:write'] })
        .expect(403);
      expect(refused.body.message).toBe(
        'You cannot put into a role what you may not do yourself: billing:read, billing:write',
      );

      await createRole({ name: 'Reader', permissions: ['viewers:read'] }, pat.token);
    });

    it('keeps them away from their own role and from bigger roles', async () => {
      const own = await http()
        .patch(`/v1/roles/${hrRoleId}`)
        .set(as(pat.token))
        .send({ description: 'Mine' })
        .expect(403);
      expect(own.body.message).toMatch(/hold yourself/);

      await http()
        .patch(`/v1/roles/${supportRoleId}`)
        .set(as(pat.token))
        .send({ name: 'Renamed' })
        .expect(403);
      await http().delete(`/v1/roles/${supportRoleId}`).set(as(pat.token)).expect(403);

      const reader = await createRole({ name: 'Reader', permissions: ['viewers:read'] });
      await http()
        .patch(`/v1/roles/${reader}`)
        .set(as(pat.token))
        .send({ permissions: ['viewers:read', 'audit:read'] })
        .expect(403);
      await http()
        .patch(`/v1/roles/${reader}`)
        .set(as(pat.token))
        .send({ permissions: ['viewers:read', 'admins:read'] })
        .expect(200);
    });

    it('still keeps owners for owners', async () => {
      const everything = await createRole({ name: 'Everything', permissions: [...PERMISSIONS] });
      const max = await createAdmin('max@example.com', {
        role: 'CUSTOM',
        customRoleId: everything,
      });
      const owner = await testApp.prisma.adminUser.findUniqueOrThrow({
        where: { email: OWNER.email },
      });

      await http()
        .patch(`/v1/admins/${owner.id}`)
        .set(as(max.token))
        .send({ displayName: 'Renamed' })
        .expect(403);
      await http()
        .post('/v1/admins')
        .set(as(max.token))
        .send({ email: 'o@example.com', displayName: 'O', password: PASSWORD, role: 'OWNER' })
        .expect(403);
      // Everything else an admin may do is open to them.
      await createAdmin('a@example.com', { role: 'ADMIN' }, max.token);
    });
  });

  describe('deleting a role', () => {
    it('goes at once when nobody holds it', async () => {
      const id = await createRole(support);
      const removed = await http().delete(`/v1/roles/${id}`).set(as(ownerToken)).expect(200);
      expect(removed.body).toEqual({ movedAdmins: 0 });
      await http().get(`/v1/roles/${id}`).set(as(ownerToken)).expect(404);
    });

    it('asks where its holders go, moves them and signs them out', async () => {
      const id = await createRole(support);
      const other = await createRole({ name: 'Reader', permissions: ['viewers:read'] });
      const sam = await createAdmin('sam@example.com', { role: 'CUSTOM', customRoleId: id });
      const kim = await createAdmin('kim@example.com', { role: 'CUSTOM', customRoleId: id });

      const refused = await http().delete(`/v1/roles/${id}`).set(as(ownerToken)).expect(409);
      expect(refused.body).toMatchObject({ code: 'role_in_use', admins: 2 });
      await http().delete(`/v1/roles/${id}?moveTo=${id}`).set(as(ownerToken)).expect(400);
      await http().delete(`/v1/roles/${id}?moveTo=OWNER`).set(as(ownerToken)).expect(400);

      const removed = await http()
        .delete(`/v1/roles/${id}?moveTo=${other}`)
        .set(as(ownerToken))
        .expect(200);
      expect(removed.body).toEqual({ movedAdmins: 2 });

      await http().get('/v1/auth/me').set(as(sam.token)).expect(401);
      const again = await testApp.login('kim@example.com', PASSWORD);
      const me = await http().get('/v1/auth/me').set(as(again)).expect(200);
      expect(me.body).toMatchObject({
        customRole: { name: 'Reader' },
        permissions: ['viewers:read'],
      });
      expect(kim.id).toBeTruthy();

      const entry = await testApp.prisma.auditLog.findFirst({ where: { action: 'role.delete' } });
      expect(entry?.metadata).toEqual({ name: 'Support', movedAdmins: 2, movedTo: other });
    });

    it('can move its holders to a built-in role', async () => {
      const id = await createRole(support);
      const sam = await createAdmin('sam@example.com', { role: 'CUSTOM', customRoleId: id });

      await http().delete(`/v1/roles/${id}?moveTo=VIEWER`).set(as(ownerToken)).expect(200);
      const admin = await http().get(`/v1/admins/${sam.id}`).set(as(ownerToken)).expect(200);
      expect(admin.body).toMatchObject({ role: 'VIEWER', customRole: null });
    });
  });
});
