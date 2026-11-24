// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of the sound tracks of a video, with the real FFmpeg:
// every sound stream of a source becomes a track, a sound file can be added
// to a video that is ready, and processing a video again keeps what was
// added and what was said about each track.
//
// Skipped unless TEST_DATABASE_URL is set and FFmpeg is installed.
import { spawnSync } from 'node:child_process';
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

interface Track {
  id: string;
  language: string;
  label: string;
  source: string;
  status: string;
  error: string | null;
  isDefault: boolean;
  inVideo: boolean;
  codec: string;
  channels: number;
  bitrate: number;
  sizeBytes: string;
  fileName: string | null;
}

describe.skipIf(!TEST_DATABASE_URL || !hasFfmpeg)('Sound tracks (e2e, real FFmpeg)', () => {
  let testApp: TestApp;
  let workDirectory: string;
  let storageDirectory: string;
  let ownerToken: string;
  /** H.264 and AAC, one language. */
  let oneLanguage: string;
  /** H.264 with English AAC and German MP3: the picture can still be copied. */
  let twoLanguages: string;
  /** Nine seconds of sound, as a dubbed version would come. */
  let dub: Buffer;

  const http = () => testApp.http();
  const auth = () => testApp.bearer(ownerToken);
  const uploadSource = (file: string, body: Record<string, unknown> = {}) =>
    uploadSourceTo(testApp, ownerToken, file, body);
  const drainQueue = () => drainQueueOf(testApp);
  const hls = (assetId: string, ...parts: string[]) =>
    path.join(storageDirectory, 'assets', assetId, 'hls', ...parts);
  const masterOf = (assetId: string) => readFile(hls(assetId, 'master.m3u8'), 'utf8');
  const tracksOf = async (assetId: string) =>
    (await http().get(`/v1/assets/${assetId}/audio-tracks`).set(auth()).expect(200))
      .body as Track[];
  const addAudio = (assetId: string, query: string, body: Buffer) =>
    http()
      .post(`/v1/assets/${assetId}/audio-tracks?${query}`)
      .set(auth())
      .set('Content-Type', 'application/octet-stream')
      .send(body);
  const audioLines = (master: string) =>
    master.split('\n').filter((line) => line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'));
  /** What FFprobe finds in a folder of the output. */
  const probe = (file: string) =>
    JSON.parse(
      spawnSync(FFPROBE, [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        file,
      ]).stdout.toString(),
    ) as { streams: { codec_type: string; codec_name: string; channels?: number }[] };

  beforeAll(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'onyx-audio-'));
    storageDirectory = path.join(workDirectory, 'storage');

    oneLanguage = path.join(workDirectory, 'one.mp4');
    generateVideo(oneLanguage, copyableVideoOptions());
    twoLanguages = path.join(workDirectory, 'two.mkv');
    generateVideo(twoLanguages, [
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=640x360:rate=30:duration=9',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=9',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:duration=9',
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-map',
      '2:a',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-g',
      '60',
      '-keyint_min',
      '60',
      '-sc_threshold',
      '0',
      '-c:a:0',
      'aac',
      '-c:a:1',
      'libmp3lame',
      '-metadata:s:a:0',
      'language=eng',
      '-metadata:s:a:1',
      'language=ger',
      '-disposition:a:0',
      'default',
      '-disposition:a:1',
      '0',
    ]);
    const dubFile = path.join(workDirectory, 'dub.mp3');
    generateVideo(dubFile, [
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=660:duration=9',
      '-c:a',
      'libmp3lame',
    ]);
    dub = await readFile(dubFile);

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

  it('keeps the sound of a video apart from its picture, also when there is one language', async () => {
    const assetId = await uploadSource(oneLanguage);
    await drainQueue();

    const master = await masterOf(assetId);
    expect(audioLines(master)).toEqual([
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Track 1",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="1",URI="audio-0-und/playlist.m3u8"',
    ]);
    expect(master).toMatch(
      /#EXT-X-STREAM-INF:.*CODECS="avc1\.[0-9a-f]+,mp4a\.40\.2".*AUDIO="audio"/,
    );
    // The quality holds the picture alone, the folder of the track the sound alone.
    const picture = probe(hls(assetId, '360p', 'playlist.m3u8')).streams;
    expect(picture.map((stream) => stream.codec_type)).toEqual(['video']);
    const sound = probe(hls(assetId, 'audio-0-und', 'playlist.m3u8')).streams;
    expect(sound).toHaveLength(1);
    // Taken as it is: the file had AAC, and the picture was copied too.
    expect(sound[0]).toMatchObject({ codec_type: 'audio', codec_name: 'aac', channels: 1 });

    const tracks = await tracksOf(assetId);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      source: 'EMBEDDED',
      status: 'READY',
      isDefault: true,
      inVideo: false,
      codec: 'aac',
      channels: 1,
    });
    expect(Number(tracks[0]!.sizeBytes)).toBeGreaterThan(1000);
    // The only sound of a video is not something to take out.
    await http()
      .delete(`/v1/assets/${assetId}/audio-tracks/${tracks[0]!.id}`)
      .set(auth())
      .expect(409);
  }, 120_000);

  it('makes a track of every sound stream of the source, and still copies the picture', async () => {
    const assetId = await uploadSource(twoLanguages);
    await drainQueue();

    const asset = (await http().get(`/v1/assets/${assetId}`).set(auth()).expect(200)).body;
    expect(asset.status).toBe('READY');
    // The second stream is MP3. It is encoded on its own and no longer costs the picture a transcode.
    expect(asset.processingMode).toBe('COPY');

    const master = await masterOf(assetId);
    expect(audioLines(master)).toEqual([
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="1",URI="audio-0-en/playlist.m3u8"',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Deutsch",LANGUAGE="de",DEFAULT=NO,AUTOSELECT=YES,CHANNELS="2",URI="audio-1-de/playlist.m3u8"',
    ]);
    for (const line of master.split('\n').filter((item) => item.startsWith('#EXT-X-STREAM-INF'))) {
      expect(line).toContain('AUDIO="audio"');
    }

    // MP3 does not play everywhere: that stream is encoded to stereo AAC.
    const folder = hls(assetId, 'audio-1-de');
    const playlist = await readFile(path.join(folder, 'playlist.m3u8'), 'utf8');
    expect(playlist).toContain('#EXT-X-MAP:URI="init.mp4"');
    expect(playlist).toContain('#EXT-X-ENDLIST');
    const found = probe(path.join(folder, 'playlist.m3u8')).streams;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ codec_type: 'audio', codec_name: 'aac', channels: 2 });

    const tracks = await tracksOf(assetId);
    expect(
      tracks.map((track) => [track.label, track.language, track.inVideo, track.isDefault]),
    ).toEqual([
      ['English', 'en', false, true],
      ['Deutsch', 'de', false, false],
    ]);
    expect(Number(tracks[1]!.sizeBytes)).toBeGreaterThan(1000);
    expect(tracks[1]!.bitrate).toBeGreaterThan(30_000);
    const media = (await http().get(`/v1/assets/${assetId}/media`).set(auth()).expect(200)).body;
    expect(media.audio).toHaveLength(2);

    // The player is served the track through the same signed address as the rest.
    const playback = await http().post(`/v1/assets/${assetId}/playback`).set(auth()).expect(200);
    // The answer says what there is to hear, before anything is loaded.
    expect(playback.body.audio).toEqual([
      { language: 'en', label: 'English', isDefault: true },
      { language: 'de', label: 'Deutsch', isDefault: false },
    ]);
    expect(playback.body.subtitles).toEqual([]);
    const base = (playback.body.manifestUrl as string).replace('master.m3u8', '');
    const served = await http().get(`${base}audio-1-de/playlist.m3u8`).expect(200);
    expect(served.text).toContain('seg-00000.m4s');
    await http().get(`${base}audio-1-de/seg-00000.m4s`).expect(200);
  }, 120_000);

  it('adds a sound file to a video that is ready, without touching the picture', async () => {
    const assetId = await uploadSource(oneLanguage);
    await drainQueue();
    const before = await masterOf(assetId);
    const pictureBefore = (await stat(hls(assetId, '360p', 'seg-00000.m4s'))).mtimeMs;

    const added = await addAudio(assetId, 'filename=film.fr.mp3', dub).expect(201);
    expect(added.body).toMatchObject({
      language: 'fr',
      label: 'Français',
      source: 'UPLOADED',
      status: 'PROCESSING',
      inVideo: false,
      isDefault: false,
      fileName: 'film.fr.mp3',
    });
    const trackId = added.body.id as string;
    // Until it is made, players are told nothing of it.
    expect(await masterOf(assetId)).toBe(before);

    await drainQueue();
    const [main, french] = await tracksOf(assetId);
    expect(french).toMatchObject({ id: trackId, status: 'READY', channels: 2, error: null });
    expect(Number(french!.sizeBytes)).toBeGreaterThan(1000);
    const master = await masterOf(assetId);
    expect(audioLines(master)).toEqual([
      `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${main!.label}",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="1",URI="audio-0-und/playlist.m3u8"`,
      `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Français",LANGUAGE="fr",DEFAULT=NO,AUTOSELECT=YES,CHANNELS="2",URI="audio-u-${trackId}/playlist.m3u8"`,
    ]);
    expect(master).toMatch(/#EXT-X-STREAM-INF:.*AUDIO="audio"/);
    expect(probe(hls(assetId, `audio-u-${trackId}`, 'playlist.m3u8')).streams[0]).toMatchObject({
      codec_name: 'aac',
      channels: 2,
    });
    expect((await stat(hls(assetId, '360p', 'seg-00000.m4s'))).mtimeMs).toBe(pictureBefore);
    const job = (
      await http().get(`/v1/jobs?assetId=${assetId}&pageSize=100`).set(auth()).expect(200)
    ).body.items.find((item: { type: string }) => item.type === 'AUDIO');
    expect(job).toMatchObject({ status: 'COMPLETED', output: { track: 'Français' } });

    // Named and given a language. The video without a language of its own gets one too.
    await http()
      .patch(`/v1/assets/${assetId}/audio-tracks/${main!.id}`)
      .set(auth())
      .send({ language: 'en', label: 'English' })
      .expect(200);
    const renamed = await http()
      .patch(`/v1/assets/${assetId}/audio-tracks/${trackId}`)
      .set(auth())
      .send({ label: 'Français (doublage)', language: 'fr-CA' })
      .expect(200);
    expect(renamed.body).toMatchObject({ label: 'Français (doublage)', language: 'fr-CA' });
    await http()
      .patch(`/v1/assets/${assetId}/audio-tracks/${trackId}`)
      .set(auth())
      .send({ label: 'English' })
      .expect(409);
    expect(audioLines(await masterOf(assetId))).toEqual([
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="1",URI="audio-0-und/playlist.m3u8"',
      `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Français (doublage)",LANGUAGE="fr-CA",DEFAULT=NO,AUTOSELECT=YES,CHANNELS="2",URI="audio-u-${trackId}/playlist.m3u8"`,
    ]);

    // Players start with the added one from now on.
    await http()
      .patch(`/v1/assets/${assetId}/audio-tracks/${trackId}`)
      .set(auth())
      .send({ isDefault: true })
      .expect(200);
    const defaults = audioLines(await masterOf(assetId)).map(
      (line) => /DEFAULT=(\w+)/.exec(line)?.[1],
    );
    expect(defaults).toEqual(['NO', 'YES']);
    expect((await tracksOf(assetId)).map((track) => track.isDefault)).toEqual([false, true]);

    // Removed: the playlist lists what is left, and nothing of the file is left.
    await http().delete(`/v1/assets/${assetId}/audio-tracks/${trackId}`).set(auth()).expect(204);
    expect(audioLines(await masterOf(assetId))).toEqual([
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="1",URI="audio-0-und/playlist.m3u8"',
    ]);
    await expect(stat(hls(assetId, `audio-u-${trackId}`))).rejects.toThrow();
    expect(await readdir(path.join(storageDirectory, 'audio', assetId))).toEqual([]);
    expect((await tracksOf(assetId)).map((track) => track.isDefault)).toEqual([true]);
  }, 120_000);

  it('says why a file could not be made into a track, and lets it be tried again or removed', async () => {
    const assetId = await uploadSource(oneLanguage);
    await drainQueue();
    const before = await masterOf(assetId);

    await addAudio(assetId, 'language=de', Buffer.alloc(0)).expect(400);
    await addAudio(assetId, 'language=german', dub).expect(400);
    await http()
      .post('/v1/assets/00000000-0000-7000-8000-000000000000/audio-tracks')
      .set(auth())
      .send(dub)
      .expect(404);
    await addAudio(assetId, 'language=de', dub).expect(201);

    const notSound = await addAudio(
      assetId,
      'language=it&filename=notes.txt',
      Buffer.from('These are notes, not sound.\n'.repeat(50)),
    ).expect(201);
    await drainQueue();
    const tracks = await tracksOf(assetId);
    const failed = tracks.find((track) => track.id === notSound.body.id)!;
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toMatch(/not a media file|no sound/);
    // A track that failed is not offered to players, and cannot be their default.
    expect(audioLines(await masterOf(assetId)).some((line) => line.includes('LANGUAGE="it"'))).toBe(
      false,
    );
    await http()
      .patch(`/v1/assets/${assetId}/audio-tracks/${failed.id}`)
      .set(auth())
      .send({ isDefault: true })
      .expect(409);

    const again = await http()
      .post(`/v1/assets/${assetId}/audio-tracks/${failed.id}/retry`)
      .set(auth())
      .expect(200);
    expect(again.body.status).toBe('PROCESSING');
    await drainQueue();
    expect((await tracksOf(assetId)).find((track) => track.id === failed.id)!.status).toBe(
      'FAILED',
    );
    // Only a failed one can be tried again.
    const ready = tracks.find((track) => track.language === 'de')!;
    await http()
      .post(`/v1/assets/${assetId}/audio-tracks/${ready.id}/retry`)
      .set(auth())
      .expect(409);

    for (const track of [failed, ready]) {
      await http().delete(`/v1/assets/${assetId}/audio-tracks/${track.id}`).set(auth()).expect(204);
    }
    expect(await masterOf(assetId)).toBe(before);
  }, 120_000);

  it('keeps added tracks, and what was said about each, when the video is processed again', async () => {
    const assetId = await uploadSource(twoLanguages);
    await drainQueue();
    const added = await addAudio(assetId, 'language=fr&label=Fran%C3%A7ais', dub).expect(201);
    await drainQueue();
    const [, german] = await tracksOf(assetId);
    await http()
      .patch(`/v1/assets/${assetId}/audio-tracks/${german!.id}`)
      .set(auth())
      .send({ label: 'Deutsch (Synchronfassung)', language: 'de-DE' })
      .expect(200);
    await http()
      .patch(`/v1/assets/${assetId}/audio-tracks/${added.body.id}`)
      .set(auth())
      .send({ isDefault: true })
      .expect(200);

    await http()
      .post(`/v1/assets/${assetId}/reprocess`)
      .set(auth())
      .send({ processingMode: 'TRANSCODE' })
      .expect(202);
    // While the video is made again, sound cannot be added to it.
    await addAudio(assetId, 'language=es', dub).expect(409);
    await drainQueue();

    const tracks = await tracksOf(assetId);
    expect(
      tracks.map((track) => [track.label, track.language, track.status, track.isDefault]),
    ).toEqual([
      ['English', 'en', 'READY', false],
      ['Deutsch (Synchronfassung)', 'de-DE', 'READY', false],
      ['Français', 'fr', 'READY', true],
    ]);
    expect(tracks[2]!.id).toBe(added.body.id);
    const lines = audioLines(await masterOf(assetId));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('NAME="English",LANGUAGE="en",DEFAULT=NO');
    expect(lines[1]).toContain('URI="audio-1-de/playlist.m3u8"');
    expect(lines[2]).toContain(
      `DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",URI="audio-u-${added.body.id}/playlist.m3u8"`,
    );
    for (const folder of ['audio-1-de', `audio-u-${added.body.id}`]) {
      expect(probe(hls(assetId, folder, 'playlist.m3u8')).streams[0]?.codec_name).toBe('aac');
    }
  }, 180_000);

  it('encrypts every track of an encrypted video with the key of the video', async () => {
    const assetId = await uploadSource(twoLanguages, { encryption: 'AES_128' });
    await drainQueue();
    const added = await addAudio(assetId, 'language=fr', dub).expect(201);
    await drainQueue();
    expect((await tracksOf(assetId)).map((track) => track.status)).toEqual([
      'READY',
      'READY',
      'READY',
    ]);

    for (const folder of ['audio-1-de', `audio-u-${added.body.id}`]) {
      const playlist = await readFile(hls(assetId, folder, 'playlist.m3u8'), 'utf8');
      // The same address as the qualities give: one key for the whole video.
      expect(playlist).toContain('#EXT-X-KEY:METHOD=AES-128,URI="../key"');
      expect(playlist).toContain('seg-00000.ts');
      // The segments are not readable as they lie on the disk.
      const plain = probe(hls(assetId, folder, 'seg-00000.ts'));
      expect(plain.streams ?? []).toEqual([]);
    }
    // No key was left with the files.
    const everything = (await readdir(hls(assetId), { recursive: true })).map(String);
    expect(everything.filter((name) => /key/i.test(name))).toEqual([]);
  }, 180_000);

  it('gives a silent video its first sound, and takes it away again', async () => {
    const silent = path.join(workDirectory, 'silent.mp4');
    generateVideo(silent, [
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=640x360:rate=30:duration=9',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-g',
      '60',
      '-keyint_min',
      '60',
      '-sc_threshold',
      '0',
    ]);
    const assetId = await uploadSource(silent);
    await drainQueue();
    const before = await masterOf(assetId);
    expect(before).not.toContain('AUDIO');
    expect(before).not.toContain('mp4a');
    expect(await tracksOf(assetId)).toEqual([]);

    const added = await addAudio(assetId, 'language=en', dub).expect(201);
    await drainQueue();
    const master = await masterOf(assetId);
    expect(audioLines(master)).toHaveLength(1);
    expect(audioLines(master)[0]).toContain('DEFAULT=YES');
    // The qualities now say that sound comes with them, and of what kind.
    expect(master).toMatch(/CODECS="avc1\.[0-9a-f]+,mp4a\.40\.2".*AUDIO="audio"/);
    expect((await tracksOf(assetId))[0]).toMatchObject({ status: 'READY', isDefault: true });

    await http()
      .delete(`/v1/assets/${assetId}/audio-tracks/${added.body.id}`)
      .set(auth())
      .expect(204);
    expect(await masterOf(assetId)).toBe(before);
  }, 120_000);

  it('starts picture and sound at the same moment', async () => {
    const assetId = await uploadSource(twoLanguages);
    await drainQueue();
    const startOf = (file: string) =>
      Number(
        spawnSync(FFPROBE, [
          '-v',
          'error',
          '-show_entries',
          'format=start_time',
          '-of',
          'csv=p=0',
          file,
        ])
          .stdout.toString()
          .trim(),
      );
    const picture = startOf(hls(assetId, '360p', 'playlist.m3u8'));
    for (const folder of ['audio-0-en', 'audio-1-de']) {
      // Within a frame or two: an encoder begins a few milliseconds early.
      expect(Math.abs(startOf(hls(assetId, folder, 'playlist.m3u8')) - picture)).toBeLessThan(0.08);
    }
  }, 120_000);

  it('plays a video from before sound was kept apart as it is, and asks to process it again for more', async () => {
    const assetId = await uploadSource(oneLanguage);
    await drainQueue();
    // As such a video is: no word about its sound, which is inside its picture.
    await testApp.prisma.audioTrack.deleteMany({ where: { assetId } });
    const older = (await masterOf(assetId))
      .split('\n')
      .filter((line) => !line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'))
      .map((line) => line.replace(',AUDIO="audio"', ''))
      .join('\n');
    await writeFile(hls(assetId, 'master.m3u8'), older);

    const tracks = await tracksOf(assetId);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ inVideo: true, isDefault: true, status: 'READY' });
    const refused = await addAudio(assetId, 'language=fr', dub).expect(409);
    expect(refused.body.message).toContain('Process it again');
    await http()
      .delete(`/v1/assets/${assetId}/audio-tracks/${tracks[0]!.id}`)
      .set(auth())
      .expect(409);
    // Naming it changes nothing about how it plays.
    await http()
      .patch(`/v1/assets/${assetId}/audio-tracks/${tracks[0]!.id}`)
      .set(auth())
      .send({ language: 'en', label: 'English' })
      .expect(200);
    expect(await masterOf(assetId)).toBe(older);

    // Processed again, its sound is apart, under the name it was given.
    await http().post(`/v1/assets/${assetId}/reprocess`).set(auth()).send({}).expect(202);
    await drainQueue();
    const after = await tracksOf(assetId);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ inVideo: false, label: 'English', language: 'en' });
    await addAudio(assetId, 'language=fr', dub).expect(201);
  }, 180_000);

  it('removes everything of the sound with the video', async () => {
    const assetId = await uploadSource(oneLanguage);
    await drainQueue();
    await addAudio(assetId, 'language=fr', dub).expect(201);
    await drainQueue();

    await http().delete(`/v1/assets/${assetId}`).set(auth()).expect(204);
    await drainQueue();
    await expect(stat(path.join(storageDirectory, 'audio', assetId))).rejects.toThrow();
    await expect(stat(path.join(storageDirectory, 'assets', assetId))).rejects.toThrow();
    expect(await testApp.prisma.audioTrack.count({ where: { assetId } })).toBe(0);
  }, 120_000);
});
