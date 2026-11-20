// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of storage pool management against a real PostgreSQL
// database and real directories on disk. Skipped unless TEST_DATABASE_URL is set.
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { StorageModule, StoragePoolsModule } from '../src/storage/storage.module.js';
import { StorageService } from '../src/storage/storage.service.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const S3_POOL = {
  name: 'offsite',
  driver: 'S3',
  config: {
    bucket: 'media',
    // Nothing listens here, so connection attempts fail at once.
    endpoint: 'http://127.0.0.1:1',
    forcePathStyle: true,
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'super-secret-access-key',
  },
};

describe.skipIf(!TEST_DATABASE_URL)('Storage pools (e2e, real database)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-pools-'));
    testApp = await createTestApp([StorageModule, StoragePoolsModule, AdminsModule], {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'default'),
    });
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp?.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  async function createLocalPool(name: string, extra: Record<string, unknown> = {}) {
    const response = await http()
      .post('/v1/storage-pools')
      .set(auth())
      .send({
        name,
        driver: 'LOCAL',
        config: { basePath: path.join(workDirectory, name) },
        ...extra,
      })
      .expect(201);
    return response.body;
  }

  it('creates the default local pool on a fresh installation', async () => {
    const pool = await testApp.app.get(StorageService).getDefaultPool();

    expect(pool).toMatchObject({ name: 'local', driver: 'LOCAL', isDefault: true, isActive: true });
    expect(pool.config).toEqual({ basePath: path.join(workDirectory, 'default') });

    const list = await http().get('/v1/storage-pools').set(auth()).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('creates a local pool and returns byte counts as strings', async () => {
    const pool = await createLocalPool('fast-disk', { quotaBytes: '5000000000000' });

    expect(pool).toMatchObject({
      name: 'fast-disk',
      driver: 'LOCAL',
      isDefault: false,
      quotaBytes: '5000000000000',
      usedBytes: '0',
    });

    await http()
      .post('/v1/storage-pools')
      .set(auth())
      .send({ name: 'fast-disk', driver: 'LOCAL', config: { basePath: '/tmp/other' } })
      .expect(409);
  });

  it('rejects a relative path and an unknown driver', async () => {
    await http()
      .post('/v1/storage-pools')
      .set(auth())
      .send({ name: 'bad', driver: 'LOCAL', config: { basePath: 'relative/path' } })
      .expect(400);
    await http()
      .post('/v1/storage-pools')
      .set(auth())
      .send({ name: 'bad', driver: 'FTP', config: {} })
      .expect(400);
  });

  it('never returns the S3 secret key and stores it encrypted', async () => {
    const created = await http().post('/v1/storage-pools').set(auth()).send(S3_POOL).expect(201);

    expect(created.body.config).toMatchObject({
      bucket: 'media',
      region: 'us-east-1',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKeySet: true,
    });
    expect(JSON.stringify(created.body)).not.toContain('super-secret-access-key');

    const stored = await testApp.prisma.storagePool.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(JSON.stringify(stored.config)).not.toContain('super-secret-access-key');

    const log = await http().get('/v1/audit-logs').set(auth()).expect(200);
    expect(JSON.stringify(log.body)).not.toContain('super-secret-access-key');
  });

  it('keeps the stored secret when other S3 settings change', async () => {
    const created = await http().post('/v1/storage-pools').set(auth()).send(S3_POOL).expect(201);
    const before = await testApp.prisma.storagePool.findUniqueOrThrow({
      where: { id: created.body.id },
    });

    const updated = await http()
      .patch(`/v1/storage-pools/${created.body.id}`)
      .set(auth())
      .send({ config: { region: 'eu-central-1', endpoint: null } })
      .expect(200);
    expect(updated.body.config.region).toBe('eu-central-1');
    expect(updated.body.config).not.toHaveProperty('endpoint');

    const after = await testApp.prisma.storagePool.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect((after.config as { secretAccessKey: string }).secretAccessKey).toBe(
      (before.config as { secretAccessKey: string }).secretAccessKey,
    );

    await http()
      .patch(`/v1/storage-pools/${created.body.id}`)
      .set(auth())
      .send({ config: { notASetting: true } })
      .expect(400);
  });

  it('keeps exactly one default pool', async () => {
    await testApp.app.get(StorageService).ensureDefaultPool();
    const second = await createLocalPool('second');

    await http()
      .patch(`/v1/storage-pools/${second.id}`)
      .set(auth())
      .send({ isDefault: true })
      .expect(200);

    const list = await http().get('/v1/storage-pools').set(auth()).expect(200);
    const defaults = list.body.filter((pool: { isDefault: boolean }) => pool.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe('second');
  });

  it('protects the default pool from deactivation and inactive pools from becoming default', async () => {
    const pool = await createLocalPool('main', { isDefault: true });
    const spare = await createLocalPool('spare');

    await http()
      .patch(`/v1/storage-pools/${pool.id}`)
      .set(auth())
      .send({ isActive: false })
      .expect(409);

    await http()
      .patch(`/v1/storage-pools/${spare.id}`)
      .set(auth())
      .send({ isActive: false })
      .expect(200);
    await http()
      .patch(`/v1/storage-pools/${spare.id}`)
      .set(auth())
      .send({ isDefault: true })
      .expect(409);
  });

  it('refuses to move a pool that already holds assets', async () => {
    const pool = await createLocalPool('in-use');
    await testApp.prisma.asset.create({
      data: { title: 'Existing asset', storagePoolId: pool.id },
    });

    const response = await http()
      .patch(`/v1/storage-pools/${pool.id}`)
      .set(auth())
      .send({ config: { basePath: path.join(workDirectory, 'moved') } })
      .expect(400);
    expect(response.body.message).toMatch(/holds 1 asset/);
  });

  it('tests a working local pool and cleans up after itself', async () => {
    const pool = await createLocalPool('tested');

    const result = await http().post(`/v1/storage-pools/${pool.id}/test`).set(auth()).expect(200);
    expect(result.body.ok).toBe(true);

    const leftovers = await readdir(path.join(workDirectory, 'tested', '.onyx-connection-test'));
    expect(leftovers).toEqual([]);
  });

  it('reports an unreachable S3 pool as a failed test, not as a server error', async () => {
    const created = await http().post('/v1/storage-pools').set(auth()).send(S3_POOL).expect(201);

    const result = await http()
      .post(`/v1/storage-pools/${created.body.id}/test`)
      .set(auth())
      .expect(200);
    expect(result.body.ok).toBe(false);
    expect(result.body.error).toEqual(expect.any(String));
    expect(result.body.error).not.toContain('super-secret-access-key');
  }, 30_000);

  it('lets editors read pools but not change them', async () => {
    await http()
      .post('/v1/admins')
      .set(auth())
      .send({
        email: 'editor@example.com',
        displayName: 'Eddie Editor',
        password: 'editor-password-123',
        role: 'EDITOR',
      })
      .expect(201);
    const editorToken = await testApp.login('editor@example.com', 'editor-password-123');
    const editor = testApp.bearer(editorToken);

    await http().get('/v1/storage-pools').set(editor).expect(200);
    await http()
      .post('/v1/storage-pools')
      .set(editor)
      .send({ name: 'x', driver: 'LOCAL', config: { basePath: '/tmp/x' } })
      .expect(403);
  });
});
