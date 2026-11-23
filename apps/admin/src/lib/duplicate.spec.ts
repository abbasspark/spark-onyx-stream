// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { TitleDetail } from '@/api/types';
import {
  copyName,
  effectiveParts,
  PRESETS,
  partRows,
  presetOf,
  seasonCounts,
  seasonOptions,
} from './duplicate';

function title(over: Record<string, unknown> = {}): TitleDetail {
  return {
    id: 't1',
    type: 'MOVIE',
    name: 'Harbour Lights',
    poster: null,
    backdrop: null,
    logo: null,
    genres: [],
    categories: [],
    keywords: [],
    packages: [],
    credits: [],
    translations: [],
    collections: [],
    extras: [],
    seasons: [],
    asset: null,
    trailerAsset: null,
    access: 'FREE',
    rentAmount: null,
    buyAmount: null,
    availableFrom: null,
    availableUntil: null,
    metadata: null,
    ...over,
  } as unknown as TitleDetail;
}

const image = { id: 'i1' };
const video = { id: 'a1' };

describe('copyName', () => {
  it('adds "(copy)" once', () => {
    expect(copyName('Harbour Lights')).toBe('Harbour Lights (copy)');
    expect(copyName('Harbour Lights (copy)')).toBe('Harbour Lights (copy)');
  });
});

describe('presets', () => {
  it('are recognized when the choices equal one', () => {
    expect(presetOf(PRESETS.start.parts)).toBe('start');
    expect(presetOf(PRESETS.exact.parts)).toBe('exact');
    expect(presetOf({ ...PRESETS.start.parts, videos: true })).toBeNull();
  });
});

describe('partRows', () => {
  it('says what the title has of each part', () => {
    const rows = partRows(
      title({
        poster: image,
        backdrop: image,
        genres: [{ id: 'g', name: 'Drama' }],
        keywords: ['a', 'b'],
        credits: [{}, {}, {}],
        translations: ['de', 'fr'],
        access: 'PAID',
        rentAmount: 399,
        asset: video,
        extras: [{}],
        collections: [{ id: 'c', name: 'Harbour Saga' }],
      }),
    );
    const detail = (key: string) => rows.find((row) => row.key === key)?.detail;
    expect(detail('artwork')).toBe('Poster and backdrop. The same pictures, not new files.');
    expect(detail('classification')).toBe('1 genre and 2 keywords');
    expect(detail('credits')).toBe('3 credits');
    expect(detail('translations')).toBe('2 languages: de, fr');
    expect(detail('pricing')).toBe('For subscribers and a rental price');
    expect(detail('videos')).toBe(
      'The film and 1 extra. The same videos: nothing is encoded or stored again.',
    );
    expect(detail('collections')).toBe('A place at the end of Harbour Saga');
  });

  it('marks what the title does not have', () => {
    const rows = partRows(title());
    expect(rows.every((row) => !row.available)).toBe(true);
    expect(rows.find((row) => row.key === 'credits')?.detail).toBe('This title has no credits.');
  });
});

describe('series', () => {
  const show = title({
    type: 'SERIES',
    seasons: [
      {
        poster: image,
        episodes: [
          { asset: video, still: image },
          { asset: null, still: null },
        ],
      },
    ],
  });

  it('counts seasons, episodes and their videos', () => {
    expect(seasonCounts(show)).toEqual({ seasons: 1, episodes: 2, videos: 1 });
    expect(seasonOptions(show)[1]?.description).toBe('1 season, 2 episodes, 1 video, as drafts');
    expect(partRows(show).find((row) => row.key === 'artwork')?.detail).toBe(
      '2 season and episode pictures. The same pictures, not new files.',
    );
  });
});

describe('effectiveParts', () => {
  it('switches off what has nothing to copy', () => {
    const parts = effectiveParts(title({ credits: [{}] }), PRESETS.exact.parts);
    expect(parts).toEqual({ ...PRESETS.template.parts, credits: true });
  });
});
