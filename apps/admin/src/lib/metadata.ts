// SPDX-License-Identifier: AGPL-3.0-only
import type { ImportReport, MetadataPreview } from '@/api/types';

/** Languages offered for an import. TMDB has many more: these are the common ones. */
export const IMPORT_LANGUAGES: readonly (readonly [code: string, name: string])[] = [
  ['en-US', 'English'],
  ['ar-SA', 'Arabic'],
  ['zh-CN', 'Chinese'],
  ['nl-NL', 'Dutch'],
  ['fr-FR', 'French'],
  ['de-DE', 'German'],
  ['hi-IN', 'Hindi'],
  ['it-IT', 'Italian'],
  ['ja-JP', 'Japanese'],
  ['ko-KR', 'Korean'],
  ['pl-PL', 'Polish'],
  ['pt-BR', 'Portuguese (Brazil)'],
  ['ru-RU', 'Russian'],
  ['es-ES', 'Spanish'],
  ['sv-SE', 'Swedish'],
  ['tr-TR', 'Turkish'],
];

/** The list of languages, with the installation's own default added when it is not in it. */
export function languageOptions(defaultLanguage: string): { value: string; label: string }[] {
  const known = IMPORT_LANGUAGES.map(([value, label]) => ({ value, label }));
  return known.some((option) => option.value === defaultLanguage)
    ? known
    : [{ value: defaultLanguage, label: defaultLanguage }, ...known];
}

const count = (amount: number, one: string, many = `${one}s`) =>
  `${amount} ${amount === 1 ? one : many}`;

/** "3 seasons, 24 episodes" for a series, null for a movie. */
export function describeSeasons(seasons: MetadataPreview['seasons']): string | null {
  if (seasons.length === 0) {
    return null;
  }
  const episodes = seasons.reduce((total, season) => total + season.episodeCount, 0);
  return `${count(seasons.length, 'season')}, ${count(episodes, 'episode')}`;
}

const FIELD_NAMES: Record<string, string> = {
  name: 'name',
  originalName: 'original name',
  tagline: 'tagline',
  synopsis: 'synopsis',
  releaseYear: 'year',
  ageRating: 'age rating',
  originalLanguage: 'language',
  poster: 'poster',
  backdrop: 'backdrop',
  logo: 'logo',
  categories: 'categories',
  genres: 'genres',
  credits: 'cast and crew',
  // The facts are many and small. Together they are one thing that was filled.
  releaseDate: 'facts',
  runtimeMinutes: 'facts',
  imdbId: 'facts',
  countries: 'facts',
  studios: 'facts',
  keywords: 'facts',
  seriesStatus: 'facts',
  lastAirDate: 'facts',
};

/**
 * What an import did, in a sentence: "Filled tagline, year and poster. Added
 * 2 seasons and 14 episodes." When it changed nothing, it says so.
 */
export function describeReport(report: ImportReport): string {
  const sentences: string[] = [];
  const fields = [...new Set(report.fields.map((field) => FIELD_NAMES[field] ?? field))];
  if (fields.length > 0) {
    const last = fields.at(-1) as string;
    sentences.push(
      `Filled ${fields.length === 1 ? last : `${fields.slice(0, -1).join(', ')} and ${last}`}.`,
    );
  }
  const added = [
    report.seasonsCreated > 0 ? count(report.seasonsCreated, 'season') : null,
    report.episodesCreated > 0 ? count(report.episodesCreated, 'episode') : null,
  ].filter((part) => part !== null);
  if (added.length > 0) {
    sentences.push(`Added ${added.join(' and ')}.`);
  }
  if (report.episodesUpdated > 0) {
    sentences.push(`Updated ${count(report.episodesUpdated, 'episode')}.`);
  }
  if (report.peopleCreated > 0) {
    sentences.push(`${count(report.peopleCreated, 'person', 'people')} new to the catalog.`);
  }
  if (report.categoriesCreated.length > 0) {
    sentences.push(
      `Created the ${report.categoriesCreated.length === 1 ? 'category' : 'categories'} ${report.categoriesCreated.join(', ')}.`,
    );
  }
  return sentences.length > 0
    ? sentences.join(' ')
    : 'Nothing to add: the title has everything the source offers.';
}

/** Address of an entry on TMDB's own site, to check that it is the right one. */
export function sourceUrl(metadataId: string): string | null {
  const match = /^(movie|tv):(\d+)$/.exec(metadataId);
  return match ? `https://www.themoviedb.org/${match[1]}/${match[2]}` : null;
}
