// SPDX-License-Identifier: AGPL-3.0-only
import type { TermField, TermRow, TermSaveItem } from '@/api/types';

/** What was typed and not saved yet: by term, then by field. */
export type TermEdits = Record<string, Record<string, string>>;

/** The text a field shows: what was typed, or else what is stored. */
export function valueOf(row: TermRow, edits: TermEdits, key: string): string {
  return edits[row.id]?.[key] ?? row.translation?.[key] ?? '';
}

/** Edits with one field set. Typing back what is stored takes the edit away again. */
export function withEdit(edits: TermEdits, row: TermRow, key: string, value: string): TermEdits {
  const stored = row.translation?.[key] ?? '';
  const ofRow = { ...edits[row.id] };
  if (value.trim() === stored) {
    delete ofRow[key];
  } else {
    ofRow[key] = value;
  }
  const next = { ...edits };
  if (Object.keys(ofRow).length === 0) {
    delete next[row.id];
  } else {
    next[row.id] = ofRow;
  }
  return next;
}

export function isRowDirty(edits: TermEdits, id: string): boolean {
  return edits[id] !== undefined;
}

export function dirtyCount(edits: TermEdits): number {
  return Object.keys(edits).length;
}

/** What a save sends: for every changed term, only the fields that changed. */
export function saveItems(edits: TermEdits): TermSaveItem[] {
  return Object.entries(edits).map(([id, texts]) => ({
    id,
    texts: Object.fromEntries(
      Object.entries(texts).map(([key, value]) => [key, value.trim() || null]),
    ),
  }));
}

/**
 * How far a term is translated: "done" when every text it has in the language
 * of the catalog has one here, "partly" when some do, "missing" when none.
 */
export type TermState = 'done' | 'partly' | 'missing';

export function stateOf(row: TermRow, edits: TermEdits, fields: readonly TermField[]): TermState {
  const wanted = fields.filter((field) => row.original[field.key]);
  const have = wanted.filter((field) => valueOf(row, edits, field.key).trim() !== '');
  if (have.length === 0) {
    // A text only the translation has still counts as something.
    return fields.some((field) => valueOf(row, edits, field.key).trim() !== '')
      ? 'partly'
      : 'missing';
  }
  return have.length === wanted.length ? 'done' : 'partly';
}

/** A share as a whole percentage. Nothing to translate counts as all of it. */
export function percent(part: number, whole: number): number {
  if (whole <= 0) {
    return 100;
  }
  return Math.min(100, Math.round((part / whole) * 100));
}

/** The longest text among the long fields, cut for a line under the name. */
export function teaser(row: TermRow, fields: readonly TermField[], length = 110): string | null {
  for (const field of fields) {
    const text = field.long ? row.original[field.key] : null;
    if (text) {
      return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
    }
  }
  return null;
}

const SINGULAR: Record<string, [one: string, many: string]> = {
  categories: ['category', 'categories'],
  genres: ['genre', 'genres'],
  collections: ['collection', 'collections'],
  people: ['person', 'people'],
};

/** "1 genre", "3 people". */
export function countOf(kind: string, count: number): string {
  const [one, many] = SINGULAR[kind] ?? [kind, kind];
  return `${count} ${count === 1 ? one : many}`;
}
