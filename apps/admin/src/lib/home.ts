// SPDX-License-Identifier: AGPL-3.0-only
import type {
  HomeLayout,
  HomeSection,
  HomeSectionInput,
  HomeSectionKind,
  HomeSort,
  HomeSource,
} from '@/api/types';

export const MAX_HERO_TITLES = 8;
export const MIN_ROW_TITLES = 4;
export const MAX_ROW_TITLES = 40;

export const SOURCE_LABELS: Record<HomeSource, { label: string; about: string }> = {
  ALL: { label: 'The whole catalog', about: 'Every title, in the order you choose' },
  FEATURED: { label: 'Featured titles', about: 'The titles marked as featured' },
  CATEGORY: { label: 'A category', about: 'The titles of one of your categories' },
  GENRE: { label: 'A genre', about: 'The titles of one genre' },
  COLLECTION: { label: 'A collection', about: 'A collection, in its own order or another' },
  MANUAL: { label: 'Titles I pick', about: 'Exactly the titles you choose, in your order' },
};

export const SORT_LABELS: Record<HomeSort, { label: string; about: string }> = {
  CURATED: { label: 'As arranged', about: 'The order of the collection' },
  NEWEST: { label: 'Newest first', about: 'Last published first' },
  RELEASED: { label: 'Latest premiere first', about: 'By the day of the premiere' },
  RATING: { label: 'Best rated first', about: 'By the rating of the title' },
  NAME: { label: 'A to Z', about: 'By name' },
};

export const LAYOUT_LABELS: Record<HomeLayout, { label: string; about: string }> = {
  POSTER: { label: 'Posters', about: 'Upright posters, the usual row' },
  LANDSCAPE: {
    label: 'Wide cards',
    about: 'Backdrops with the name on them. Fewer fit, each says more',
  },
  NUMBERED: { label: 'Top list', about: 'Posters with their place beside them: 1, 2, 3' },
};

/** The orders a source can have. Picked titles only have their own. */
export function sortsFor(source: HomeSource): HomeSort[] {
  if (source === 'MANUAL') {
    return ['CURATED'];
  }
  const sorts: HomeSort[] = ['NEWEST', 'RELEASED', 'RATING', 'NAME'];
  return source === 'COLLECTION' ? ['CURATED', ...sorts] : sorts;
}

export type SectionState = 'shown' | 'off' | 'scheduled' | 'ended' | 'empty';

/** Why viewers see a section right now, or why not. */
export function sectionState(
  section: Pick<HomeSection, 'visible' | 'visibleFrom' | 'visibleUntil' | 'kind' | 'count'>,
  now: number = Date.now(),
): SectionState {
  if (!section.visible) {
    return 'off';
  }
  if (section.visibleFrom && new Date(section.visibleFrom).getTime() > now) {
    return 'scheduled';
  }
  if (section.visibleUntil && new Date(section.visibleUntil).getTime() <= now) {
    return 'ended';
  }
  return section.kind !== 'CONTINUE_WATCHING' && section.count === 0 ? 'empty' : 'shown';
}

const KIND_WORD = { MOVIE: 'movies', SERIES: 'series' } as const;

/**
 * One line that says what a section shows: "Movies of the category Drama,
 * best rated first, up to 20, as wide cards".
 */
export function describeSection(
  section: Pick<
    HomeSection,
    | 'kind'
    | 'source'
    | 'category'
    | 'genre'
    | 'collection'
    | 'titleType'
    | 'sort'
    | 'limit'
    | 'layout'
  >,
): string {
  if (section.kind === 'CONTINUE_WATCHING') {
    return 'What each viewer started and did not finish. Shown only to those who have something.';
  }
  const what = section.titleType ? KIND_WORD[section.titleType] : 'titles';
  const from: Record<HomeSource, string> = {
    ALL: section.titleType ? `All ${what}` : 'The whole catalog',
    FEATURED: `Featured ${what}`,
    CATEGORY: `${cap(what)} of the category ${section.category?.name ?? '…'}`,
    GENRE: `${cap(what)} of the genre ${section.genre?.name ?? '…'}`,
    COLLECTION: `${cap(what)} of the collection ${section.collection?.name ?? '…'}`,
    MANUAL: `${cap(what)} picked by hand`,
  };
  const order: Record<HomeSort, string> = {
    CURATED: section.source === 'MANUAL' ? 'in your order' : 'in its own order',
    NEWEST: 'newest first',
    RELEASED: 'latest premiere first',
    RATING: 'best rated first',
    NAME: 'A to Z',
  };
  const parts = [from[section.source], order[section.sort]];
  if (section.kind === 'HERO') {
    parts.push(section.limit === 1 ? 'one title' : `up to ${section.limit} that take turns`);
  } else {
    parts.push(`up to ${section.limit}`);
    if (section.layout !== 'POSTER') {
      parts.push(section.layout === 'LANDSCAPE' ? 'as wide cards' : 'as a numbered top list');
    }
  }
  return parts.join(', ');
}

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Ready-made sections offered when one is added. */
export interface SectionPreset {
  key: string;
  label: string;
  about: string;
  kind: HomeSectionKind;
  input: HomeSectionInput;
  /** Needs a choice before it can be made: the editor opens first. */
  needs?: 'category' | 'genre' | 'collection' | 'titles';
}

