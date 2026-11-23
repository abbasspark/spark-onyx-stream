// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  cueClock,
  defaultSubtitleLabel,
  isSubtitleFile,
  parseSubtitleName,
  parseVtt,
} from './subtitles';

describe('isSubtitleFile', () => {
  it('goes by the ending', () => {
    expect(isSubtitleFile('film.de.SRT')).toBe(true);
    expect(isSubtitleFile('film.ass')).toBe(true);
    expect(isSubtitleFile('film.sub')).toBe(false);
    expect(isSubtitleFile('film.mkv')).toBe(false);
  });
});

describe('parseSubtitleName', () => {
  it('reads the language between the last dots', () => {
    expect(parseSubtitleName('603_the-matrix.de.srt')).toEqual({
      language: 'de',
      forced: false,
      sdh: false,
    });
    expect(parseSubtitleName('x.pt-br.vtt').language).toBe('pt-BR');
    expect(parseSubtitleName('x.zh_hant.srt').language).toBe('zh-Hant');
    expect(parseSubtitleName('x.Arabic.srt').language).toBe('ar');
  });
  it('reads forced tracks and those for the hard of hearing', () => {
    expect(parseSubtitleName('x.en.forced.srt')).toMatchObject({ language: 'en', forced: true });
    expect(parseSubtitleName('x.eng.sdh.srt')).toMatchObject({ language: 'en', sdh: true });
  });
  it('does not take the name of the film for a language', () => {
    expect(parseSubtitleName('the-matrix.srt').language).toBeNull();
    expect(parseSubtitleName('it.follows.1080p.srt').language).toBeNull();
    expect(parseSubtitleName('603.No.Way.Out.srt').language).toBeNull();
  });
});

describe('defaultSubtitleLabel', () => {
  it('names a language in its own words', () => {
    expect(defaultSubtitleLabel('de', {})).toBe('Deutsch');
    expect(defaultSubtitleLabel('en', { sdh: true, forced: true })).toBe('English (SDH, Forced)');
    expect(defaultSubtitleLabel('', {})).toBe('Subtitles');
    expect(defaultSubtitleLabel('und', { forced: true })).toBe('Subtitles (Forced)');
  });
});

describe('parseVtt', () => {
  it('reads times and words, without markup', () => {
    const cues = parseVtt(
      'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\n<i>Hello</i> there.\nSecond line\n\n01:02:03.000 --> 01:02:04.000\nLater\n',
    );
    expect(cues).toEqual([
      {
        start: '00:00:01.000',
        end: '00:00:03.500',
        startMs: 1000,
        text: 'Hello there.\nSecond line',
      },
      { start: '01:02:03.000', end: '01:02:04.000', startMs: 3_723_000, text: 'Later' },
    ]);
  });
  it('passes over what is not a subtitle', () => {
    expect(parseVtt('WEBVTT\n\nNOTE a remark\n')).toEqual([]);
  });
});

describe('cueClock', () => {
  it('leaves out empty hours', () => {
    expect(cueClock(123_000)).toBe('2:03');
    expect(cueClock(3_723_900)).toBe('1:02:03');
  });
});
