// SPDX-License-Identifier: AGPL-3.0-only
import type { SimilarItem, SimilarSignal, SimilarSignalKind, SimilarView } from '@/api/types';

/** How a reason is drawn and named. The order is the order of the legend and of the bar. */
export const SIGNAL_LOOKS: Record<
  SimilarSignalKind,
  { name: string; description: string; color: string }
> = {
  collection: {
    name: 'Same collection',
    description: 'An editor put both into one collection.',
    color: 'var(--series-1)',
  },
  watched: {
    name: 'Watched together',
    description: 'The same viewers watch both.',
    color: 'var(--series-2)',
  },
  genres: {
    name: 'Genres',
    description: 'The share of their genres both have.',
    color: 'var(--series-3)',
  },
  keywords: {
    name: 'Keywords',
    description: 'Four shared keywords count in full.',
    color: 'var(--series-4)',
  },
  cast: {
    name: 'Cast',
    description: 'Among the first ten of each. Three shared actors count in full.',
    color: 'var(--series-5)',
  },
  crew: {
    name: 'Crew',
    description: 'Among the first eight of each. Two shared people count in full.',
    color: 'var(--series-7)',
  },
  categories: { name: 'Categories', description: '', color: 'var(--series-rest)' },
  kind: { name: 'Both movies, or both series', description: '', color: 'var(--series-rest)' },
  era: { name: 'Released around the same time', description: '', color: 'var(--series-rest)' },
  studio: { name: 'Same studio', description: '', color: 'var(--series-rest)' },
  language: { name: 'Same original language', description: '', color: 'var(--series-rest)' },
};

/** The reasons that make two titles similar by themselves, in the order of the legend. */
export const STRONG_SIGNALS: readonly SimilarSignalKind[] = [
  'collection',
  'watched',
  'genres',
  'keywords',
  'cast',
  'crew',
];
/** The reasons that only order titles which are alike anyway. */
export const WEAK_SIGNALS: readonly SimilarSignalKind[] = [
  'categories',
  'kind',
  'era',
  'studio',
  'language',
];

const isStrong = (signal: SimilarSignalKind) => STRONG_SIGNALS.includes(signal);

export interface BarPart {
  key: string;
  name: string;
  color: string;
  points: number;
}

/**
 * The parts of the bar of a match: one per strong reason, in the order of
 * the legend, and one for everything else together. Their widths are points
 * out of 100, so two bars can be compared by eye.
 */
