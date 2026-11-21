// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of cleaning up after deleted assets and of the periodic
// repairs. Assets are processed with real FFmpeg, so real files are removed.
//
// Skipped unless TEST_DATABASE_URL is set and FFmpeg is installed.
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AssetsModule } from '../src/assets/assets.module.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { MaintenanceModule } from '../src/maintenance/maintenance.module.js';
import { MaintenanceService } from '../src/maintenance/maintenance.service.js';
import { ProcessingApiModule, ProcessingStepsModule } from '../src/processing/processing.module.js';
import {
  copyableVideoOptions,
  drainQueue,
  FFMPEG,
  FFPROBE,
  generateVideo,
  hasFfmpeg,
  uploadSource,
} from './support/processing-helpers.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

describe.skipIf(!TEST_DATABASE_URL || !hasFfmpeg)('Cleanup and repairs (e2e, real FFmpeg)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let storageDirectory: string;
  let ownerToken: string;
  let source: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const outputFolder = (assetId: string) => path.join(storageDirectory, 'assets', assetId);
  const sourceFolder = (assetId: string) => path.join(storageDirectory, 'sources', assetId);

  async function usedBytes(): Promise<bigint> {
    return (await testApp.prisma.storagePool.findFirstOrThrow()).usedBytes;
  }

  async function jobsOf(assetId: string): Promise<Record<string, string>> {
    const jobs = await testApp.prisma.job.findMany({ where: { assetId } });
    return Object.fromEntries(jobs.map((job) => [job.type, job.status]));
  }

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-maintenance-'));
    storageDirectory = path.join(workDirectory, 'storage');
    source = path.join(workDirectory, 'film.mp4');
    generateVideo(source, copyableVideoOptions());

    testApp = await createTestApp(
      [AssetsModule, ProcessingApiModule, ProcessingStepsModule, MaintenanceModule],
      {
        STORAGE_LOCAL_PATH: storageDirectory,
        UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
        PROCESSING_TEMP_PATH: path.join(workDirectory, 'processing'),
        FFMPEG_PATH: FFMPEG,
        FFPROBE_PATH: FFPROBE,
      },
    );
  }, 60_000);

  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp?.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  it('removes every file of a deleted asset and stops its playback', async () => {
    const assetId = await uploadSource(testApp, ownerToken, source, { encryption: 'AES_128' });
    await drainQueue(testApp);
    expect(existsSync(path.join(outputFolder(assetId), 'hls', 'master.m3u8'))).toBe(true);
    expect(existsSync(sourceFolder(assetId))).toBe(true);
    expect(await usedBytes()).toBeGreaterThan(0n);

    const playback = await http().post(`/v1/assets/${assetId}/playback`).set(auth()).expect(200);
    await http().get(playback.body.manifestUrl).expect(200);

    await http().delete(`/v1/assets/${assetId}`).set(auth()).expect(204);
    await drainQueue(testApp);

    expect(existsSync(outputFolder(assetId))).toBe(false);
    expect(existsSync(sourceFolder(assetId))).toBe(false);
    expect(await usedBytes()).toBe(0n);
    expect(await testApp.prisma.rendition.count({ where: { assetId } })).toBe(0);
    expect(await testApp.prisma.thumbnail.count({ where: { assetId } })).toBe(0);
    expect(await testApp.prisma.encryptionKey.count({ where: { assetId } })).toBe(0);
    expect((await jobsOf(assetId)).CLEANUP).toBe('COMPLETED');

    const row = await testApp.prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    expect(row).toMatchObject({ status: 'DELETED', sourcePath: null, manifestPath: null });
    await http().get(`/v1/assets/${assetId}`).set(auth()).expect(404);
  }, 120_000);

  it('stops waiting jobs when an asset is deleted before it was processed', async () => {
    const assetId = await uploadSource(testApp, ownerToken, source);
    expect(testApp.queue.waiting.map((job) => job.name)).toEqual(['PROBE']);

    await http().delete(`/v1/assets/${assetId}`).set(auth()).expect(204);
    expect(testApp.queue.waiting.map((job) => job.name)).toEqual(['CLEANUP']);
    await drainQueue(testApp);

    expect(await jobsOf(assetId)).toEqual({ PROBE: 'CANCELLED', CLEANUP: 'COMPLETED' });
    expect(existsSync(sourceFolder(assetId))).toBe(false);
    expect(existsSync(outputFolder(assetId))).toBe(false);
    expect(await usedBytes()).toBe(0n);
  }, 60_000);

  it('never cleans up an asset that is not deleted', async () => {
    const assetId = await uploadSource(testApp, ownerToken, source);
    await drainQueue(testApp);

    await testApp.app.get(JobsService).enqueue({ type: 'CLEANUP', assetId });
    await drainQueue(testApp);

    expect((await jobsOf(assetId)).CLEANUP).toBe('FAILED');
    expect(existsSync(path.join(outputFolder(assetId), 'hls', 'master.m3u8'))).toBe(true);
    expect(existsSync(sourceFolder(assetId))).toBe(true);
    const asset = await http().get(`/v1/assets/${assetId}`).set(auth()).expect(200);
    expect(asset.body.status).toBe('READY');
  }, 120_000);

  it('starts the processing of an upload that was stored but never queued', async () => {
    const assetId = await uploadSource(testApp, ownerToken, source);
    // What a database or Redis outage at the end of the upload leaves behind.
    testApp.queue.waiting.length = 0;
    await testApp.prisma.job.deleteMany({ where: { assetId } });
    await testApp.prisma.asset.update({ where: { id: assetId }, data: { status: 'UPLOADED' } });

    const maintenance = testApp.app.get(MaintenanceService);
    // Too fresh: a request may still be working on it.
    expect(await maintenance.sweep()).toEqual({ started: 0, cleanups: 0 });
    expect(await maintenance.sweep(0)).toEqual({ started: 1, cleanups: 0 });
    // Now it has a job, so it is not started twice.
    expect(await maintenance.sweep(0)).toEqual({ started: 0, cleanups: 0 });

    await drainQueue(testApp);
    const asset = await http().get(`/v1/assets/${assetId}`).set(auth()).expect(200);
    expect(asset.body.status).toBe('READY');
  }, 120_000);

  it('queues the cleanup of a deleted asset whose files are still there', async () => {
    const assetId = await uploadSource(testApp, ownerToken, source);
    await drainQueue(testApp);
    // What a failed queue write during deletion leaves behind.
    await testApp.prisma.asset.update({
      where: { id: assetId },
      data: { status: 'DELETED', deletedAt: new Date() },
    });

    const maintenance = testApp.app.get(MaintenanceService);
    expect(await maintenance.sweep()).toEqual({ started: 0, cleanups: 0 });
    expect(await maintenance.sweep(0)).toEqual({ started: 0, cleanups: 1 });
    expect(await maintenance.sweep(0)).toEqual({ started: 0, cleanups: 0 });

    await drainQueue(testApp);
    expect(existsSync(outputFolder(assetId))).toBe(false);
    expect(existsSync(sourceFolder(assetId))).toBe(false);
    expect(await usedBytes()).toBe(0n);
    // Nothing is left to repair.
    expect(await maintenance.sweep(0)).toEqual({ started: 0, cleanups: 0 });
  }, 120_000);

  it('deletes viewer sessions that ended long ago and keeps the rest', async () => {
    const maintenance = testApp.app.get(MaintenanceService);
    const viewer = await testApp.prisma.viewer.create({
      data: { email: 'anna@example.com', displayName: 'Anna', passwordHash: 'x' },
    });
    const day = 24 * 60 * 60 * 1000;
    const session = (name: string, expiresInDays: number, revokedDaysAgo?: number) => ({
      viewerId: viewer.id,
      tokenHash: name,
      userAgent: name,
      expiresAt: new Date(Date.now() + expiresInDays * day),
      revokedAt: revokedDaysAgo === undefined ? null : new Date(Date.now() - revokedDaysAgo * day),
    });
    await testApp.prisma.viewerSession.createMany({
      data: [
        session('active', 20),
        session('expired yesterday', -1),
        session('expired long ago', -10),
        session('signed out yesterday', 20, 1),
        session('signed out long ago', 20, 10),
      ],
    });

    expect(await maintenance.purgeEndedViewerSessions()).toBe(2);
    const left = await testApp.prisma.viewerSession.findMany({ orderBy: { userAgent: 'asc' } });
    expect(left.map((item) => item.userAgent)).toEqual([
      'active',
      'expired yesterday',
      'signed out yesterday',
    ]);
  });
});
