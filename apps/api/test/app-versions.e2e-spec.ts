// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the description of the API and of the gate that turns
// away apps that are too old.
//
// Skipped unless TEST_DATABASE_URL is set.
import { AdminsModule } from '../src/admins/admins.module.js';
import { ApiKeysModule } from '../src/api-keys/api-keys.module.js';
import { CatalogModule } from '../src/catalog/catalog.module.js';
import { OpenApiModule } from '../src/openapi/openapi.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('The description of the API and app versions (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const save = (rules: object[]) => http().put('/v1/app-versions').set(auth()).send({ rules });

  beforeAll(async () => {
    testApp = await createTestApp([AdminsModule, ApiKeysModule, CatalogModule, OpenApiModule]);
  });
  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });
  afterAll(async () => {
    await testApp?.close();
  });

  describe('the description', () => {
    it('is served to anyone, and describes itself', async () => {
      const response = await http().get('/v1/openapi.json').expect(200);
      expect(response.headers['cache-control']).toContain('max-age');
      expect(response.body.openapi).toBe('3.1.0');
      expect(response.body.info.title).toBe('Spark Onyx Stream API');

      const self = response.body.paths['/v1/openapi.json'].get;
      expect(self['x-onyx-access'].kind).toBe('public');
      const login = response.body.paths['/v1/viewer/login'].post;
      expect(login.requestBody.content['application/json'].schema.required).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
      const titles = response.body.paths['/v1/titles'].get;
      expect(titles['x-onyx-access']).toMatchObject({
        kind: 'admin',
        permissions: ['catalog:read'],
      });
      expect(response.body.components.schemas.Problem.required).toEqual(['statusCode', 'message']);
    });
  });

  describe('app versions', () => {
    it('starts without rules, and nobody is turned away', async () => {
      const view = await http().get('/v1/app-versions').set(auth()).expect(200);
      expect(view.body).toEqual({ rules: [], header: 'X-Onyx-Client', maxRules: 20 });
      await http().get('/v1/catalog/genres').set('X-Onyx-Client', 'android-tv/0.0.1').expect(200);
    });

    it('turns away an app below its minimum, on every address, with a code to act on', async () => {
      const saved = await save([
        {
          app: 'Android-TV',
          minimum: '1.4.0',
          message: 'Update the app from the Play Store to keep watching.',
          updateUrl: 'https://play.google.com/store/apps/details?id=tv.example',
        },
        { app: 'android', minimum: '2.0' },
      ]).expect(200);
      expect(saved.body.rules).toEqual([
        { app: 'android', minimum: '2.0', message: null, updateUrl: null },
        {
          app: 'android-tv',
          minimum: '1.4.0',
          message: 'Update the app from the Play Store to keep watching.',
          updateUrl: 'https://play.google.com/store/apps/details?id=tv.example',
        },
      ]);

      const old = await http()
        .get('/v1/catalog/genres')
        .set('X-Onyx-Client', 'android-tv/1.3.9')
        .expect(426);
      expect(old.body).toEqual({
        statusCode: 426,
        error: 'Upgrade Required',
        code: 'client_too_old',
        minimumVersion: '1.4.0',
        message: 'Update the app from the Play Store to keep watching.',
        updateUrl: 'https://play.google.com/store/apps/details?id=tv.example',
      });
      // Also where a sign-in would be asked for first: the app is told why, not "sign in".
      await http().get('/v1/viewer/me').set('X-Onyx-Client', 'android/1.9.9').expect(426);
      const standard = await http()
        .post('/v1/viewer/login')
        .set('X-Onyx-Client', 'android/1.0')
        .send({ email: 'a@example.com', password: 'x' })
        .expect(426);
      expect(standard.body.message).toMatch(/no longer supported/);

      // New enough, another app, no header, a header that is not in the form: all pass.
      for (const client of [
        'android-tv/1.4.0',
        'android-tv/1.10.0-beta.1',
        'roku/0.1',
        'nonsense',
      ]) {
        await http().get('/v1/catalog/genres').set('X-Onyx-Client', client).expect(200);
      }
      await http().get('/v1/catalog/genres').expect(200);
    });

    it('tells an app where it stands when it starts, even one that is too old', async () => {
      await save([{ app: 'android-tv', minimum: '1.4.0' }]).expect(200);

      const old = await http().get('/v1/meta').set('X-Onyx-Client', 'android-tv/1.0.0').expect(200);
      expect(old.headers['cache-control']).toBe('no-store');
      expect(old.body).toMatchObject({
        api: { prefix: 'v1', description: '/v1/openapi.json' },
        client: {
          app: 'android-tv',
          version: '1.0.0',
          supported: false,
          refusal: { minimumVersion: '1.4.0', updateUrl: null },
        },
      });
      expect(old.body.name).toBeTruthy();
      expect(old.body.api.version).toMatch(/^\d+\.\d+\.\d+/);

      const current = await http()
        .get('/v1/meta')
        .set('X-Onyx-Client', 'android-tv/2.0')
        .expect(200);
      expect(current.body.client).toEqual({
        app: 'android-tv',
        version: '2.0',
        supported: true,
        refusal: null,
      });
      expect((await http().get('/v1/meta').expect(200)).body.client).toBeNull();
    });

    it('refuses rules that make no sense', async () => {
      await save([{ app: 'android tv', minimum: '1.0' }]).expect(400);
      await save([{ app: 'android', minimum: 'latest' }]).expect(400);
      await save([{ app: 'android', minimum: '1.0', updateUrl: 'play store' }]).expect(400);
      const twice = await save([
        { app: 'android', minimum: '1.0' },
        { app: 'android', minimum: '2.0' },
      ]).expect(400);
      expect(JSON.stringify(twice.body)).toContain('one rule');
      // A link into a store app is an address too.
      await save([
        { app: 'android', minimum: '1.0', updateUrl: 'market://details?id=tv.example' },
      ]).expect(200);
    });

    it('is for admins who may change settings, and is written to the audit log', async () => {
      await http().get('/v1/app-versions').expect(401);
      await http()
        .post('/v1/admins')
        .set(auth())
        .send({
          email: 'editor@example.com',
          displayName: 'Edith Editor',
          password: 'another-long-password',
          role: 'EDITOR',
        })
        .expect(201);
      const editor = testApp.bearer(
        await testApp.login('editor@example.com', 'another-long-password'),
      );
      await http().get('/v1/app-versions').set(editor).expect(403);
      await http().put('/v1/app-versions').set(editor).send({ rules: [] }).expect(403);

      await save([{ app: 'ios', minimum: '3.2.1' }]).expect(200);
      const entry = await testApp.prisma.auditLog.findFirst({
        where: { action: 'app-versions.update' },
      });
      expect(entry?.metadata).toEqual({ rules: ['ios 3.2.1'] });
    });
  });
});
