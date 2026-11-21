// SPDX-License-Identifier: AGPL-3.0-only
import { findPreview, parsePreviewTrack } from './vtt';

const BASE = 'https://example.org/v1/media/a1/token/thumbnails/thumbnails.vtt';
const TRACK = `WEBVTT

00:00:00.000 --> 00:00:10.000
sprite.jpg#xywh=0,0,160,90

00:00:10.000 --> 00:00:20.000
sprite.jpg#xywh=160,0,160,90

01:00:20.000 --> 01:00:30.000
sprite-2.jpg#xywh=0,90,160,90
`;

describe('parsePreviewTrack', () => {
  it('reads times, regions and addresses next to the track', () => {
    const cues = parsePreviewTrack(TRACK, BASE);
    expect(cues).toHaveLength(3);
    expect(cues[1]).toEqual({
      start: 10,
      end: 20,
      url: 'https://example.org/v1/media/a1/token/thumbnails/sprite.jpg',
      x: 160,
      y: 0,
      width: 160,
      height: 90,
    });
    expect(cues[2]).toMatchObject({ start: 3620, end: 3630, y: 90 });
    expect(cues[2]?.url).toContain('/thumbnails/sprite-2.jpg');
  });

  it('accepts Windows line ends and times without hours', () => {
    const cues = parsePreviewTrack(
      'WEBVTT\r\n\r\n00:05.000 --> 00:15.000\r\nsprite.jpg#xywh=0,0,160,90\r\n',
      BASE,
    );
    expect(cues).toMatchObject([{ start: 5, end: 15 }]);
  });

  it('skips cues it cannot read', () => {
    const broken = `WEBVTT

00:00:00.000 --> 00:00:10.000
sprite.jpg

nonsense --> 00:00:20.000
sprite.jpg#xywh=0,0,160,90

00:00:20.000 --> 00:00:30.000
sprite.jpg#xywh=0,0,160,90
`;
    expect(parsePreviewTrack(broken, BASE)).toMatchObject([{ start: 20 }]);
    expect(parsePreviewTrack('', BASE)).toEqual([]);
    expect(parsePreviewTrack('<html>not found</html>', BASE)).toEqual([]);
  });
});

describe('findPreview', () => {
  const cues = parsePreviewTrack(TRACK, BASE);

  it('finds the picture for a moment', () => {
    expect(findPreview(cues, 0)?.x).toBe(0);
    expect(findPreview(cues, 9.9)?.x).toBe(0);
    expect(findPreview(cues, 10)?.x).toBe(160);
    expect(findPreview(cues, 3625)?.y).toBe(90);
  });

  it('falls back to the nearest end and has nothing for an empty track', () => {
    expect(findPreview(cues, 99_999)?.y).toBe(90);
    expect(findPreview([], 5)).toBeUndefined();
  });
});
