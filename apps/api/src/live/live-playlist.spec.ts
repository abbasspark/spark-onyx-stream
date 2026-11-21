// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { measureBitrate, parseSegments } from './live-playlist.js';

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

  it('has no figure before there is a playlist', async () => {
    expect(await measureBitrate(directory)).toBeNull();
  });
});
