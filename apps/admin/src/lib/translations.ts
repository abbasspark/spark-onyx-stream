// SPDX-License-Identifier: AGPL-3.0-only
import type {
  PartTranslation,
  SourceTranslation,
  TitleDetail,
  Translation,
  TranslationInput,
} from '@/api/types';

/** Languages offered when a title gets a new one. Any other tag can be typed. */
export const COMMON_LANGUAGES = [
  'ar',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'fa',
  'fi',
  'fr',
  'he',
  'hi',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt',
  'pt-BR',
  'ro',
  'ru',
  'sv',
  'th',
  'tr',
  'uk',
  'vi',
  'zh',
] as const;

const names =
  typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(undefined, { type: 'language' })
    : null;

/** "German" for "de", "Brazilian Portuguese" for "pt-BR". The tag itself when unknown. */
export function languageName(tag: string): string {
  try {
    const name = names?.of(tag);
    return name && name !== tag ? name.charAt(0).toUpperCase() + name.slice(1) : tag;
  } catch {
    return tag;
  }
}

/** Whether a language is written from right to left, to set the direction of its fields. */
export function isRightToLeft(tag: string): boolean {
  return ['ar', 'fa', 'he', 'ur', 'ps', 'yi'].includes(tag.split('-')[0] ?? '');
}

/**
 * Brings a typed tag into the form the catalog stores: "DE" becomes "de",
 * "pt-br" becomes "pt-BR". Null for what is not a language tag.
 */
export function normalizeLanguage(value: string): string | null {
  const [language, ...rest] = value.trim().replace(/_/g, '-').split('-');
  if (!language) {
    return null;
  }
  const tag = [
    language.toLowerCase(),
    ...rest.map((part) =>
      part.length === 4
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : part.toUpperCase(),
    ),
  ].join('-');
  return /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/.test(tag) ? tag : null;
}

interface PartTexts {
  name: string;
  synopsis: string;
}

/** A translation while it is edited: every field a text, empty for "not translated". */
export interface TranslationForm {
  name: string;
  tagline: string;
  synopsis: string;
  /** By the id of the season or episode. */
  seasons: Record<string, PartTexts>;
  episodes: Record<string, PartTexts>;
}

const EMPTY_PART: PartTexts = { name: '', synopsis: '' };

const toParts = (parts: readonly PartTranslation[]): Record<string, PartTexts> =>
  Object.fromEntries(
    parts.map((part) => [part.id, { name: part.name ?? '', synopsis: part.synopsis ?? '' }]),
  );

export function toTranslationForm(translation: TranslationInput | undefined): TranslationForm {
  return {
    name: translation?.name ?? '',
    tagline: translation?.tagline ?? '',
    synopsis: translation?.synopsis ?? '',
    seasons: toParts(translation?.seasons ?? []),
    episodes: toParts(translation?.episodes ?? []),
  };
}

const fromParts = (parts: Record<string, PartTexts>): PartTranslation[] =>
  Object.entries(parts)
    .map(([id, part]) => ({
      id,
      name: part.name.trim() || null,
      synopsis: part.synopsis.trim() || null,
    }))
    .filter((part) => part.name || part.synopsis)
    .sort((a, b) => a.id.localeCompare(b.id));

/** What is saved: trimmed, with what is empty left out. */
export function toTranslationInput(form: TranslationForm): TranslationInput {
  return {
    name: form.name.trim() || null,
    tagline: form.tagline.trim() || null,
    synopsis: form.synopsis.trim() || null,
    seasons: fromParts(form.seasons),
    episodes: fromParts(form.episodes),
  };
}

/** Whether two forms would save the same. */
export function sameTranslation(a: TranslationForm, b: TranslationForm): boolean {
  return JSON.stringify(toTranslationInput(a)) === JSON.stringify(toTranslationInput(b));
}

export const partOf = (parts: Record<string, PartTexts>, id: string): PartTexts =>
  parts[id] ?? EMPTY_PART;

/**
 * Puts what the source offers into a form.
 *
 * @param overwrite Off, only empty fields are filled, so nothing typed is lost.
 * @returns the new form and how many fields it changed.
 */
export function mergeSource(
  form: TranslationForm,
  source: SourceTranslation,
  overwrite = false,
): { form: TranslationForm; filled: number } {
  let filled = 0;
  const take = (current: string, offered: string | null): string => {
    if (!offered || offered === current || (current.trim() && !overwrite)) {
      return current;
    }
    filled += 1;
    return offered;
  };
  const merge = (current: Record<string, PartTexts>, offered: readonly PartTranslation[]) => {
    const next = { ...current };
    for (const part of offered) {
      const own = partOf(current, part.id);
      next[part.id] = {
        name: take(own.name, part.name),
        synopsis: take(own.synopsis, part.synopsis),
      };
    }
    return next;
  };
  const next: TranslationForm = {
    name: take(form.name, source.name),
    tagline: take(form.tagline, source.tagline),
    synopsis: take(form.synopsis, source.synopsis),
    seasons: merge(form.seasons, source.seasons),
    episodes: merge(form.episodes, source.episodes),
  };
  return { form: next, filled };
}

/**
 * How much of a title is translated in a form: of every text the title has in
 * its own language, how many have one in the other. The same count as the
 * server's, so the number does not jump on saving.
 */
export function translationProgress(
  title: Pick<TitleDetail, 'tagline' | 'synopsis' | 'seasons'>,
  form: TranslationForm,
): { filled: number; total: number; percent: number } {
  const has = (value: string) => (value.trim() ? 1 : 0);
  let total = 1 + (title.tagline ? 1 : 0) + (title.synopsis ? 1 : 0);
  let filled = has(form.name) + has(form.tagline) + has(form.synopsis);
  for (const season of title.seasons) {
    total += (season.name ? 1 : 0) + (season.synopsis ? 1 : 0);
    const ofSeason = partOf(form.seasons, season.id);
    filled += has(ofSeason.name) + has(ofSeason.synopsis);
    for (const episode of season.episodes) {
      total += 1 + (episode.synopsis ? 1 : 0);
      const ofEpisode = partOf(form.episodes, episode.id);
      filled += has(ofEpisode.name) + has(ofEpisode.synopsis);
    }
  }
  filled = Math.min(filled, total);
  return { filled, total, percent: Math.round((filled / total) * 100) };
}

/** The same share for a saved translation, as the server counted it. */
export function savedPercent(translation: Pick<Translation, 'filled' | 'total'>): number {
  return translation.total === 0 ? 0 : Math.round((translation.filled / translation.total) * 100);
}
