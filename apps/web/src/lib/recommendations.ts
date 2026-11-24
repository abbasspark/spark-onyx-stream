// SPDX-License-Identifier: AGPL-3.0-only
//
// Rows made for the profile in use: titles like the ones it watched last.
import { withLanguage } from './language';
import type { TitleCard } from './types';
import { call } from './viewer-api';

export interface RecommendationRow {
  /** The title the row is about. */
  because: TitleCard;
  titles: TitleCard[];
}

export const recommendationsApi = {
  rows: (language?: string) =>
    call<{ rows: RecommendationRow[] }>('GET', withLanguage('/recommendations', language)).then(
      (answer) => answer.rows,
    ),
};

/**
 * The heading of a row: the words of the page's row, then the title. A
 * heading that already ends in a colon or names nothing gets no second space.
 */
export function rowHeading(lead: string, title: string): string {
  const words = lead.trim();
  return words ? `${words} ${title}` : title;
}

/**
 * Rows worth showing: with a title to name them after, and something in
 * them. An answer of another shape, from an API that changed, shows nothing.
 */
export function usableRows(rows: unknown): RecommendationRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.filter(
    (row): row is RecommendationRow =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as RecommendationRow).because?.name === 'string' &&
      Array.isArray((row as RecommendationRow).titles) &&
      (row as RecommendationRow).titles.length > 0,
  );
}
