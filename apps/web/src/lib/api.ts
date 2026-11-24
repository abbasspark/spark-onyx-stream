// SPDX-License-Identifier: AGPL-3.0-only
import { isEmptyHome, normalizeHome, type RawHome } from './home';
import 'server-only';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { AUDIENCE_COOKIE, readAudience, withAudience } from './audience';
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
  Site,
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
 * The age limit of the profile in use, from its cookie. Undefined is none.
 * The API enforces the limit of the sign-in whatever this says: the cookie
 * only decides which catalog the pages are drawn from.
 */
export async function currentAudience(): Promise<number | undefined> {
  return readAudience((await cookies()).get(AUDIENCE_COOKIE)?.value);
}

/** The address of an answer for this viewer: in their language, within their age limit. */
async function addressFor(path: string): Promise<string> {
  const store = await cookies();
  return withAudience(
    withLanguage(path, readLanguage(store.get(LANGUAGE_COOKIE)?.value)),
    readAudience(store.get(AUDIENCE_COOKIE)?.value),
  );
}

/**
 * Reads what differs by viewer: texts that exist in more than one language,
 * and lists that are shorter for a profile with an age limit. Every language
 * and every limit has its own address and with it its own shared answer.
 */
async function readLocal<Result>(path: string): Promise<Result> {
  return read<Result>(await addressFor(path));
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
  const address = await addressFor(path);
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
 * The page for movies, for series, or the rows of the live page, as arranged
 * in the panel.
 *
 * @returns Null while nobody arranged it, or when the API is from before
 *   pages could be arranged: the page is then what it was before.
 */
export async function getArrangedPage(page: 'movies' | 'series' | 'live'): Promise<Home | null> {
  const raw = await findLocal<RawHome & { custom?: boolean }>(`/pages/${page}`);
  if (!raw?.custom) {
    return null;
  }
  const arranged = normalizeHome({ ...raw, hero: raw.hero ?? null });
  return isEmptyHome(arranged) ? null : arranged;
}

/** What a page of a category or genre is the page of. */
export interface PageSubject {
  slug: string;
  name: string;
  description: string | null;
}

/**
 * The page of one category or genre, as the page of categories or genres is
 * arranged in the panel.
 *
 * @returns Null while that page was not arranged, when the API is older than
 *   it, or when there is no such category or genre: the list is the page then.
 */
export async function getSubjectPage(
  kind: 'category' | 'genre',
  slug: string,
): Promise<{ subject: PageSubject; page: Home } | null> {
  const raw = await findLocal<RawHome & { custom?: boolean; subject?: PageSubject }>(
    `/pages/${kind}/${encodeURIComponent(slug)}`,
  );
  if (!raw?.custom || !raw.subject) {
    return null;
  }
  const page = normalizeHome({ ...raw, hero: raw.hero ?? null });
  return isEmptyHome(page) ? null : { subject: raw.subject, page };
}

/** The genres that have something to watch. An API older than genres has none. */
export async function getGenres(): Promise<Genre[]> {
  try {
    return await readLocal<Genre[]>('/genres');
  } catch (error) {
    if (error instanceof CatalogError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

/** The languages on offer. An API older than translations offers only its own. */
/**
 * How the site presents itself. Never fails: when the API cannot say (it is
 * older, or not there), the site shows as it ships, under the name from its
 * own settings. A page must not break over its header.
 */
export async function getSite(): Promise<Site> {
  try {
    return await read<Site>('/site');
  } catch {
    return {
      name: siteConfig.name,
      description: siteConfig.description,
      logo: null,
      logoShowsName: false,
      icon: null,
      accent: null,
      footerText: null,
      footerLinks: [],
    };
  }
}

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
  return readLocal<Category[]>('/categories');
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
 * Titles like one, most alike first. Empty when nothing is alike, when the
 * title is gone, or when the API is older than this.
 */
export async function getSimilar(slug: string, limit = 12): Promise<TitleCard[]> {
  try {
    const answer = await findLocal<{ items: TitleCard[] }>(
      `/titles/${encodeURIComponent(slug)}/similar?limit=${limit}`,
    );
    return answer?.items ?? [];
  } catch {
    // A page is complete without this row.
    return [];
  }
}

/**
 * Whether a channel is on air changes at any moment, so what is known about
 * channels is kept for a much shorter time than the rest of the catalog.
 */
const KEEP_CHANNELS_MS = 8000;
/** One list for everyone, and one for each age limit. */
const channelAnswers = new TtlCache<Channel[]>(KEEP_CHANNELS_MS, 24);

/**
 * The live channels of the site, in the order of their numbers. A site
 * without live channels, or with an API older than them, has none.
 */
export async function getChannels(): Promise<Channel[]> {
  await connection();
  const address = withAudience('/channels', await currentAudience());
  return channelAnswers.get(address, async () => {
    try {
      return (await load(address)) as Channel[];
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
    return await read<Guide>(withAudience('/guide', await currentAudience()));
  } catch (error) {
    if (error instanceof CatalogError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
