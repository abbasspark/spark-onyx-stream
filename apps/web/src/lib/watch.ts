// SPDX-License-Identifier: AGPL-3.0-only
import type { Episode, Season, TitleDetail } from './types';

/** "S2 E5", the short way to name an episode. */
export function episodeCode(seasonNumber: number, episodeNumber: number): string {
  return `S${seasonNumber} E${episodeNumber}`;
}

export function movieKey(slug: string): string {
  return `movie:${slug}`;
}

export function episodeKey(episodeId: string): string {
  return `episode:${episodeId}`;
}

export function watchHref(slug: string, episodeId?: string): string {
  return episodeId ? `/watch/${slug}/${episodeId}` : `/watch/${slug}`;
}

export interface EpisodePlace {
  season: Season;
  episode: Episode;
  /** The episode that follows, in the same season or the first of the next. */
  next: { season: Season; episode: Episode } | null;
}

/** Finds an episode in a series, together with the one that comes after it. */
export function findEpisode(title: TitleDetail, episodeId: string): EpisodePlace | null {
  const all = title.seasons.flatMap((season) =>
    season.episodes.map((episode) => ({ season, episode })),
  );
  const index = all.findIndex((item) => item.episode.id === episodeId);
  const found = all[index];
  if (!found) {
    return null;
  }
  return { ...found, next: all[index + 1] ?? null };
}

/** The first episode of a series, where watching starts. */
export function firstEpisode(title: TitleDetail): { season: Season; episode: Episode } | null {
  for (const season of title.seasons) {
    const episode = season.episodes[0];
    if (episode) {
      return { season, episode };
    }
  }
  return null;
}

/**
 * Where a viewer goes on with a series when no episode is half watched: the
 * episode after the furthest one they finished. From the start when nothing
 * is finished, and again from the start when everything is.
 */
export function nextUnwatched(
  title: TitleDetail,
  watched: ReadonlySet<string>,
): { season: Season; episode: Episode } | null {
  const all = title.seasons.flatMap((season) =>
    season.episodes.map((episode) => ({ season, episode })),
  );
  let furthest = -1;
  all.forEach((item, index) => {
    if (watched.has(item.episode.id)) {
      furthest = index;
    }
  });
  return all[furthest + 1] ?? all[0] ?? null;
}
