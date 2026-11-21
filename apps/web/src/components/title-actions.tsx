// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Clapperboard, Play } from 'lucide-react';
import Link from 'next/link';
import { formatClock } from '@/lib/format';
import type { TitleDetail } from '@/lib/types';
import { episodeCode, firstEpisode, movieKey, watchHref } from '@/lib/watch';
import { useWatching } from './continue-watching';

/**
 * The buttons of a title page. The main one knows where this viewer stopped:
 * it resumes a movie, or goes on with the episode that was last watched.
 */
export function TitleActions({ title }: { title: TitleDetail }) {
  const watching = useWatching();

  let href: string;
  let label: string;
  let progress: number | null = null;

  if (title.type === 'MOVIE') {
    const entry = watching.find((item) => item.key === movieKey(title.slug));
    href = watchHref(title.slug);
    label = entry ? `Resume at ${formatClock(entry.position)}` : 'Play';
    progress = entry ? entry.position / entry.duration : null;
  } else {
    // The list is ordered by time, so the first match is the episode watched last.
    const entry = watching.find((item) => item.href.startsWith(`${watchHref(title.slug)}/`));
    const first = firstEpisode(title);
    if (entry) {
      href = entry.href;
      label = `Resume ${entry.detail?.split(' ').slice(0, 2).join(' ') ?? 'episode'}`;
      progress = entry.position / entry.duration;
    } else {
      href = first ? watchHref(title.slug, first.episode.id) : `/title/${title.slug}`;
      label = first ? `Play ${episodeCode(first.season.number, first.episode.number)}` : 'Play';
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link href={href} className="button button-play relative overflow-hidden">
        <Play className="fill-current" />
        {label}
        {progress !== null ? (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-onyx/25">
            <span className="block h-full bg-onyx/70" style={{ width: `${progress * 100}%` }} />
          </span>
        ) : null}
      </Link>
      {title.hasTrailer ? (
        <Link href={`${watchHref(title.slug)}?trailer=1`} className="button button-quiet">
          <Clapperboard />
          Trailer
        </Link>
      ) : null}
    </div>
  );
}
