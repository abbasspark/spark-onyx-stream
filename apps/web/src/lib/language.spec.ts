// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  countryName,
  languageFromCookies,
  nativeLanguageName,
  readLanguage,
  withLanguage,
} from './language';

describe('readLanguage', () => {
  it('takes a tag of the catalog and nothing else', () => {
    expect(readLanguage('de')).toBe('de');
    expect(readLanguage(' pt-BR ')).toBe('pt-BR');
    expect(readLanguage('zh-Hant-TW')).toBe('zh-Hant-TW');
    for (const value of [undefined, null, '', 'DE', 'german', 'de&x=1', '../de', 'de-de']) {
      expect(readLanguage(value), String(value)).toBeUndefined();
    }
  });
});

describe('languageFromCookies', () => {
  it('finds the language among the other cookies', () => {
    expect(languageFromCookies('a=1; onyx_language=de; b=2')).toBe('de');
    expect(languageFromCookies('onyx_language=pt-BR')).toBe('pt-BR');
    expect(languageFromCookies('a=1')).toBeUndefined();
    expect(languageFromCookies('')).toBeUndefined();
    expect(languageFromCookies('onyx_language=%3Cscript%3E')).toBeUndefined();
    // A cookie with a similar name is another cookie.
    expect(languageFromCookies('not_onyx_language=de')).toBeUndefined();
  });
});

describe('withLanguage', () => {
  it('adds the language to an address, with or without a question', () => {
    expect(withLanguage('/home', 'de')).toBe('/home?language=de');
    expect(withLanguage('/titles?page=2', 'pt-BR')).toBe('/titles?page=2&language=pt-BR');
    expect(withLanguage('/home', undefined)).toBe('/home');
  });
});

describe('names', () => {
  it('names a language in itself', () => {
    expect(nativeLanguageName('de')).toBe('Deutsch');
    expect(nativeLanguageName('fr')).toBe('Français');
    expect(nativeLanguageName('not-a-tag-at-all')).toBe('not-a-tag-at-all');
  });

  it('names a country, or keeps what it does not know', () => {
    expect(countryName('DE')).toBe('Germany');
    expect(countryName('??')).toBe('??');
  });
});
