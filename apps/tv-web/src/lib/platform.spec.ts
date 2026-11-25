// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { clientName, detectPlatform, keyOf } from './platform';

describe('detectPlatform', () => {
  it('knows a Samsung television', () => {
    expect(
      detectPlatform(
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 Chrome/76.0 TV Safari/537.36',
      ),
    ).toBe('tizen');
  });
  it('knows an LG television', () => {
    expect(
      detectPlatform(
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/79.0 Safari/537.36 WebAppManager',
      ),
    ).toBe('webos');
  });
  it('takes anything else for a browser', () => {
    expect(detectPlatform('Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0')).toBe('browser');
  });
});

describe('clientName', () => {
  it('names the app with its version', () => {
    expect(clientName('tizen', '0.1.0')).toBe('tizen/0.1.0');
    expect(clientName('browser', '0.1.0')).toBe('tv-web/0.1.0');
  });
});

describe('keyOf', () => {
  it('maps the arrows and OK', () => {
    expect(keyOf(37)).toBe('left');
    expect(keyOf(40)).toBe('down');
    expect(keyOf(13)).toBe('enter');
  });
  it('maps the back key of each maker', () => {
    expect(keyOf(10009)).toBe('back');
    expect(keyOf(461)).toBe('back');
  });
  it('maps the media keys and ignores the rest', () => {
    expect(keyOf(415)).toBe('play');
    expect(keyOf(19)).toBe('pause');
    expect(keyOf(417)).toBe('forward');
    expect(keyOf(65)).toBeNull();
  });
});
