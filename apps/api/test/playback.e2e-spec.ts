// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of playback: signed URLs and delivery of the generated
// files. An asset is uploaded and processed with real FFmpeg first.
//
// Skipped unless TEST_DATABASE_URL is set and FFmpeg is installed.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AssetsModule } from '../src/assets/assets.module.js';
import { createPlaybackToken } from '../src/playback/playback-token.js';
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

/** The playback signing secret the test application is configured with. */
const SIGNING_SECRET = 'b'.repeat(64);

describe.skipIf(!TEST_DATABASE_URL || !hasFfmpeg)('Playback (e2e, real FFmpeg)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let ownerToken: string;
  let assetId: string;
  let manifestUrl: string;
  let posterUrl: string;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  /** The part of a playback URL before the file path: /v1/media/{assetId}/{token} */
  const baseOf = (url: string) => url.split('/').slice(0, 5).join('/');

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-playback-'));
    const source = path.join(workDirectory, 'film.mp4');
    generateVideo(source, copyableVideoOptions());

    testApp = await createTestApp([AssetsModule, ProcessingStepsModule], {
      STORAGE_LOCAL_PATH: path.join(workDirectory, 'storage'),
      UPLOAD_TEMP_PATH: path.join(workDirectory, 'uploads'),
      PROCESSING_TEMP_PATH: path.join(workDirectory, 'processing'),
      FFMPEG_PATH: FFMPEG,
      FFPROBE_PATH: FFPROBE,
    });

    // One processed asset serves every test in this file.
    await testApp.resetDatabase();
    ownerToken = await testApp.setupOwner();
    assetId = await uploadSource(testApp, ownerToken, source);
    await drainQueue(testApp);

    const playback = await http().post(`/v1/assets/${assetId}/playback`).set(auth()).expect(200);
    manifestUrl = playback.body.manifestUrl;
    posterUrl = playback.body.posterUrl;
  }, 120_000);

  afterAll(async () => {
    await testApp?.close();
    await rm(workDirectory, { recursive: true, force: true });
  });

  it('issues signed URLs that outlast the video', async () => {
    const before = Date.now();
    const playback = await http().post(`/v1/assets/${assetId}/playback`).set(auth()).expect(200);

    expect(playback.body.protocol).toBe('hls');
    expect(playback.body.manifestUrl).toMatch(
      new RegExp(`^/v1/media/${assetId}/\\d+\\.[A-Za-z0-9_-]{43}/hls/master\\.m3u8$`),
    );
    expect(playback.body.posterUrl).toMatch(/\/thumbs\/poster\.jpg$/);
    expect(playback.body.thumbnailTrackUrl).toMatch(/\/thumbs\/sprite\.vtt$/);
    // The default lifetime is six hours.
    const lifetimeMs = new Date(playback.body.expiresAt).getTime() - before;
    expect(lifetimeMs).toBeGreaterThan(5.9 * 60 * 60 * 1000);
    expect(lifetimeMs).toBeLessThan(6.1 * 60 * 60 * 1000);
  });

  it('needs credentials to issue URLs, but not to use them', async () => {
    await http().post(`/v1/assets/${assetId}/playback`).expect(401);

    // No Authorization header from here on: the token in the URL is enough.
    const manifest = await http().get(manifestUrl).expect(200);
    expect(manifest.headers['content-type']).toContain('application/vnd.apple.mpegurl');
    expect(manifest.text).toContain('#EXT-X-STREAM-INF');
  });

  it('lets a player follow the playlists down to the segments', async () => {
    const manifest = await http().get(manifestUrl).expect(200);
    const variantPath = manifest.text.split('\n').find((line) => line.endsWith('playlist.m3u8'));
    expect(variantPath).toBe('360p/playlist.m3u8');

    // Relative paths resolve next to the manifest, so they carry the same token.
    const hlsBase = manifestUrl.slice(0, manifestUrl.lastIndexOf('/'));
    const playlist = await http().get(`${hlsBase}/${variantPath}`).expect(200);
    const initFile = /#EXT-X-MAP:URI="([^"]+)"/.exec(playlist.text)?.[1];
    const firstSegment = playlist.text.split('\n').find((line) => line.endsWith('.m4s'));
    expect(initFile).toBeDefined();
    expect(firstSegment).toBeDefined();

    const init = await http().get(`${hlsBase}/360p/${initFile}`).buffer(true).expect(200);
    expect(init.headers['content-type']).toBe('video/mp4');

    const segment = await http().get(`${hlsBase}/360p/${firstSegment}`).buffer(true).expect(200);
    expect(segment.headers['content-type']).toBe('video/iso.segment');
    expect(Number(segment.headers['content-length'])).toBeGreaterThan(1_000);
    expect(segment.headers['accept-ranges']).toBe('bytes');
    expect(segment.headers['cache-control']).toBe('private, max-age=3600');
  });

  it('serves the seek-bar preview track and its picture', async () => {
    const playback = await http().post(`/v1/assets/${assetId}/playback`).set(auth()).expect(200);

    const track = await http().get(playback.body.thumbnailTrackUrl).expect(200);
    expect(track.headers['content-type']).toContain('text/vtt');
    expect(track.text).toContain('sprite.jpg#xywh=0,0,160,90');

    // The cues name the picture relative to the track, so it is found beside it.
    const base = playback.body.thumbnailTrackUrl.replace(/sprite\.vtt$/, '');
    const sprite = await http().get(`${base}sprite.jpg`).buffer(true).expect(200);
    expect(sprite.headers['content-type']).toBe('image/jpeg');
  });

  it('serves byte ranges', async () => {
    const whole = await http().get(posterUrl).buffer(true).expect(200);
    const size = Number(whole.headers['content-length']);
    expect(whole.headers['content-type']).toBe('image/jpeg');

    const part = await http().get(posterUrl).set('Range', 'bytes=0-99').buffer(true).expect(206);
    expect(part.headers['content-range']).toBe(`bytes 0-99/${size}`);
    expect(part.headers['content-length']).toBe('100');
    expect((part.body as Buffer).equals((whole.body as Buffer).subarray(0, 100))).toBe(true);

    const tail = await http().get(posterUrl).set('Range', 'bytes=-10').buffer(true).expect(206);
    expect(tail.headers['content-range']).toBe(`bytes ${size - 10}-${size - 1}/${size}`);

    const beyond = await http().get(posterUrl).set('Range', `bytes=${size}-`).expect(416);
    expect(beyond.headers['content-range']).toBe(`bytes */${size}`);
  });

  it('answers HEAD without a body', async () => {
    const head = await http().head(manifestUrl).expect(200);

    expect(Number(head.headers['content-length'])).toBeGreaterThan(0);
    expect(head.text ?? '').toBe('');
  });

  it('refuses a changed, expired or foreign token with a plain 404', async () => {
    const [, , , id, token] = manifestUrl.split('/') as [string, string, string, string, string];
    const [expiry, signature] = token.split('.') as [string, string];
    const file = 'hls/master.m3u8';

    // Signature altered.
    const flipped = signature.startsWith('A') ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;
    await http().get(`/v1/media/${id}/${expiry}.${flipped}/${file}`).expect(404);
    // Expiry extended without a new signature.
    await http()
      .get(`/v1/media/${id}/${Number(expiry) + 1000}.${signature}/${file}`)
      .expect(404);
    // Correctly signed, but already expired.
    const expired = createPlaybackToken(id, Math.floor(Date.now() / 1000) - 10, SIGNING_SECRET);
    await http().get(`/v1/media/${id}/${expired}/${file}`).expect(404);
    // A valid token of this asset used for another asset.
    await http().get(`/v1/media/019a0000-0000-7000-8000-000000000000/${token}/${file}`).expect(404);
    // Not a token at all.
    await http().get(`/v1/media/${id}/not-a-token/${file}`).expect(404);
  });

  it('serves only generated files, never the source or anything outside the asset', async () => {
    const base = baseOf(manifestUrl);

    await http().get(`${base}/hls/missing.m4s`).expect(404);
    await http().get(`${base}/sources/film.mp4`).expect(404);
    await http().get(`${base}/hls/..%2F..%2F..%2Fsources%2F${assetId}%2Ffilm.mp4`).expect(404);
    await http().get(`${base}/hls/%2e%2e/%2e%2e/%2e%2e/sources/${assetId}/film.mp4`).expect(404);
    await http().get(`${base}/thumbs/../../../../etc/passwd`).expect(404);
  });

  it('refuses playback of an asset that is not ready', async () => {
    const created = await http()
      .post('/v1/assets')
      .set(auth())
      .send({ title: 'Empty' })
      .expect(201);

    const response = await http()
      .post(`/v1/assets/${created.body.asset.id}/playback`)
      .set(auth())
      .expect(409);
    expect(response.body.message).toMatch(/not ready to play/);

    await http()
      .post('/v1/assets/019a0000-0000-7000-8000-000000000000/playback')
      .set(auth())
      .expect(404);
  });

  it('gives the poster address and ordering in the asset list', async () => {
    const list = await http().get('/v1/assets?sort=title&order=asc').set(auth()).expect(200);
    const asset = list.body.items.find((item: { id: string }) => item.id === assetId);

    expect(asset.posterUrl).toMatch(
      new RegExp(`^/v1/media/${assetId}/\\d+\\.[A-Za-z0-9_-]{43}/thumbs/poster\\.jpg$`),
    );
    const poster = await http().get(asset.posterUrl).expect(200);
    expect(poster.headers['content-type']).toBe('image/jpeg');

    // The address is stable within the hour, so browsers can keep the picture.
    const again = await http().get(`/v1/assets/${assetId}`).set(auth()).expect(200);
    expect(again.body.posterUrl).toBe(asset.posterUrl);

    await http().get('/v1/assets?sort=password').set(auth()).expect(400);
  });

  it('gives the poster address and ordering in the asset list', async () => {
    const list = await http().get('/v1/assets?sort=title&order=asc').set(auth()).expect(200);
    const asset = list.body.items.find((item: { id: string }) => item.id === assetId);

    expect(asset.posterUrl).toMatch(
      new RegExp(`^/v1/media/${assetId}/\\d+\\.[A-Za-z0-9_-]{43}/thumbs/poster\\.jpg$`),
    );
    const poster = await http().get(asset.posterUrl).expect(200);
    expect(poster.headers['content-type']).toBe('image/jpeg');

    // The address is stable within the hour, so browsers can keep the picture.
    const again = await http().get(`/v1/assets/${assetId}`).set(auth()).expect(200);
    expect(again.body.posterUrl).toBe(asset.posterUrl);

    await http().get('/v1/assets?sort=password').set(auth()).expect(400);
  });

  it('lists the qualities, subtitles and pictures of an asset', async () => {
    const media = await http().get(`/v1/assets/${assetId}/media`).set(auth()).expect(200);

    expect(media.body.renditions).toEqual([
      expect.objectContaining({
        name: expect.stringMatching(/^\d+p$/),
        width: expect.any(Number),
        height: expect.any(Number),
        bitrate: expect.any(Number),
        codec: expect.stringMatching(/^avc1\./),
        sizeBytes: expect.stringMatching(/^[1-9]\d*$/),
      }),
    ]);
    expect(media.body.outputBytes).toBe(media.body.renditions[0].sizeBytes);
    expect(media.body.subtitles).toEqual([]);

    // Each address is signed and can be fetched as it is.
    const { posterUrl, spriteUrl, spriteTrackUrl } = media.body.thumbnails;
    expect((await http().get(posterUrl).expect(200)).headers['content-type']).toBe('image/jpeg');
    expect((await http().get(spriteUrl).expect(200)).headers['content-type']).toBe('image/jpeg');
    expect((await http().get(spriteTrackUrl).expect(200)).text).toContain('WEBVTT');

    await http().get(`/v1/assets/${assetId}/media`).expect(401);
    await http()
      .get('/v1/assets/00000000-0000-7000-8000-000000000000/media')
      .set(auth())
      .expect(404);
  });

  it('announces changes to open admin panels', async () => {
    const events = testApp.redis.published
      .filter((entry) => entry.channel === 'onyx:events')
      .map((entry) => JSON.parse(entry.message) as { type: string; [key: string]: unknown });

    expect(events).toContainEqual({ type: 'asset', assetId, change: 'created' });
    expect(events).toContainEqual({ type: 'asset', assetId, change: 'uploaded' });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'job', assetId, jobType: 'PROBE', status: 'QUEUED' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'job', assetId, jobType: 'PROBE', status: 'COMPLETED' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'job', assetId, status: 'RUNNING' }),
    );
    // Events are hints. They never carry titles, paths or other content.
    for (const event of events) {
      expect(Object.keys(event).every((key) => !/title|path|error|url/i.test(key))).toBe(true);
    }
  });
});