export const SECTION_PRESETS: SectionPreset[] = [
  {
    key: 'new',
    label: 'New arrivals',
    about: 'The titles published last',
    kind: 'TITLES',
    input: { source: 'ALL', sort: 'NEWEST' },
  },
  {
    key: 'top',
    label: 'Top 10',
    about: 'The best rated, numbered',
    kind: 'TITLES',
    input: { source: 'ALL', sort: 'RATING', limit: 10, layout: 'NUMBERED', name: 'Top 10' },
  },
  {
    key: 'featured',
    label: 'Featured',
    about: 'The titles you marked as featured',
    kind: 'TITLES',
    input: { source: 'FEATURED', sort: 'NEWEST', layout: 'LANDSCAPE' },
  },
  {
    key: 'movies',
    label: 'New movies',
    about: 'Only movies, newest first',
    kind: 'TITLES',
    input: { source: 'ALL', sort: 'NEWEST', titleType: 'MOVIE' },
  },
  {
    key: 'series',
    label: 'New series',
    about: 'Only series, newest first',
    kind: 'TITLES',
    input: { source: 'ALL', sort: 'NEWEST', titleType: 'SERIES' },
  },
  {
    key: 'category',
    label: 'A category',
    about: 'One of your categories as a row',
    kind: 'TITLES',
    input: { source: 'CATEGORY', sort: 'NEWEST' },
    needs: 'category',
  },
  {
    key: 'genre',
    label: 'A genre',
    about: 'The titles of one genre',
    kind: 'TITLES',
    input: { source: 'GENRE', sort: 'NEWEST' },
    needs: 'genre',
  },
  {
    key: 'collection',
    label: 'A collection',
    about: 'A trilogy, a season special, a theme',
    kind: 'TITLES',
    input: { source: 'COLLECTION', sort: 'CURATED' },
    needs: 'collection',
  },
  {
    key: 'picks',
    label: 'Hand-picked titles',
    about: 'Exactly the titles you choose',
    kind: 'TITLES',
    input: { source: 'MANUAL', sort: 'CURATED' },
    needs: 'titles',
  },
];

/** What the editor holds while a section is made or changed. */
export interface SectionForm {
  name: string;
  source: HomeSource;
  categoryId: string;
  genreId: string;
  collectionId: string;
  titleType: 'ALL' | 'MOVIE' | 'SERIES';
  sort: HomeSort;
  limit: number;
  layout: HomeLayout;
  visible: boolean;
  /** As typed into a date-and-time field. Empty: no date. */
  from: string;
  until: string;
  picked: { id: string; name: string; type: 'MOVIE' | 'SERIES'; visible: boolean }[];
}

/** What is still missing before a form can be saved, as a sentence. Null: nothing. */
export function formProblem(kind: HomeSectionKind, form: SectionForm): string | null {
  if (kind === 'CONTINUE_WATCHING') {
    return datesProblem(form);
  }
  if (form.source === 'CATEGORY' && !form.categoryId) {
    return 'Choose the category.';
  }
  if (form.source === 'GENRE' && !form.genreId) {
    return 'Choose the genre.';
  }
  if (form.source === 'COLLECTION' && !form.collectionId) {
    return 'Choose the collection.';
  }
  if (form.source === 'MANUAL' && form.picked.length === 0) {
    return 'Pick at least one title.';
  }
  const [least, most] = kind === 'HERO' ? [1, MAX_HERO_TITLES] : [MIN_ROW_TITLES, MAX_ROW_TITLES];
  if (!Number.isInteger(form.limit) || form.limit < least || form.limit > most) {
    return `Show between ${least} and ${most} titles.`;
  }
  return datesProblem(form);
}

function datesProblem(form: Pick<SectionForm, 'from' | 'until'>): string | null {
  return form.from && form.until && new Date(form.until) <= new Date(form.from)
    ? 'The end must come after the start.'
    : null;
}

/** Moves the entry at an index one place up (-1) or down (1). Out of range: unchanged. */
export function moved<Item>(items: readonly Item[], index: number, by: -1 | 1): Item[] {
  const target = index + by;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  [next[index], next[target]] = [next[target] as Item, next[index] as Item];
  return next;
}

/** Takes the entry with an id out and puts it where another one is. For dragging. */
export function placedAt<Item extends { id: string }>(
  items: readonly Item[],
  id: string,
  targetId: string,
): Item[] {
  const from = items.findIndex((item) => item.id === id);
  const to = items.findIndex((item) => item.id === targetId);
  if (from === -1 || to === -1 || from === to) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as Item);
  return next;
}
