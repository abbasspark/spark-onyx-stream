// SPDX-License-Identifier: AGPL-3.0-only
import { folderOf, languageFromFileName } from './audio-tracks.service.js';

describe('languageFromFileName', () => {
  it('reads the language at the end of a name', () => {
    expect(languageFromFileName('film.de.mp3')).toBe('de');
    expect(languageFromFileName('Night Train - fr.m4a')).toBe('fr');
    expect(languageFromFileName('night_train_ger.flac')).toBe('de');
    expect(languageFromFileName('film.eng.wav')).toBe('en');
  });

  it('reads none where the name says none', () => {
    expect(languageFromFileName('dub.mp3')).toBeNull();
    expect(languageFromFileName('film.final.mp3')).toBeNull();
    expect(languageFromFileName('film.2024.mp3')).toBeNull();
    expect(languageFromFileName('')).toBeNull();
  });
});

describe('folderOf', () => {
  it('is the folder of the playlist, and none for sound inside the video', () => {
    expect(folderOf({ playlistPath: 'assets/a/hls/audio-u-1/playlist.m3u8' })).toBe('audio-u-1');
    expect(folderOf({ playlistPath: null })).toBeNull();
  });
});
