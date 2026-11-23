// SPDX-License-Identifier: AGPL-3.0-only
import { isEmptyHome, normalizeHome, type RawHome } from './home';
import 'server-only';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { siteConfig } from './config';
import { LANGUAGE_COOKIE, readLanguage, withLanguage } from './language';
import { NO_PLANS, type Plans } from './plans';
import { TtlCache } from './ttl-cache';
import type {
  Category,
  Channel,
  Collection,
  Genre,
  Guide,
  Home,
  Languages,
  Page,
  Person,
  TitleCard,
  TitleDetail,
  TitleSort,
  TitleType,
} from './types';

/**
 * How long the website keeps an answer of the catalog before asking again.
 * The same time the API allows others to cache it. A change in the admin
 * panel therefore reaches viewers within about a minute at most.
 */
const KEEP_MS = 30_000;
/** Distinct catalog addresses kept at once. Far more than a site has popular pages. */
const MAX_KEPT = 1000;

const answers = new TtlCache<unknown>(KEEP_MS, MAX_KEPT);

/** The API answered, but not with success. */
export class CatalogError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

async function load(path: string): Promise<unknown> {
  const response = await fetch(`${siteConfig.apiUrl}/v1/catalog${path}`, {
    headers: { Accept: 'application/json' },
    // Kept by the cache below, which, unlike the built-in one, never hands
    // out an answer that is older than its time.
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new CatalogError(response.status, `The catalog answered ${response.status} for ${path}`);
  }
  return response.json();
}

/**
 * Reads from the public catalog on the server.
 *
 * Every viewer's page is built from the same few answers, which are shared for
 * a short time. The API therefore sees the website as one modest client,
 * however many people are browsing.
 *
 * @throws CatalogError when the API answers with an error status.
 */
async function read<Result>(path: string): Promise<Result> {
  // Pages are built when they are asked for, not when the site is built:
  // the catalog is not known, and the API may not even run, at build time.
  await connection();
  return (await answers.get(path, () => load(path))) as Result;
}

/**
 * The language this viewer reads titles in, from their cookie. Undefined is
 * the language of the catalog.
 */
export async function currentLanguage(): Promise<string | undefined> {
  return readLanguage((await cookies()).get(LANGUAGE_COOKIE)?.value);
}

/**
 * Reads texts that exist in more than one language, in the viewer's. Every
 * language has its own address and with it its own shared answer.
 */
async function readLocal<Result>(path: string): Promise<Result> {
  return read<Result>(withLanguage(path, await currentLanguage()));
}

/**
 * The same, for something that may not exist.
 *
 * @returns Null when the API says so, or does not know the address at all (an
 *   older API). That answer is kept like any other, so asking again and again
 *   for what does not exist does not reach the API each time.
 */
async function findLocal<Result>(path: string): Promise<Result | null> {
  await connection();
  const address = withLanguage(path, await currentLanguage());
  const answer = await answers.get(address, async () => {
    try {
      return await load(address);
    } catch (error) {
      // 400 is a slug that cannot exist, which for a visitor is the same as not found.
      if (error instanceof CatalogError && (error.status === 404 || error.status === 400)) {
        return null;
      }
      throw error;
    }
  });
  return answer as Result | null;
}

export async function getHome(): Promise<Home> {
  return normalizeHome(await readLocal<RawHome>('/home'));
}

/**
 * The page for movies or for series, as it is arranged in the panel.
 *
 * @returns Null while nobody arranged it, or when the API is from before
 *   pages could be arranged: the list of all movies or series is the page then.
 */
export async function getArrangedPage(page: 'movies' | 'series'): Promise<Home | null> {
  const raw = await findLocal<RawHome & { custom?: boolean }>(`/pages/${page}`);
  if (!raw?.custom) {
    return null;
  }
  const arranged = normalizeHome({ ...raw, hero: raw.hero ?? null });
  return isEmptyHome(arranged) ? null : arranged;
}

/** The genres that have something to watch. An API older than genres has none. */
export async function getGenres(): Promise<Genre[]> {
  try {
    return await read<Genre[]>('/genres');
  } catch (error) {
    if (error instanceof CatalogError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

/** The languages on offer. An API older than translations offers only its own. */
export async function getLanguages(): Promise<Languages> {
  try {
    return await read<Languages>('/languages');
  } catch (error) {
    if (error instanceof CatalogError && error.status === 404) {
      return { default: 'en', translated: [] };
    }
    throw error;
  }
}

/** @returns Null when nobody with something to watch has this slug. */
export function getPerson(slug: string): Promise<Person | null> {
  return findLocal<Person>(`/people/${encodeURIComponent(slug)}`);
}

/** @returns Null when no collection shown to viewers has this slug. */
export function getCollection(slug: string): Promise<Collection | null> {
  return findLocal<Collection>(`/collections/${encodeURIComponent(slug)}`);
}

/**
 * The plans on offer. A site without billing, or with an API older than
 * plans, has none, which is not an error.
 */
export async function getPlans(): Promise<Plans> {
  try {
    return await read<Plans>('/plans');
  } catch (error) {
    if (error instanceof CatalogError && error.status === 404) {
      return NO_PLANS;
    }
    throw error;
  }
}

export function getCategories(): Promise<Category[]> {
  return read<Category[]>('/categories');
}

export interface TitleQuery {
  page?: number;
  pageSize?: number;
  type?: TitleType;
  category?: string;
  genre?: string;
  featured?: true;
  sort?: TitleSort;
}

export function getTitles(query: TitleQuery = {}): Promise<Page<TitleCard>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  // Sorted, so the same question always has the same address and one shared answer.
  params.sort();
  const search = params.toString();
  return readLocal<Page<TitleCard>>(`/titles${search ? `?${search}` : ''}`);
}

/**
 * @returns Null when no title that viewers can see has this slug. That answer
 *   is kept like any other, so asking again and again for a title that does
 *   not exist does not reach the API each time.
 */
export function getTitle(slug: string): Promise<TitleDetail | null> {
  return findLocal<TitleDetail>(`/titles/${encodeURIComponent(slug)}`);
}

/**
 * Whether a channel is on air changes at any moment, so what is known about
 * channels is kept for a much shorter time than the rest of the catalog.
 */
const KEEP_CHANNELS_MS = 8000;
const channelAnswers = new TtlCache<Channel[]>(KEEP_CHANNELS_MS, 1);

/**
 * The live channels of the site, in the order of their numbers. A site
 * without live channels, or with an API older than them, has none.
 */
export async function getChannels(): Promise<Channel[]> {
  await connection();
  return channelAnswers.get('channels', async () => {
    try {
      return (await load('/channels')) as Channel[];
    } catch (error) {
      if (error instanceof CatalogError && error.status === 404) {
        return [];
      }
      throw error;
    }
  });
}

/** @returns Null when no channel that viewers can see has this slug. */
export async function getChannel(slug: string): Promise<Channel | null> {
  return (await getChannels()).find((channel) => channel.slug === slug) ?? null;
}

/**
 * The guide of the next day: what each channel shows, from an hour ago on.
 * A site whose API is older than the guide has an empty one.
 */
export async function getGuide(): Promise<Guide | null> {
  try {
    return await read<Guide>('/guide');
  } catch (error) {
    if (error instanceof CatalogError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
