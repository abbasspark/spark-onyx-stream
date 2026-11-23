// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The things of the catalog that are not titles and still have a name viewers
 * read: categories, genres, collections and people. "Terms" for short.
 */
export const TERM_KINDS = ['categories', 'genres', 'collections', 'people'] as const;
export type TermKind = (typeof TERM_KINDS)[number];

export function isTermKind(value: string): value is TermKind {
  return (TERM_KINDS as readonly string[]).includes(value);
}

/** A text of a term that can be translated. */
export interface TermField {
  /** The name of the field, on the term and on its translation. */
  key: string;
  label: string;
  /** A text of several lines, for a larger box in the panel. */
  long: boolean;
  maxLength: number;
}

const NAME: TermField = { key: 'name', label: 'Name', long: false, maxLength: 200 };

/** What can be translated of each kind, the name first. */
export const TERM_FIELDS: Record<TermKind, readonly TermField[]> = {
  categories: [NAME, { key: 'description', label: 'Description', long: true, maxLength: 2000 }],
  genres: [NAME],
  collections: [NAME, { key: 'synopsis', label: 'Synopsis', long: true, maxLength: 4000 }],
  people: [
    NAME,
    { key: 'knownFor', label: 'Known for', long: false, maxLength: 60 },
    { key: 'biography', label: 'Biography', long: true, maxLength: 5000 },
  ],
};

export const TERM_LABELS: Record<TermKind, string> = {
  categories: 'Categories',
  genres: 'Genres',
  collections: 'Collections',
  people: 'People',
};

/** The texts of a term or of its translation, by field. Null: there is none. */
export type TermTexts = Record<string, string | null>;

/**
 * Cleans the texts sent for one term: spaces at the ends go, an empty text
 * becomes null, fields that are left out stay out.
 *
 * @returns The cleaned texts, or a sentence saying what is wrong with them.
 */
export function cleanTexts(
  kind: TermKind,
  texts: Record<string, string | null | undefined>,
): { texts: TermTexts } | { problem: string } {
  const fields = TERM_FIELDS[kind];
  const unknown = Object.keys(texts).filter((key) => !fields.some((field) => field.key === key));
  if (unknown.length > 0) {
    return { problem: `${TERM_LABELS[kind]} have no text called ${unknown.join(', ')}` };
  }
  const cleaned: TermTexts = {};
  for (const field of fields) {
    const value = texts[field.key];
    if (value === undefined) {
      continue;
    }
    const text = value?.trim() || null;
    if (text && text.length > field.maxLength) {
      return {
        problem: `${field.label} can be ${field.maxLength} characters long, this one has ${text.length}`,
      };
    }
    cleaned[field.key] = text;
  }
  return { texts: cleaned };
}

/** True when no text is left: the translation holds nothing and can go. */
export function isEmpty(texts: TermTexts): boolean {
  return Object.values(texts).every((value) => value === null);
}

/**
 * Lays a translation over the texts of a term. A text the translation does
 * not have stays in the language of the catalog, and so does every field the
 * term itself does not carry.
 */
export function overlay<T extends object>(
  kind: TermKind,
  term: T,
  translation: Record<string, unknown> | undefined,
): T {
  if (!translation) {
    return term;
  }
  const result = { ...term } as Record<string, unknown>;
  for (const field of TERM_FIELDS[kind]) {
    const value = translation[field.key];
    if (field.key in term && typeof value === 'string' && value !== '') {
      result[field.key] = value;
    }
  }
  return result as T;
}
