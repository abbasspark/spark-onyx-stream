// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Clapperboard, Lock, Play } from 'lucide-react';
import Link from 'next/link';
import { formatClock } from '@/lib/format';
import { opensTitle } from '@/lib/plans';
import type { TitleDetail } from '@/lib/types';
import { episodeCode, movieKey, nextUnwatched, watchHref } from '@/lib/watch';
import { useWatching } from './continue-watching';
import { useViewerSession } from './viewer-session';
import { useWatchedVideos } from './watched-videos';

/**
 * The buttons of a title page. The main one knows where this viewer stopped:
 * it resumes a movie, goes on with the episode that was last watched, or
 * starts the episode after the ones that are finished.
 */
export function TitleActions({ title }: { title: TitleDetail }) {
  const watching = useWatching();
  const watched = useWatchedVideos(title.slug);
  const { state, entitled, opens } = useViewerSession();
  // Until it is known who is here the button says "Play": the player explains the rest.
  const locked = state === 'ready' && !opensTitle(opens, title);

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
    const first = nextUnwatched(title, watched);
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
      {locked ? (
        <Link
          href={`/plans?next=${encodeURIComponent(`/title/${title.slug}`)}`}
          className="button button-play"
        >
          <Lock />
          {entitled ? 'Not in your plan' : 'Subscribe to watch'}
        </Link>
      ) : null}
      <Link
        href={href}
        className={`button relative overflow-hidden ${locked ? 'hidden' : 'button-play'}`}
      >
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
