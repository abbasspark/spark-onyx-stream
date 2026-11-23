// SPDX-License-Identifier: AGPL-3.0-only
import { languageChain, normalizeLanguage, pickTranslation } from './language.js';

describe('normalizeLanguage', () => {
  it('brings a tag into the stored form', () => {
    expect(normalizeLanguage('de')).toBe('de');
    expect(normalizeLanguage(' DE ')).toBe('de');
    expect(normalizeLanguage('pt-br')).toBe('pt-BR');
    expect(normalizeLanguage('pt_BR')).toBe('pt-BR');
    expect(normalizeLanguage('ZH-hant-tw')).toBe('zh-Hant-TW');
    expect(normalizeLanguage('fil')).toBe('fil');
  });

  it('refuses what is not a language tag', () => {
    for (const value of ['', 'german', 'd', 'de-', 'de-DEU', 'de-1', '../de', 'de-DE-x']) {
      expect(normalizeLanguage(value)).toBeNull();
    }
  });
});

describe('languageChain', () => {
  it('goes from the exact tag to the bare language', () => {
    expect(languageChain('de')).toEqual(['de']);
    expect(languageChain('pt-BR')).toEqual(['pt-BR', 'pt']);
    expect(languageChain('zh-Hant-TW')).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh']);
  });
});

describe('pickTranslation', () => {
  const translations = [{ language: 'pt' }, { language: 'pt-BR' }, { language: 'de' }];

  it('prefers the exact tag, then the bare language', () => {
    expect(pickTranslation(translations, 'pt-BR')).toEqual({ language: 'pt-BR' });
    expect(pickTranslation(translations, 'pt-PT')).toEqual({ language: 'pt' });
    expect(pickTranslation(translations, 'de-AT')).toEqual({ language: 'de' });
  });

  it('does not serve a country to another one, or to the bare language', () => {
    expect(pickTranslation([{ language: 'pt-BR' }], 'pt-PT')).toBeUndefined();
    expect(pickTranslation([{ language: 'pt-BR' }], 'pt')).toBeUndefined();
    expect(pickTranslation(translations, 'fr')).toBeUndefined();
  });
});
