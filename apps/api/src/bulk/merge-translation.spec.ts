// SPDX-License-Identifier: AGPL-3.0-only
import type { TranslationView } from '../catalog/translations.service.js';
import type { SourceTranslation } from '../metadata/metadata.types.js';
import { mergeTranslation } from './merge-translation.js';

const source: SourceTranslation = {
  language: 'de',
  name: 'Tiefes Wasser',
  tagline: null,
  synopsis: 'Drei Tauchgänge.',
  seasons: [{ id: 's1', name: null, synopsis: 'Die ersten.' }],
  episodes: [
    { id: 'e1', name: 'Der Schelf', synopsis: 'Im Licht.' },
    { id: 'e2', name: 'Mitternachtszone', synopsis: null },
  ],
  warnings: [],
};
const existing: TranslationView = {
  language: 'de',
  name: 'Mein Titel',
  tagline: 'Von Hand.',
  synopsis: null,
  seasons: [],
  episodes: [
    { id: 'e1', name: 'Mein Schelf', synopsis: null },
    { id: 'e9', name: 'Nur hier', synopsis: null },
  ],
  filled: 4,
  total: 8,
  updatedAt: new Date(),
};

describe('mergeTranslation', () => {
  it('takes everything the source has for a title without a translation', () => {
    const merged = mergeTranslation(undefined, source, false);
    expect(merged.added).toBe(6);
    expect(merged.input).toEqual({
      name: 'Tiefes Wasser',
      tagline: null,
      synopsis: 'Drei Tauchgänge.',
      seasons: [{ id: 's1', name: null, synopsis: 'Die ersten.' }],
      episodes: [
        { id: 'e1', name: 'Der Schelf', synopsis: 'Im Licht.' },
        { id: 'e2', name: 'Mitternachtszone', synopsis: null },
      ],
    });
  });

  it('fills what is empty and keeps what was typed, also what the source does not know', () => {
    const merged = mergeTranslation(existing, source, false);
    expect(merged.added).toBe(4);
    expect(merged.input).toMatchObject({
      name: 'Mein Titel',
      tagline: 'Von Hand.',
      synopsis: 'Drei Tauchgänge.',
    });
    expect(merged.input.episodes).toEqual([
      { id: 'e1', name: 'Mein Schelf', synopsis: 'Im Licht.' },
      { id: 'e9', name: 'Nur hier', synopsis: null },
      { id: 'e2', name: 'Mitternachtszone', synopsis: null },
    ]);
  });

  it('replaces what was typed only when asked to, and never with nothing', () => {
    const merged = mergeTranslation(existing, source, true);
    expect(merged.input.name).toBe('Tiefes Wasser');
    // The source has no tagline: the typed one stays.
    expect(merged.input.tagline).toBe('Von Hand.');
    expect(merged.input.episodes?.[0]).toEqual({
      id: 'e1',
      name: 'Der Schelf',
      synopsis: 'Im Licht.',
    });
    expect(merged.added).toBe(6);
  });

  it('adds nothing when the source has nothing new', () => {
    const first = mergeTranslation(undefined, source, false);
    const saved = { ...existing, ...first.input } as TranslationView;
    expect(mergeTranslation(saved, source, true).added).toBe(0);
    const empty = { ...source, name: null, synopsis: null, seasons: [], episodes: [] };
    expect(mergeTranslation(undefined, empty, false).added).toBe(0);
  });
});
