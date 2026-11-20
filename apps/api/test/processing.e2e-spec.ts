// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the processing pipeline: a real upload, real FFmpeg and
// a real database. The queue is replaced by one the test drains itself, so
// each job runs at a known moment.
//
// Skipped unless TEST_DATABASE_URL is set and FFmpeg is installed.
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AssetsModule } from '../src/assets/assets.module.js';
import { ProcessingApiModule, ProcessingStepsModule } from '../src/processing/processing.module.js';
import { StoragePoolsModule } from '../src/storage/storage.module.js';
import {
  copyableVideoOptions,
  drainQueue as drainQueueOf,
  FFMPEG,
  FFPROBE,
  generateVideo,
  hasFfmpeg,
  uploadSource as uploadSourceTo,
} from './support/processing-helpers.js';
import { createTestApp, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

describe.skipIf(!TEST_DATABASE_URL || !hasFfmpeg)('Processing pipeline (e2e, real FFmpeg)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let storageDirectory: string;
  let ownerToken: string;
  /** H.264 with one keyframe and MP3 audio: has to be transcoded. */
  let needsTranscode: string;
  /** H.264 with a keyframe every 2 s and AAC audio: can be copied. */
  let copyable: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-processing-'));
    storageDirectory = path.join(workDirectory, 'storage');

    needsTranscode = path.join(workDirectory, 'needs-transcode.mkv');
    generateVideo(needsTranscode, [
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=1280x720:rate=30:duration=9',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=9',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-g',
      '600',
      '-b:v',
      '600k',
      '-c:a',
      'libmp3lame',
    ]);
    copyable = path.join(workDirectory, 'copyable.mp4');
    generateVideo(copyable, copyableVideoOptions());

    testApp = await createTestApp(
      [StoragePoolsModule, AssetsModule, ProcessingApiModule, ProcessingStepsModule],
      {
        STORAGE_LOCAL_PATH: storageDirectory,
        UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
        PROCESSING_TEMP_PATH: path.join(workDirectory, 'processing'),
        FFMPEG_PATH: FFMPEG,
        FFPROBE_PATH: FFPROBE,
      },
    );
  }, 120_000);

  beforeEach(async () => {
    await testApp.resetDatabase();
    await rm(storageDirectory, { recursive: true, force: true });
    await mkdir(storageDirectory, { recursive: true });
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp?.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  const uploadSource = (file: string, body: Record<string, unknown> = {}) =>
    uploadSourceTo(testApp, ownerToken, file, body);
  const drainQueue = () => drainQueueOf(testApp);

  async function getAsset(assetId: string) {
    return (await http().get(`/v1/assets/${assetId}`).set(auth()).expect(200)).body;
  }

  async function jobsOf(
    assetId: string,
  ): Promise<
    { type: string; status: string; error: string | null; output: Record<string, unknown> | null }[]
  > {
    const response = await http()
      .get(`/v1/jobs?assetId=${assetId}&pageSize=100`)
      .set(auth())
      .expect(200);
    return response.body.items;
  }

  function segmentDurations(playlist: string): string[] {
    return playlist.split('\n').filter((line) => line.startsWith('#EXTINF:'));
  }

  it('has a default encoding profile with four qualities', async () => {
    const response = await http().get('/v1/encoding-profiles').set(auth()).expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ name: 'default', isDefault: true, segmentSeconds: 4 });
    expect(response.body[0].renditions.map((r: { name: string }) => r.name)).toEqual([
      '1080p',
      '720p',
      '480p',
      '360p',
    ]);
  });

  it('transcodes a source into an aligned HLS ladder without upscaling', async () => {
    const assetId = await uploadSource(needsTranscode);
    await drainQueue();

    const asset = await getAsset(assetId);
    expect(asset.status).toBe('READY');
    expect(asset.processingMode).toBe('TRANSCODE');
    expect(asset.media).toMatchObject({
      width: 1280,
      height: 720,
      videoCodec: 'h264',
      audioCodec: 'mp3',
    });
    expect(asset.media.durationMs).toBeGreaterThan(8_500);
    expect(asset.readyAt).not.toBeNull();

    const jobs = await jobsOf(assetId);
    expect(jobs.map((job) => `${job.type}:${job.status}`).sort()).toEqual([
      'PROBE:COMPLETED',
      'THUMBNAILS:COMPLETED',
      'TRANSCODE:COMPLETED',
    ]);
    const probe = jobs.find((job) => job.type === 'PROBE');
    expect(String(probe?.output?.reason)).toContain('mp3');

    // The source is 720p, so the 1080p quality of the profile is left out.
    const hls = path.join(storageDirectory, 'assets', assetId, 'hls');
    const master = await readFile(path.join(hls, 'master.m3u8'), 'utf8');
    expect(master).toContain('RESOLUTION=1280x720');
    expect(master).toContain('RESOLUTION=854x480');
    expect(master).toContain('RESOLUTION=640x360');
    expect(master).not.toContain('1080');
    expect(master).toContain('avc1');
    expect(master).toContain('mp4a');

    // Every quality is cut at the same times, which quality switching and segment sharing need.
    const durations = await Promise.all(
      ['720p', '480p', '360p'].map(async (name) =>
        segmentDurations(await readFile(path.join(hls, name, 'playlist.m3u8'), 'utf8')),
      ),
    );
    expect(durations[0]?.length).toBeGreaterThanOrEqual(3);
    expect(durations[0]?.[0]).toBe('#EXTINF:4.000000,');
    expect(durations[1]).toEqual(durations[0]);
    expect(durations[2]).toEqual(durations[0]);

    const playlist = await readFile(path.join(hls, '720p', 'playlist.m3u8'), 'utf8');
    expect(playlist).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
    expect(playlist).toContain('#EXT-X-MAP:URI=');
    expect(playlist).toContain('#EXT-X-ENDLIST');
    expect((await readdir(path.join(hls, '720p'))).some((file) => file.endsWith('.m4s'))).toBe(
      true,
    );

    const renditions = await testApp.prisma.rendition.findMany({
      where: { assetId },
      orderBy: { height: 'desc' },
    });
    expect(renditions.map((r) => `${r.name}:${r.width}x${r.height}`)).toEqual([
      '720p:1280x720',
      '480p:854x480',
      '360p:640x360',
    ]);
    expect(renditions.every((r) => r.sizeBytes > 0n && r.bitrate > 0)).toBe(true);

    const poster = await stat(
      path.join(storageDirectory, 'assets', assetId, 'thumbs', 'poster.jpg'),
    );
    expect(poster.size).toBeGreaterThan(1_000);

    // The pool counts the source file and everything that was generated.
    const pool = await testApp.prisma.storagePool.findFirstOrThrow();
    const sourceSize = BigInt((await stat(needsTranscode)).size);
    expect(pool.usedBytes).toBeGreaterThan(sourceSize);

    // Working files are removed.
    expect(await readdir(path.join(workDirectory, 'processing'))).toEqual([]);
  }, 180_000);

  it('repackages a compatible source without re-encoding', async () => {
    const assetId = await uploadSource(copyable);
    await drainQueue();

    const asset = await getAsset(assetId);
    expect(asset.status).toBe('READY');
    expect(asset.processingMode).toBe('COPY');

    const jobs = await jobsOf(assetId);
    expect(jobs.map((job) => job.type).sort()).toEqual(['PROBE', 'REMUX', 'THUMBNAILS']);

    const hls = path.join(storageDirectory, 'assets', assetId, 'hls');
    expect(await readFile(path.join(hls, 'master.m3u8'), 'utf8')).toContain('RESOLUTION=640x360');
    const playlist = await readFile(path.join(hls, '360p', 'playlist.m3u8'), 'utf8');
    expect(segmentDurations(playlist).length).toBeGreaterThanOrEqual(3);

    const renditions = await testApp.prisma.rendition.findMany({ where: { assetId } });
    expect(renditions.map((r) => r.name)).toEqual(['360p']);
  }, 120_000);

  it('honors a forced mode and replaces the outputs when reprocessing', async () => {
    const assetId = await uploadSource(copyable);
    await drainQueue();
    const afterCopy = (await testApp.prisma.storagePool.findFirstOrThrow()).usedBytes;

    const accepted = await http()
      .post(`/v1/assets/${assetId}/reprocess`)
      .set(auth())
      .send({ processingMode: 'TRANSCODE' })
      .expect(202);
    expect(accepted.body.status).toBe('PROCESSING');
    // The earlier outputs are gone and their space is given back.
    expect(await readdir(path.join(storageDirectory, 'assets')).catch(() => [])).toEqual([]);
    expect((await testApp.prisma.storagePool.findFirstOrThrow()).usedBytes).toBeLessThan(afterCopy);

    await drainQueue();

    const asset = await getAsset(assetId);
    expect(asset.status).toBe('READY');
    expect(asset.processingMode).toBe('TRANSCODE');
    expect(await testApp.prisma.rendition.count({ where: { assetId } })).toBe(1);
    expect(await testApp.prisma.thumbnail.count({ where: { assetId } })).toBe(1);

    await http().post(`/v1/assets/${assetId}/reprocess`).set(auth()).expect(202);
    await http().post(`/v1/assets/${assetId}/reprocess`).set(auth()).expect(409);
  }, 180_000);

  it('fails an asset whose file is not a video, without retrying', async () => {
    const notVideo = path.join(workDirectory, 'notes.txt');
    await writeFile(notVideo, 'This is plainly not a video file.\n'.repeat(50));

    const assetId = await uploadSource(notVideo);
    await drainQueue();

    expect((await getAsset(assetId)).status).toBe('FAILED');
    const jobs = await jobsOf(assetId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ type: 'PROBE', status: 'FAILED' });
    expect(jobs[0]?.error).toMatch(/text file or a picture|not a media file/);
  }, 60_000);

  it('fails an audio-only file with a clear reason', async () => {
    const audioOnly = path.join(workDirectory, 'audio.m4a');
    generateVideo(audioOnly, ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'aac']);

    const assetId = await uploadSource(audioOnly);
    await drainQueue();

    expect((await getAsset(assetId)).status).toBe('FAILED');
    expect((await jobsOf(assetId))[0]?.error).toBe('The file contains no video stream');
  }, 60_000);

  it('cancels a waiting job and can retry it', async () => {
    const assetId = await uploadSource(copyable);
    const [probe] = await jobsOf(assetId);
    const probeId = (probe as unknown as { id: string }).id;

    const cancelled = await http().post(`/v1/jobs/${probeId}/cancel`).set(auth()).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(testApp.queue.waiting).toHaveLength(0);
    expect((await getAsset(assetId)).status).toBe('FAILED');

    await http().post(`/v1/jobs/${probeId}/cancel`).set(auth()).expect(409);

    const retried = await http().post(`/v1/jobs/${probeId}/retry`).set(auth()).expect(200);
    expect(retried.body.id).not.toBe(probeId);
    expect(retried.body).toMatchObject({ type: 'PROBE', status: 'QUEUED' });
    expect((await getAsset(assetId)).status).toBe('PROCESSING');

    await drainQueue();
    expect((await getAsset(assetId)).status).toBe('READY');
  }, 120_000);

  it('signals a running job to stop through Redis', async () => {
    const assetId = await uploadSource(copyable);
    const [probe] = await jobsOf(assetId);
    const probeId = (probe as unknown as { id: string }).id;
    await testApp.prisma.job.update({ where: { id: probeId }, data: { status: 'RUNNING' } });

    await http().post(`/v1/jobs/${probeId}/cancel`).set(auth()).expect(200);

    expect(testApp.redis.published).toEqual([{ channel: 'onyx:jobs:cancel', message: probeId }]);
  }, 60_000);
});
