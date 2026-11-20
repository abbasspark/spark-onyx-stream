// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of assets and resumable uploads against a real PostgreSQL
// database and real directories on disk. Skipped unless TEST_DATABASE_URL is set.
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { ApiKeysModule } from '../src/api-keys/api-keys.module.js';
import { AssetsModule } from '../src/assets/assets.module.js';
import { StorageModule, StoragePoolsModule } from '../src/storage/storage.module.js';
import { encodeUploadMetadata } from '../src/uploads/upload-metadata.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const TUS = { 'Tus-Resumable': '1.0.0' };
const MAX_BYTES = 1024 * 1024;

describe.skipIf(!TEST_DATABASE_URL)('Assets and uploads (e2e, real database)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let storageDirectory: string;
  let uploadDirectory: string;
  let ownerToken: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-uploads-'));
    storageDirectory = path.join(workDirectory, 'storage');
    uploadDirectory = path.join(workDirectory, 'uploads');
    testApp = await createTestApp(
      [StorageModule, StoragePoolsModule, AssetsModule, AdminsModule, ApiKeysModule],
      {
        STORAGE_LOCAL_PATH: storageDirectory,
        UPLOAD_TEMP_PATH: uploadDirectory,
        UPLOAD_MAX_BYTES: String(MAX_BYTES),
      },
    );
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    // Unfinished uploads of earlier tests would otherwise still be in the directory.
    await rm(uploadDirectory, { recursive: true, force: true });
    await mkdir(uploadDirectory, { recursive: true });
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp?.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  async function createAsset(title = 'Test film', headers = auth()): Promise<string> {
    const response = await http().post('/v1/assets').set(headers).send({ title }).expect(201);
    return response.body.asset.id as string;
  }

  function startUpload(assetId: string, size: number, filename = 'film.mp4', headers = auth()) {
    return http()
      .post('/v1/uploads')
      .set(headers)
      .set(TUS)
      .set('Upload-Length', String(size))
      .set('Upload-Metadata', encodeUploadMetadata({ assetId, filename }));
  }

  function sendBytes(assetId: string, offset: number, bytes: Buffer, headers = auth()) {
    return http()
      .patch(`/v1/uploads/${assetId}`)
      .set(headers)
      .set(TUS)
      .set('Upload-Offset', String(offset))
      .set('Content-Type', 'application/offset+octet-stream')
      .send(bytes);
  }

  /**
   * The file moves into storage shortly after the last byte, and processing is
   * queued right after that, so the status is polled.
   */
  async function waitForStatus(assetId: string, status: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await http().get(`/v1/assets/${assetId}`).set(auth()).expect(200);
      if (response.body.status === status) {
        return response.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Asset ${assetId} did not reach status ${status}`);
  }

  describe('assets', () => {
    it('creates an asset in the default pool with upload instructions', async () => {
      const response = await http()
        .post('/v1/assets')
        .set(auth())
        .send({ title: '  My film  ' })
        .expect(201);

      expect(response.body.asset).toMatchObject({ title: 'My film', status: 'UPLOADING' });
      expect(response.body.asset.source).toEqual({ filename: null, bytes: null, checksum: null });
      expect(response.body.upload).toEqual({
        protocol: 'tus',
        endpoint: '/v1/uploads',
        metadata: { assetId: response.body.asset.id },
        maxBytes: MAX_BYTES,
      });
    });

    it('lists, searches, renames and deletes', async () => {
      const first = await createAsset('Ocean documentary');
      await createAsset('City timelapse');

      const all = await http().get('/v1/assets').set(auth()).expect(200);
      expect(all.body.total).toBe(2);

      const found = await http().get('/v1/assets?q=OCEAN').set(auth()).expect(200);
      expect(found.body.items.map((asset: { id: string }) => asset.id)).toEqual([first]);

      const renamed = await http()
        .patch(`/v1/assets/${first}`)
        .set(auth())
        .send({ title: 'Deep ocean' })
        .expect(200);
      expect(renamed.body.title).toBe('Deep ocean');

      await http().delete(`/v1/assets/${first}`).set(auth()).expect(204);
      await http().get(`/v1/assets/${first}`).set(auth()).expect(404);

      const remaining = await http().get('/v1/assets').set(auth()).expect(200);
      expect(remaining.body.total).toBe(1);
      const deleted = await http().get('/v1/assets?status=DELETED').set(auth()).expect(200);
      expect(deleted.body.total).toBe(1);
    });

    it('rejects an unknown or inactive storage pool', async () => {
      await http()
        .post('/v1/assets')
        .set(auth())
        .send({ title: 'X', storagePoolId: '019a0000-0000-7000-8000-000000000000' })
        .expect(400);
    });
  });

  describe('uploads', () => {
    it('receives a file in resumable chunks and stores it in the pool', async () => {
      const content = randomBytes(200_000);
      const assetId = await createAsset();

      const started = await startUpload(assetId, content.length, 'My Film (final).mp4').expect(201);
      expect(started.headers.location).toBe(`/v1/uploads/${assetId}`);

      const firstPart = await sendBytes(assetId, 0, content.subarray(0, 80_000)).expect(204);
      expect(firstPart.headers['upload-offset']).toBe('80000');

      // A client that lost its connection asks where to continue.
      const progress = await http().head(`/v1/uploads/${assetId}`).set(auth()).set(TUS).expect(200);
      expect(progress.headers['upload-offset']).toBe('80000');
      expect(progress.headers['upload-length']).toBe(String(content.length));

      // Sending from the wrong position is refused.
      await sendBytes(assetId, 0, content.subarray(0, 10)).expect(409);

      await sendBytes(assetId, 80_000, content.subarray(80_000)).expect(204);

      const asset = await waitForStatus(assetId, 'PROCESSING');
      expect(asset.source).toEqual({
        filename: 'My Film (final).mp4',
        bytes: String(content.length),
        checksum: `sha256:${createHash('sha256').update(content).digest('hex')}`,
      });

      const stored = await readFile(
        path.join(storageDirectory, 'sources', assetId, 'My_Film_final_.mp4'),
      );
      expect(stored.equals(content)).toBe(true);

      // Nothing is left in the temporary directory.
      expect(await readdir(uploadDirectory)).toEqual([]);

      const pools = await http().get('/v1/storage-pools').set(auth()).expect(200);
      expect(pools.body[0].usedBytes).toBe(String(content.length));

      const log = await http()
        .get('/v1/audit-logs?action=asset.upload_complete')
        .set(auth())
        .expect(200);
      expect(log.body.total).toBe(1);
    });

    it('keeps a hostile file name inside the asset folder', async () => {
      const content = randomBytes(1_000);
      const assetId = await createAsset();

      await startUpload(assetId, content.length, '../../../etc/cron.d/evil job.mp4').expect(201);
      await sendBytes(assetId, 0, content).expect(204);
      await waitForStatus(assetId, 'PROCESSING');

      expect(await readdir(path.join(storageDirectory, 'sources', assetId))).toEqual([
        'evil_job.mp4',
      ]);
    });

    it('refuses a second source file for the same asset', async () => {
      const content = randomBytes(1_000);
      const assetId = await createAsset();
      await startUpload(assetId, content.length).expect(201);
      await sendBytes(assetId, 0, content).expect(204);
      await waitForStatus(assetId, 'PROCESSING');

      await startUpload(assetId, content.length).expect(409);
      await sendBytes(assetId, 0, content).expect(410);
    });

    it('validates the request that starts an upload', async () => {
      const assetId = await createAsset();

      // No metadata at all.
      await http().post('/v1/uploads').set(auth()).set(TUS).set('Upload-Length', '10').expect(400);
      // No file name.
      await http()
        .post('/v1/uploads')
        .set(auth())
        .set(TUS)
        .set('Upload-Length', '10')
        .set('Upload-Metadata', encodeUploadMetadata({ assetId }))
        .expect(400);
      // No size.
      await http()
        .post('/v1/uploads')
        .set(auth())
        .set(TUS)
        .set('Upload-Metadata', encodeUploadMetadata({ assetId, filename: 'a.mp4' }))
        .expect(400);
      // Larger than the limit.
      await startUpload(assetId, MAX_BYTES + 1).expect(413);
      // Asset that does not exist.
      await startUpload('019a0000-0000-7000-8000-000000000000', 10).expect(404);
    });

    it('refuses a file that does not fit the pool quota', async () => {
      const pool = await http()
        .post('/v1/storage-pools')
        .set(auth())
        .send({
          name: 'small',
          driver: 'LOCAL',
          config: { basePath: path.join(workDirectory, 'small') },
          quotaBytes: 500,
        })
        .expect(201);
      const created = await http()
        .post('/v1/assets')
        .set(auth())
        .send({ title: 'Too big', storagePoolId: pool.body.id })
        .expect(201);

      await startUpload(created.body.asset.id, 501).expect(507);
      await startUpload(created.body.asset.id, 500).expect(201);
    });

    it('discards the received bytes when the asset is deleted', async () => {
      const assetId = await createAsset();
      await startUpload(assetId, 1_000).expect(201);
      await sendBytes(assetId, 0, randomBytes(400)).expect(204);
      expect((await readdir(uploadDirectory)).length).toBeGreaterThan(0);

      await http().delete(`/v1/assets/${assetId}`).set(auth()).expect(204);

      expect(await readdir(uploadDirectory)).toEqual([]);
      await sendBytes(assetId, 400, randomBytes(600)).expect(404);
    });

    it('requires credentials and the assets:write permission', async () => {
      const assetId = await createAsset();

      await http()
        .post('/v1/uploads')
        .set(TUS)
        .set('Upload-Length', '10')
        .set('Upload-Metadata', encodeUploadMetadata({ assetId, filename: 'a.mp4' }))
        .expect(401);

      await http()
        .post('/v1/admins')
        .set(auth())
        .send({
          email: 'viewer@example.com',
          displayName: 'Vera Viewer',
          password: 'viewer-password-123',
          role: 'VIEWER',
        })
        .expect(201);
      const viewer = testApp.bearer(
        await testApp.login('viewer@example.com', 'viewer-password-123'),
      );

      await http().get('/v1/assets').set(viewer).expect(200);
      await http().post('/v1/assets').set(viewer).send({ title: 'No' }).expect(403);
      await startUpload(assetId, 10, 'a.mp4', viewer).expect(403);
    });

    it('lets an API key with assets:write create and upload', async () => {
      const created = await http()
        .post('/v1/api-keys')
        .set(auth())
        .send({ name: 'Uploader', scopes: ['assets:read', 'assets:write'] })
        .expect(201);
      const key = testApp.bearer(created.body.key as string);
      const content = randomBytes(2_000);

      const assetId = await createAsset('From a script', key);
      await startUpload(assetId, content.length, 'clip.mov', key).expect(201);
      await sendBytes(assetId, 0, content, key).expect(204);

      const asset = await waitForStatus(assetId, 'PROCESSING');
      expect(asset.source.bytes).toBe('2000');
    });
  });
});
