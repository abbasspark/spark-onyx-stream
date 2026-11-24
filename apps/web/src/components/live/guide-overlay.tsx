// SPDX-License-Identifier: AGPL-3.0-only
'use client';

// The guide over the picture: a row per channel, time running to the right,
// a line at the present moment. The channel that is playing keeps playing
// behind it, which is the whole point of a guide you open while watching.
//
// A programme that has already been sent is still reachable on a channel
// that keeps what it sent, so choosing one either tunes to its channel or
// jumps back to where it began.

import { Clock, Play, RotateCcw, Star, X } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { progressOf } from '@/lib/live';
import type { Channel, Guide, Programme } from '@/lib/types';

/** Width of one hour. Wide enough for a title, narrow enough to see an evening. */
const HOUR_PX = 220;
const HOUR_MS = 3_600_000;
/** Width of the column that names the channels. */
const LABEL_PX = 150;
const ROW_PX = 56;

export interface GuideChoice {
  channel: Channel;
  programme: Programme | null;
  /** Where in the video it begins, for a programme still kept by the channel playing. */
  position: number | null;
}

interface GuideOverlayProps {
  channels: Channel[];
  guide: Guide | null;
  /** The channel playing behind the guide. */
  current: string;
  favourites: readonly string[];
  onToggleFavourite: (slug: string) => void;
  /**
   * Where in the video a moment of the world lies on the channel that is
   * playing, or null when it is not kept.
   */
  positionOf: (at: number) => number | null;
  onChoose: (choice: GuideChoice) => void;
  onClose: () => void;
}

