// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The words of the notifications that are made by themselves. They are in
 * the language of the catalog, like the names they carry.
 */

export interface NewEpisode {
  season: number;
  number: number;
  name: string;
}

export interface NotificationText {
  title: string;
  body: string;
}

const MAX_TITLE = 120;
const MAX_BODY = 240;
const cut = (text: string, most: number): string =>
  text.length > most ? `${text.slice(0, most - 1).trimEnd()}…` : text;

/** Whether a name says something: "Episode 4" next to "S1 E4" would say it twice. */
const isPlainName = (name: string, number: number): boolean =>
  new RegExp(`^(episode|folge|ep\\.?)\\s*${number}$`, 'i').test(name.trim());

/**
 * What viewers who follow a series are told when episodes arrive. Several at
 * once are one notification, not one each.
 */
export function newEpisodesText(series: string, episodes: readonly NewEpisode[]): NotificationText {
  const sorted = [...episodes].sort((a, b) => a.season - b.season || a.number - b.number);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) {
    return { title: cut(series, MAX_TITLE), body: 'New episodes are here.' };
  }
  if (sorted.length === 1) {
    const code = `S${first.season} E${first.number}`;
    return {
      title: cut(`New episode of ${series}`, MAX_TITLE),
      body: cut(
        isPlainName(first.name, first.number) ? `${code} is here.` : `${code} · ${first.name}`,
        MAX_BODY,
      ),
    };
  }
  const seasons = new Set(sorted.map((episode) => episode.season));
  const body =
    seasons.size === 1
      ? last.number - first.number === sorted.length - 1
        ? `Season ${first.season}, episodes ${first.number} to ${last.number}.`
        : `Season ${first.season}: ${sorted.length} episodes.`
      : `Seasons ${first.season} to ${last.season}.`;
  return { title: cut(`${sorted.length} new episodes of ${series}`, MAX_TITLE), body };
}

export interface NewTitle {
  name: string;
  type: 'MOVIE' | 'SERIES';
  tagline: string | null;
}

/** From how many new titles on they are told about together. */
export const DIGEST_FROM = 3;

/** What everybody is told when one title arrives. */
export function newTitleText(title: NewTitle): NotificationText {
  return {
    title: cut(`New: ${title.name}`, MAX_TITLE),
    body: cut(
      title.tagline?.trim() ||
        (title.type === 'SERIES' ? 'A new series to watch.' : 'A new movie to watch.'),
      MAX_BODY,
    ),
  };
}

/** What everybody is told when many arrive at once: one notification that names a few. */
export function newTitlesDigestText(names: readonly string[]): NotificationText {
  const shown = names.slice(0, 3);
  const more = names.length - shown.length;
  return {
    title: `${names.length} new titles`,
    body: cut(
      more > 0 ? `${shown.join(', ')} and ${more} more.` : `${shown.join(', ')}.`,
      MAX_BODY,
    ),
  };
}
