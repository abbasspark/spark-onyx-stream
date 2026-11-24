// SPDX-License-Identifier: AGPL-3.0-only
'use client';

// What a television shows for a few seconds after a channel change: the
// number, the name, what is on and how far through it is, and what follows.
// It is how a viewer who is flipping decides whether to stop here.

import { useEffect, useState } from 'react';
import { progressOf } from '@/lib/live';
import type { Channel } from '@/lib/types';

/** How long the banner stays after a change. */
const SHOW_MS = 5000;

interface ChannelBannerProps {
  channel: Channel;
  /** Raising this number shows the banner again, as a change does. */
  signal: number;
  /** Shown whatever the signal says, as while the controls are up. */
  pinned?: boolean;
}

function clock(time: string): string {
  return new Date(time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function ChannelBanner({ channel, signal, pinned = false }: ChannelBannerProps) {
  const [shown, setShown] = useState(true);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setShown(true);
    const timer = window.setTimeout(() => setShown(false), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [signal, channel.slug]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  const visible = shown || pinned;
  const running = channel.now ?? null;
  // The clock is only written once the browser has said what time it is, so
  // the server and the page agree on what they render.
  const through = running && now !== null ? progressOf(running, now) : 0;

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4 transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="w-full max-w-md border border-line bg-coal/90 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-baseline gap-3">
          {channel.number !== null ? (
            <span className="display text-2xl text-sard tabular-nums">{channel.number}</span>
          ) : null}
          <p className="heading min-w-0 flex-1 truncate text-base">{channel.name}</p>
          {!channel.onAir ? <span className="text-xs text-dust">Off air</span> : null}
        </div>
        {running ? (
          <>
            <p className="mt-1.5 flex items-baseline gap-2 text-sm">
              <span className="truncate">{running.title}</span>
              {now !== null ? (
                <span className="shrink-0 text-xs text-smoke tabular-nums">
                  {clock(running.startsAt)}–{clock(running.endsAt)}
                </span>
              ) : null}
            </p>
            <span aria-hidden="true" className="mt-2 block h-0.5 w-full bg-vein/20">
              <span className="block h-full bg-sard" style={{ width: `${through * 100}%` }} />
            </span>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-dust">Nothing in the guide for this channel</p>
        )}
        {channel.next ? (
          <p className="mt-2 truncate text-xs text-smoke">
            Then: {channel.next.title}
            {now !== null ? ` at ${clock(channel.next.startsAt)}` : ''}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface NumberTunerProps {
  /** The digits typed so far. Empty hides it. */
  digits: string;
}

/** The digits of a channel number as they are typed, as on a remote control. */
export function NumberTuner({ digits }: NumberTunerProps) {
  if (digits === '') {
    return null;
  }
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute top-16 right-4 border border-line bg-coal/90 px-5 py-3 backdrop-blur-sm sm:right-6"
    >
      <span className="display text-4xl tracking-[0.1em] tabular-nums">{digits}</span>
    </div>
  );
}
