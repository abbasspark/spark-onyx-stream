// SPDX-License-Identifier: AGPL-3.0-only
import { buildCopyArgs, buildKeyInfo, buildPosterArgs, buildTranscodeArgs } from './hls-command.js';
import type { PlannedRendition } from './ladder.js';

function rendition(name: string, height: number, videoBitrate: number): PlannedRendition {
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

const RENDITIONS = [rendition('720p', 720, 2_800_000), rendition('360p', 360, 800_000)];
const TIMING = { segmentSeconds: 4, keyframeSeconds: 2 };

/** Returns the value that follows a flag. */
function valueOf(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

describe('buildTranscodeArgs', () => {
  const args = buildTranscodeArgs({
    sourcePath: '/work/source file.mkv',
    outputDirectory: '/work/out',
    renditions: RENDITIONS,
    videoStreamIndex: 1,
    audioStreamIndex: 0,
    timing: TIMING,
  });

  it('passes the source path as one argument, spaces included', () => {
    expect(valueOf(args, '-i')).toBe('/work/source file.mkv');
  });

  it('splits and scales the chosen video stream once per rendition', () => {
    expect(valueOf(args, '-filter_complex')).toBe(
      '[0:v:1]split=2[v0][v1];[v0]scale=-2:720[v0o];[v1]scale=-2:360[v1o]',
    );
  });

  it('forces aligned keyframes and disables scene-change keyframes', () => {
    expect(valueOf(args, '-force_key_frames')).toBe('expr:gte(t,n_forced*2)');
    expect(valueOf(args, '-sc_threshold')).toBe('0');
    expect(valueOf(args, '-hls_time')).toBe('4');
  });

  it('sets bitrates per rendition', () => {
    expect(valueOf(args, '-b:v:0')).toBe('2800000');
    expect(valueOf(args, '-maxrate:v:0')).toBe('2996000');
    expect(valueOf(args, '-b:v:1')).toBe('800000');
    expect(valueOf(args, '-b:a:1')).toBe('128000');
  });

  it('names the variants after the renditions', () => {
    expect(valueOf(args, '-var_stream_map')).toBe('v:0,a:0,name:720p v:1,a:1,name:360p');
    expect(args[args.length - 1]).toBe('/work/out/%v/playlist.m3u8');
    expect(valueOf(args, '-hls_segment_type')).toBe('fmp4');
  });

  it('leaves audio out when the source has none', () => {
    const silent = buildTranscodeArgs({
      sourcePath: '/s.mp4',
      outputDirectory: '/o',
      renditions: RENDITIONS,
      videoStreamIndex: 0,
      audioStreamIndex: null,
      timing: TIMING,
    });

    expect(silent).not.toContain('-c:a');
    expect(silent.some((arg) => arg.startsWith('-b:a'))).toBe(false);
    expect(valueOf(silent, '-var_stream_map')).toBe('v:0,name:720p v:1,name:360p');
  });

  it('rejects a keyframe interval that does not divide the segment length', () => {
    expect(() =>
      buildTranscodeArgs({
        sourcePath: '/s.mp4',
        outputDirectory: '/o',
        renditions: RENDITIONS,
        videoStreamIndex: 0,
        audioStreamIndex: 0,
        timing: { segmentSeconds: 4, keyframeSeconds: 3 },
      }),
    ).toThrow(/divide the segment length/);
  });
});

describe('buildCopyArgs', () => {
  it('copies the streams into a single variant', () => {
    const args = buildCopyArgs({
      sourcePath: '/s.mp4',
      outputDirectory: '/o',
      renditionName: '1080p',
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      segmentSeconds: 4,
    });

    expect(valueOf(args, '-c')).toBe('copy');
    expect(args).toContain('0:v:0');
    expect(args).toContain('0:a:1');
    expect(valueOf(args, '-var_stream_map')).toBe('v:0,a:0,name:1080p');
    expect(args).not.toContain('libx264');
  });
});

describe('buildPosterArgs', () => {
  it('takes one frame without enlarging it', () => {
    const args = buildPosterArgs({
      sourcePath: '/s.mp4',
      outputPath: '/o/poster.jpg',
      videoStreamIndex: 0,
      atSeconds: 12.5,
      maxHeight: 720,
    });

    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(valueOf(args, '-ss')).toBe('12.500');
    expect(valueOf(args, '-frames:v')).toBe('1');
    expect(valueOf(args, '-vf')).toBe("scale=-2:'min(720,ih)'");
  });
});

describe('encryption', () => {
  const encryption = { keyInfoPath: '/work/keys/key.info' };

  it('writes encrypted MPEG-TS segments when transcoding', () => {
    const args = buildTranscodeArgs({
      sourcePath: '/work/in.mp4',
      outputDirectory: '/work/out',
      renditions: RENDITIONS,
      videoStreamIndex: 0,
      audioStreamIndex: 0,
      timing: TIMING,
      encryption,
    });

    expect(valueOf(args, '-hls_segment_type')).toBe('mpegts');
    expect(valueOf(args, '-hls_key_info_file')).toBe('/work/keys/key.info');
    expect(valueOf(args, '-hls_segment_filename')).toBe('/work/out/%v/seg-%05d.ts');
    expect(args).not.toContain('-hls_fmp4_init_filename');
  });

  it('writes encrypted MPEG-TS segments when copying', () => {
    const args = buildCopyArgs({
      sourcePath: '/work/in.mp4',
      outputDirectory: '/work/out',
      renditionName: '720p',
      videoStreamIndex: 0,
      audioStreamIndex: null,
      segmentSeconds: 4,
      encryption,
    });

    expect(valueOf(args, '-hls_segment_type')).toBe('mpegts');
    expect(valueOf(args, '-hls_key_info_file')).toBe('/work/keys/key.info');
  });

  it('keeps fragmented MP4 without encryption', () => {
    const args = buildCopyArgs({
      sourcePath: '/work/in.mp4',
      outputDirectory: '/work/out',
      renditionName: '720p',
      videoStreamIndex: 0,
      audioStreamIndex: null,
      segmentSeconds: 4,
    });

    expect(valueOf(args, '-hls_segment_type')).toBe('fmp4');
    expect(args).not.toContain('-hls_key_info_file');
  });

  it('builds the key info file', () => {
    const iv = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');

    expect(buildKeyInfo('../key', '/work/keys/content.key', iv)).toBe(
      '../key\n/work/keys/content.key\n000102030405060708090a0b0c0d0e0f\n',
    );
    expect(() => buildKeyInfo('../key', '/work/k', Buffer.alloc(8))).toThrow(/16 bytes/);
    expect(() => buildKeyInfo('../key\nx', '/work/k', iv)).toThrow(/line breaks/);
  });
});
