// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of two-factor sign-in for admins: setting it up, signing
// in with a code from the app or a recovery code, switching it off, what an
// installation that asks every admin for it does, and the ways back in.
//
// Skipped unless TEST_DATABASE_URL is set.
import { AdminsModule } from '../src/admins/admins.module.js';
import { ApiKeysModule } from '../src/api-keys/api-keys.module.js';
import { runAdminCli } from '../src/auth/admin-cli.js';
import { totpAt, totpStep } from '../src/auth/totp.js';
import { createTestApp, OWNER, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const EDITOR = {
  email: 'editor@example.com',
  displayName: 'Edith Editor',
  password: 'another-long-password',
  role: 'EDITOR',
};
const MANAGER = { ...EDITOR, email: 'admin@example.com', displayName: 'Ada Admin', role: 'ADMIN' };

describe.skipIf(!TEST_DATABASE_URL)('Two-factor sign-in (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;

  const http = () => testApp.http();
  const as = (token: string) => testApp.bearer(token);

  const login = (body: Record<string, unknown>) => http().post('/v1/auth/login').send(body);
  const ownerLogin = (code?: string) =>
    login({ email: OWNER.email, password: OWNER.password, ...(code ? { code } : {}) });

  /**
   * A code the application takes now. A code counts once, so each call hands
   * out the one of the next half minute, which is still within what is taken,
   * and forgets which one was used last.
   */
  async function codeOf(secret: string, email = OWNER.email): Promise<string> {
    await testApp.prisma.adminUser.update({ where: { email }, data: { totpLastStep: null } });
    return totpAt(secret, totpStep());
  }

  /** Switches two-factor sign-in on for the admin of a token. */
  async function enable(token: string, password: string) {
    const setup = await http()
      .post('/v1/auth/two-factor/setup')
      .set(as(token))
      .send({ password })
      .expect(200);
    const secret = setup.body.secret as string;
    const enabled = await http()
      .post('/v1/auth/two-factor/enable')
      .set(as(token))
      .send({ code: totpAt(secret, totpStep()) })
      .expect(200);
    return { secret, recoveryCodes: enabled.body.recoveryCodes as string[] };
  }

  async function createAdmin(admin = EDITOR): Promise<{ id: string; token: string }> {
    const created = await http().post('/v1/admins').set(as(ownerToken)).send(admin).expect(201);
    const signedIn = await login({ email: admin.email, password: admin.password }).expect(200);
    return { id: created.body.id as string, token: signedIn.body.token as string };
  }

  const status = async (token: string) =>
    (await http().get('/v1/auth/two-factor').set(as(token)).expect(200)).body as {
      enabled: boolean;
      recoveryCodesLeft: number;
      required: boolean;
    };

  describe('on an installation that leaves it to each admin', () => {
    beforeAll(async () => {
      testApp = await createTestApp([AdminsModule, ApiKeysModule]);
    });
    beforeEach(async () => {
      await testApp.resetDatabase();
      ownerToken = await testApp.setupOwner();
    });
    afterAll(async () => {
      await testApp.resetDatabase();
      await testApp.close();
    });

    it('is off until an admin sets it up, and changes nothing before the first code', async () => {
      expect(await status(ownerToken)).toEqual({
        enabled: false,
        enabledAt: null,
        recoveryCodesLeft: 0,
        required: false,
      });

      await http()
        .post('/v1/auth/two-factor/setup')
        .set(as(ownerToken))
        .send({ password: 'not-the-password' })
        .expect(400);
      const setup = await http()
        .post('/v1/auth/two-factor/setup')
        .set(as(ownerToken))
        .send({ password: OWNER.password })
        .expect(200);
      expect(setup.body.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(setup.body.uri).toBe(
        `otpauth://totp/Onyx%20Stream:${encodeURIComponent(OWNER.email)}?secret=${setup.body.secret}&issuer=Onyx+Stream&algorithm=SHA1&digits=6&period=30`,
      );

      // Started and not finished: signing in is as before.
      expect((await status(ownerToken)).enabled).toBe(false);
      await ownerLogin().expect(200);
      // The secret is not readable in the database.
      const stored = await testApp.prisma.adminUser.findUniqueOrThrow({
        where: { email: OWNER.email },
      });
      expect(stored.totpSecret).toMatch(/^v1\./);
      expect(stored.totpSecret).not.toContain(setup.body.secret);
    });

    it('is switched on by a code from the app, and hands out recovery codes once', async () => {
      const other = (await ownerLogin().expect(200)).body.token as string;
      const setup = await http()
        .post('/v1/auth/two-factor/setup')
        .set(as(ownerToken))
        .send({ password: OWNER.password })
        .expect(200);

      const wrong = await http()
        .post('/v1/auth/two-factor/enable')
        .set(as(ownerToken))
        .send({ code: '000000' })
        .expect(400);
      expect(wrong.body.code).toBe('two_factor_invalid');

      const enabled = await http()
        .post('/v1/auth/two-factor/enable')
        .set(as(ownerToken))
        .send({ code: totpAt(setup.body.secret, totpStep()) })
        .expect(200);
      expect(enabled.body.recoveryCodes).toHaveLength(10);
      expect(new Set(enabled.body.recoveryCodes).size).toBe(10);
      expect(enabled.body.recoveryCodes[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

      expect(await status(ownerToken)).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });
      const me = await http().get('/v1/auth/me').set(as(ownerToken)).expect(200);
      expect(me.body).toMatchObject({ twoFactorEnabled: true, twoFactorSetupRequired: false });
      const admins = await http().get('/v1/admins').set(as(ownerToken)).expect(200);
      expect(admins.body.items[0].twoFactorEnabled).toBe(true);
      expect(JSON.stringify(admins.body)).not.toContain('totp');

      // The other devices are signed out, and it cannot be set up twice.
      await http().get('/v1/auth/me').set(as(other)).expect(401);
      await http()
        .post('/v1/auth/two-factor/setup')
        .set(as(ownerToken))
        .send({ password: OWNER.password })
        .expect(409);
      // The codes are stored as hashes only.
      const rows = await testApp.prisma.adminRecoveryCode.findMany();
      expect(rows).toHaveLength(10);
      expect(JSON.stringify(rows)).not.toContain(enabled.body.recoveryCodes[0]);
      const trace = await testApp.prisma.auditLog.findMany({
        where: { action: 'auth.two_factor_enable' },
      });
      expect(trace).toHaveLength(1);
    });

    it('asks for a code after the password, and takes each code once', async () => {
      const { secret } = await enable(ownerToken, OWNER.password);

      const asked = await ownerLogin().expect(401);
      expect(asked.body).toMatchObject({
        code: 'two_factor_required',
        message: 'Enter the code from your authenticator app',
      });
      expect(asked.body).not.toHaveProperty('token');

      const code = await codeOf(secret);
      const signedIn = await ownerLogin(code).expect(200);
      expect(signedIn.body.token).toEqual(expect.any(String));
      expect(signedIn.body).not.toHaveProperty('recoveryCodesLeft');
      // Seen once, a code is worth nothing to whoever saw it.
      const again = await ownerLogin(code).expect(401);
      expect(again.body.code).toBe('two_factor_invalid');
      // A code typed with a space, as apps show it, is fine.
      const spaced = await codeOf(secret);
      await ownerLogin(`${spaced.slice(0, 3)} ${spaced.slice(3)}`).expect(200);
    });

    it('does not say that an account uses it to someone without the password', async () => {
      await enable(ownerToken, OWNER.password);
      const wrong = await login({ email: OWNER.email, password: 'not-the-password' }).expect(401);
      expect(wrong.body.message).toBe('Email or password is incorrect');
      expect(wrong.body).not.toHaveProperty('code');
      const withCode = await login({
        email: OWNER.email,
        password: 'not-the-password',
        code: '123456',
      }).expect(401);
      expect(withCode.body.message).toBe('Email or password is incorrect');
    });

    it('counts wrong codes like wrong passwords, and being asked for a code not at all', async () => {
      const { secret } = await enable(ownerToken, OWNER.password);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await ownerLogin().expect(401);
      }
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await ownerLogin('000000').expect(401)).body.code).toBe('two_factor_invalid');
      }
      // Locked for a while, also with the right code.
      await ownerLogin(await codeOf(secret)).expect(429);
      const failed = await testApp.prisma.auditLog.findMany({
        where: { action: 'auth.login_failed' },
      });
      expect(failed).toHaveLength(5);
      expect(failed[0]?.metadata).toMatchObject({ reason: 'two_factor' });
    });

    it('takes a recovery code instead, once, and says how many are left', async () => {
      const { recoveryCodes } = await enable(ownerToken, OWNER.password);
      const first = recoveryCodes[0] as string;

      const signedIn = await ownerLogin(` ${first.toLowerCase().replace(/-/g, ' ')} `).expect(200);
      expect(signedIn.body.recoveryCodesLeft).toBe(9);
      expect((await ownerLogin(first).expect(401)).body.code).toBe('two_factor_invalid');
      await ownerLogin('AAAA-BBBB-CCCC').expect(401);
      expect((await status(signedIn.body.token)).recoveryCodesLeft).toBe(9);

      const used = await testApp.prisma.auditLog.findMany({
        where: { action: 'auth.recovery_code_used' },
      });
      expect(used).toHaveLength(1);
      expect(used[0]?.metadata).toMatchObject({ left: 9 });
    });

    it('makes new recovery codes, which end the old ones', async () => {
      const { secret, recoveryCodes } = await enable(ownerToken, OWNER.password);
      const prove = (body: Record<string, unknown>) =>
        http().post('/v1/auth/two-factor/recovery-codes').set(as(ownerToken)).send(body);

      await prove({ password: 'not-the-password', code: await codeOf(secret) }).expect(400);
      await prove({ password: OWNER.password, code: '000000' }).expect(400);
      const made = await prove({ password: OWNER.password, code: await codeOf(secret) }).expect(
        200,
      );
      expect(made.body.recoveryCodes).toHaveLength(10);
      expect(made.body.recoveryCodes).not.toContain(recoveryCodes[0]);

      await ownerLogin(recoveryCodes[0]).expect(401);
      await ownerLogin(made.body.recoveryCodes[0]).expect(200);
    });

    it('is switched off with the password and a code', async () => {
      const { secret } = await enable(ownerToken, OWNER.password);
      const disable = (body: Record<string, unknown>) =>
        http().post('/v1/auth/two-factor/disable').set(as(ownerToken)).send(body);

      await disable({ password: OWNER.password }).expect(400);
      await disable({ password: 'not-the-password', code: await codeOf(secret) }).expect(400);
      await disable({ password: OWNER.password, code: '000000' }).expect(400);
      await disable({ password: OWNER.password, code: await codeOf(secret) }).expect(204);

      expect(await status(ownerToken)).toMatchObject({ enabled: false, recoveryCodesLeft: 0 });
      await ownerLogin().expect(200);
      expect(await testApp.prisma.adminRecoveryCode.count()).toBe(0);
      const stored = await testApp.prisma.adminUser.findUniqueOrThrow({
        where: { email: OWNER.email },
      });
      expect(stored).toMatchObject({ totpSecret: null, totpEnabledAt: null, totpLastStep: null });
      await disable({ password: OWNER.password, code: '123456' }).expect(409);
    });

    it('is for signed-in admins, not for API keys', async () => {
      const key = await http()
        .post('/v1/api-keys')
        .set(as(ownerToken))
        .send({ name: 'Robot', scopes: ['admins:read'] })
        .expect(201);
      const robot = as(key.body.key as string);
      await http().get('/v1/auth/two-factor').set(robot).expect(403);
      await http().post('/v1/auth/two-factor/setup').set(robot).send({ password: 'x' }).expect(403);
      await http().get('/v1/auth/two-factor').expect(401);
    });

    it('can be taken off another admin who is locked out, by those who may', async () => {
      const editor = await createAdmin();
      const manager = await createAdmin(MANAGER);
      await enable(editor.token, EDITOR.password);
      const owner = await enable(ownerToken, OWNER.password);
      const reset = (token: string, id: string) =>
        http().delete(`/v1/admins/${id}/two-factor`).set(as(token));

      const ownerId = (await http().get('/v1/auth/me').set(as(ownerToken)).expect(200)).body
        .adminId as string;
      // Not one's own, not an owner's by someone who is none, and not by an editor at all.
      await reset(ownerToken, ownerId).expect(400);
      await reset(manager.token, ownerId).expect(403);
      await reset(editor.token, manager.id).expect(403);
      await reset(ownerToken, manager.id).expect(409);
      await reset(ownerToken, '00000000-0000-7000-8000-000000000000').expect(404);

      await login({ email: EDITOR.email, password: EDITOR.password }).expect(401);
      await reset(manager.token, editor.id).expect(204);
      // Signed out, and back in with the password alone.
      await http().get('/v1/auth/me').set(as(editor.token)).expect(401);
      const back = await login({ email: EDITOR.email, password: EDITOR.password }).expect(200);
      expect((await status(back.body.token)).enabled).toBe(false);

      const trace = await testApp.prisma.auditLog.findMany({
        where: { action: 'admin.two_factor_reset' },
      });
      expect(trace).toHaveLength(1);
      expect(trace[0]?.metadata).toMatchObject({ email: EDITOR.email });
      // The owner still has theirs.
      await ownerLogin(await codeOf(owner.secret)).expect(200);
    });

    it('has a way back in from the command line for an owner nobody can help', async () => {
      await enable(ownerToken, OWNER.password);
      const lines: string[] = [];
      const run = (...args: string[]) =>
        runAdminCli(args, {
          env: {},
          out: (line) => void lines.push(line),
          prisma: testApp.prisma,
        });

      expect(await run('list')).toBe(0);
      expect(lines.join('\n')).toContain(`${OWNER.email}  OWNER  active  two-factor on`);
      expect(await run('two-factor-off', 'nobody@example.com')).toBe(1);
      expect(await run('two-factor-off')).toBe(2);
      expect(await run('something-else')).toBe(2);
      await ownerLogin().expect(401);

      lines.length = 0;
      expect(await run('two-factor-off', OWNER.email.toUpperCase())).toBe(0);
      expect(lines[0]).toContain('Two-factor sign-in is off');
      await http().get('/v1/auth/me').set(as(ownerToken)).expect(401);
      await ownerLogin().expect(200);
      expect(await testApp.prisma.adminRecoveryCode.count()).toBe(0);
      expect(
        await testApp.prisma.auditLog.count({ where: { action: 'admin.two_factor_reset' } }),
      ).toBe(1);
      // A second time changes nothing and says so.
      lines.length = 0;
      expect(await run('two-factor-off', OWNER.email)).toBe(0);
      expect(lines[0]).toContain('Nothing was changed');
    });
  });

  describe('on an installation that asks every admin for it', () => {
    beforeAll(async () => {
      testApp = await createTestApp([AdminsModule, ApiKeysModule], {
        ADMIN_TWO_FACTOR: 'required',
      });
    });
    beforeEach(async () => {
      await testApp.resetDatabase();
      ownerToken = await testApp.setupOwner();
    });
    afterAll(async () => {
      await testApp.resetDatabase();
      await testApp.close();
    });

    it('lets an admin without it in, to set it up and for nothing else', async () => {
      const me = await http().get('/v1/auth/me').set(as(ownerToken)).expect(200);
      expect(me.body).toMatchObject({ twoFactorEnabled: false, twoFactorSetupRequired: true });
      expect((await status(ownerToken)).required).toBe(true);

      const closed = await http().get('/v1/admins').set(as(ownerToken)).expect(403);
      expect(closed.body.code).toBe('two_factor_setup_required');
      await http().post('/v1/admins').set(as(ownerToken)).send(EDITOR).expect(403);
      await http().post('/v1/api-keys').set(as(ownerToken)).send({ name: 'x' }).expect(403);

      const { secret } = await enable(ownerToken, OWNER.password);
      await http().get('/v1/admins').set(as(ownerToken)).expect(200);
      const now = await http().get('/v1/auth/me').set(as(ownerToken)).expect(200);
      expect(now.body).toMatchObject({ twoFactorEnabled: true, twoFactorSetupRequired: false });

      // It cannot be switched off here.
      const kept = await http()
        .post('/v1/auth/two-factor/disable')
        .set(as(ownerToken))
        .send({ password: OWNER.password, code: await codeOf(secret) })
        .expect(403);
      expect(kept.body.message).toContain('cannot be switched off');
      expect((await status(ownerToken)).enabled).toBe(true);
    });

    it('lets an admin change their password and sign out before setting it up', async () => {
      await http()
        .post('/v1/auth/password')
        .set(as(ownerToken))
        .send({ currentPassword: OWNER.password, newPassword: 'a-brand-new-password' })
        .expect(204);
      await http().post('/v1/auth/logout').set(as(ownerToken)).expect(204);
    });

    it('sends an admin whose two-factor sign-in was taken off back to setting it up', async () => {
      await enable(ownerToken, OWNER.password);
      const editor = await createAdmin();
      await http().get('/v1/auth/two-factor').set(as(editor.token)).expect(200);
      await http().get('/v1/admins').set(as(editor.token)).expect(403);
      await enable(editor.token, EDITOR.password);

      await http().delete(`/v1/admins/${editor.id}/two-factor`).set(as(ownerToken)).expect(204);
      const back = await login({ email: EDITOR.email, password: EDITOR.password }).expect(200);
      const me = await http().get('/v1/auth/me').set(as(back.body.token)).expect(200);
      expect(me.body.twoFactorSetupRequired).toBe(true);
    });
  });
});
