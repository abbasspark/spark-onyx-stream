// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { isLocked, liveHref } from '@/lib/live';
import type { Channel } from '@/lib/types';
import { useViewerSession } from './viewer-session';

interface ChannelLineupProps {
  channels: Channel[];
  /** The channel that is playing, marked in the list. */
  current?: string;
  /** Tighter rows, for the list beside the player. */
  compact?: boolean;
}

/**
 * The channels of the site as a lineup: one row each, in the order of their
 * numbers, the way a programme guide lists them.
 */
export function ChannelLineup({ channels, current, compact = false }: ChannelLineupProps) {
  const { opens } = useViewerSession();

  return (
    <ol className="border-t border-line">
      {channels.map((channel) => {
        const locked = isLocked(channel, opens);
        const playing = channel.slug === current;
        return (
          <li key={channel.slug} className="border-b border-line">
            <Link
              href={liveHref(channel.slug)}
              aria-current={playing ? 'page' : undefined}
              className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 transition-colors hover:bg-coal focus-visible:bg-coal aria-[current]:bg-coal ${
                compact ? 'px-4 py-3' : 'px-3 py-5 sm:gap-x-8 sm:px-5 sm:py-6'
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
                {channel.description && !compact ? (
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
          </li>
        );
      })}
    </ol>
  );
}
