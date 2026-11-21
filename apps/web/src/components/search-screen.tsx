// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Page, TitleCard } from '@/lib/types';
import { PosterCard } from './poster-card';

const DELAY_MS = 250;
const PAGE_SIZE = 48;

type Result =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; query: string; titles: Page<TitleCard> }
  | { state: 'failed'; message: string };

/**
 * Search as you type. The browser asks the catalog itself, so every viewer
 * searches on their own allowance and the website's server is not involved.
 */
export function SearchScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get('q') ?? '';
  const [text, setText] = useState(initial);
  const [result, setResult] = useState<Result>(
    initial.trim() ? { state: 'loading' } : { state: 'idle' },
  );
  const input = useRef<HTMLInputElement>(null);

  // A search started from the header arrives through the address.
  useEffect(() => {
    setText(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    const query = text.trim();
    if (!query) {
      setResult({ state: 'idle' });
      return;
    }
    setResult((current) => (current.state === 'done' ? current : { state: 'loading' }));

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      // The address follows the search, so a result can be shared or reloaded.
      router.replace(`/search?q=${encodeURIComponent(query)}`, { scroll: false });
      try {
        const response = await fetch(
          `/v1/catalog/titles?q=${encodeURIComponent(query)}&pageSize=${PAGE_SIZE}&sort=name`,
          { signal: controller.signal, headers: { Accept: 'application/json' } },
        );
        if (response.status === 429) {
          setResult({
            state: 'failed',
            message: 'Too many searches at once. Wait a moment and try again.',
          });
          return;
        }
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        setResult({ state: 'done', query, titles: (await response.json()) as Page<TitleCard> });
      } catch {
        // A search that was replaced by a newer one is not a failure.
        if (!controller.signal.aborted) {
          setResult({
            state: 'failed',
            message: 'The search could not be reached. Check your connection and try again.',
          });
        }
      }
    }, DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, router]);

  return (
    <>
      <form role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="relative block max-w-3xl">
          <span className="sr-only">Search titles</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-0 size-7 -translate-y-1/2 text-smoke"
            aria-hidden="true"
          />
          <input
            ref={input}
            type="search"
            // The page exists for this one field.
            autoFocus
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Search by name"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="display w-full border-b-2 border-line bg-transparent py-3 pl-11 text-2xl placeholder:text-dust focus:border-vein focus:outline-none sm:text-3xl"
          />
        </label>
      </form>

      <div
        className="mt-10 min-h-[40dvh]"
        aria-live="polite"
        aria-busy={result.state === 'loading'}
      >
        {result.state === 'idle' ? (
          <p className="text-smoke">Type the name of a movie or a series.</p>
        ) : null}
        {result.state === 'loading' ? <p className="text-smoke">Searching…</p> : null}
        {result.state === 'failed' ? <p className="text-alarm">{result.message}</p> : null}
        {result.state === 'done' && result.titles.total === 0 ? (
          <div className="max-w-xl">
            <h2 className="heading text-xl">Nothing found for “{result.query}”</h2>
            <p className="mt-3 text-smoke">
              Check the spelling or try fewer letters. The search looks at names only.
            </p>
          </div>
        ) : null}
        {result.state === 'done' && result.titles.total > 0 ? (
          <>
            <p className="mb-6 text-sm text-smoke">
              {result.titles.total} {result.titles.total === 1 ? 'title' : 'titles'}
              {result.titles.total > result.titles.items.length
                ? `, the first ${result.titles.items.length} shown`
                : ''}
            </p>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] gap-x-[clamp(0.5rem,1vw,0.875rem)] gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
              {result.titles.items.map((title) => (
                <li key={title.id}>
                  <PosterCard title={title} eager />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </>
  );
}
