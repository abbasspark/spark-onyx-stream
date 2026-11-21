// SPDX-License-Identifier: AGPL-3.0-only
import 'server-only';
import { connection } from 'next/server';
import { siteConfig } from './config';
import type { Category, Home, Page, TitleCard, TitleDetail, TitleSort, TitleType } from './types';

/**
 * How long the website keeps an answer of the catalog before asking again.
 * The same time the API allows others to cache it, so a change in the admin
 * panel reaches viewers within about a minute at most.
 */
const REVALIDATE_SECONDS = 30;

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

  const response = await fetch(`${siteConfig.apiUrl}/v1/catalog${path}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!response.ok) {
    throw new CatalogError(response.status, `The catalog answered ${response.status} for ${path}`);
  }
  return (await response.json()) as Result;
}

export function getHome(): Promise<Home> {
  return read<Home>('/home');
}

export function getCategories(): Promise<Category[]> {
  return read<Category[]>('/categories');
}

export interface TitleQuery {
  page?: number;
  pageSize?: number;
  type?: TitleType;
  category?: string;
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
  return read<Page<TitleCard>>(`/titles${search ? `?${search}` : ''}`);
}

/** @returns Null when no title that viewers can see has this slug. */
export async function getTitle(slug: string): Promise<TitleDetail | null> {
  try {
    return await read<TitleDetail>(`/titles/${encodeURIComponent(slug)}`);
  } catch (error) {
    // 400 is a slug that cannot exist, which for a visitor is the same as not found.
    if (error instanceof CatalogError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  }
}
