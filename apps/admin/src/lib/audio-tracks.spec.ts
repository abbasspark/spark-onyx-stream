// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  describeAudioCodec,
  describeChannels,
  describeOrigin,
  isAudioFile,
  isMakingTracks,
  languageFromFileName,
} from './audio-tracks';

describe('isAudioFile', () => {
  it('knows sound files, and video files whose sound can be taken', () => {
    for (const name of ['dub.mp3', 'Film.DE.M4A', 'a.flac', 'a.wav', 'a.mka', 'film.mkv']) {
      expect(isAudioFile(name)).toBe(true);
    }
    for (const name of ['notes.txt', 'film.srt', 'poster.jpg', 'mp3']) {
      expect(isAudioFile(name)).toBe(false);
    }
  });
});

describe('languageFromFileName', () => {
  it('reads the language a name ends in', () => {
    expect(languageFromFileName('film.de.mp3')).toBe('de');
    expect(languageFromFileName('Night Train - fr.m4a')).toBe('fr');
    expect(languageFromFileName('night_train_ger.flac')).toBe('de');
    expect(languageFromFileName('film.ENG.wav')).toBe('en');
  });

  it('reads none where the name says none', () => {
    for (const name of ['dub.mp3', 'film.final.mp3', 'film.2024.mp3', 'film.dub.mp3', '']) {
      expect(languageFromFileName(name)).toBeNull();
    }
  });
});

describe('describing a track', () => {
  it('names channels and codecs as people know them', () => {
    expect(describeChannels(2)).toBe('Stereo');
    expect(describeChannels(6)).toBe('5.1');
    expect(describeChannels(1)).toBe('Mono');
    expect(describeChannels(4)).toBe('4 channels');
    expect(describeChannels(0)).toBe('–');
    expect(describeAudioCodec('aac')).toBe('AAC');
    expect(describeAudioCodec('ac3')).toBe('Dolby Digital');
    expect(describeAudioCodec('vorbis')).toBe('VORBIS');
  });

  it('says where a track comes from', () => {
    expect(describeOrigin({ inVideo: true, source: 'EMBEDDED' })).toBe('Inside the video');
    expect(describeOrigin({ inVideo: false, source: 'EMBEDDED' })).toBe('From the video file');
    expect(describeOrigin({ inVideo: false, source: 'UPLOADED' })).toBe('Added as a file');
  });

  it('knows when a track is still being made', () => {
    expect(isMakingTracks([{ status: 'READY' }, { status: 'PROCESSING' }])).toBe(true);
    expect(isMakingTracks([{ status: 'READY' }, { status: 'FAILED' }])).toBe(false);
    expect(isMakingTracks(undefined)).toBe(false);
  });
});
