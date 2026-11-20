// SPDX-License-Identifier: AGPL-3.0-only
import { normalizeStorageKey } from '../storage/storage-key.js';
import { safeSourceFilename } from './source-filename.js';

describe('safeSourceFilename', () => {
  it('keeps ordinary names', () => {
    expect(safeSourceFilename('movie-final_v2.mp4')).toBe('movie-final_v2.mp4');
  });

  it('replaces spaces and symbols', () => {
    expect(safeSourceFilename('My Movie (2024) [1080p].mkv')).toBe('My_Movie_2024_1080p_.mkv');
  });

  it('strips accents and other scripts', () => {
    expect(safeSourceFilename('Café Zürich.mov')).toBe('Cafe_Zurich.mov');
    expect(safeSourceFilename('فيلم.mp4')).toBe('mp4');
  });

  it('drops directory parts from both kinds of path', () => {
    expect(safeSourceFilename('../../etc/passwd')).toBe('passwd');
    expect(safeSourceFilename('C:\\Users\\me\\clip.mp4')).toBe('clip.mp4');
  });

  it('never returns a hidden or empty name', () => {
    expect(safeSourceFilename('.htaccess')).toBe('htaccess');
    expect(safeSourceFilename('..')).toBe('source');
    expect(safeSourceFilename('')).toBe('source');
    expect(safeSourceFilename('???')).toBe('source');
  });

  it('shortens long names and keeps the extension', () => {
    const result = safeSourceFilename(`${'a'.repeat(300)}.mkv`);

    expect(result.length).toBeLessThanOrEqual(120);
    expect(result.endsWith('.mkv')).toBe(true);
  });

  it('always produces a valid storage key segment', () => {
    for (const name of ['a/../b.mp4', '....', 'x\0y.mp4', ' spaced .mp4 ', 'ok.mp4']) {
      const safe = safeSourceFilename(name);
      expect(normalizeStorageKey(`sources/id/${safe}`)).toBe(`sources/id/${safe}`);
    }
  });
});
