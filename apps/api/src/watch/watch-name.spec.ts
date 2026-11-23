// SPDX-License-Identifier: AGPL-3.0-only
import {
  episodeCode,
  extensionOf,
  importedPath,
  isCandidate,
  isSidecarOf,
  parseWatchedName,
  stemOf,
} from './watch-name.js';

describe('parseWatchedName', () => {
  it('reads a movie from an id and a name', () => {
    expect(parseWatchedName('603_the-matrix.mkv')).toEqual({
      metadataId: 'movie:603',
      seasonNumber: null,
      episodeNumber: null,
      label: 'the-matrix',
    });
    expect(parseWatchedName('new/2024/603_The Matrix (1999).mp4')).toMatchObject({
      metadataId: 'movie:603',
      label: 'The Matrix (1999)',
    });
  });

  it('reads an episode when a season and an episode follow the id', () => {
    expect(parseWatchedName('1399_S01E05_the-pointy-end.mp4')).toEqual({
      metadataId: 'tv:1399',
      seasonNumber: 1,
      episodeNumber: 5,
      label: 'the-pointy-end',
    });
    expect(parseWatchedName('1399_s2e10.mkv')).toMatchObject({
      metadataId: 'tv:1399',
      seasonNumber: 2,
      episodeNumber: 10,
      label: '',
    });
    // Specials are season 0.
    expect(parseWatchedName('1399_S00E01_behind.mkv')).toMatchObject({ seasonNumber: 0 });
  });

  it('takes dashes, dots and spaces for the underscore, and an id alone', () => {
    expect(parseWatchedName('603-the-matrix.mkv')?.metadataId).toBe('movie:603');
    expect(parseWatchedName('603.the.matrix.1080p.mkv')?.label).toBe('the.matrix.1080p');
    expect(parseWatchedName('603 The Matrix.mkv')?.metadataId).toBe('movie:603');
    expect(parseWatchedName('603.mkv')).toMatchObject({ metadataId: 'movie:603', label: '' });
    expect(parseWatchedName('tmdb-603_the-matrix.mkv')?.metadataId).toBe('movie:603');
    expect(parseWatchedName('1399.S01.E05.mkv')?.metadataId).toBe('tv:1399');
  });

  it('refuses names that do not start with an id', () => {
    for (const name of [
      'the-matrix.mkv',
      'The Matrix (1999).mkv',
      '0_nothing.mkv',
      'S01E05_1399.mkv',
      '603the-matrix.mkv',
      '1234567890_too-long-an-id.mkv',
      '1399_S01E00_no-such-episode.mkv',
    ]) {
      expect(parseWatchedName(name), name).toBeNull();
    }
  });

  it('keeps a year in the name from passing for an id only when it stands first', () => {
    // A name that starts with a number is read as an id: that is the format.
    expect(parseWatchedName('2001_a-space-odyssey.mkv')?.metadataId).toBe('movie:2001');
    expect(parseWatchedName('a-space-odyssey_2001.mkv')).toBeNull();
  });
});

describe('files of a location', () => {
  it('are candidates when they are videos, visible and not yet imported', () => {
    expect(isCandidate('603_x.mkv')).toBe(true);
    expect(isCandidate('in/deep/603_x.MP4')).toBe(true);
    expect(isCandidate('603_x.srt')).toBe(false);
    expect(isCandidate('603_x.mkv.part')).toBe(false);
    expect(isCandidate('.603_x.mkv')).toBe(false);
    expect(isCandidate('.trash/603_x.mkv')).toBe(false);
    expect(isCandidate('imported/603_x.mkv')).toBe(false);
    // Only the folder at the top is the importer's own.
    expect(isCandidate('films/imported/603_x.mkv')).toBe(true);
    expect(isCandidate('603_x')).toBe(false);
  });

  it('know their ending and their name without it', () => {
    expect(extensionOf('a/b.c/603_x.MKV')).toBe('mkv');
    expect(extensionOf('a/.hidden')).toBe('');
    expect(stemOf('a/b.c/603_x.mkv')).toBe('a/b.c/603_x');
    expect(stemOf('a/b.c/noending')).toBe('a/b.c/noending');
  });

  it('take their subtitles and notes with them', () => {
    expect(isSidecarOf('in/603_x.mkv', 'in/603_x.srt')).toBe(true);
    expect(isSidecarOf('in/603_x.mkv', 'in/603_x.en.srt')).toBe(true);
    expect(isSidecarOf('in/603_x.mkv', 'in/603_x.pt-BR.vtt')).toBe(true);
    expect(isSidecarOf('in/603_x.mkv', 'in/603_x.nfo')).toBe(true);
    expect(isSidecarOf('in/603_x.mkv', 'in/603_x.mkv')).toBe(false);
    expect(isSidecarOf('in/603_x.mkv', 'in/603_x.mp4')).toBe(false);
    expect(isSidecarOf('in/603_x.mkv', 'in/603_xy.srt')).toBe(false);
    expect(isSidecarOf('in/603_x.mkv', 'other/603_x.srt')).toBe(false);
    expect(isSidecarOf('in/603_x.mkv', 'in/603_x.a.b.c.srt')).toBe(false);
  });

  it('go to the same place under "imported"', () => {
    expect(importedPath('in/603_x.mkv')).toBe('imported/in/603_x.mkv');
  });

  it('name an episode the usual way', () => {
    expect(episodeCode(1, 5)).toBe('S01E05');
    expect(episodeCode(12, 104)).toBe('S12E104');
  });
});
