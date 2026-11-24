// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Lock, Search, Star } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { favouritesFirst, matching } from '@/lib/favourites';
import { isLocked, liveHref, onNow, progressOf } from '@/lib/live';
import type { Channel } from '@/lib/types';
import { useFavourites } from './live/use-favourites';
import { useViewerSession } from './viewer-session';

interface ChannelLineupProps {
  channels: Channel[];
  /** The channel that is playing, marked in the list. */
  current?: string;
  /** Tighter rows, for the list beside the player. */
  compact?: boolean;
  /** A box to search the list, for a lineup long enough to need one. */
  searchable?: boolean;
}

/**
 * The channels of the site as a lineup: one row each, in the order of their
 * numbers, the way a programme guide lists them.
 */
export function ChannelLineup({
  channels,
  current,
  compact = false,
  searchable = false,
}: ChannelLineupProps) {
  const { opens } = useViewerSession();
  const { marked, toggle } = useFavourites();
  const [search, setSearch] = useState('');
  // Times are shown in the viewer's own time zone, which only the browser knows.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Favourites come first, in the order the viewer marked them. Searching
  // leaves that order alone, so a list does not reshuffle as it narrows.
  const shown = useMemo(
    () => matching(favouritesFirst(channels, marked), searchable ? search : ''),
    [channels, marked, search, searchable],
  );
  /** Where the favourites end, for the line that separates them from the rest. */
  const lastFavourite = shown.reduce(
    (last, channel, index) => (marked.includes(channel.slug) ? index : last),
    -1,
  );

  return (
    <>
      {searchable ? (
        <div className="relative px-4 pb-3">
          <Search
            className="pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-1/2 text-smoke"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or number"
            aria-label="Search the channels"
            className="h-10 w-full border border-line bg-ash pr-3 pl-9 text-sm placeholder:text-dust"
          />
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-smoke">No channel of that name.</p>
      ) : null}
      <ol className="border-t border-line">
        {shown.map((channel, index) => {
          const locked = isLocked(channel, opens);
          const playing = channel.slug === current;
          const guide = now === null ? null : onNow(channel, now);
          return (
            <li
              key={channel.slug}
              className={`relative border-b border-line ${
                index === lastFavourite && index < shown.length - 1
                  ? 'border-b-2 border-b-line'
                  : ''
              }`}
            >
              <Link
                href={liveHref(channel.slug)}
                aria-current={playing ? 'page' : undefined}
                className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 transition-colors hover:bg-coal focus-visible:bg-coal aria-[current]:bg-coal ${
                  compact ? 'py-3 pr-11 pl-4' : 'py-5 pr-12 pl-3 sm:gap-x-8 sm:py-6 sm:pl-5'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`display text-right tabular-nums ${
                    channel.onAir ? 'text-vein' : 'text-dust'
                  } ${compact ? 'w-9 text-2xl' : 'w-12 text-4xl sm:w-20 sm:text-6xl'}`}
                >
                  {channel.number ?? '·'}
                </span>
                <span className="grid min-w-0 gap-1">
                  <span
                    className={`heading truncate group-hover:text-sard ${
                      compact ? 'text-base' : 'text-xl sm:text-2xl'
                    } ${playing ? 'text-sard' : ''}`}
                  >
                    {channel.number ? (
                      <span className="sr-only">Channel {channel.number}: </span>
                    ) : null}
                    {channel.name}
                  </span>
                  {guide?.now ? (
                    <span className="grid gap-1.5">
                      <span className={`truncate text-vein ${compact ? 'text-xs' : 'text-sm'}`}>
                        <span className="text-smoke">Now </span>
                        {guide.now.title}
                        {compact ? null : (
                          <span className="text-smoke"> until {clock(guide.now.endsAt)}</span>
                        )}
                      </span>
                      <span
                        aria-hidden="true"
                        className="block h-0.5 w-full max-w-64 overflow-hidden rounded-full bg-line"
                      >
                        <span
                          className="block h-full bg-sard"
                          style={{ width: `${progressOf(guide.now, now ?? 0) * 100}%` }}
                        />
                      </span>
                      {guide.next && !compact ? (
                        <span className="truncate text-sm text-smoke">
                          Next {clock(guide.next.startsAt)} {guide.next.title}
                        </span>
                      ) : null}
                    </span>
                  ) : guide?.next && !compact ? (
                    <span className="truncate text-sm text-smoke">
                      Next {clock(guide.next.startsAt)} {guide.next.title}
                    </span>
                  ) : channel.description && !compact ? (
                    <span className="line-clamp-2 max-w-[65ch] text-sm text-smoke">
                      {channel.description}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-col items-end gap-1.5 text-xs sm:flex-row sm:items-center sm:gap-4">
                  {locked ? (
                    <span className="flex h-6 items-center gap-1 rounded-[3px] border border-sard/40 px-1.5 font-medium text-sard">
                      <Lock className="size-3" aria-hidden="true" />
                      <span className="sr-only">Needs a subscription. </span>
                      <span aria-hidden="true">Plan</span>
                    </span>
                  ) : null}
                  {channel.onAir ? (
                    <span className="flex items-center gap-2 font-medium text-vein">
                      <span
                        aria-hidden="true"
                        className="size-2 rounded-full bg-sard motion-safe:animate-pulse"
                      />
                      On air
                    </span>
                  ) : (
                    <span className="text-dust">Off air</span>
                  )}
                </span>
              </Link>
              <button
                type="button"
                aria-label={
                  marked.includes(channel.slug)
                    ? `Take ${channel.name} out of the favourites`
                    : `Make ${channel.name} a favourite`
                }
                aria-pressed={marked.includes(channel.slug)}
                className={`absolute top-1/2 right-1 -translate-y-1/2 p-2 text-dust hover:text-sard ${
                  compact ? '' : 'sm:right-2'
                }`}
                onClick={() => toggle(channel.slug)}
              >
                <Star
                  className={`size-4 ${marked.includes(channel.slug) ? 'fill-sard text-sard' : ''}`}
                />
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
