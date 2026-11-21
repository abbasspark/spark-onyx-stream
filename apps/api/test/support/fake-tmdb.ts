// SPDX-License-Identifier: AGPL-3.0-only
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** The start of a PNG file, which is all the catalog reads to recognize one. */
export function png(width: number, height: number, padding = 100): Buffer {
  const data = Buffer.alloc(33 + padding);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write('IHDR', 12, 'latin1');
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

export interface FakeTmdb {
  /** Values for TMDB_API_URL and TMDB_IMAGE_URL. */
  apiUrl: string;
  imageUrl: string;
  /** Every request received, as "GET /3/movie/603?language=en-US". */
  requests: string[];
  /** Authorization headers received, to check how the token travels. */
  authorizations: (string | undefined)[];
  /** Answers by path, such as "/3/movie/603". Changed by tests as they need. */
  json: Record<string, unknown>;
  /** Pictures by path, such as "/poster.jpg". A size prefix is ignored. */
  pictures: Record<string, Buffer>;
  /** Makes every API request answer with this status. */
  failWith: number | null;
  /** Makes the next API request answer 429 once. */
  busyOnce: boolean;
  reset: () => void;
  close: () => Promise<void>;
}

const MATRIX = {
  id: 603,
  title: 'The Matrix',
  original_title: 'The Matrix',
  tagline: 'Free your mind.',
  overview: 'A computer hacker learns what the world really is.\n\nAnd takes a side.',
  release_date: '1999-03-31',
  original_language: 'en',
  genres: [
    { id: 28, name: 'Action' },
    { id: 878, name: 'Science Fiction' },
  ],
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  images: {
    logos: [
      { file_path: '/logo-fr.png', iso_639_1: 'fr', vote_average: 9 },
      { file_path: '/logo-en.svg', iso_639_1: 'en', vote_average: 5 },
    ],
  },
  release_dates: {
    results: [
      { iso_3166_1: 'DE', release_dates: [{ certification: '16' }] },
      { iso_3166_1: 'US', release_dates: [{ certification: '' }, { certification: 'R' }] },
    ],
  },
};

const DEEP = {
  id: 1399,
  name: 'Deep Water',
  original_name: 'Tiefes Wasser',
  tagline: '',
  overview: 'Three dives, each deeper than the last.',
  first_air_date: '2021-09-05',
  original_language: 'de',
  genres: [{ id: 99, name: 'Documentary' }],
  poster_path: '/deep-poster.jpg',
  backdrop_path: null,
  images: { logos: [] },
  content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-PG' }] },
  seasons: [
    { season_number: 0, name: 'Specials', episode_count: 1 },
    { season_number: 1, name: 'Season 1', episode_count: 2 },
    { season_number: 2, name: 'The Abyss', episode_count: 1 },
    { season_number: 3, name: 'Season 3', episode_count: 0 },
  ],
};

function defaults(): Record<string, unknown> {
  return {
    '/3/search/movie': {
      results: [
        {
          id: 603,
          title: 'The Matrix',
          original_title: 'The Matrix',
          release_date: '1999-03-31',
          overview: 'A computer hacker learns what the world really is.',
          poster_path: '/poster.jpg',
        },
        { id: 604, title: 'The Matrix Reloaded', release_date: '2003-05-15', poster_path: null },
        { id: 'broken', title: 'No id' },
        { id: 605 },
      ],
    },
    '/3/search/tv': {
      results: [
        {
          id: 1399,
          name: 'Deep Water',
          original_name: 'Tiefes Wasser',
          first_air_date: '2021-09-05',
          poster_path: '/deep-poster.jpg',
        },
      ],
    },
    '/3/movie/603': MATRIX,
    '/3/tv/1399': DEEP,
    '/3/tv/1399/season/0': {
      season_number: 0,
      name: 'Specials',
      episodes: [{ episode_number: 1, name: 'Making of', still_path: null }],
    },
    '/3/tv/1399/season/1': {
      season_number: 1,
      name: 'Season 1',
      overview: 'The first dives.',
      episodes: [
        { episode_number: 2, name: 'Midnight Zone', overview: 'No light.', still_path: null },
        { episode_number: 1, name: 'The Shelf', overview: 'Sunlit.', still_path: '/still-1.jpg' },
        { episode_number: 1, name: 'A duplicate', overview: 'Ignored.' },
        { name: 'No number' },
      ],
    },
    '/3/tv/1399/season/2': {
      season_number: 2,
      name: 'The Abyss',
      episodes: [{ episode_number: 1, name: '', overview: '', still_path: '/still-gone.jpg' }],
    },
  };
}

function pictures(): Record<string, Buffer> {
  return {
    '/poster.jpg': png(1000, 1500),
    '/backdrop.jpg': png(1920, 1080),
    '/logo-en.png': png(500, 200),
    '/logo-fr.png': png(500, 200),
    '/deep-poster.jpg': png(1000, 1500),
    '/still-1.jpg': png(1280, 720),
  };
}

/** A stand-in for The Movie Database on this machine, with a movie and a series. */
export async function startFakeTmdb(): Promise<FakeTmdb> {
  const fake = {
    requests: [] as string[],
    authorizations: [] as (string | undefined)[],
    json: defaults(),
    pictures: pictures(),
    failWith: null as number | null,
    busyOnce: false,
  };

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    fake.requests.push(`${request.method} ${url.pathname}${url.search}`);

    if (url.pathname.startsWith('/t/p/')) {
      const path = url.pathname.replace(/^\/t\/p\/[^/]+/, '');
      const picture = fake.pictures[path];
      if (!picture) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': picture.length });
      response.end(picture);
      return;
    }

    fake.authorizations.push(request.headers.authorization);
    if (fake.busyOnce) {
      fake.busyOnce = false;
      response.writeHead(429, { 'Retry-After': '0' }).end();
      return;
    }
    if (fake.failWith) {
      response.writeHead(fake.failWith, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status_message: 'failed' }));
      return;
    }
    const body = fake.json[url.pathname];
    if (body === undefined) {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status_code: 34 }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(typeof body === 'string' ? body : JSON.stringify(body));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return Object.assign(fake, {
    apiUrl: `${origin}/3`,
    imageUrl: `${origin}/t/p`,
    reset: () => {
      fake.requests.length = 0;
      fake.authorizations.length = 0;
      fake.json = defaults();
      fake.pictures = pictures();
      fake.failWith = null;
      fake.busyOnce = false;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  });
}
