// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of AES-128 encryption: an asset is processed with real
// FFmpeg, and a segment is decrypted with the key the playback path delivers.
//
// Skipped unless TEST_DATABASE_URL is set and FFmpeg is installed.
import { createDecipheriv } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Response } from 'supertest';
import { AssetsModule } from '../src/assets/assets.module.js';
import { ContentKeysService } from '../src/crypto/content-keys.service.js';
import { ProcessingStepsModule } from '../src/processing/processing.module.js';
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

/** Collects a binary response body. */
function binary(response: Response, done: (error: Error | null, body: unknown) => void): void {
  // During parsing, the response is the incoming stream.
  const stream = response as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => done(null, Buffer.concat(chunks)));
}

describe.skipIf(!TEST_DATABASE_URL || !hasFfmpeg)('Encryption (e2e, real FFmpeg)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let storageDirectory: string;
  let ownerToken: string;
  let source: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const baseOf = (url: string) => url.split('/').slice(0, 5).join('/');

  async function playbackBase(assetId: string): Promise<string> {
    const playback = await http().post(`/v1/assets/${assetId}/playback`).set(auth()).expect(200);
    return baseOf(playback.body.manifestUrl as string);
  }

  async function fetchBytes(url: string): Promise<Buffer> {
    const response = await http().get(url).buffer(true).parse(binary).expect(200);
    return response.body as Buffer;
  }

  /** Follows the playlists of an asset and checks that its first segment decrypts to MPEG-TS. */
  async function expectEncryptedPlayback(
    assetId: string,
  ): Promise<{ key: Buffer; qualities: number }> {
    const base = await playbackBase(assetId);
    const master = (await http().get(`${base}/hls/master.m3u8`).expect(200)).text;
    const qualities = master.split('\n').filter((line) => line.endsWith('/playlist.m3u8'));
    expect(qualities.length).toBeGreaterThan(0);
    expect(master).toMatch(/CODECS="avc1\.[0-9a-f]{6},mp4a\.40\.2"/);

    const quality = (qualities[0] as string).split('/')[0] as string;
    const playlist = (await http().get(`${base}/hls/${quality}/playlist.m3u8`).expect(200)).text;
    const keyLine = playlist.split('\n').find((line) => line.startsWith('#EXT-X-KEY:')) as string;
    expect(keyLine).toMatch(/^#EXT-X-KEY:METHOD=AES-128,URI="\.\.\/key",IV=0x[0-9a-f]{32}$/);
    expect(playlist).not.toContain('#EXT-X-MAP');
    const iv = Buffer.from(/IV=0x([0-9a-f]{32})/.exec(keyLine)?.[1] as string, 'hex');

    const keyResponse = await http().get(`${base}/hls/key`).buffer(true).parse(binary).expect(200);
    const key = keyResponse.body as Buffer;
    expect(key).toHaveLength(16);
    expect(keyResponse.headers['cache-control']).toBe('no-store');

    const segmentName = playlist.split('\n').find((line) => line.endsWith('.ts')) as string;
    const segmentResponse = await http()
      .get(`${base}/hls/${quality}/${segmentName}`)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(segmentResponse.headers['content-type']).toBe('video/mp2t');
    const encrypted = segmentResponse.body as Buffer;

    // An MPEG-TS packet is 188 bytes and starts with 0x47. The stored bytes must not look like that.
    expect(encrypted[0] === 0x47 && encrypted[188] === 0x47 && encrypted[376] === 0x47).toBe(false);

    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    expect(plain.length % 188).toBe(0);
    expect(plain[0]).toBe(0x47);
    expect(plain[188]).toBe(0x47);
    expect(plain[376]).toBe(0x47);

    return { key, qualities: qualities.length };
  }

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-encryption-'));
    storageDirectory = path.join(workDirectory, 'storage');
    source = path.join(workDirectory, 'film.mp4');
    generateVideo(source, copyableVideoOptions());

    testApp = await createTestApp([AssetsModule, ProcessingStepsModule], {
      STORAGE_LOCAL_PATH: storageDirectory,
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      PROCESSING_TEMP_PATH: path.join(workDirectory, 'processing'),
      FFMPEG_PATH: FFMPEG,
      FFPROBE_PATH: FFPROBE,
    });
  }, 60_000);

  beforeEach(async () => {
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
  });

  afterAll(async () => {
    await testApp?.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  it('encrypts a copied asset and delivers the key only with a valid token', async () => {
    const assetId = await uploadSource(testApp, ownerToken, source, { encryption: 'AES_128' });
    await drainQueue(testApp);

    const asset = await http().get(`/v1/assets/${assetId}`).set(auth()).expect(200);
    expect(asset.body).toMatchObject({
      status: 'READY',
      encryption: 'AES_128',
      processingMode: 'COPY',
    });

    const { key } = await expectEncryptedPlayback(assetId);

    // The key exists only encrypted in the database and nowhere in storage.
    const rows = await testApp.prisma.encryptionKey.findMany({ where: { assetId } });
    expect(rows).toHaveLength(1);
    const stored = Buffer.from(rows[0]?.encryptedKey as Uint8Array);
    expect(stored.toString('utf8')).toMatch(/^v1\./);
    expect(stored.includes(key)).toBe(false);
    expect(stored.toString('utf8')).not.toContain(key.toString('hex'));

    const files = await readdir(path.join(storageDirectory, 'assets', assetId, 'hls'), {
      recursive: true,
    });
    expect(files.some((file) => /key/i.test(file))).toBe(false);
    expect(files.some((file) => file.endsWith('.ts'))).toBe(true);
    expect(files.some((file) => file.endsWith('.m4s'))).toBe(false);

    // The working directory, which held the key during the job, is gone.
    const leftovers = await readdir(path.join(workDirectory, 'processing')).catch(() => []);
    expect(leftovers).toEqual([]);

    const base = await playbackBase(assetId);
    const [prefix, token] = [base.split('/').slice(0, 4).join('/'), base.split('/')[4] as string];
    // One character of the signature is changed. Not the last one: its lowest
    // bits are padding, so some changes there leave the signature the same.
    const at = token.length - 10;
    const changed = `${token.slice(0, at)}${token[at] === 'A' ? 'B' : 'A'}${token.slice(at + 1)}`;
    await http().get(`${prefix}/${changed}/hls/key`).expect(404);
    await http()
      .get(`${prefix}/0.${token.split('.')[1]}/hls/key`)
      .expect(404);
  }, 120_000);

  it('encrypts every quality of a transcoded asset with one key', async () => {
    const assetId = await uploadSource(testApp, ownerToken, source, {
      encryption: 'AES_128',
      processingMode: 'TRANSCODE',
    });
    await drainQueue(testApp);

    const asset = await http().get(`/v1/assets/${assetId}`).set(auth()).expect(200);
    expect(asset.body).toMatchObject({ status: 'READY', processingMode: 'TRANSCODE' });

    const { qualities } = await expectEncryptedPlayback(assetId);
    expect(qualities).toBe(1);

    const base = await playbackBase(assetId);
    const master = (await http().get(`${base}/hls/master.m3u8`).expect(200)).text;
    for (const line of master.split('\n').filter((entry) => entry.endsWith('/playlist.m3u8'))) {
      const playlist = (await http().get(`${base}/hls/${line}`).expect(200)).text;
      expect(playlist).toContain('#EXT-X-KEY:METHOD=AES-128,URI="../key"');
    }
  }, 180_000);

  it('has no key for an asset that is not encrypted', async () => {
    const assetId = await uploadSource(testApp, ownerToken, source);
    await drainQueue(testApp);

    const base = await playbackBase(assetId);
    await http().get(`${base}/hls/key`).expect(404);
    expect(await testApp.prisma.encryptionKey.count()).toBe(0);
    expect((await fetchBytes(`${base}/hls/master.m3u8`)).toString()).toContain('playlist.m3u8');
  }, 120_000);

  it('replaces the key when reprocessing and removes it when encryption is switched off', async () => {
    const assetId = await uploadSource(testApp, ownerToken, source, { encryption: 'AES_128' });
    await drainQueue(testApp);
    const first = (await expectEncryptedPlayback(assetId)).key;

    await http().post(`/v1/assets/${assetId}/reprocess`).set(auth()).send({}).expect(202);
    await drainQueue(testApp);
    // The playback service remembers a key for a short time, so ask the database.
    const rows = await testApp.prisma.encryptionKey.findMany({ where: { assetId } });
    expect(rows).toHaveLength(1);
    const second = await testApp.app.get(ContentKeysService).find(assetId);
    expect(second).not.toBeNull();
    expect(second?.key.equals(first)).toBe(false);

    await http()
      .post(`/v1/assets/${assetId}/reprocess`)
      .set(auth())
      .send({ encryption: 'NONE' })
      .expect(202);
    await drainQueue(testApp);

    const asset = await http().get(`/v1/assets/${assetId}`).set(auth()).expect(200);
    expect(asset.body).toMatchObject({ status: 'READY', encryption: 'NONE' });
    expect(await testApp.prisma.encryptionKey.count({ where: { assetId } })).toBe(0);

    const files = await readdir(path.join(storageDirectory, 'assets', assetId, 'hls'), {
      recursive: true,
    });
    expect(files.some((file) => file.endsWith('.m4s'))).toBe(true);
    expect(files.some((file) => file.endsWith('.ts'))).toBe(false);
  }, 240_000);

  it('rejects an unknown encryption mode', async () => {
    await http().post('/v1/assets').set(auth()).send({ title: 'X', encryption: 'DES' }).expect(400);
  });
});
