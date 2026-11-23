// SPDX-License-Identifier: AGPL-3.0-only
import {
  decodeSubtitle,
  defaultLabel,
  formatOf,
  parseSubtitleName,
  SubtitleFileError,
  toWebVtt,
  vttTime,
} from './subtitle-file.js';

const SRT = [
  '1',
  '00:00:01,000 --> 00:00:03,500',
  '<i>Hello</i> there.',
  '',
  '2',
  '00:00:04,000 --> 00:00:06,000 X1:10 X2:20',
  '{\\an8}<font color="#fff">Second</font> line',
  'and a third.',
  '',
].join('\r\n');

describe('toWebVtt', () => {
  it('converts SubRip, keeps italics and drops fonts, positions and numbers', () => {
    const result = toWebVtt(Buffer.from(SRT), { fileName: 'film.srt' });
    expect(result).toMatchObject({ cues: 2, format: 'srt', encoding: 'utf-8', endMs: 6000 });
    expect(result.vtt).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\n<i>Hello</i> there.\n\n' +
        '00:00:04.000 --> 00:00:06.000\nSecond line\nand a third.\n',
    );
  });

  it('writes WebVTT anew, without its header notes, names and settings', () => {
    const vtt = [
      'WEBVTT - made by a tool',
      '',
      'NOTE a remark',
      '',
      'intro',
      '00:01.000 --> 00:02.000 line:0 align:start',
      'Short times have no hours.',
      '',
      'STYLE',
      '::cue { color: red }',
      '',
    ].join('\n');
    expect(toWebVtt(Buffer.from(vtt)).vtt).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nShort times have no hours.\n',
    );
  });

  it('reads the dialogue of a SubStation file', () => {
    const ass = [
      '[Script Info]',
      'Title: x',
      '[V4+ Styles]',
      'Format: Name, Fontname',
      'Style: Default,Arial',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:05.50,0:00:07.00,Default,,0,0,0,,{\\i1}Later{\\i0}, with a comma\\Nand a break',
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,First',
      'Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,{\\p1}m 0 0 l 10 10{\\p0}',
      'Comment: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,not shown',
    ].join('\n');
    const result = toWebVtt(Buffer.from(ass), { fileName: 'film.ass' });
    expect(result.format).toBe('ass');
    expect(result.vtt).toBe(
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nFirst\n\n' +
        '00:00:05.500 --> 00:00:07.000\nLater, with a comma\nand a break\n',
    );
  });

  it('puts cues in the order of their start and drops broken ones', () => {
    const srt =
      '1\n00:00:05,000 --> 00:00:06,000\nBravo\n\n2\n00:00:01,000 --> 00:00:02,000\nAlpha\n\n' +
      '3\n00:00:09,000 --> 00:00:08,000\nends before it starts\n\n4\n00:00:10,000 --> 00:00:11,000\n\n';
    const result = toWebVtt(Buffer.from(srt));
    expect(result.cues).toBe(2);
    expect(result.vtt.indexOf('Alpha')).toBeLessThan(result.vtt.indexOf('Bravo'));
  });

  it('cannot be broken out of by an arrow in a text', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nleft --> right\n';
    expect(toWebVtt(Buffer.from(srt)).vtt).toContain('left -> right');
  });

  it('refuses what is not a subtitle file, with a reason', () => {
    expect(() => toWebVtt(Buffer.alloc(0))).toThrow('The file is empty');
    expect(() => toWebVtt(Buffer.from('just some words'), { fileName: 'notes.txt' })).toThrow(
      SubtitleFileError,
    );
    expect(() => toWebVtt(Buffer.from([0x00, 0x00, 0x01, 0xba, 0x44]))).toThrow(/not text/);
    expect(() => toWebVtt(Buffer.from('WEBVTT\n\nNOTE nothing here\n'))).toThrow(
      /No subtitle with a start and an end/,
    );
  });
});

