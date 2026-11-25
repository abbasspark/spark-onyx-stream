// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react';
import { Button, Message, Spinner } from '@/components/ui';
import { type TitleDetail, type WatchingItem, api } from '@/lib/api';
import { resumePoint, runtime } from '@/lib/format';
import { clock } from '@/lib/format';
import { focusFirst } from '@/lib/remote';

export interface Playing {
  slug: string;
  episodeId: string | null;
  heading: string;
  detail: string | null;
  /** Where to start, in seconds. */
  startAt: number;
}

/** One title: what it is, and the way to play it. A series lists its episodes. */
export function Title({ slug, onPlay }: { slug: string; onPlay: (playing: Playing) => void }) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; title: TitleDetail; watching: WatchingItem[] }
    | { kind: 'trouble'; text: string }
  >({ kind: 'loading' });
  const [season, setSeason] = useState(0);

  useEffect(() => {
    let over = false;
    Promise.all([api.title(slug), api.watching().catch(() => ({ items: [] as WatchingItem[] }))])
      .then(([title, watching]) => {
        if (!over) {
          setState({ kind: 'ready', title, watching: watching.items });
        }
      })
      .catch((error: Error) => {
        if (!over) {
          setState({ kind: 'trouble', text: error.message });
        }
      });
    return () => {
      over = true;
    };
  }, [slug]);

  useEffect(() => {
    if (state.kind !== 'loading') {
      focusFirst();
    }
  }, [state.kind]);

  if (state.kind === 'loading') {
    return <Spinner label="Loading" />;
  }
  if (state.kind === 'trouble') {
    return <Message title="This title did not load">{state.text}</Message>;
  }

  const { title, watching } = state;
  const mine = watching.filter((item) => item.title.slug === title.slug);
  const isSeries = title.type !== 'MOVIE';
  const seasons = title.seasons;
  const shown = seasons[Math.min(season, Math.max(0, seasons.length - 1))];
  const meta = [
    title.releaseYear ? String(title.releaseYear) : null,
    title.ageRating,
    isSeries
      ? `${title.seasonCount} ${title.seasonCount === 1 ? 'season' : 'seasons'}`
      : runtime(title.runtimeMinutes),
    title.genres
      .map((genre) => genre.name)
      .slice(0, 3)
      .join(', ') || null,
  ].filter((part): part is string => Boolean(part));

  const playMovie = () => {
    const kept = mine.find((item) => !item.episode);
    onPlay({
      slug: title.slug,
      episodeId: null,
      heading: title.name,
      detail: null,
      startAt: kept ? resumePoint(kept.position, kept.duration) : 0,
    });
  };

  // For a series, the button goes where the viewer was, or to the first episode.
  const latest = mine
    .filter((item) => item.episode)
    .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))[0];
  const first = seasons[0]?.episodes[0];
  const playSeries = () => {
    if (latest?.episode) {
      onPlay({
        slug: title.slug,
        episodeId: latest.episode.id,
        heading: title.name,
        detail: `S${latest.episode.seasonNumber} E${latest.episode.number} · ${latest.episode.name}`,
        startAt: resumePoint(latest.position, latest.duration),
      });
    } else if (first && seasons[0]) {
      onPlay({
        slug: title.slug,
        episodeId: first.id,
        heading: title.name,
        detail: `S${seasons[0].number} E${first.number} · ${first.name}`,
        startAt: 0,
      });
    }
  };

  const resuming = isSeries
    ? latest !== undefined && resumePoint(latest.position, latest.duration) > 0
    : mine.some((item) => !item.episode && resumePoint(item.position, item.duration) > 0);

  return (
    <div className="title">
      {title.backdrop ? <img className="backdrop" src={title.backdrop.url} alt="" /> : null}
      <div className="body">
        <h1>{title.name}</h1>
        <p className="meta">{meta.join('  ·  ')}</p>
        {title.synopsis ? <p className="synopsis">{title.synopsis}</p> : null}
        <div className="actions">
          <Button primary autoFocus onClick={isSeries ? playSeries : playMovie}>
            {resuming ? 'Resume' : 'Play'}
          </Button>
        </div>
        {isSeries && seasons.length > 0 ? (
          <>
            {seasons.length > 1 ? (
              <div className="seasons">
                {seasons.map((item, index) => (
                  <button
                    key={item.number}
                    type="button"
                    className={index === season ? 'chip on' : 'chip'}
                    data-focus
                    onClick={() => setSeason(index)}
                  >
                    {item.name ?? `Season ${item.number}`}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="episodes">
              {shown?.episodes.map((episode) => {
                const kept = mine.find((item) => item.episode?.id === episode.id);
                return (
                  <button
                    key={episode.id}
                    type="button"
                    className="episode"
                    data-focus
                    onClick={() =>
                      onPlay({
                        slug: title.slug,
                        episodeId: episode.id,
                        heading: title.name,
                        detail: `S${shown.number} E${episode.number} · ${episode.name}`,
                        startAt: kept ? resumePoint(kept.position, kept.duration) : 0,
                      })
                    }
                  >
                    <span className="number">{episode.number}</span>
                    <span className="text">
                      <span className="episode-name">{episode.name}</span>
                      {episode.durationMs ? (
                        <span className="episode-time">{clock(episode.durationMs / 1000)}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
