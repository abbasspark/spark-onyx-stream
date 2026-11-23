// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { SourceTranslation } from '@/api/types';
import {
  isRightToLeft,
  languageName,
  mergeSource,
  normalizeLanguage,
  sameTranslation,
  toTranslationForm,
  toTranslationInput,
  translationProgress,
} from './translations';

const source: SourceTranslation = {
  language: 'de',
  name: 'Tiefes Wasser',
  tagline: null,
  synopsis: 'Drei Tauchgänge.',
  seasons: [{ id: 's1', name: null, synopsis: 'Die ersten.' }],
  episodes: [{ id: 'e1', name: 'Der Schelf', synopsis: 'Im Licht.' }],
  warnings: [],
};

describe('languages', () => {
  it('are named for reading, and kept as they are when unknown', () => {
    expect(languageName('de')).toMatch(/German|Deutsch/);
    expect(languageName('xx-unknown-tag')).toBe('xx-unknown-tag');
  });

  it('are tidied as they are typed', () => {
    expect(normalizeLanguage(' PT_br ')).toBe('pt-BR');
    expect(normalizeLanguage('zh-hant')).toBe('zh-Hant');
    expect(normalizeLanguage('german')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();
  });

  it('know which way they are written', () => {
    expect(isRightToLeft('ar')).toBe(true);
    expect(isRightToLeft('he-IL')).toBe(true);
    expect(isRightToLeft('de')).toBe(false);
  });
});

describe('a translation as a form', () => {
  it('saves trimmed texts and leaves out what is empty', () => {
    const form = toTranslationForm(undefined);
    form.name = '  Tiefes Wasser ';
    form.episodes.e2 = { name: ' ', synopsis: '' };
    form.episodes.e1 = { name: 'Der Schelf', synopsis: '' };
    expect(toTranslationInput(form)).toEqual({
      name: 'Tiefes Wasser',
      tagline: null,
      synopsis: null,
      seasons: [],
      episodes: [{ id: 'e1', name: 'Der Schelf', synopsis: null }],
    });
  });

  it('is the same as another when only spaces and empty parts differ', () => {
    const saved = toTranslationForm(source);
    const edited = toTranslationForm(source);
    edited.name = 'Tiefes Wasser ';
    edited.episodes.e9 = { name: '', synopsis: ' ' };
    expect(sameTranslation(saved, edited)).toBe(true);
    edited.synopsis = 'Anders.';
    expect(sameTranslation(saved, edited)).toBe(false);
  });
});

describe('mergeSource', () => {
  it('fills what is empty and keeps what was typed', () => {
    const form = toTranslationForm(undefined);
    form.name = 'Mein Titel';
    const merged = mergeSource(form, source);
    expect(merged.filled).toBe(4);
    expect(merged.form.name).toBe('Mein Titel');
    expect(merged.form.synopsis).toBe('Drei Tauchgänge.');
    expect(merged.form.seasons.s1).toEqual({ name: '', synopsis: 'Die ersten.' });
    expect(merged.form.episodes.e1).toEqual({ name: 'Der Schelf', synopsis: 'Im Licht.' });
    // The form given is left as it was.
    expect(form.episodes.e1).toBeUndefined();
  });

  it('replaces what was typed only when asked to', () => {
    const form = toTranslationForm(undefined);
    form.name = 'Mein Titel';
    const merged = mergeSource(form, source, true);
    expect(merged.form.name).toBe('Tiefes Wasser');
    expect(merged.filled).toBe(5);
    // A second time there is nothing left to do.
    expect(mergeSource(merged.form, source, true).filled).toBe(0);
  });
});

describe('translationProgress', () => {
  const title = {
    tagline: null,
    synopsis: 'Three dives.',
    seasons: [
      {
        id: 's1',
        name: null,
        synopsis: 'The first.',
        episodes: [
          { id: 'e1', synopsis: 'Sunlit.' },
          { id: 'e2', synopsis: null },
        ],
      },
    ],
  } as unknown as Parameters<typeof translationProgress>[0];

  it('counts the texts the title has, and how many are translated', () => {
    // Name and synopsis, the season's synopsis, two names and one synopsis of episodes.
    expect(translationProgress(title, toTranslationForm(undefined))).toEqual({
      filled: 0,
      total: 6,
      percent: 0,
    });
    expect(translationProgress(title, toTranslationForm(source))).toEqual({
      filled: 5,
      total: 6,
      percent: 83,
    });
  });

  it('never goes beyond the whole', () => {
    const form = toTranslationForm(source);
    form.tagline = 'Ein Satz mehr.';
    form.seasons.s1 = { name: 'Extra', synopsis: 'Die ersten.' };
    form.episodes.e2 = { name: 'Zwei', synopsis: 'Auch extra.' };
    expect(translationProgress(title, form)).toMatchObject({ filled: 6, total: 6, percent: 100 });
  });
});
