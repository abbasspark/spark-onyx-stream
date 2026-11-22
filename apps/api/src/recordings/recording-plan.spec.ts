// SPDX-License-Identifier: AGPL-3.0-only
import {
  buildRecordArgs,
  parseDatedSegments,
  pickStart,
  recordingFileName,
} from './recording-plan.js';

const PLAYLIST = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:100
#EXT-X-MAP:URI="init-a.mp4"
#EXTINF:4.000000,
#EXT-X-PROGRAM-DATE-TIME:2026-11-22T09:21:17.000+0100
seg-100.m4s
#EXTINF:4.000000,
#EXT-X-PROGRAM-DATE-TIME:2026-11-22T09:21:21.000+0100
seg-101.m4s
#EXTINF:2.500000,
seg-102.m4s
`;
const at = (time: string) => Date.parse(`2026-11-22T${time}Z`);

describe('parseDatedSegments', () => {
  it('reads the time of every segment, also in the form FFmpeg writes it', () => {
    expect(parseDatedSegments(PLAYLIST)).toEqual([
      { name: 'seg-100.m4s', seconds: 4, startsAt: at('08:21:17.000') },
      { name: 'seg-101.m4s', seconds: 4, startsAt: at('08:21:21.000') },
      // Without a time of its own, it follows the one before.
      { name: 'seg-102.m4s', seconds: 2.5, startsAt: at('08:21:25.000') },
    ]);
  });

  it('leaves out segments it cannot place', () => {
    expect(parseDatedSegments('#EXTM3U\n#EXTINF:4,\nseg-1.m4s\n')).toEqual([]);
  });
});

describe('pickStart', () => {
  const segments = parseDatedSegments(PLAYLIST);

  it('finds the segment that covers a moment', () => {
    expect(pickStart(segments, at('08:21:22.500'))).toEqual({ index: 1, at: at('08:21:21.000') });
    expect(pickStart(segments, at('08:21:17.000'))).toEqual({ index: 0, at: at('08:21:17.000') });
  });

  it('takes the oldest segment when the moment is no longer kept', () => {
    expect(pickStart(segments, at('07:00:00.000'))?.index).toBe(0);
  });

  it('waits when the moment lies ahead', () => {
    expect(pickStart(segments, at('08:21:27.500'))).toBeNull();
    expect(pickStart([], at('08:21:00.000'))).toBeNull();
  });
});

describe('buildRecordArgs', () => {
  it('copies from the local playlist, from a segment on, for a set time', () => {
    const args = buildRecordArgs('/live/abc/index.m3u8', 12, 1800.5, '/live/rec/part-0.mp4');
    const pair = (flag: string) => args[args.indexOf(flag) + 1];
    expect(pair('-live_start_index')).toBe('12');
    expect(pair('-i')).toBe('/live/abc/index.m3u8');
    expect(pair('-c')).toBe('copy');
    expect(pair('-t')).toBe('1800.500');
    expect(pair('-protocol_whitelist')).toBe('file,crypto');
    expect(args.at(-1)).toBe('/live/rec/part-0.mp4');
    // Start options come before the input they belong to.
    expect(args.indexOf('-live_start_index')).toBeLessThan(args.indexOf('-i'));
  });
});

describe('recordingFileName', () => {
  it('is made from the title and the start, with nothing a file system dislikes', () => {
    const start = new Date('2026-11-22T19:30:00.000Z');
    expect(recordingFileName('Evening News: Special / Part 2', start)).toBe(
      'Evening-News-Special-Part-2-2026-11-22-19-30.mp4',
    );
    expect(recordingFileName('../../etc/passwd', start)).toBe('etcpasswd-2026-11-22-19-30.mp4');
    expect(recordingFileName('???', start)).toBe('recording-2026-11-22-19-30.mp4');
  });
});
