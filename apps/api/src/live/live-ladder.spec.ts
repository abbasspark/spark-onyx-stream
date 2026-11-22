// SPDX-License-Identifier: AGPL-3.0-only
import { ladderFor, playlistLength, videoKbpsFor } from './live-ladder.js';

const heights = (qualities: number[], source: number) =>
  ladderFor(qualities, source).map((rendition) => rendition.height);

describe('videoKbpsFor', () => {
  it('knows the usual heights and works out those in between', () => {
    expect(videoKbpsFor(1080)).toBe(5000);
    expect(videoKbpsFor(720)).toBe(2800);
    expect(videoKbpsFor(576)).toBe(1950);
    expect(videoKbpsFor(120)).toBe(400);
    expect(videoKbpsFor(4320)).toBe(14000);
  });

  it('gives fast pictures more, from 720 lines up', () => {
    expect(videoKbpsFor(1080, 50)).toBe(7000);
    expect(videoKbpsFor(720, 59.94)).toBe(3900);
    expect(videoKbpsFor(480, 50)).toBe(1400);
    expect(videoKbpsFor(1080, 25)).toBe(5000);
  });
});

describe('ladderFor', () => {
  it('keeps the chosen heights that fit, best first', () => {
    expect(heights([480, 1080, 720, 720], 1080)).toEqual([1080, 720, 480]);
    expect(heights([720, 360], 2160)).toEqual([720, 360]);
  });

  it('never makes a picture larger than the source', () => {
    expect(heights([1080, 720, 480], 720)).toEqual([720, 480]);
    expect(heights([1080, 720], 360)).toEqual([360]);
  });

  it('puts the height of the source in place of a top that was cut off', () => {
    expect(heights([1080, 720, 480], 576)).toEqual([576, 480]);
    expect(heights([1080, 720], 900)).toEqual([900, 720]);
    // Close to a chosen height, the source gets no quality of its own.
    expect(heights([1080, 480], 486)).toEqual([480]);
  });

  it('takes a source that is a few lines off a usual height as that height', () => {
    expect(heights([1080, 720], 1088)).toEqual([1080, 720]);
    expect(heights([1080, 720], 1072)).toEqual([1072, 720]);
  });

  it('uses the usual three when nothing is chosen', () => {
    expect(heights([], 1080)).toEqual([1080, 720, 480]);
  });

  it('uses even heights and names files after them', () => {
    expect(ladderFor([1080], 575)).toMatchObject([{ name: '574p', height: 574, profile: 'main' }]);
    expect(ladderFor([720], 1080)).toMatchObject([
      { name: '720p', videoKbps: 2800, maxrateKbps: 3080, profile: 'high' },
    ]);
  });
});

describe('playlistLength', () => {
  it('lists the usual few segments for a channel that only shows the present', () => {
    expect(playlistLength(0, 4, 6)).toBe(6);
  });

  it('lists enough segments for the whole window', () => {
    expect(playlistLength(30, 4, 6)).toBe(450);
    expect(playlistLength(240, 4, 6)).toBe(3600);
    expect(playlistLength(30, 7, 6)).toBe(258);
  });

  it('never lists fewer than a channel without a window would', () => {
    expect(playlistLength(30, 10, 500)).toBe(500);
  });
});
