// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { languageChoices, pickTrack } from './tracks';

describe('pickTrack', () => {
  const tracks = [{ lang: 'en' }, { lang: 'de' }, { lang: 'pt-BR' }, { lang: null }, {}];

  it('finds the track of the language', () => {
    expect(pickTrack(tracks, 'de')).toBe(1);
    expect(pickTrack(tracks, 'DE')).toBe(1);
    expect(pickTrack(tracks, 'pt-BR')).toBe(2);
  });

  it('takes the same language of another country when that is all there is', () => {
    expect(pickTrack(tracks, 'pt')).toBe(2);
    expect(pickTrack(tracks, 'pt-PT')).toBe(2);
    expect(pickTrack(tracks, 'de-AT')).toBe(1);
  });

  it('prefers the exact tag, then the bare language, over another country', () => {
    const many = [{ lang: 'es-MX' }, { lang: 'es' }, { lang: 'es-ES' }];
    expect(pickTrack(many, 'es-ES')).toBe(2);
    expect(pickTrack(many, 'es-AR')).toBe(1);
    expect(pickTrack(many, 'es')).toBe(1);
  });

  it('finds nothing without a preference or a fitting track', () => {
    expect(pickTrack(tracks, null)).toBe(-1);
    expect(pickTrack(tracks, undefined)).toBe(-1);
    expect(pickTrack(tracks, 'fr')).toBe(-1);
    expect(pickTrack([], 'en')).toBe(-1);
  });

  it('passes over forced subtitles', () => {
    expect(pickTrack([{ lang: 'de', forced: true }, { lang: 'de' }], 'de')).toBe(1);
    expect(pickTrack([{ lang: 'de', forced: true }], 'de')).toBe(-1);
  });
});

describe('languageChoices', () => {
  const upper = (tag: string) => tag.toUpperCase();

  it('lists the offered languages by their names', () => {
    const choices = languageChoices(null, upper);
    expect(choices.length).toBeGreaterThan(20);
    expect(choices.map((choice) => choice.label)).toEqual(
      choices.map((choice) => choice.label).sort((a, b) => a.localeCompare(b)),
    );
    expect(choices.find((choice) => choice.value === 'de')).toEqual({ value: 'de', label: 'DE' });
  });

  it('keeps a language in use that is not among the offered', () => {
    expect(languageChoices('gsw', upper).some((choice) => choice.value === 'gsw')).toBe(true);
    expect(languageChoices('de', upper).filter((choice) => choice.value === 'de')).toHaveLength(1);
  });
});