describe('decodeSubtitle', () => {
  it('recognizes Unicode by its mark or by being valid', () => {
    expect(decodeSubtitle(Buffer.from('﻿Grüße'), null)).toEqual({
      text: 'Grüße',
      encoding: 'utf-8',
    });
    expect(decodeSubtitle(Buffer.from('مرحبا'), null).text).toBe('مرحبا');
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Grüße', 'utf16le')]);
    expect(decodeSubtitle(utf16, null)).toEqual({ text: 'Grüße', encoding: 'utf-16le' });
  });

  it('reads an old file in the encoding usual for its language', () => {
    // "مرحبا" in Windows-1256, "Привет" in Windows-1251, "Grüße" in Windows-1252.
    const arabic = Buffer.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7]);
    expect(decodeSubtitle(arabic, 'ar')).toEqual({ text: 'مرحبا', encoding: 'windows-1256' });
    const russian = Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
    expect(decodeSubtitle(russian, 'ru-RU').text).toBe('Привет');
    const german = Buffer.from([0x47, 0x72, 0xfc, 0xdf, 0x65]);
    expect(decodeSubtitle(german, null)).toEqual({ text: 'Grüße', encoding: 'windows-1252' });
  });

  it('obeys an encoding that is named', () => {
    const arabic = Buffer.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7]);
    expect(decodeSubtitle(arabic, null, 'windows-1256').text).toBe('مرحبا');
  });

  it('converts a whole file in an old encoding', () => {
    const head = Buffer.from('1\r\n00:00:01,000 --> 00:00:02,000\r\n', 'latin1');
    const result = toWebVtt(Buffer.concat([head, Buffer.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7])]), {
      language: 'ar',
    });
    expect(result.encoding).toBe('windows-1256');
    expect(result.vtt).toContain('مرحبا');
  });
});

describe('formatOf and vttTime', () => {
  it('goes by the content before the name', () => {
    expect(formatOf('WEBVTT\n', 'x.srt')).toBe('vtt');
    expect(formatOf('1\n00:00:01,000 --> 00:00:02,000\nx', null)).toBe('srt');
    expect(formatOf('[Script Info]\n', 'x.txt')).toBe('ass');
    expect(formatOf('words', 'x.txt')).toBeNull();
  });
  it('writes times with hours and three decimals', () => {
    expect(vttTime(3_723_004)).toBe('01:02:03.004');
    expect(vttTime(-5)).toBe('00:00:00.000');
  });
});

describe('parseSubtitleName', () => {
  it('reads the language between the last dots', () => {
    expect(parseSubtitleName('603_the-matrix.de.srt')).toEqual({
      language: 'de',
      forced: false,
      sdh: false,
    });
    expect(parseSubtitleName('a/b/603_x.pt-br.vtt').language).toBe('pt-BR');
    expect(parseSubtitleName('603_x.zh_hant.srt').language).toBe('zh-Hant');
    expect(parseSubtitleName('603_x.ger.srt').language).toBe('de');
    expect(parseSubtitleName('603_x.Arabic.srt').language).toBe('ar');
  });

  it('reads forced tracks and those for the hard of hearing', () => {
    expect(parseSubtitleName('603_x.en.forced.srt')).toEqual({
      language: 'en',
      forced: true,
      sdh: false,
    });
    expect(parseSubtitleName('603_x.eng.sdh.srt')).toEqual({
      language: 'en',
      forced: false,
      sdh: true,
    });
    expect(parseSubtitleName('603_x.en.hi.srt')).toMatchObject({ language: 'en', sdh: true });
  });

  it('does not take the name of the film for a language', () => {
    expect(parseSubtitleName('603_the-matrix.srt').language).toBeNull();
    expect(parseSubtitleName('1399_s01e02_it.follows.1080p.srt').language).toBeNull();
    expect(parseSubtitleName('603.No.Way.Out.srt').language).toBeNull();
    expect(parseSubtitleName('603_x.tv.srt').language).toBeNull();
  });
});

describe('defaultLabel', () => {
  it('names a language in its own words', () => {
    expect(defaultLabel('de', {})).toBe('Deutsch');
    expect(defaultLabel('ar', {})).toBe('العربية');
    expect(defaultLabel('en', { sdh: true })).toBe('English (SDH)');
    expect(defaultLabel('fr', { sdh: true, forced: true })).toBe('Français (SDH, Forced)');
    expect(defaultLabel('und', {})).toBe('Subtitles');
  });
});
