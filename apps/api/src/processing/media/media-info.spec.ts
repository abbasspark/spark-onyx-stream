// SPDX-License-Identifier: AGPL-3.0-only
import {
  maxKeyframeGap,
  parseFrameRate,
  parseProbe,
  unsupportedSourceReason,
} from './media-info.js';

const PROBE = JSON.stringify({
  format: {
    format_name: 'matroska,webm',
    duration: '13.025000',
    size: '12216770',
    bit_rate: '7503582',
  },
  streams: [
    {
      codec_type: 'video',
      codec_name: 'mjpeg',
      width: 600,
      height: 600,
      disposition: { attached_pic: 1 },
    },
    {
      codec_type: 'video',
      codec_name: 'h264',
      width: 1920,
      height: 1080,
      pix_fmt: 'yuv420p',
      avg_frame_rate: '30000/1001',
      side_data_list: [{ rotation: -90 }],
      disposition: { attached_pic: 0 },
    },
    {
      codec_type: 'audio',
      codec_name: 'aac',
      profile: 'LC',
      channels: 2,
      tags: { language: 'eng' },
      disposition: { default: 1 },
    },
    { codec_type: 'audio', codec_name: 'ac3', channels: 6, tags: { language: 'und' } },
    { codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'DEU' } },
    { codec_type: 'data', codec_name: 'bin_data' },
  ],
});

describe('parseProbe', () => {
  it('extracts container, duration and size', () => {
    const info = parseProbe(PROBE);

    expect(info.container).toBe('matroska,webm');
    expect(info.durationMs).toBe(13025);
    expect(info.sizeBytes).toBe(12216770);
    expect(info.bitrate).toBe(7503582);
  });

  it('picks the first real video stream and skips cover images', () => {
    expect(parseProbe(PROBE).video).toEqual({
      index: 1,
      codec: 'h264',
      width: 1920,
      height: 1080,
      frameRate: 29.97,
      pixelFormat: 'yuv420p',
      rotation: 270,
    });
  });

  it('lists audio and subtitle streams with their position and language', () => {
    const info = parseProbe(PROBE);

    expect(info.audio).toEqual([
      { index: 0, codec: 'aac', profile: 'LC', channels: 2, language: 'eng', isDefault: true },
      { index: 1, codec: 'ac3', profile: null, channels: 6, language: null, isDefault: false },
    ]);
    expect(info.subtitles).toEqual([
      {
        index: 0,
        codec: 'subrip',
        language: 'deu',
        title: null,
        isDefault: false,
        isForced: false,
      },
    ]);
  });

  it('handles a file without video or duration', () => {
    const info = parseProbe(
      JSON.stringify({
        format: { format_name: 'mp3' },
        streams: [{ codec_type: 'audio', codec_name: 'mp3', channels: 2 }],
      }),
    );

    expect(info.video).toBeNull();
    expect(info.durationMs).toBeNull();
    expect(info.audio).toHaveLength(1);
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseProbe('Invalid data found when processing input')).toThrow(/not valid JSON/);
  });
});

describe('parseFrameRate', () => {
  it('parses fractions and whole numbers', () => {
    expect(parseFrameRate('30000/1001')).toBe(29.97);
    expect(parseFrameRate('25/1')).toBe(25);
    expect(parseFrameRate('24')).toBe(24);
  });

  it('returns null for missing or empty rates', () => {
    expect(parseFrameRate(undefined)).toBeNull();
    expect(parseFrameRate('0/0')).toBeNull();
  });
});

describe('maxKeyframeGap', () => {
  it('finds the largest distance between keyframes', () => {
    expect(maxKeyframeGap([0, 2, 4, 6], 8)).toBe(2);
    expect(maxKeyframeGap([4, 0, 2, 9], 10)).toBe(5);
  });

  it('counts the distance from the last keyframe to the end of the sample', () => {
    expect(maxKeyframeGap([0, 2], 10)).toBe(8);
    expect(maxKeyframeGap([0], 13)).toBe(13);
  });

  it('returns null without keyframes', () => {
    expect(maxKeyframeGap([], 10)).toBeNull();
  });
});

describe('unsupportedSourceReason', () => {
  function probe(format: Record<string, string>, codec = 'h264') {
    return parseProbe(
      JSON.stringify({
        format,
        streams: [{ codec_type: 'video', codec_name: codec, width: 640, height: 360 }],
      }),
    );
  }

  it('accepts an ordinary video', () => {
    expect(unsupportedSourceReason(parseProbe(PROBE))).toBeNull();
    expect(
      unsupportedSourceReason(probe({ format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12.5' })),
    ).toBeNull();
  });

  it('rejects a file without video', () => {
    const audioOnly = parseProbe(
      JSON.stringify({
        format: { format_name: 'mp3', duration: '180' },
        streams: [{ codec_type: 'audio', codec_name: 'mp3' }],
      }),
    );

    expect(unsupportedSourceReason(audioOnly)).toMatch(/no video stream/);
  });

  it('rejects text files, which FFmpeg opens as terminal art', () => {
    expect(unsupportedSourceReason(probe({ format_name: 'tty', duration: '4.2' }, 'ansi'))).toMatch(
      /text file or a picture/,
    );
  });

  it('rejects still pictures', () => {
    expect(
      unsupportedSourceReason(probe({ format_name: 'image2', duration: '0.04' }, 'mjpeg')),
    ).toMatch(/text file or a picture/);
    expect(unsupportedSourceReason(probe({ format_name: 'png_pipe' }, 'png'))).toMatch(
      /text file or a picture/,
    );
  });

  it('rejects a file without a playable duration', () => {
    expect(unsupportedSourceReason(probe({ format_name: 'matroska,webm' }))).toMatch(
      /no playable duration/,
    );
    expect(
      unsupportedSourceReason(probe({ format_name: 'matroska,webm', duration: '0.1' })),
    ).toMatch(/no playable duration/);
  });
});