export function barParts(signals: readonly SimilarSignal[]): BarPart[] {
  const parts: BarPart[] = STRONG_SIGNALS.flatMap((kind) => {
    const found = signals.find((entry) => entry.signal === kind);
    return found
      ? [
          {
            key: kind,
            name: SIGNAL_LOOKS[kind].name,
            color: SIGNAL_LOOKS[kind].color,
            points: found.points,
          },
        ]
      : [];
  });
  const rest = signals
    .filter((entry) => !isStrong(entry.signal))
    .reduce((total, entry) => total + entry.points, 0);
  if (rest > 0) {
    parts.push({
      key: 'rest',
      name: 'Also alike',
      color: 'var(--series-rest)',
      points: Math.round(rest * 10) / 10,
    });
  }
  return parts;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Names in a row, cut after a few: "Crime, Drama and 2 more". */
function listed(names: readonly string[], total: number, most = 3): string {
  const shown = names.slice(0, most);
  const more = Math.max(total, names.length) - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ');
}

/** A strong reason in words, with what is shared: "Genres: Crime, Drama". */
export function describeSignal(signal: SimilarSignal): string {
  switch (signal.signal) {
    case 'collection':
      return signal.names.length > 0
        ? `Collection: ${listed(signal.names, signal.count)}`
        : 'Same collection';
    case 'watched':
      return `Watched together by ${plural(signal.count, 'profile', 'profiles')}`;
    case 'genres':
    case 'keywords':
    case 'cast':
    case 'crew':
    case 'categories': {
      const name = SIGNAL_LOOKS[signal.signal].name;
      return signal.names.length > 0 ? `${name}: ${listed(signal.names, signal.count)}` : name;
    }
    case 'studio':
      return signal.names.length > 0 ? `Studio: ${listed(signal.names, signal.count)}` : 'Studio';
    default:
      return SIGNAL_LOOKS[signal.signal].name;
  }
}

/** The reasons shown as chips: the strong ones, strongest first. */
export function strongSignals(signals: readonly SimilarSignal[]): SimilarSignal[] {
  return signals.filter((entry) => isStrong(entry.signal));
}

/** The others, in one sentence for a tooltip. Null when there are none. */
export function weakSummary(signals: readonly SimilarSignal[]): string | null {
  const weak = signals.filter((entry) => !isStrong(entry.signal));
  return weak.length > 0 ? weak.map((entry) => describeSignal(entry)).join(' · ') : null;
}

export const UNSEEN_LABELS: Record<NonNullable<SimilarItem['unseen']>, [string, string]> = {
  draft: ['Not published', 'Viewers get it here once it is published.'],
  dates: ['Outside its dates', 'It is published, but not available right now.'],
  unplayable: ['Nothing to play', 'It is published, but has no video that plays yet.'],
};

/** What an editor decided, as it is sent and compared. */
export interface SimilarDraft {
  pinned: string[];
  hidden: string[];
}

export function draftOf(view: SimilarView): SimilarDraft {
  return {
    pinned: view.items.filter((item) => item.pinned).map((item) => item.title.id),
    hidden: view.hidden.map((item) => item.title.id),
  };
}

export function sameDraft(a: SimilarDraft, b: SimilarDraft): boolean {
  const hiddenA = [...a.hidden].sort();
  const hiddenB = [...b.hidden].sort();
  return a.pinned.join() === b.pinned.join() && hiddenA.join() === hiddenB.join();
}

export type DraftItem = SimilarItem & {
  /** True for a title put here since the last save: how alike it is shows after saving. */
  fresh: boolean;
};

/**
 * The list as it will be after saving: the pinned titles in the order of the
 * draft, then the found ones that are neither pinned nor hidden. The places
 * viewers see are counted again, so the list answers while it is edited.
 *
 * @param known Titles the server said nothing about yet: picked in the search.
 */
export function arrangeDraft(
  view: SimilarView,
  draft: SimilarDraft,
  known: ReadonlyMap<string, SimilarItem['title']>,
): { items: DraftItem[]; hidden: DraftItem[] } {
  const saved = new Map([...view.items, ...view.hidden].map((item) => [item.title.id, item]));
  const pinned = new Set(draft.pinned);
  const hidden = new Set(draft.hidden);

  const resolve = (id: string, isPinned: boolean): DraftItem[] => {
    const item = saved.get(id);
    if (item) {
      return [{ ...item, pinned: isPinned, fresh: false }];
    }
    const title = known.get(id);
    return title
      ? [
          {
            title,
            pinned: isPinned,
            score: null,
            signals: [],
            rank: null,
            unseen: title.status === 'PUBLISHED' ? null : 'draft',
            fresh: true,
          },
        ]
      : [];
  };

  const found = [...view.items, ...view.hidden].filter(
    (item) => !pinned.has(item.title.id) && !hidden.has(item.title.id),
  );
  // What was pinned or hidden and is let go falls back among the found ones, by how alike it is.
  const ordered = found
    .filter((item) => item.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  let rank = 0;
  const items = [
    ...draft.pinned.flatMap((id) => resolve(id, true)),
    ...ordered.map((item) => ({ ...item, pinned: false, fresh: false })),
  ].map((item) => ({ ...item, rank: item.unseen === null ? ++rank : null }));

  return {
    items,
    hidden: draft.hidden
      .flatMap((id) => resolve(id, false))
      .map((item) => ({ ...item, rank: null })),
  };
}

/** Moves a pinned title one place among the pinned ones. */
export function movePinned(draft: SimilarDraft, id: string, by: -1 | 1): SimilarDraft {
  const from = draft.pinned.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= draft.pinned.length) {
    return draft;
  }
  const pinned = [...draft.pinned];
  [pinned[from], pinned[to]] = [pinned[to] as string, pinned[from] as string];
  return { ...draft, pinned };
}

/** What the list says about itself in one line: "12 shown to viewers · 2 pinned · 1 hidden". */
export function listSummary(items: readonly DraftItem[], draft: SimilarDraft, shown: number) {
  const seen = items.filter((item) => item.rank !== null).length;
  return [
    seen === 0
      ? 'Nothing shown to viewers'
      : `${Math.min(seen, shown)} shown on the website${seen > shown ? `, ${seen} found` : ''}`,
    ...(draft.pinned.length > 0 ? [`${draft.pinned.length} pinned`] : []),
    ...(draft.hidden.length > 0 ? [`${draft.hidden.length} hidden`] : []),
  ].join(' · ');
}
