// SPDX-License-Identifier: AGPL-3.0-only

/** A language tag as the catalog stores it: "de", "pt-BR", "zh-Hant", "zh-Hant-TW". */
export const LANGUAGE_PATTERN = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;

/**
 * Brings a tag into the stored form, whatever its capitals: "DE" becomes "de",
 * "pt-br" becomes "pt-BR". Returns null for what is not a language tag.
 */
export function normalizeLanguage(value: string): string | null {
  const parts = value.trim().replace(/_/g, '-').split('-');
  const [language, ...rest] = parts;
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
  return LANGUAGE_PATTERN.test(tag) ? tag : null;
}

/**
 * The tags to look a translation up by, best first: the tag itself, then
 * without its country, then the bare language. "pt-BR" gives "pt-BR", "pt".
 */
export function languageChain(language: string): string[] {
  const parts = language.split('-');
  const chain: string[] = [];
  for (let length = parts.length; length > 0; length -= 1) {
    chain.push(parts.slice(0, length).join('-'));
  }
  return chain;
}

/**
 * Picks, of the translations of one thing, the one that fits a language best.
 * A translation for the bare language also serves a tag with a country.
 */
export function pickTranslation<T extends { language: string }>(
  translations: readonly T[],
  language: string,
): T | undefined {
  for (const tag of languageChain(language)) {
    const found = translations.find((translation) => translation.language === tag);
    if (found) {
      return found;
    }
  }
  return undefined;
}
