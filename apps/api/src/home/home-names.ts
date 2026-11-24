// SPDX-License-Identifier: AGPL-3.0-only

type Source = 'ALL' | 'FEATURED' | 'CATEGORY' | 'GENRE' | 'COLLECTION' | 'MANUAL';
type Sort = 'CURATED' | 'NEWEST' | 'RELEASED' | 'RATING' | 'NAME';
type TitleType = 'MOVIE' | 'SERIES' | null;

export interface NamedSection {
  kind: 'HERO' | 'CONTINUE_WATCHING' | 'MY_LIST' | 'BECAUSE_YOU_WATCHED' | 'TITLES';
  name: string | null;
  source: Source;
  sort: Sort;
  titleType: TitleType;
  category: { name: string; slug: string } | null;
  genre: { name: string; slug: string } | null;
  collection: { name: string; slug: string } | null;
}

const KIND_WORD = { MOVIE: 'movies', SERIES: 'series' } as const;

/**
 * What a section is called when nobody gave it a heading: after what it
 * shows. "New movies", "Top rated", "Drama series", the name of a collection.
 *
 * @param pageType The kind of title the page of the section is about, if it is about one.
 */
export function defaultSectionName(section: NamedSection, pageType: TitleType = null): string {
  if (section.kind === 'CONTINUE_WATCHING') {
    return 'Continue watching';
  }
  if (section.kind === 'MY_LIST') {
    return 'My list';
  }
  if (section.kind === 'BECAUSE_YOU_WATCHED') {
    // Clients put the name of the title the row is about behind it.
    return 'Because you watched';
  }
  // On the page for movies, "New" says enough: "New movies" would repeat the page.
  const kind =
    section.titleType && section.titleType !== pageType ? KIND_WORD[section.titleType] : null;
  const withKind = (word: string) => (kind ? `${word} ${kind}` : word);
  switch (section.source) {
    case 'FEATURED':
      return withKind('Featured');
    case 'CATEGORY':
      return withKind(section.category?.name ?? 'Category');
    case 'GENRE':
      return withKind(section.genre?.name ?? 'Genre');
    case 'COLLECTION':
      return section.collection?.name ?? 'Collection';
    case 'MANUAL':
      return 'Our picks';
    case 'ALL':
      switch (section.sort) {
        case 'RATING':
          return withKind('Top rated');
        case 'RELEASED':
          return kind ? `Latest ${kind}` : 'Latest releases';
        case 'NAME':
          return kind ? `All ${kind}` : 'Everything, A to Z';
        default:
          return kind ? `New ${kind}` : 'New';
      }
  }
}

/** The public sort a home sort is called on the browse page. Null: the default there. */
const BROWSE_SORT: Record<Sort, string | null> = {
  CURATED: null,
  NEWEST: null,
  RELEASED: 'year',
  RATING: 'rating',
  NAME: 'name',
};

/**
 * Where "See all" of a row leads on the website: the browse page with the
 * same filters, or the page of the collection. Null for picked titles, which
 * the row shows all of.
 *
 * @param scope The category or genre the page itself is about, on such a page.
 */
export function browsePath(
  section: NamedSection,
  scope?: { kind: 'category' | 'genre'; slug: string },
): string | null {
  if (section.kind === 'MY_LIST') {
    return '/my-list';
  }
  if (section.kind !== 'TITLES' || section.source === 'MANUAL') {
    return null;
  }
  if (section.source === 'COLLECTION') {
    // The page of a collection cannot be narrowed to the category or genre of a page.
    return section.collection && !scope ? `/collection/${section.collection.slug}` : null;
  }
  // The browse page takes one category and one genre: a second one has no address.
  if (scope && scope.kind.toUpperCase() === section.source) {
    return null;
  }
  const params = new URLSearchParams();
  if (section.titleType) {
    params.set('type', section.titleType);
  }
  if (section.source === 'CATEGORY' && section.category) {
    params.set('category', section.category.slug);
  }
  if (section.source === 'GENRE' && section.genre) {
    params.set('genre', section.genre.slug);
  }
  if (scope) {
    params.set(scope.kind, scope.slug);
  }
  if (section.source === 'FEATURED') {
    params.set('featured', 'true');
  }
  const sort = BROWSE_SORT[section.sort];
  if (sort) {
    params.set('sort', sort);
  }
  const search = params.toString();
  return search ? `/browse?${search}` : '/browse';
}

/** Whether a section is shown at a moment: switched on, and inside its dates. */
export function isShownAt(
  section: { visible: boolean; visibleFrom: Date | null; visibleUntil: Date | null },
  now: Date,
): boolean {
  return (
    section.visible &&
    (section.visibleFrom === null || section.visibleFrom <= now) &&
    (section.visibleUntil === null || section.visibleUntil > now)
  );
}
