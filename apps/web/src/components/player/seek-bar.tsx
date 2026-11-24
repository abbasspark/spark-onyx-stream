// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { formatClock } from '@/lib/format';
import { bandAt, type MarkerBand } from '@/lib/markers';
import { findPreview, type PreviewCue } from '@/lib/vtt';

interface SeekBarProps {
  time: number;
  duration: number;
  /** Seconds up to which the video is loaded. */
  buffered: number;
  previews: readonly PreviewCue[];
  /** The marked stretches — recap, opening, credits — drawn across the bar. */
  bands?: readonly MarkerBand[];
  onSeek: (seconds: number) => void;
}

const STEP_SECONDS = 10;

/**
 * The seek bar, drawn as a band: a pale track, what is loaded a little
 * lighter, what was watched in amber. Pointing at it shows the time and, when
 * the video has them, a small picture of that moment.
 */
export function SeekBar({ time, duration, buffered, previews, bands = [], onSeek }: SeekBarProps) {
  const track = useRef<HTMLDivElement>(null);
  /** Where the pointer is, as a fraction of the bar. Null when it is elsewhere. */
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const usable = duration > 0;
  const fraction = (event: PointerEvent): number => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!usable || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setHover(fraction(event));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (usable) {
      setHover(fraction(event));
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) {
      return;
    }
    setDragging(false);
    onSeek(fraction(event) * duration);
    // A finger leaves no pointer behind to keep the preview open.
    if (event.pointerType !== 'mouse') {
      setHover(null);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const targets: Record<string, number> = {
      ArrowLeft: time - STEP_SECONDS,
      ArrowRight: time + STEP_SECONDS,
      PageDown: time - 60,
      PageUp: time + 60,
      Home: 0,
      End: duration,
    };
    const target = targets[event.key];
    if (target === undefined || !usable) {
      return;
    }
    event.preventDefault();
    // The player has the same keys for the whole screen. Here they belong to the bar.
    event.stopPropagation();
    onSeek(Math.min(duration, Math.max(0, target)));
  };

  // While dragging, the bar follows the pointer, not the video.
  const shown = dragging && hover !== null ? hover : usable ? time / duration : 0;
  const hoverTime = hover !== null ? hover * duration : null;
  const preview = hoverTime !== null ? findPreview(previews, hoverTime) : undefined;
  const band = hoverTime !== null ? bandAt(bands, hoverTime) : null;

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label="Position in the video"
      aria-valuemin={0}
      aria-valuemax={Math.floor(duration) || 0}
      aria-valuenow={Math.floor(time)}
      aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
      aria-disabled={!usable}
      className="group/seek relative flex h-6 cursor-pointer touch-none items-center"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDragging(false);
        setHover(null);
      }}
      onPointerLeave={() => {
        if (!dragging) {
          setHover(null);
        }
      }}
      onKeyDown={onKeyDown}
    >
      <div className="relative h-1 w-full bg-vein/25 transition-[height] duration-100 group-hover/seek:h-1.5 group-focus-visible/seek:h-1.5">
        <div
          className="absolute inset-y-0 left-0 bg-vein/35"
          style={{ width: `${usable ? Math.min(1, buffered / duration) * 100 : 0}%` }}
        />
        <div className="absolute inset-y-0 left-0 bg-sard" style={{ width: `${shown * 100}%` }} />
        {/*
          The marked stretches, drawn over the bar in pale strokes so a viewer
          can see where the opening and the credits are before reaching them.
        */}
        {bands.map((marked) => (
          <span
            key={`${marked.kind}-${marked.from}`}
            aria-hidden="true"
            className="absolute inset-y-0 border-x border-onyx/70 bg-vein/35 mix-blend-screen"
            style={{
              left: `${marked.from * 100}%`,
              width: `${Math.max(0.4, (marked.to - marked.from) * 100)}%`,
            }}
          />
        ))}
      </div>
      <div
        aria-hidden="true"
        className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sard transition-transform duration-100 group-hover/seek:scale-100 group-focus-visible/seek:scale-100 ${dragging ? 'scale-100' : 'scale-0'}`}
        style={{ left: `${shown * 100}%` }}
      />

      {hover !== null && hoverTime !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full mb-3 flex -translate-x-1/2 flex-col items-center gap-1.5"
          // Kept inside the bar, so the picture is never cut off at the edge.
          style={{ left: `clamp(5.5rem, ${hover * 100}%, calc(100% - 5.5rem))` }}
        >
          {preview ? (
            <div
              className="rounded-[3px] border border-vein/40 bg-onyx bg-no-repeat"
              style={{
                width: preview.width,
                height: preview.height,
                backgroundImage: `url("${preview.url}")`,
                backgroundPosition: `-${preview.x}px -${preview.y}px`,
              }}
            />
          ) : null}
          <span className="flex items-baseline gap-2 rounded-[2px] bg-onyx/85 px-1.5 py-0.5 text-xs font-medium">
            {band ? <span className="text-sard">{band.name}</span> : null}
            <span className="tabular-nums">{formatClock(hoverTime)}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
