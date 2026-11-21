// SPDX-License-Identifier: AGPL-3.0-only
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PosterCard } from '@/components/poster-card';
import { getCategories, getTitles } from '@/lib/api';
import { browseHref, type BrowseState, parseBrowseParams } from '@/lib/browse';
import type { Category, TitleSort } from '@/lib/types';

const PAGE_SIZE = 36;

const SORT_LABELS: Record<TitleSort, string> = {
  newest: 'Newest',
  name: 'A to Z',
  year: 'Release year',
};

const KINDS = [
  { type: undefined, label: 'All' },
  { type: 'MOVIE', label: 'Movies' },
  { type: 'SERIES', label: 'Series' },
] as const;

interface BrowseProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function heading(state: BrowseState, category: Category | undefined): string {
  const kind = state.type === 'MOVIE' ? 'movies' : state.type === 'SERIES' ? 'series' : null;
  if (category) {
    return kind ? `${category.name} ${kind}` : category.name;
  }
  if (state.featured) {
    return kind ? `Featured ${kind}` : 'Featured';
  }
  return kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Everything';
}

export async function generateMetadata({ searchParams }: BrowseProps): Promise<Metadata> {
  const state = parseBrowseParams(await searchParams);
  const categories = state.category ? await getCategories() : [];
  const category = categories.find((item) => item.slug === state.category);
  return {
    title: heading(state, category),
    description: category?.description ?? undefined,
    alternates: { canonical: browseHref(state, { page: state.page }) },
  };
}

export default async function BrowsePage({ searchParams }: BrowseProps) {
  const state = parseBrowseParams(await searchParams);
  const [titles, categories] = await Promise.all([
    getTitles({
      page: state.page,
      pageSize: PAGE_SIZE,
      type: state.type,
      category: state.category,
      featured: state.featured || undefined,
      sort: state.sort,
    }),
    getCategories(),
  ]);
  const category = categories.find((item) => item.slug === state.category);
  const pages = Math.max(1, Math.ceil(titles.total / PAGE_SIZE));

  const chip = (active: boolean) =>
    `inline-flex h-9 items-center rounded-full border px-4 text-sm transition-colors ${
      active
        ? 'border-vein bg-vein text-onyx'
        : 'border-line text-smoke hover:border-vein/60 hover:text-vein'
    }`;

  return (
    <div className="pt-28">
      <header className="gutter">
        <h1 className="display text-3xl sm:text-4xl">{heading(state, category)}</h1>
        {category?.description ? (
          <p className="mt-4 max-w-2xl text-lg text-smoke">{category.description}</p>
        ) : null}
        <p className="mt-3 text-sm text-smoke" aria-live="polite">
          {titles.total} {titles.total === 1 ? 'title' : 'titles'}
        </p>
      </header>

      <div className="gutter mt-8 flex flex-wrap items-center gap-x-10 gap-y-4">
        <nav aria-label="Kind" className="flex gap-2">
          {KINDS.map((kind) => (
            <Link
              key={kind.label}
              href={browseHref(state, { type: kind.type })}
              aria-current={state.type === kind.type ? 'true' : undefined}
              className={chip(state.type === kind.type)}
            >
              {kind.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Order" className="flex items-center gap-2">
          <span className="mr-1 text-sm text-dust">Order</span>
          {(Object.keys(SORT_LABELS) as TitleSort[]).map((sort) => (
            <Link
              key={sort}
              href={browseHref(state, { sort })}
              aria-current={state.sort === sort ? 'true' : undefined}
              className={chip(state.sort === sort)}
            >
              {SORT_LABELS[sort]}
            </Link>
          ))}
        </nav>
      </div>

      {categories.length > 0 ? (
        <nav aria-label="Category" className="strip mt-4 py-1">
          <Link
            href={browseHref(state, { category: undefined })}
            aria-current={!state.category ? 'true' : undefined}
            className={chip(!state.category)}
          >
            Any category
          </Link>
          {categories.map((item) => (
            <Link
              key={item.slug}
              href={browseHref(state, { category: item.slug })}
              aria-current={state.category === item.slug ? 'true' : undefined}
              className={chip(state.category === item.slug)}
            >
              {item.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {titles.items.length === 0 ? (
        <div className="gutter mt-16 max-w-xl">
          <h2 className="heading text-xl">Nothing here</h2>
          <p className="mt-3 text-smoke">
            No title matches these filters.{' '}
            <Link href="/browse" className="text-vein underline underline-offset-4">
              Show everything
            </Link>
          </p>
        </div>
      ) : (
        <ul className="gutter mt-10 grid grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] gap-x-[clamp(0.5rem,1vw,0.875rem)] gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
          {titles.items.map((title, index) => (
            <li key={title.id}>
              <PosterCard title={title} eager={index < 12} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="gutter mt-14 flex items-center justify-center gap-6">
          {state.page > 1 ? (
            <Link
              href={browseHref(state, { page: state.page - 1 })}
              rel="prev"
              className="button button-quiet"
            >
              <ChevronLeft />
              Previous
            </Link>
          ) : null}
          <span className="text-sm text-smoke">
            Page {state.page} of {pages}
          </span>
          {state.page < pages ? (
            <Link
              href={browseHref(state, { page: state.page + 1 })}
              rel="next"
              className="button button-quiet"
            >
              Next
              <ChevronRight />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
