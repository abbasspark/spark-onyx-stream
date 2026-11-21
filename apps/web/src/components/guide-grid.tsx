// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Play } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { liveHref, placeOf } from '@/lib/live';
import type { Channel, Guide, Programme } from '@/lib/types';

/** Width of one hour in the guide. */
const HOUR_PX = 240;
const HOUR_MS = 3_600_000;
/** Width of the column that names the channels. */
const LABEL_PX = 136;

interface GuideGridProps {
  channels: Channel[];
  guide: Guide;
}

function clock(time: number | string): string {
  return new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * The guide as a timetable: a row per channel, time running to the right,
 * with a line at the present moment. A programme shows its details when it
 * is chosen.
 */
export function GuideGrid({ channels, guide }: GuideGridProps) {
  const from = new Date(guide.from).getTime();
  const to = new Date(guide.to).getTime();
  const width = ((to - from) / HOUR_MS) * HOUR_PX;
  const scroller = useRef<HTMLDivElement>(null);
  // Times are written in the viewer's own time zone, which only the browser knows.
  const [now, setNow] = useState<number | null>(null);
  const [chosen, setChosen] = useState<{ channel: Channel; programme: Programme } | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const started = now !== null;
  useEffect(() => {
    // Opens with the present a little in from the left edge.
    if (started && scroller.current) {
      const offset = ((Date.now() - from) / HOUR_MS) * HOUR_PX;
      scroller.current.scrollLeft = Math.max(0, offset - 80);
    }
  }, [started, from]);

  const hours: number[] = [];
  for (let time = Math.ceil(from / HOUR_MS) * HOUR_MS; time < to; time += HOUR_MS) {
    hours.push(time);
  }
  const rows = channels.map((channel) => ({
    channel,
    programmes: guide.channels.find((row) => row.slug === channel.slug)?.programmes ?? [],
  }));
  const nowOffset =
    now !== null && now >= from && now <= to ? ((now - from) / HOUR_MS) * HOUR_PX : null;

  if (now === null) {
    return (
      <p role="status" className="py-16 text-center text-smoke">
        Loading the guide
      </p>
    );
  }

  return (
    <div className="grid gap-6">
      <div
        ref={scroller}
        className="overflow-x-auto border border-line"
        role="region"
        aria-label="Guide, scrolls sideways"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        <div className="relative" style={{ width: LABEL_PX + width }}>
          <div className="flex h-10 border-b border-line bg-coal text-xs text-smoke">
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-line bg-coal"
              style={{ width: LABEL_PX }}
            />
            <div className="relative flex-1">
              {hours.map((time) => (
                <span
                  key={time}
                  className="absolute top-0 flex h-full items-center border-l border-line pl-2 tabular-nums"
                  style={{ left: ((time - from) / HOUR_MS) * HOUR_PX }}
                >
                  {clock(time)}
                </span>
              ))}
            </div>
          </div>

          {rows.map(({ channel, programmes }) => (
            <div
              key={channel.slug}
              className="flex h-[4.5rem] border-b border-line last:border-b-0"
            >
              <Link
                href={liveHref(channel.slug)}
                className="sticky left-0 z-20 flex shrink-0 items-center gap-3 border-r border-line bg-onyx px-3 hover:bg-coal"
                style={{ width: LABEL_PX }}
              >
                <span className="display w-7 text-right text-xl text-dust tabular-nums">
                  {channel.number ?? ''}
                </span>
                <span className="heading line-clamp-2 min-w-0 text-sm">{channel.name}</span>
              </Link>
              <div className="relative flex-1">
                {programmes.length === 0 ? (
                  <span className="absolute inset-0 flex items-center px-4 text-sm text-dust">
                    No guide for this channel
                  </span>
                ) : null}
                {programmes.map((programme) => {
                  const place = placeOf(programme, from, to);
                  if (!place) {
                    return null;
                  }
                  const start = new Date(programme.startsAt).getTime();
                  const end = new Date(programme.endsAt).getTime();
                  const running = start <= now && end > now;
                  const selected =
                    chosen?.channel.slug === channel.slug &&
                    chosen.programme.startsAt === programme.startsAt;
                  return (
                    <button
                      key={programme.startsAt}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${programme.title}, ${clock(start)} to ${clock(end)} on ${channel.name}`}
                      onClick={() => setChosen({ channel, programme })}
                      className={`absolute inset-y-1 flex items-center overflow-clip rounded-[3px] border px-2.5 text-left transition-colors hover:border-vein ${
                        selected
                          ? 'border-sard bg-ash'
                          : running
                            ? 'border-vein/40 bg-ash'
                            : end <= now
                              ? 'border-line bg-onyx text-dust'
                              : 'border-line bg-coal'
                      }`}
                      style={{ left: place.start * width + 2, width: place.width * width - 4 }}
                    >
                      {/* Stays in view while its programme is scrolled half out to the left. */}
                      <span className="sticky grid min-w-0 gap-0.5" style={{ left: LABEL_PX + 12 }}>
                        <span className="truncate text-sm font-medium">{programme.title}</span>
                        <span className="truncate text-xs text-smoke tabular-nums">
                          {clock(start)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {nowOffset !== null ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-sard"
              style={{ left: LABEL_PX + nowOffset }}
            />
          ) : null}
        </div>
      </div>

      {chosen ? (
        <article aria-live="polite" className="grid max-w-[70ch] gap-3 border-l-2 border-sard pl-5">
          <p className="text-sm text-smoke tabular-nums">
            {chosen.channel.name} · {clock(chosen.programme.startsAt)} to{' '}
            {clock(chosen.programme.endsAt)}
            {chosen.programme.category ? ` · ${chosen.programme.category}` : ''}
          </p>
          <h2 className="display text-3xl">{chosen.programme.title}</h2>
          {chosen.programme.subtitle ? (
            <p className="heading text-lg text-smoke">{chosen.programme.subtitle}</p>
          ) : null}
          {chosen.programme.description ? <p>{chosen.programme.description}</p> : null}
          {new Date(chosen.programme.startsAt).getTime() <= now &&
          new Date(chosen.programme.endsAt).getTime() > now ? (
            <p>
              <Link href={liveHref(chosen.channel.slug)} className="button button-play">
                <Play />
                Watch {chosen.channel.name}
              </Link>
            </p>
          ) : null}
        </article>
      ) : (
        <p className="text-sm text-smoke">Choose a programme to read more about it.</p>
      )}
    </div>
  );
}
