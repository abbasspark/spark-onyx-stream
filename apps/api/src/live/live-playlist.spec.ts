// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { measureBitrate, parseSegments, parseVariants } from './live-playlist.js';

const PLAYLIST = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:100
#EXT-X-MAP:URI="init-a.mp4"
#EXTINF:4.000000,
#EXT-X-PROGRAM-DATE-TIME:2026-11-21T19:59:20.361+0100
seg-100.m4s
#EXTINF:2.000000,
seg-101.m4s
`;

describe('parseSegments', () => {
  it('lists the segments with their lengths', () => {
    expect(parseSegments(PLAYLIST)).toEqual([
      { name: 'seg-100.m4s', seconds: 4 },
      { name: 'seg-101.m4s', seconds: 2 },
    ]);
  });
});

const MASTER = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=2890800,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2"
q-720p.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=910800,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
q-360p.m3u8
`;

describe('parseVariants', () => {
  it('lists the playlists of the qualities, and nothing for a plain playlist', () => {
    expect(parseVariants(MASTER)).toEqual(['q-720p.m3u8', 'q-360p.m3u8']);
    expect(parseVariants(PLAYLIST)).toEqual([]);
  });
});

describe('measureBitrate', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'onyx-live-'));
  });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  it('divides the size of the listed segments by their length', async () => {
    await writeFile(path.join(directory, 'index.m3u8'), PLAYLIST);
    await writeFile(path.join(directory, 'seg-100.m4s'), Buffer.alloc(500_000));
    await writeFile(path.join(directory, 'seg-101.m4s'), Buffer.alloc(250_000));
    expect(await measureBitrate(directory)).toBe(1_000_000);
  });

  it('leaves out a segment that is gone', async () => {
    await writeFile(path.join(directory, 'index.m3u8'), PLAYLIST);
    await writeFile(path.join(directory, 'seg-101.m4s'), Buffer.alloc(250_000));
    expect(await measureBitrate(directory)).toBe(1_000_000);
  });

  it('measures the best quality of a channel that has several', async () => {
    await writeFile(path.join(directory, 'index.m3u8'), MASTER);
    await writeFile(path.join(directory, 'q-720p.m3u8'), PLAYLIST);
    await writeFile(path.join(directory, 'seg-100.m4s'), Buffer.alloc(1_000_000));
    await writeFile(path.join(directory, 'seg-101.m4s'), Buffer.alloc(500_000));
    expect(await measureBitrate(directory)).toBe(2_000_000);
  });

  it('measures the newest segments of a channel that keeps hours', async () => {
    const lines = ['#EXTM3U'];
    for (let index = 0; index < 100; index += 1) {
      lines.push('#EXTINF:1.000000,', `seg-${index}.m4s`);
      // The old ones are large, the newest six small.
      await writeFile(
        path.join(directory, `seg-${index}.m4s`),
        Buffer.alloc(index >= 94 ? 125_000 : 1_250_000),
      );
    }
    await writeFile(path.join(directory, 'index.m3u8'), `${lines.join('\n')}\n`);
    expect(await measureBitrate(directory)).toBe(1_000_000);
  });

  it('has no figure before there is a playlist', async () => {
    expect(await measureBitrate(directory)).toBeNull();
  });
});