function clock(time: number | string): string {
  return new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function GuideOverlay({
  channels,
  guide,
  current,
  favourites,
  onToggleFavourite,
  positionOf,
  onChoose,
  onClose,
}: GuideOverlayProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // Times are written in the viewer's own zone, which only the browser knows.
  const [now, setNow] = useState<number | null>(null);
  /** The row and the programme the keyboard is on. */
  const [at, setAt] = useState({ row: 0, column: 0 });

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const from = guide ? new Date(guide.from).getTime() : 0;
  const to = guide ? new Date(guide.to).getTime() : 0;

  const rows = useMemo(
    () =>
      channels.map((channel) => ({
        channel,
        programmes: guide?.channels.find((row) => row.slug === channel.slug)?.programmes ?? [],
      })),
    [channels, guide],
  );

  // Opens on the channel that is playing, with the present a little in from
  // the left: a viewer wants to see what is on now, not what was on at dawn.
  const started = now !== null;
  useEffect(() => {
    if (!started || !scroller.current || !guide) {
      return;
    }
    scroller.current.scrollLeft = Math.max(0, ((Date.now() - from) / HOUR_MS) * HOUR_PX - 90);
    const row = rows.findIndex((entry) => entry.channel.slug === current);
    if (row > 0) {
      scroller.current.scrollTop = Math.max(0, (row - 1) * ROW_PX);
      setAt({ row, column: 0 });
    }
  }, [started, guide, from, rows, current]);

  if (now === null || !guide) {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-onyx/92">
        <p role="status" className="text-smoke">
          Loading the guide
        </p>
      </div>
    );
  }

  const hours: number[] = [];
  for (let time = Math.ceil(from / HOUR_MS) * HOUR_MS; time < to; time += HOUR_MS) {
    hours.push(time);
  }
  const width = ((to - from) / HOUR_MS) * HOUR_PX;
  const nowOffset = now >= from && now <= to ? ((now - from) / HOUR_MS) * HOUR_PX : null;

  const choose = (channel: Channel, programme: Programme | null) => {
    const startsAt = programme ? new Date(programme.startsAt).getTime() : now;
    onChoose({
      channel,
      programme,
      position:
        channel.slug === current && programme && startsAt < now ? positionOf(startsAt) : null,
    });
  };

  /** The keyboard walks the grid; Enter takes what it is on. */
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const row = rows[at.row];
    const steps: Record<string, () => void> = {
      ArrowDown: () =>
        setAt((place) => ({ row: Math.min(rows.length - 1, place.row + 1), column: 0 })),
      ArrowUp: () => setAt((place) => ({ row: Math.max(0, place.row - 1), column: 0 })),
      ArrowRight: () =>
        setAt((place) => ({
          ...place,
          column: Math.min((rows[place.row]?.programmes.length ?? 1) - 1, place.column + 1),
        })),
      ArrowLeft: () => setAt((place) => ({ ...place, column: Math.max(0, place.column - 1) })),
      Enter: () => {
        if (row) {
          choose(row.channel, row.programmes[at.column] ?? null);
        }
      },
    };
    const step = steps[event.key];
    if (step) {
      event.preventDefault();
      event.stopPropagation();
      step();
    }
  };

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Guide"
      data-own-keys
      className="absolute inset-0 z-30 flex flex-col bg-onyx/94 backdrop-blur-sm"
    >
      <div className="flex h-14 shrink-0 items-center gap-4 px-4 sm:px-6">
        <h2 className="heading text-lg">Guide</h2>
        <p className="text-sm text-smoke">
          <Clock className="mr-1.5 inline size-3.5" aria-hidden="true" />
          {clock(now)}
        </p>
        <button
          type="button"
          aria-label="Close the guide"
          className="player-button ml-auto"
          onClick={onClose}
        >
          <X />
        </button>
      </div>

      <div
        ref={scroller}
        className="flex-1 overflow-auto border-t border-line"
        role="region"
        aria-label="Guide, scrolls in both directions"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div className="relative" style={{ width: LABEL_PX + width }}>
          {/* The hours, kept at the top while the rows go by. */}
          <div className="sticky top-0 z-30 flex h-8 bg-coal">
            {/* Stays over the names, so the hours do not slide out under them. */}
            <span
              aria-hidden="true"
              className="sticky left-0 z-10 shrink-0 border-r border-line bg-coal"
              style={{ width: LABEL_PX }}
            />
            {/* The gap before the first full hour, when the guide starts inside one. */}
            <span
              aria-hidden="true"
              className="shrink-0"
              style={{ width: (((hours[0] ?? from) - from) / HOUR_MS) * HOUR_PX }}
            />
            {hours.map((hour) => (
              <span
                key={hour}
                className="shrink-0 border-l border-line pl-2 text-xs text-smoke tabular-nums"
                style={{ width: HOUR_PX }}
              >
                {clock(hour)}
              </span>
            ))}
          </div>

          {nowOffset !== null ? (
            <span
              aria-hidden="true"
              className="absolute top-8 bottom-0 z-10 w-px bg-sard"
              style={{ left: LABEL_PX + nowOffset }}
            />
          ) : null}

          {rows.map((row, index) => {
            const playing = row.channel.slug === current;
            return (
              <div key={row.channel.slug} className="flex" style={{ height: ROW_PX }}>
                <div
                  className={`sticky left-0 z-20 flex w-[150px] shrink-0 items-center gap-2 border-t border-r border-line px-2.5 ${
                    playing ? 'bg-ash' : 'bg-coal'
                  }`}
                >
                  <button
                    type="button"
                    aria-label={
                      favourites.includes(row.channel.slug)
                        ? `Take ${row.channel.name} out of the favourites`
                        : `Make ${row.channel.name} a favourite`
                    }
                    aria-pressed={favourites.includes(row.channel.slug)}
                    className="shrink-0 text-smoke hover:text-sard"
                    onClick={() => onToggleFavourite(row.channel.slug)}
                  >
                    <Star
                      className={`size-3.5 ${
                        favourites.includes(row.channel.slug) ? 'fill-sard text-sard' : ''
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
                    onClick={() => choose(row.channel, null)}
                  >
                    {row.channel.number !== null ? (
                      <span className="shrink-0 text-xs text-dust tabular-nums">
                        {row.channel.number}
                      </span>
                    ) : null}
                    <span className="truncate text-sm">{row.channel.name}</span>
                  </button>
                  {playing ? (
                    <Play className="size-3 shrink-0 fill-sard text-sard" aria-hidden="true" />
                  ) : null}
                </div>

                <div className="relative border-t border-line" style={{ width }}>
                  {row.programmes.map((programme, column) => {
                    const start = new Date(programme.startsAt).getTime();
                    const end = new Date(programme.endsAt).getTime();
                    if (end <= from || start >= to) {
                      return null;
                    }
                    const left = ((Math.max(start, from) - from) / HOUR_MS) * HOUR_PX;
                    const span = ((Math.min(end, to) - Math.max(start, from)) / HOUR_MS) * HOUR_PX;
                    const past = end <= now;
                    const running = start <= now && end > now;
                    // A past programme is only worth choosing where the
                    // channel playing still keeps it.
                    const kept = past && playing && positionOf(start) !== null;
                    const here = index === at.row && column === at.column;
                    return (
                      <button
                        key={programme.startsAt + programme.title}
                        type="button"
                        className={`absolute top-0.5 bottom-0.5 overflow-hidden border border-line px-2 text-left ${
                          running ? 'bg-ash' : past ? 'bg-coal/60' : 'bg-coal'
                        } ${here ? 'ring-1 ring-sard' : ''} ${
                          past && !kept ? 'text-dust' : 'hover:border-vein/50'
                        }`}
                        style={{ left, width: Math.max(span - 3, 24) }}
                        onClick={() => choose(row.channel, programme)}
                      >
                        <span className="flex items-center gap-1.5">
                          {kept ? (
                            <RotateCcw className="size-3 shrink-0 text-sard" aria-hidden="true" />
                          ) : null}
                          <span className="truncate text-xs font-medium">{programme.title}</span>
                        </span>
                        <span className="block truncate text-[11px] text-smoke tabular-nums">
                          {clock(programme.startsAt)}
                        </span>
                        {running ? (
                          <span
                            aria-hidden="true"
                            className="absolute inset-x-0 bottom-0 h-0.5 bg-sard"
                            style={{ width: `${progressOf(programme, now) * 100}%` }}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                  {row.programmes.length === 0 ? (
                    <p className="flex h-full items-center px-3 text-xs text-dust">
                      Nothing in the guide for this channel
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
