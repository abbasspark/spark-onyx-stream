// SPDX-License-Identifier: AGPL-3.0-only

/** The cookie that remembers the language a viewer reads titles in. */
export const LANGUAGE_COOKIE = 'onyx_language';

const TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$/;

/**
 * A language tag as the catalog knows it: "de", "pt-BR". Whatever else a
 * cookie may hold is no language, and the catalog's own is used.
 */
export function readLanguage(value: string | undefined | null): string | undefined {
  const tag = value?.trim();
  return tag && TAG.test(tag) ? tag : undefined;
}

/** Reads the language out of the text of `document.cookie`. */
export function languageFromCookies(cookies: string): string | undefined {
  for (const part of cookies.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === LANGUAGE_COOKIE) {
      return readLanguage(decodeURIComponent(rest.join('=')));
    }
  }
  return undefined;
}

/** Adds the language to an address of the catalog. Without one the address stays as it is. */
export function withLanguage(path: string, language: string | undefined): string {
  if (!language) {
    return path;
  }
  return `${path}${path.includes('?') ? '&' : '?'}language=${encodeURIComponent(language)}`;
}

/** "Deutsch" for "de": a language named in itself, as a viewer looks for it. */
export function nativeLanguageName(tag: string): string {
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
    return name && name !== tag ? name.charAt(0).toLocaleUpperCase(tag) + name.slice(1) : tag;
  } catch {
    return tag;
  }
}

/** The name of a language in English, for a code such as "en" or "pt-BR". */
export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** The name of a country in English, for a code such as "DE". */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
