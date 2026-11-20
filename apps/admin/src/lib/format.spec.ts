// SPDX-License-Identifier: AGPL-3.0-only
import {
  formatBytes,
  formatDuration,
  formatElapsed,
  formatResolution,
  humanize,
  titleFromFileName,
} from './format';

describe('formatBytes', () => {
  it('chooses a readable unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(12_216_770)).toBe('11.7 MB');
    expect(formatBytes(250 * 1024 ** 3)).toBe('250 GB');
  });

  it('accepts counts sent as text and rejects nonsense', () => {
    expect(formatBytes('5368709120')).toBe('5.0 GB');
    expect(formatBytes(null)).toBe('–');
    expect(formatBytes('abc')).toBe('–');
    expect(formatBytes(-1)).toBe('–');
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9_400)).toBe('0:09');
    expect(formatDuration(125_000)).toBe('2:05');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(null)).toBe('–');
  });
});

describe('formatElapsed', () => {
  it('measures to the end, or to now while running', () => {
    expect(formatElapsed('2026-01-01T00:00:00Z', '2026-01-01T00:00:12Z')).toBe('12 s');
    expect(formatElapsed('2026-01-01T00:00:00Z', '2026-01-01T00:03:05Z')).toBe('3 min 5 s');
    expect(formatElapsed('2026-01-01T00:00:00Z', null, Date.parse('2026-01-01T00:00:30Z'))).toBe(
      '30 s',
    );
    expect(formatElapsed(null, null)).toBe('–');
  });
});

describe('small helpers', () => {
  it('humanizes constants', () => {
    expect(humanize('AES_128')).toBe('Aes 128');
    expect(humanize('PROCESSING')).toBe('Processing');
    expect(humanize(null)).toBe('–');
  });

  it('describes the picture', () => {
    expect(formatResolution(1920, 1080, 29.97)).toBe('1920×1080, 29.97 fps');
    expect(formatResolution(1280, 720)).toBe('1280×720');
    expect(formatResolution(null, null)).toBe('–');
  });

  it('takes a title from a file name', () => {
    expect(titleFromFileName('My Film.final.mkv')).toBe('My Film.final');
    expect(titleFromFileName('.hidden')).toBe('.hidden');
    expect(titleFromFileName(`${'a'.repeat(300)}.mp4`)).toHaveLength(200);
  });
});
