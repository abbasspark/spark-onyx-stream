// SPDX-License-Identifier: AGPL-3.0-only
//
// What the viewer's account knows about what they watch.
import type { WatchEntry, WatchReport } from './progress';
import { call } from './viewer-api';
import { episodeCode, episodeKey, movieKey, watchHref } from './watch';

/** An entry of "Continue watching" as the API sends it. */
export interface WatchingItem {
  id: string;
  title: { slug: string; name: string; type: 'MOVIE' | 'SERIES' };
  episode: { id: string; seasonNumber: number; number: number; name: string } | null;
  image: { url: string } | null;
  position: number;
  duration: number;
  watchedAt: string;
}

/** How far the viewer is in one video of a title. */
export interface TitleWatchState {
  id: string;
  position: number;
  duration: number;
  completed: boolean;
}

/** An entry of the account in the shape the pages keep them. */
export function toEntry(item: WatchingItem): WatchEntry {
  const { title, episode } = item;
  return {
    key: episode ? episodeKey(episode.id) : movieKey(title.slug),
    href: watchHref(title.slug, episode?.id),
    name: title.name,
    detail: episode ? `${episodeCode(episode.seasonNumber, episode.number)} ${episode.name}` : null,
    image: item.image?.url ?? null,
    position: item.position,
    duration: item.duration,
    updatedAt: Date.parse(item.watchedAt) || 0,
    id: item.id,
    synced: true,
  };
}

export const watchingApi = {
  list: () =>
    call<{ items: WatchingItem[] }>('GET', '/watching').then((result) => result.items.map(toEntry)),
  forTitle: (slug: string) =>
    call<{ items: TitleWatchState[] }>('GET', `/watching/titles/${encodeURIComponent(slug)}`).then(
      (result) => result.items,
    ),
  /** @param keepalive For a report sent while the page is being left. */
  report: (items: WatchReport[], keepalive = false) =>
    call<{ saved: number }>('PUT', '/watching', { items }, keepalive),
  remove: (id: string) => call<void>('DELETE', `/watching/${id}`),
  clear: () => call<{ removed: number }>('DELETE', '/watching'),
};
