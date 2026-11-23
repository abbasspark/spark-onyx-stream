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
    expect(await testApp.prisma.thumbnail.count({ where: { assetId } })).toBe(3);

    await http().post(`/v1/assets/${assetId}/reprocess`).set(auth()).expect(202);
    await http().post(`/v1/assets/${assetId}/reprocess`).set(auth()).expect(409);
  }, 180_000);

  it('converts embedded subtitles to WebVTT tracks and builds seek-bar previews', async () => {
    const english = path.join(workDirectory, 'en.srt');
    const german = path.join(workDirectory, 'de.srt');
    await writeFile(english, '1\n00:00:01,000 --> 00:00:03,000\nHello from the first cue\n\n');
    await writeFile(
      german,
      '1\n00:00:01,000 --> 00:00:03,000\nHallo aus dem ersten Untertitel\n\n',
    );
    const withSubtitles = path.join(workDirectory, 'with-subtitles.mkv');
    generateVideo(withSubtitles, [
      '-i',
      copyable,
      '-i',
      english,
      '-i',
      german,
      '-map',
      '0:v',
      '-map',
      '0:a',
      '-map',
      '1',
      '-map',
      '2',
      '-c',
      'copy',
      '-c:s',
      'srt',
      '-metadata:s:s:0',
      'language=eng',
      '-metadata:s:s:1',
      'language=ger',
      '-metadata:s:s:1',
      'title=Deutsch (SDH)',
    ]);

    const assetId = await uploadSource(withSubtitles);
    await drainQueue();
    expect((await getAsset(assetId)).status).toBe('READY');

    // Subtitles: one WebVTT file and one playlist per track, listed in the multivariant playlist.
    const hls = path.join(storageDirectory, 'assets', assetId, 'hls');
    const master = await readFile(path.join(hls, 'master.m3u8'), 'utf8');
    expect(master).toContain('TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en"');
    expect(master).toContain('NAME="Deutsch (SDH)",LANGUAGE="de"');
    expect(master).toContain('URI="subs/0-en/playlist.m3u8"');
    expect(master).toMatch(/#EXT-X-STREAM-INF:.*SUBTITLES="subs"/);

    const vtt = await readFile(path.join(hls, 'subs', '0-en', 'subtitles.vtt'), 'utf8');
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('Hello from the first cue');
    expect(await readFile(path.join(hls, 'subs', '1-de', 'playlist.m3u8'), 'utf8')).toContain(
      'subtitles.vtt',
    );

    const tracks = await testApp.prisma.subtitleTrack.findMany({
      where: { assetId },
      orderBy: { language: 'asc' },
    });
    expect(tracks.map((track) => `${track.language}:${track.label}:${track.source}`)).toEqual([
      'de:Deutsch (SDH):EMBEDDED',
      'en:English:EMBEDDED',
    ]);

    const encode = (await jobsOf(assetId)).find((job) => job.type === 'REMUX');
    expect(encode?.output?.subtitles).toEqual(['English', 'Deutsch (SDH)']);

    // Previews: a sprite sheet and the WebVTT file that indexes it.
    const thumbs = path.join(storageDirectory, 'assets', assetId, 'thumbs');
    expect((await readdir(thumbs)).sort()).toEqual(['poster.jpg', 'sprite.jpg', 'sprite.vtt']);
    const spriteVtt = await readFile(path.join(thumbs, 'sprite.vtt'), 'utf8');
    expect(spriteVtt).toContain('00:00:00.000 --> 00:00:02.000\nsprite.jpg#xywh=0,0,160,90');
    expect(spriteVtt).toContain('sprite.jpg#xywh=480,0,160,90');

    const kinds = await testApp.prisma.thumbnail.findMany({ where: { assetId } });
    expect(kinds.map((thumbnail) => thumbnail.type).sort()).toEqual([
      'POSTER',
      'SPRITE',
      'SPRITE_VTT',
    ]);
  }, 120_000);

  describe('subtitle files added to a video', () => {
    const SRT = '1\n00:00:01,000 --> 00:00:03,000\n<i>Guten</i> Abend\n\n';
    const addSubtitle = (assetId: string, query: string, body: string | Buffer) =>
      http()
        .post(`/v1/assets/${assetId}/subtitles?${query}`)
        .set(auth())
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.isBuffer(body) ? body : Buffer.from(body));
    const masterOf = (assetId: string) =>
      readFile(path.join(storageDirectory, 'assets', assetId, 'hls', 'master.m3u8'), 'utf8');
    const mediaOf = async (assetId: string) =>
      (await http().get(`/v1/assets/${assetId}/media`).set(auth()).expect(200)).body;

    it('are converted, offered by the player at once, renamed and removed', async () => {
      const assetId = await uploadSource(copyable);
      await drainQueue();
      const before = await masterOf(assetId);
      expect(before).not.toContain('SUBTITLES');

      const added = await addSubtitle(assetId, 'filename=film.de.srt', SRT).expect(201);
      expect(added.body).toMatchObject({
        track: { language: 'de', label: 'Deutsch', source: 'UPLOADED', isForced: false },
        cues: 1,
        format: 'srt',
        encoding: 'utf-8',
        warning: null,
      });
      const trackId = added.body.track.id as string;

      // The playlist names the track, and its files are where the playlist says.
      const master = await masterOf(assetId);
      expect(master).toContain(
        `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Deutsch",LANGUAGE="de",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI="subs/u-${trackId}/playlist.m3u8"`,
      );
      expect(master).toMatch(/#EXT-X-STREAM-INF:.*SUBTITLES="subs"/);
      const folder = path.join(storageDirectory, 'assets', assetId, 'hls', 'subs', `u-${trackId}`);
      expect(await readFile(path.join(folder, 'subtitles.vtt'), 'utf8')).toBe(
        'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<i>Guten</i> Abend\n',
      );
      expect(await readFile(path.join(folder, 'playlist.m3u8'), 'utf8')).toContain('subtitles.vtt');
      const media = await mediaOf(assetId);
      expect(media.subtitles).toHaveLength(1);
      expect(media.subtitles[0].url).toContain(`subs/u-${trackId}/subtitles.vtt`);

      // A second file in the same language gets a name of its own.
      const second = await addSubtitle(assetId, 'language=de&forced=true', SRT).expect(201);
      expect(second.body.track).toMatchObject({ label: 'Deutsch (Forced)', isForced: true });
      const third = await addSubtitle(assetId, 'language=de&label=Deutsch', SRT).expect(201);
      expect(third.body.track.label).toBe('Deutsch 2');
      expect(await masterOf(assetId)).toContain(
        'NAME="Deutsch (Forced)",LANGUAGE="de",DEFAULT=YES',
      );

      // Renamed, and given another language.
      const renamed = await http()
        .patch(`/v1/assets/${assetId}/subtitles/${trackId}`)
        .set(auth())
        .send({ label: 'Deutsch (Original)', language: 'de-AT' })
        .expect(200);
      expect(renamed.body).toMatchObject({ label: 'Deutsch (Original)', language: 'de-AT' });
      expect(await masterOf(assetId)).toContain('NAME="Deutsch (Original)",LANGUAGE="de-AT"');
      await http()
        .patch(`/v1/assets/${assetId}/subtitles/${trackId}`)
        .set(auth())
        .send({ label: 'Deutsch 2' })
        .expect(409);

      // The file can be read back.
      const file = await http()
        .get(`/v1/assets/${assetId}/subtitles/${trackId}/file`)
        .set(auth())
        .expect(200);
      expect(file.headers['content-type']).toContain('text/vtt');
      expect(file.text).toContain('Guten</i> Abend');

      // Removed: out of the playlist, and its files are gone.
      for (const id of [trackId, second.body.track.id, third.body.track.id]) {
        await http().delete(`/v1/assets/${assetId}/subtitles/${id}`).set(auth()).expect(204);
      }
      expect(await masterOf(assetId)).toBe(before);
      await expect(stat(folder)).rejects.toThrow();
      await expect(
        stat(path.join(storageDirectory, 'subtitles', assetId, `${trackId}.vtt`)),
      ).rejects.toThrow();
      await http().delete(`/v1/assets/${assetId}/subtitles/${trackId}`).set(auth()).expect(404);

      const actions = await testApp.prisma.auditLog.findMany({
        where: { action: { startsWith: 'asset.subtitle.' } },
      });
      expect(new Set(actions.map((entry) => entry.action))).toEqual(
        new Set(['asset.subtitle.add', 'asset.subtitle.update', 'asset.subtitle.remove']),
      );
    }, 120_000);

    it('wait for a video that is not ready, and stay when it is processed again', async () => {
      const assetId = await uploadSource(copyable);
      // Before anything was processed.
      const added = await addSubtitle(
        assetId,
        'language=ar&label=%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9',
        SRT,
      ).expect(201);
      const trackId = added.body.track.id as string;
      expect((await mediaOf(assetId)).subtitles[0].url).toBeNull();

      await drainQueue();
      expect((await getAsset(assetId)).status).toBe('READY');
      const line = `NAME="العربية",LANGUAGE="ar",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI="subs/u-${trackId}/playlist.m3u8"`;
      expect(await masterOf(assetId)).toContain(line);

      await http()
        .post(`/v1/assets/${assetId}/reprocess`)
        .set(auth())
        .send({ processingMode: 'TRANSCODE' })
        .expect(202);
      await drainQueue();
      expect((await getAsset(assetId)).status).toBe('READY');
      expect(await masterOf(assetId)).toContain(line);
      expect(
        await readFile(
          path.join(
            storageDirectory,
            'assets',
            assetId,
            'hls',
            'subs',
            `u-${trackId}`,
            'subtitles.vtt',
          ),
          'utf8',
        ),
      ).toContain('Guten');
      expect(await testApp.prisma.subtitleTrack.count({ where: { assetId } })).toBe(1);

      // Deleting the video takes the kept file with it.
      await http().delete(`/v1/assets/${assetId}`).set(auth()).expect(204);
      await drainQueue();
      await expect(stat(path.join(storageDirectory, 'subtitles', assetId))).rejects.toThrow();
    }, 180_000);

    it('read old encodings by the language, and refuse what is no subtitle file', async () => {
      const assetId = await uploadSource(copyable);
      await drainQueue();

      // "مرحبا" in Windows-1256.
      const arabic = Buffer.concat([
        Buffer.from('1\r\n00:00:01,000 --> 00:00:02,000\r\n', 'latin1'),
        Buffer.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7]),
      ]);
      const added = await addSubtitle(assetId, 'filename=film.ara.srt', arabic).expect(201);
      expect(added.body).toMatchObject({
        track: { language: 'ar', label: 'العربية' },
        encoding: 'windows-1256',
      });
      const file = await http()
        .get(`/v1/assets/${assetId}/subtitles/${added.body.track.id}/file`)
        .set(auth())
        .expect(200);
      expect(file.text).toContain('مرحبا');

      // Subtitles that go on long after the video ends are taken, with a remark.
      const late = await addSubtitle(
        assetId,
        'language=en',
        '1\n01:30:00,000 --> 01:30:02,000\nMuch later\n',
      ).expect(201);
      expect(late.body.warning).toMatch(/after the end of the video/);

      const refused = await addSubtitle(assetId, 'filename=notes.txt', 'just words').expect(400);
      expect(refused.body.message).toMatch(/not a SubRip/);
      await addSubtitle(assetId, 'language=german!', SRT).expect(400);
      await addSubtitle(assetId, 'language=de', Buffer.alloc(5 * 1024 * 1024 + 1, 'a')).expect(413);
      await addSubtitle('01a1fdfd-0000-7000-8000-000000000000', 'language=de', SRT).expect(404);
      await http().post(`/v1/assets/${assetId}/subtitles?language=de`).send(SRT).expect(401);
    }, 120_000);
  });

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

    expect(testApp.redis.published.filter((entry) => entry.channel === 'onyx:jobs:cancel')).toEqual(
      [{ channel: 'onyx:jobs:cancel', message: probeId }],
    );
  }, 60_000);
});
