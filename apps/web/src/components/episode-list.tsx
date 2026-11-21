// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Play } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatRuntime } from '@/lib/format';
import type { TitleDetail } from '@/lib/types';
import { episodeKey, watchHref } from '@/lib/watch';
import { useWatching } from './continue-watching';

/** The episodes of a series, one season at a time. */
export function EpisodeList({ title }: { title: TitleDetail }) {
  const watching = useWatching();
  // Opens on the season of the episode watched last, otherwise on the first.
  const lastWatched = watching.find((entry) => entry.href.startsWith(`${watchHref(title.slug)}/`));
  const startSeason =
    title.seasons.find((season) =>
      season.episodes.some((episode) => episodeKey(episode.id) === lastWatched?.key),
    ) ?? title.seasons[0];
  const [chosen, setChosen] = useState<number | null>(null);
  const season = title.seasons.find((item) => item.number === chosen) ?? startSeason;

  if (!season) {
    return null;
  }

  return (
    <section id="episodes" aria-labelledby="episodes-heading" className="gutter mt-16 scroll-mt-24">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <h2 id="episodes-heading" className="heading text-xl">
          Episodes
        </h2>
        {title.seasons.length > 1 ? (
          <div role="tablist" aria-label="Season" className="flex flex-wrap gap-2">
            {title.seasons.map((item) => {
              const active = item.number === season.number;
              return (
                <button
                  key={item.number}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setChosen(item.number)}
                  className={`inline-flex h-9 items-center rounded-full border px-4 text-sm transition-colors ${
                    active
                      ? 'border-vein bg-vein text-onyx'
                      : 'border-line text-smoke hover:border-vein/60 hover:text-vein'
                  }`}
                >
                  {item.name ?? `Season ${item.number}`}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      {season.synopsis ? <p className="mt-4 max-w-[65ch] text-smoke">{season.synopsis}</p> : null}

      <ol className="mt-6 max-w-5xl border-t border-line">
        {season.episodes.map((episode) => {
          const entry = watching.find((item) => item.key === episodeKey(episode.id));
          const runtime = formatRuntime(episode.durationMs);
          return (
            <li key={episode.id} className="border-b border-line">
              <Link
                href={watchHref(title.slug, episode.id)}
                className="group grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-4 py-4 sm:grid-cols-[2.5rem_11rem_minmax(0,1fr)_auto] sm:gap-x-6"
              >
                <span
                  className="display hidden text-2xl text-dust group-hover:text-vein sm:block"
                  aria-hidden="true"
                >
                  {episode.number}
                </span>
                <span className="relative block aspect-video overflow-hidden rounded-[3px] bg-ash">
                  {episode.still ? (
                    <img
                      src={episode.still.url}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center bg-onyx/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Play className="size-9 fill-current" aria-hidden="true" />
                  </span>
                  {entry ? (
                    <span className="band absolute inset-x-0 bottom-0">
                      <span style={{ width: `${(entry.position / entry.duration) * 100}%` }} />
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">
                    <span className="sr-only">Episode </span>
                    <span className="sm:sr-only">{episode.number}. </span>
                    {episode.name}
                  </span>
                  {episode.synopsis ? (
                    <span className="mt-1 line-clamp-2 block text-sm text-smoke">
                      {episode.synopsis}
                    </span>
                  ) : null}
                  {runtime ? (
                    <span className="mt-1 block text-xs text-dust sm:hidden">{runtime}</span>
                  ) : null}
                </span>
                {runtime ? (
                  <span className="hidden text-sm text-smoke tabular-nums sm:block">{runtime}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
