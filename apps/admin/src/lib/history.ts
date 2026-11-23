// SPDX-License-Identifier: AGPL-3.0-only
import type { ChangeGroup, TitleChange, TitleRevision } from '@/api/types';
import { formatMoney } from './billing';
import { formatDateTime, formatDay, humanize } from './format';
import { languageName } from './translations';

const ACTIONS: Record<string, string> = {
  baseline: 'Recorded the title as it was',
  create: 'Created the title',
  duplicate: 'Made it as a copy',
  import: 'Imported it from TMDB',
  metadata_update: 'Updated details from TMDB',
  update: 'Edited the details',
  publish: 'Published',
  unpublish: 'Unpublished',
  archive: 'Archived',
  credits: 'Changed cast and crew',
  extras: 'Changed the extras',
  translation: 'Changed translations',
  season: 'Changed the seasons',
  episode: 'Changed episodes',
  bulk: 'Changed it together with other titles',
  restore: 'Brought an earlier version back',
};

/** What was done, as a sentence that follows a name: "Abbas edited the details". */
export function actionLabel(action: string): string {
  return ACTIONS[action] ?? humanize(action);
}

export const GROUP_LABELS: Record<ChangeGroup, string> = {
  texts: 'Texts',
  facts: 'Facts',
  publishing: 'Publishing',
  access: 'Access and prices',
  artwork: 'Artwork',
  classification: 'Genres and categories',
  people: 'Cast and crew',
  videos: 'Videos',
  translations: 'Translations',
  episodes: 'Seasons and episodes',
};

/**
 * The label of a change for a person. Translations carry their language as a
 * tag ("de: synopsis"), which is named here ("German: synopsis").
 */
export function changeLabel(change: TitleChange): string {
  if (change.field.startsWith('translation:')) {
    const [, language, part] = change.field.split(':');
    return `${languageName(language ?? '')}: ${part ?? ''}`;
  }
  return change.label;
}

/** A value of a change as a person reads it. Null: there was none. */
export function formatValue(
  change: TitleChange,
  value: string | null | undefined,
  currency: string,
): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  switch (change.format) {
    case 'money':
      return formatMoney(Number(value), currency);
    case 'date':
      return formatDay(value);
    case 'datetime':
      return formatDateTime(value);
    case 'status':
      return humanize(value);
    case 'yesno':
      return value === 'true' ? 'Yes' : 'No';
    case 'picture':
      return 'A picture';
    default:
      return value;
  }
}

/** The names in a list change, with languages named when it is the list of languages. */
export function listItems(change: TitleChange, items: readonly string[] | undefined): string[] {
  return (items ?? []).map((item) => (change.field === 'languages' ? languageName(item) : item));
}

export interface DiffPart {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

/** Texts longer than this many words are shown whole, not compared word by word. */
const MAX_DIFF_WORDS = 400;

/**
 * Compares two texts word by word, so a changed sentence shows what was
 * taken out and what was put in, and the rest stays readable.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter((token) => token !== '');
  const b = after.split(/(\s+)/).filter((token) => token !== '');
  if (a.length > MAX_DIFF_WORDS * 2 || b.length > MAX_DIFF_WORDS * 2) {
    return [
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ];
  }
  // The longest common run of words, by the classic table.
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      (table[i] as number[])[j] =
        a[i] === b[j]
          ? ((table[i + 1] as number[])[j + 1] as number) + 1
          : Math.max(
              (table[i + 1] as number[])[j] as number,
              (table[i] as number[])[j + 1] as number,
            );
    }
  }
  const parts: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = parts.at(-1);
    if (last && last.kind === kind) {
      last.text += text;
    } else {
      parts.push({ kind, text });
    }
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i] as string);
      i += 1;
      j += 1;
    } else if (
      ((table[i + 1] as number[])[j] as number) >= ((table[i] as number[])[j + 1] as number)
    ) {
      push('removed', a[i] as string);
      i += 1;
    } else {
      push('added', b[j] as string);
      j += 1;
    }
  }
  while (i < a.length) {
    push('removed', a[i] as string);
    i += 1;
  }
  while (j < b.length) {
    push('added', b[j] as string);
    j += 1;
  }
  return parts;
}

export interface RevisionDay {
  /** The day as "2026-11-23", in the time zone of the browser. */
  day: string;
  revisions: TitleRevision[];
}

const localDay = (iso: string): string => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Revisions under the day they were made on, in the order given. */
export function groupByDay(revisions: readonly TitleRevision[]): RevisionDay[] {
  const days: RevisionDay[] = [];
  for (const revision of revisions) {
    const day = localDay(revision.createdAt);
    const last = days.at(-1);
    if (last && last.day === day) {
      last.revisions.push(revision);
    } else {
      days.push({ day, revisions: [revision] });
    }
  }
  return days;
}

/** "Today", "Yesterday" or the date, for the heading of a day. */
export function dayHeading(day: string, now: Date = new Date()): string {
  const today = localDay(now.toISOString());
  const before = new Date(now);
  before.setDate(before.getDate() - 1);
  if (day === today) {
    return 'Today';
  }
  if (day === localDay(before.toISOString())) {
    return 'Yesterday';
  }
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "1 change", "12 changes". */
export function changesCount(count: number): string {
  return `${count} ${count === 1 ? 'change' : 'changes'}`;
}
