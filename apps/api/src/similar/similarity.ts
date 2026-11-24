// SPDX-License-Identifier: AGPL-3.0-only

/**
 * How alike two titles are, as a number from 0 to 100 with the reasons for it.
 *
 * Nothing here reads the database: it is given what two titles share and
 * answers with points. That keeps the rule in one place, where it can be
 * tested and read, and lets the panel show an editor why a title is listed.
 */

/** What is known of the title the others are compared with. */
export interface SimilarSource {
  type: string;
  releaseYear: number | null;
  originalLanguage: string | null;
  minAge: number | null;
  genreCount: number;
  categoryCount: number;
}

/** A title that shares something with it, and how much. */
export interface SimilarCandidate {
  id: string;
  type: string;
  releaseYear: number | null;
  originalLanguage: string | null;
  minAge: number | null;
  rating: number | null;
  genreCount: number;
  categoryCount: number;
  sharedGenres: number;
  sharedCategories: number;
  sharedCollections: number;
  sharedKeywords: number;
  /** People in front of the camera both have among their first names. */
  sharedCast: number;
  /** People behind it. */
  sharedCrew: number;
  sharedStudios: number;
  /** Profiles that watched both, and how large that overlap is from 0 to 1. */
  coViewers: number;
  coStrength: number;
}

export const SIGNALS = [
  'collection',
  'watched',
  'genres',
  'keywords',
  'cast',
  'crew',
  'categories',
  'kind',
  'era',
  'studio',
  'language',
] as const;
export type SignalKind = (typeof SIGNALS)[number];

/**
 * The most points each reason can give. They add up to 100.
 *
 * What an editor did by hand counts most: a collection is a deliberate
 * statement that titles belong together. What viewers did comes next, then
 * what the titles are about and who made them. The last five only order
 * titles that are alike anyway: none of them makes two titles similar.
 */
export const WEIGHTS: Record<SignalKind, number> = {
  collection: 20,
  watched: 20,
  genres: 22,
  keywords: 12,
  cast: 10,
  crew: 8,
  categories: 2,
  kind: 2,
  era: 2,
  studio: 1,
  language: 1,
};

/** Reasons that make two titles similar by themselves. */
const STRONG: ReadonlySet<SignalKind> = new Set([
  'collection',
  'watched',
  'genres',
  'keywords',
  'cast',
  'crew',
]);

/** Below this a title is not offered as similar: one shared genre out of many is not enough. */
export const MIN_SCORE = 10;

/** Shared keywords, actors and crew from which the reason counts in full. */
const FULL_KEYWORDS = 4;
const FULL_CAST = 3;
const FULL_CREW = 2;
/** An overlap of audiences from which watching counts in full. */
const FULL_STRENGTH = 0.4;
/** Years apart at which the time of release stops counting. */
const ERA_YEARS = 15;
/**
 * A title for viewers this many years older than those of the source is
 * pushed down: next to a film for children, a film from 16 does not belong.
 */
const OLDER_AUDIENCE_YEARS = 6;
const OLDER_AUDIENCE_PENALTY = 15;

export interface Signal {
  signal: SignalKind;
  /** What it gave, rounded to one decimal. */
  points: number;
  /** How many genres, keywords or people are shared, or profiles that watched both. */
  count: number;
}

export interface ScoredTitle {
  id: string;
  /** From 0 to 100. */
  score: number;
  /** Strongest first. */
  signals: Signal[];
  rating: number | null;
}

/** The share of what two sets hold together that both hold. */
function overlap(shared: number, a: number, b: number): number {
  const union = a + b - shared;
  return union > 0 ? Math.min(1, shared / union) : 0;
}

const upTo = (count: number, full: number): number => Math.min(1, count / full);
const round = (value: number): number => Math.round(value * 10) / 10;

/**
 * The points of one title against the source.
 *
 * @returns Null when the two are not similar: nothing strong is shared, or too little.
 */
export function scoreCandidate(
  source: SimilarSource,
  candidate: SimilarCandidate,
): ScoredTitle | null {
  const parts: [SignalKind, number, number][] = [
    ['collection', candidate.sharedCollections > 0 ? 1 : 0, candidate.sharedCollections],
    ['watched', upTo(candidate.coStrength, FULL_STRENGTH), candidate.coViewers],
    [
      'genres',
      overlap(candidate.sharedGenres, source.genreCount, candidate.genreCount),
      candidate.sharedGenres,
    ],
    ['keywords', upTo(candidate.sharedKeywords, FULL_KEYWORDS), candidate.sharedKeywords],
    ['cast', upTo(candidate.sharedCast, FULL_CAST), candidate.sharedCast],
    ['crew', upTo(candidate.sharedCrew, FULL_CREW), candidate.sharedCrew],
    [
      'categories',
      overlap(candidate.sharedCategories, source.categoryCount, candidate.categoryCount),
      candidate.sharedCategories,
    ],
    ['kind', candidate.type === source.type ? 1 : 0, 1],
    [
      'era',
      source.releaseYear !== null && candidate.releaseYear !== null
        ? Math.max(0, 1 - Math.abs(source.releaseYear - candidate.releaseYear) / ERA_YEARS)
        : 0,
      1,
    ],
    ['studio', candidate.sharedStudios > 0 ? 1 : 0, candidate.sharedStudios],
    [
      'language',
      source.originalLanguage !== null && candidate.originalLanguage === source.originalLanguage
        ? 1
        : 0,
      1,
    ],
  ];

  const signals: Signal[] = parts
    .filter(([, share]) => share > 0)
    .map(([signal, share, count]) => ({ signal, points: round(share * WEIGHTS[signal]), count }))
    .filter((entry) => entry.points > 0);
  if (!signals.some((entry) => STRONG.has(entry.signal))) {
    return null;
  }

  let score = signals.reduce((total, entry) => total + entry.points, 0);
  if (
    source.minAge !== null &&
    candidate.minAge !== null &&
    candidate.minAge - source.minAge >= OLDER_AUDIENCE_YEARS
  ) {
    score -= OLDER_AUDIENCE_PENALTY;
  }
  score = round(Math.min(100, score));
  if (score < MIN_SCORE) {
    return null;
  }
  return {
    id: candidate.id,
    score,
    signals: signals.sort(
      (a, b) => b.points - a.points || SIGNALS.indexOf(a.signal) - SIGNALS.indexOf(b.signal),
    ),
    rating: candidate.rating,
  };
}

/** Every similar title, most alike first. Between equals, the better rated one leads. */
export function rankSimilar(
  source: SimilarSource,
  candidates: readonly SimilarCandidate[],
): ScoredTitle[] {
  return candidates
    .map((candidate) => scoreCandidate(source, candidate))
    .filter((entry): entry is ScoredTitle => entry !== null)
    .sort(
      (a, b) =>
        b.score - a.score || (b.rating ?? -1) - (a.rating ?? -1) || a.id.localeCompare(b.id),
    );
}

/**
 * The order viewers get: what an editor pinned in the editor's order, then
 * what was found, without what the editor hid and without repeats.
 */
export function arrangeSimilar(
  found: readonly string[],
  pinned: readonly string[],
  hidden: ReadonlySet<string>,
): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of [...pinned, ...found]) {
    if (!seen.has(id) && !hidden.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }
  return order;
}
