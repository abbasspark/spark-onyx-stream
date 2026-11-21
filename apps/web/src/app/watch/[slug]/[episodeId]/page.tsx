// SPDX-License-Identifier: AGPL-3.0-only
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WatchScreen } from '@/components/watch-screen';
import { getTitle } from '@/lib/api';
import { episodeCode, episodeKey, findEpisode, watchHref } from '@/lib/watch';

interface EpisodePageProps {
  params: Promise<{ slug: string; episodeId: string }>;
}

export async function generateMetadata({ params }: EpisodePageProps): Promise<Metadata> {
  const { slug, episodeId } = await params;
  const title = await getTitle(slug);
  const place = title ? findEpisode(title, episodeId) : null;
  return {
    title:
      title && place
        ? `${title.name}, ${episodeCode(place.season.number, place.episode.number)}`
        : 'Not found',
    robots: { index: false, follow: false },
  };
}

/** Plays one episode of a series and knows which one follows. */
export default async function EpisodePage({ params }: EpisodePageProps) {
  const { slug, episodeId } = await params;
  const title = await getTitle(slug);
  const place = title ? findEpisode(title, episodeId) : null;
  if (!title || !place) {
    notFound();
  }

  const { season, episode, next } = place;
  const label = (seasonNumber: number, number: number, name: string) =>
    `${episodeCode(seasonNumber, number)} ${name}`;

  return (
    <WatchScreen
      playbackPath={`/v1/catalog/episodes/${episode.id}/playback`}
      heading={title.name}
      detail={label(season.number, episode.number, episode.name)}
      backHref={`/title/${title.slug}#episodes`}
      progress={{
        id: episode.id,
        key: episodeKey(episode.id),
        href: watchHref(title.slug, episode.id),
        image: (episode.still ?? title.backdrop ?? title.poster)?.url ?? null,
      }}
      next={
        next
          ? {
              href: watchHref(title.slug, next.episode.id),
              label: label(next.season.number, next.episode.number, next.episode.name),
            }
          : null
      }
    />
  );
}
