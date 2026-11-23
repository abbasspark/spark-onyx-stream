// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { WatchScreen } from '@/components/watch-screen';
import { getTitle } from '@/lib/api';
import { firstEpisode, movieKey, watchHref } from '@/lib/watch';

interface WatchPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ trailer?: string; extra?: string }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: WatchPageProps): Promise<Metadata> {
  const [{ slug }, { trailer }] = await Promise.all([params, searchParams]);
  const title = await getTitle(slug);
  return {
    title: title ? (trailer ? `${title.name}, trailer` : title.name) : 'Not found',
    // The title page is the one to find. This page is only for watching.
    robots: { index: false, follow: false },
  };
}

/** Plays a movie, or with "?trailer=1" the trailer, or with "?extra=" one of the extras of any title. */
export default async function WatchPage({ params, searchParams }: WatchPageProps) {
  const [{ slug }, { trailer, extra }] = await Promise.all([params, searchParams]);
  const title = await getTitle(slug);
  if (!title) {
    notFound();
  }
  const backHref = `/title/${title.slug}`;

  if (extra) {
    const found = title.extras?.find((item) => item.id === extra);
    if (!found) {
      redirect(backHref);
    }
    return (
      <WatchScreen
        playbackPath={`/v1/catalog/titles/${title.slug}/extras/${found.id}/playback`}
        heading={title.name}
        detail={found.name}
        backHref={backHref}
        progress={null}
        next={null}
      />
    );
  }

  if (trailer) {
    if (!title.hasTrailer) {
      redirect(backHref);
    }
    return (
      <WatchScreen
        playbackPath={`/v1/catalog/titles/${title.slug}/trailer/playback`}
        heading={title.name}
        detail="Trailer"
        backHref={backHref}
        progress={null}
        next={null}
      />
    );
  }

  // A series is watched by episode. Its plain address leads to the first one.
  if (title.type === 'SERIES') {
    const first = firstEpisode(title);
    redirect(first ? watchHref(title.slug, first.episode.id) : backHref);
  }

  return (
    <WatchScreen
      playbackPath={`/v1/catalog/titles/${title.slug}/playback`}
      heading={title.name}
      detail={null}
      backHref={backHref}
      progress={{
        id: title.id,
        key: movieKey(title.slug),
        href: watchHref(title.slug),
        image: (title.backdrop ?? title.poster)?.url ?? null,
      }}
      next={null}
    />
  );
}
