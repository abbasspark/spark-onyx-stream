// SPDX-License-Identifier: AGPL-3.0-only
import { targetOf } from './progress';
import { toEntry, type WatchingItem } from './watching-api';

const MOVIE: WatchingItem = {
  id: 'movie-id',
  title: { slug: 'night-train', name: 'Night Train', type: 'MOVIE' },
  episode: null,
  image: { url: '/media/backdrop.jpg' },
  position: 600,
  duration: 5400,
  watchedAt: '2026-11-20T10:00:00.000Z',
};

describe('toEntry', () => {
  it('turns a movie of the account into an entry of the row', () => {
    expect(toEntry(MOVIE)).toEqual({
      key: 'movie:night-train',
      href: '/watch/night-train',
      name: 'Night Train',
      detail: null,
      image: '/media/backdrop.jpg',
      position: 600,
      duration: 5400,
      updatedAt: Date.parse('2026-11-20T10:00:00.000Z'),
      id: 'movie-id',
      synced: true,
    });
  });

  it('names the episode, and uses the key the player uses', () => {
    const entry = toEntry({
      ...MOVIE,
      id: 'episode-id',
      title: { slug: 'deep-water', name: 'Deep Water', type: 'SERIES' },
      episode: { id: 'episode-id', seasonNumber: 2, number: 5, name: 'The Trench' },
      image: null,
    });
    expect(entry).toMatchObject({
      key: 'episode:episode-id',
      href: '/watch/deep-water/episode-id',
      name: 'Deep Water',
      detail: 'S2 E5 The Trench',
      image: null,
    });
    // The entry leads back to the same video when it is reported again.
    expect(targetOf(entry)).toEqual({ title: 'deep-water', episodeId: 'episode-id' });
  });
});
