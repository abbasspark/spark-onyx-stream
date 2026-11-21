// SPDX-License-Identifier: AGPL-3.0-only
import type { MediaInfo } from '../processing/media/media-info.js';
import {
  buildLiveArgs,
  buildProbeArgs,
  planOutput,
  UnsupportedSourceError,
} from './live-command.js';
import { parseSource } from './live-source.js';

function info(video: string | null, audio: { codec: string; channels: number }[] = []): MediaInfo {
  return {
    container: 'mpegts',
    durationMs: null,
    sizeBytes: null,
    bitrate: null,
    video: video
      ? {
          index: 0,
          codec: video,
          width: 1920,
          height: 1080,
          frameRate: 25,
          pixelFormat: 'yuv420p',
          profile: 'High',
          level: 40,
          rotation: 0,
        }
      : null,
    audio: audio.map((stream, index) => ({
      index,
      codec: stream.codec,
      profile: null,
      channels: stream.channels,
      language: null,
      isDefault: false,
    })),
    subtitles: [],
  };
}

const settings = {
  directory: '/var/live/abc',
  segmentSeconds: 4,
  playlistSegments: 6,
  runId: 'run1',
};
const source = parseSource('udp://239.1.1.1:5000');

describe('planOutput', () => {
  it('passes H.264 with AAC on untouched', () => {
    expect(planOutput(info('h264', [{ codec: 'aac', channels: 2 }]))).toMatchObject({
      audio: 'copy',
      tagHevc: false,
      streams: { videoCodec: 'h264', width: 1920, height: 1080, audioCodec: 'aac' },
    });
  });

  it('encodes audio browsers cannot play, down to stereo', () => {
    expect(planOutput(info('h264', [{ codec: 'ac3', channels: 6 }]))).toMatchObject({
      audio: 'aac',
      audioChannels: 2,
    });
    expect(planOutput(info('h264', [{ codec: 'mp2', channels: 1 }]))).toMatchObject({
      audio: 'aac',
      audioChannels: 1,
    });
  });

  it('tags HEVC for Apple players', () => {
    expect(planOutput(info('hevc')).tagHevc).toBe(true);
  });

  it('accepts a source without audio', () => {
    expect(planOutput(info('h264')).audio).toBe('none');
  });

  it('refuses video that would need re-encoding', () => {
    expect(() => planOutput(info('mpeg2video'))).toThrow(UnsupportedSourceError);
    expect(() => planOutput(info('mpeg2video'))).toThrow('MPEG2VIDEO');
    expect(() => planOutput(info(null, [{ codec: 'aac', channels: 2 }]))).toThrow('no video');
  });
});

describe('buildLiveArgs', () => {
  const pair = (args: string[], flag: string): string | undefined => args[args.indexOf(flag) + 1];

  it('copies the video and writes fMP4 segments beside the playlist', () => {
    const args = buildLiveArgs(source, planOutput(info('h264')), settings);
    expect(pair(args, '-i')).toBe('udp://239.1.1.1:5000');
    expect(pair(args, '-c:v')).toBe('copy');
    expect(pair(args, '-hls_segment_type')).toBe('fmp4');
    expect(pair(args, '-hls_time')).toBe('4');
    expect(pair(args, '-hls_list_size')).toBe('6');
    expect(pair(args, '-hls_fmp4_init_filename')).toBe('init-run1.mp4');
    expect(pair(args, '-hls_segment_filename')).toBe('/var/live/abc/seg-%d.m4s');
    expect(args.at(-1)).toBe('/var/live/abc/index.m3u8');
    expect(args).not.toContain('-c:a');
  });

  it('puts the options of the source in front of it', () => {
    const args = buildLiveArgs(source, planOutput(info('h264')), settings);
    expect(args.indexOf('-protocol_whitelist')).toBeLessThan(args.indexOf('-i'));
  });

  it('numbers segments by the clock, deletes old ones and never ends the playlist', () => {
    const args = buildLiveArgs(source, planOutput(info('h264')), settings);
    expect(pair(args, '-hls_start_number_source')).toBe('epoch');
    expect(pair(args, '-hls_flags')?.split('+')).toEqual(
      expect.arrayContaining(['delete_segments', 'temp_file', 'omit_endlist']),
    );
  });

  it('handles the audio as planned', () => {
    const copy = buildLiveArgs(
      source,
      planOutput(info('h264', [{ codec: 'aac', channels: 2 }])),
      settings,
    );
    expect(pair(copy, '-c:a')).toBe('copy');

    const encode = buildLiveArgs(
      source,
      planOutput(info('hevc', [{ codec: 'eac3', channels: 6 }])),
      settings,
    );
    expect(pair(encode, '-c:a')).toBe('aac');
    expect(pair(encode, '-ac')).toBe('2');
    expect(pair(encode, '-tag:v')).toBe('hvc1');
  });
});

describe('buildProbeArgs', () => {
  it('asks for JSON and ends with the address', () => {
    const args = buildProbeArgs(source);
    expect(args).toEqual(expect.arrayContaining(['-print_format', 'json', '-show_streams']));
    expect(args.at(-1)).toBe(source.url);
  });
});
