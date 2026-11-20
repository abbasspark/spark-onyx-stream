// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the dashboard figures.
//
// Skipped unless TEST_DATABASE_URL is set.
import { AssetsModule } from '../src/assets/assets.module.js';
import { StatsModule } from '../src/stats/stats.module.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('Stats (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);

  beforeAll(async () => {
    testApp = await createTestApp([AssetsModule, StatsModule]);
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp?.close();
  });

  it('starts with zeros on an empty installation', async () => {
    const stats = await http().get('/v1/stats/overview').set(auth()).expect(200);

    expect(stats.body.assets).toEqual({ total: 0, byStatus: {}, readyDurationMs: 0 });
    expect(stats.body.jobs).toEqual({
      queued: 0,
      running: 0,
      completedLast24h: 0,
      failedLast24h: 0,
    });
    expect(stats.body.uploadsPerDay).toHaveLength(14);
    expect(stats.body.recentFailures).toEqual([]);
  });

  it('counts assets, jobs and storage', async () => {
    const created = await http().post('/v1/assets').set(auth()).send({ title: 'A' }).expect(201);
    await http().post('/v1/assets').set(auth()).send({ title: 'B' }).expect(201);
    const removed = await http().post('/v1/assets').set(auth()).send({ title: 'C' }).expect(201);
    await http().delete(`/v1/assets/${removed.body.asset.id}`).set(auth()).expect(204);

    const assetId = created.body.asset.id as string;
    const pool = await testApp.prisma.storagePool.findFirstOrThrow();
    await testApp.prisma.storagePool.update({
      where: { id: pool.id },
      data: { usedBytes: 5_000_000_000n, quotaBytes: 20_000_000_000n },
    });
    await testApp.prisma.asset.update({
      where: { id: assetId },
      data: { status: 'READY', durationMs: 90_000 },
    });
    const now = new Date();
    const old = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    await testApp.prisma.job.createMany({
      data: [
        { type: 'PROBE', assetId, status: 'QUEUED' },
        { type: 'TRANSCODE', assetId, status: 'RUNNING' },
        { type: 'REMUX', assetId, status: 'COMPLETED', finishedAt: now },
        { type: 'REMUX', assetId, status: 'COMPLETED', finishedAt: old },
        { type: 'THUMBNAILS', assetId, status: 'FAILED', finishedAt: now, error: 'No picture' },
      ],
    });

    const stats = await http().get('/v1/stats/overview').set(auth()).expect(200);

    expect(stats.body.assets).toEqual({
      total: 2,
      byStatus: { READY: 1, UPLOADING: 1 },
      readyDurationMs: 90_000,
    });
    // Deleting an asset queued its cleanup, which is the second waiting job.
    expect(stats.body.jobs).toEqual({
      queued: 2,
      running: 1,
      completedLast24h: 1,
      failedLast24h: 1,
    });
    expect(stats.body.storage).toEqual({
      pools: 1,
      usedBytes: '5000000000',
      quotaBytes: '20000000000',
    });
    expect(stats.body.uploadsPerDay.at(-1)).toEqual({
      date: now.toISOString().slice(0, 10),
      count: 2,
    });
    expect(stats.body.recentFailures).toEqual([
      expect.objectContaining({
        type: 'THUMBNAILS',
        assetId,
        assetTitle: 'A',
        error: 'No picture',
      }),
    ]);
  });

  it('needs a sign-in', async () => {
    await http().get('/v1/stats/overview').expect(401);
  });
});
