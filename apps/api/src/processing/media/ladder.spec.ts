// SPDX-License-Identifier: AGPL-3.0-only
import { planRenditions, type ProfileRendition } from './ladder.js';

function rendition(name: string, height: number, videoBitrate: number): ProfileRendition {
  return {
    name,
    height,
    videoBitrate,
    audioBitrate: 128_000,
    videoCodec: 'h264',
    audioCodec: 'aac',
    preset: 'medium',
    sortOrder: 0,
  };
}

const PROFILE = [
  rendition('360p', 360, 800_000),
  rendition('1080p', 1080, 5_000_000),
  rendition('720p', 720, 2_800_000),
  rendition('480p', 480, 1_400_000),
];

describe('planRenditions', () => {
  it('uses the whole profile for a source at least as tall, highest quality first', () => {
    expect(planRenditions(PROFILE, 2160).map((r) => r.name)).toEqual([
      '1080p',
      '720p',
      '480p',
      '360p',
    ]);
    expect(planRenditions(PROFILE, 1080).map((r) => r.name)).toEqual([
      '1080p',
      '720p',
      '480p',
      '360p',
    ]);
  });

  it('never upscales', () => {
    expect(planRenditions(PROFILE, 720).map((r) => r.name)).toEqual(['720p', '480p', '360p']);
    expect(planRenditions(PROFILE, 576).map((r) => r.name)).toEqual(['480p', '360p']);
  });

  it('encodes a very small source once, at its own height', () => {
    expect(planRenditions(PROFILE, 240)).toEqual([
      { ...rendition('360p', 360, 800_000), name: '240p', height: 240 },
    ]);
  });

  it('rounds an odd source height down to an even number', () => {
    expect(planRenditions(PROFILE, 241)[0]?.height).toBe(240);
    expect(planRenditions(PROFILE, 361).map((r) => r.name)).toEqual(['360p']);
  });

  it('rejects an empty profile and unsafe names', () => {
    expect(() => planRenditions([], 1080)).toThrow(/no renditions/);
    expect(() => planRenditions([rendition('../x', 360, 1)], 1080)).toThrow(/may contain only/);
    expect(() => planRenditions([rendition('720p hd', 720, 1)], 1080)).toThrow(/may contain only/);
  });
});
