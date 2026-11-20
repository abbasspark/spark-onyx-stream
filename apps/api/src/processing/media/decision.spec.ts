// SPDX-License-Identifier: AGPL-3.0-only
import { decideProcessingMode } from './decision.js';
import type { MediaInfo } from './media-info.js';

function media(
  overrides: {
    video?: Partial<NonNullable<MediaInfo['video']>> | null;
    audioCodecs?: string[];
  } = {},
): MediaInfo {
  return {
    container: 'mov,mp4,m4a,3gp,3g2,mj2',
    durationMs: 60_000,
    sizeBytes: 10_000_000,
    bitrate: 1_300_000,
    video:
      overrides.video === null
        ? null
        : {
            index: 0,
            codec: 'h264',
            width: 1920,
            height: 1080,
            frameRate: 25,
            pixelFormat: 'yuv420p',
            profile: 'High',
            level: 40,
            rotation: 0,
            ...overrides.video,
          },
    audio: (overrides.audioCodecs ?? ['aac']).map((codec, index) => ({
      index,
      codec,
      profile: null,
      channels: 2,
      language: null,
      isDefault: index === 0,
    })),
    subtitles: [],
  };
}

const base = { maxKeyframeGapSeconds: 2, segmentSeconds: 4 };

describe('decideProcessingMode', () => {
  it('copies H.264 with AAC and regular keyframes', () => {
    expect(decideProcessingMode({ info: media(), ...base }).mode).toBe('COPY');
  });

  it('copies a file without audio', () => {
    expect(decideProcessingMode({ info: media({ audioCodecs: [] }), ...base }).mode).toBe('COPY');
  });

  it('transcodes another video codec', () => {
    const decision = decideProcessingMode({ info: media({ video: { codec: 'hevc' } }), ...base });

    expect(decision.mode).toBe('TRANSCODE');
    expect(decision.reason).toContain('hevc');
  });

  it('transcodes 10-bit video', () => {
    const decision = decideProcessingMode({
      info: media({ video: { pixelFormat: 'yuv420p10le' } }),
      ...base,
    });

    expect(decision.mode).toBe('TRANSCODE');
  });

  it('transcodes rotated video', () => {
    expect(decideProcessingMode({ info: media({ video: { rotation: 90 } }), ...base }).mode).toBe(
      'TRANSCODE',
    );
  });

  it('transcodes when any audio stream is not AAC', () => {
    const decision = decideProcessingMode({
      info: media({ audioCodecs: ['aac', 'ac3'] }),
      ...base,
    });

    expect(decision.mode).toBe('TRANSCODE');
    expect(decision.reason).toContain('ac3');
  });

  it('transcodes when keyframes are too far apart or missing', () => {
    expect(
      decideProcessingMode({ info: media(), maxKeyframeGapSeconds: 8.3, segmentSeconds: 4 }).mode,
    ).toBe('TRANSCODE');
    expect(
      decideProcessingMode({ info: media(), maxKeyframeGapSeconds: null, segmentSeconds: 4 }).mode,
    ).toBe('TRANSCODE');
  });

  it('accepts a keyframe distance equal to the segment length', () => {
    expect(
      decideProcessingMode({ info: media(), maxKeyframeGapSeconds: 4.04, segmentSeconds: 4 }).mode,
    ).toBe('COPY');
  });

  it('lists every reason', () => {
    const decision = decideProcessingMode({
      info: media({ video: { codec: 'vp9' }, audioCodecs: ['opus'] }),
      ...base,
    });

    expect(decision.reason).toContain('vp9');
    expect(decision.reason).toContain('opus');
  });

  it('honors a forced mode', () => {
    expect(
      decideProcessingMode({
        info: media({ video: { codec: 'hevc' } }),
        ...base,
        forcedMode: 'COPY',
      }).mode,
    ).toBe('COPY');
    expect(decideProcessingMode({ info: media(), ...base, forcedMode: 'TRANSCODE' }).mode).toBe(
      'TRANSCODE',
    );
  });

  it('rejects a file without video, even with a forced mode', () => {
    expect(() =>
      decideProcessingMode({ info: media({ video: null }), ...base, forcedMode: 'COPY' }),
    ).toThrow(/no video stream/);
  });
});
