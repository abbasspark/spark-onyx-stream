// SPDX-License-Identifier: AGPL-3.0-only
//
// Choosing the sound and the subtitles of a video by the languages a profile likes.

/** A track as a player lists it. */
export interface LanguageTrack {
  /** The tag the playlist gives, such as "de" or "pt-BR". Missing when it gives none. */
  lang?: string | null;
  /** Subtitles that only translate what is spoken in another language. */
  forced?: boolean;
}

const primary = (tag: string): string => tag.toLowerCase().split('-')[0] as string;

/**
 * The position of the track that fits a language best: the same tag, or
 * else the same language of another country. "pt" finds "pt-BR", and
 * "pt-PT" finds "pt-BR" when there is no "pt-PT".
 *
 * Forced subtitles are passed over: they are not what someone who asks for
 * subtitles wants to read.
 *
 * @returns -1 when no track fits, or nothing is preferred.
 */
export function pickTrack(
  tracks: readonly LanguageTrack[],
  preferred: string | null | undefined,
): number {
  if (!preferred) {
    return -1;
  }
  const wanted = preferred.toLowerCase();
  const usable = tracks
    .map((track, index) => ({ lang: track.lang?.toLowerCase() ?? '', forced: track.forced, index }))
    .filter((track) => track.lang && !track.forced);
  const exact = usable.find((track) => track.lang === wanted);
  if (exact) {
    return exact.index;
  }
  const bare = usable.find((track) => track.lang === primary(wanted));
  if (bare) {
    return bare.index;
  }
  return usable.find((track) => primary(track.lang) === primary(wanted))?.index ?? -1;
}

/** The languages offered when a profile says what it likes. Any other tag a video has works too. */
export const PREFERENCE_LANGUAGES = [
  'ar',
  'zh',
  'cs',
  'da',
  'nl',
  'en',
  'fi',
  'fr',
  'de',
  'el',
  'he',
  'hi',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'no',
  'fa',
  'pl',
  'pt',
  'ro',
  'ru',
  'es',
  'sv',
  'th',
  'tr',
  'uk',
  'vi',
] as const;

/**
 * The choices of a language field: the offered languages named in
 * themselves, in the order of those names, with the one in use added when
 * it is not among them.
 */
export function languageChoices(
  current: string | null | undefined,
  nameOf: (tag: string) => string,
): { value: string; label: string }[] {
  const tags = new Set<string>(PREFERENCE_LANGUAGES);
  if (current) {
    tags.add(current);
  }
  return [...tags]
    .map((value) => ({ value, label: nameOf(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
