// SPDX-License-Identifier: AGPL-3.0-only
'use client';

// The picture itself, as something to touch. On a phone the controls are in
// the way of the film, so the picture takes the common gestures instead:
// double-tap a side to skip, hold to run fast, drag up and down for the
// volume on the right and the brightness on the left.

import { FastForward, Rewind, Sun, Volume2 } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react';
import {
  DOUBLE_TAP_MS,
  dragged,
  HOLD_MS,
  HOLD_SLACK_PX,
  isDoubleTap,
  type Zone,
  zoneOf,
} from './gestures';

/** What the picture shows back while a gesture is running. */
export type Feedback =
  | { kind: 'skip'; zone: 'left' | 'right'; seconds: number }
  | { kind: 'volume'; value: number }
  | { kind: 'brightness'; value: number }
  | { kind: 'fast'; rate: number }
  | null;

interface TouchSurfaceProps {
  /** Seconds a double tap moves. */
  step: number;
  /** How fast the picture runs while a finger rests on it. 1 switches it off. */
  holdRate: number;
  volume: number;
  brightness: number;
  onSkip: (seconds: number) => void;
  onTogglePlay: () => void;
  onToggleFullscreen: () => void;
  onVolume: (value: number) => void;
  onBrightness: (value: number) => void;
  onRate: (rate: number) => void;
  /** Brings the controls back, as the start of any touch does. */
  onWake: () => void;
  /** A single tap of a finger, once it is clear it is not a double tap. */
  onTap: () => void;
}

const HIDE_FEEDBACK_MS = 700;

/**
 * The layer over the picture that takes pointers. It sits under the controls,
 * so a button still gets its own press.
 */
export function TouchSurface({
  step,
  holdRate,
  volume,
  brightness,
  onSkip,
  onTogglePlay,
  onToggleFullscreen,
  onVolume,
  onBrightness,
  onRate,
  onWake,
  onTap,
}: TouchSurfaceProps) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const fade = useRef<number | undefined>(undefined);
  const lastTap = useRef<{ at: number; zone: Zone } | null>(null);
  /** How many taps in a row have gone the same way, so a third tap skips 30s. */
  const run = useRef(0);
  const hold = useRef<number | undefined>(undefined);
  const drag = useRef<{
    zone: Zone;
    y: number;
    height: number;
    from: number;
    moving: boolean;
  } | null>(null);
  const fast = useRef(false);

  const show = (next: Feedback, sticky = false) => {
    setFeedback(next);
    window.clearTimeout(fade.current);
    if (!sticky) {
      fade.current = window.setTimeout(() => setFeedback(null), HIDE_FEEDBACK_MS);
    }
  };

  const stopHolding = () => {
    window.clearTimeout(hold.current);
    if (fast.current) {
      fast.current = false;
      onRate(1);
      setFeedback(null);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    onWake();
    const box = event.currentTarget.getBoundingClientRect();
    const zone = zoneOf(event.clientX - box.left, box.width);
    drag.current = {
      zone,
      y: event.clientY,
      height: box.height,
      from: zone === 'left' ? brightness : volume,
      moving: false,
    };
    if (event.pointerType === 'mouse') {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (holdRate > 1) {
      hold.current = window.setTimeout(() => {
        fast.current = true;
        onRate(holdRate);
        show({ kind: 'fast', rate: holdRate }, true);
      }, HOLD_MS);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || event.pointerType === 'mouse' || state.zone === 'middle') {
      return;
    }
    const moved = event.clientY - state.y;
    if (!state.moving) {
      if (Math.abs(moved) < HOLD_SLACK_PX) {
        return;
      }
      // A finger that travels is not a finger at rest.
      state.moving = true;
      window.clearTimeout(hold.current);
    }
    const value = dragged(moved, state.height, state.from);
    if (state.zone === 'left') {
      onBrightness(value);
      show({ kind: 'brightness', value }, true);
    } else {
      onVolume(value);
      show({ kind: 'volume', value }, true);
    }
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    const wasFast = fast.current;
    stopHolding();
    if (!state) {
      return;
    }
    if (state.moving) {
      window.clearTimeout(fade.current);
      fade.current = window.setTimeout(() => setFeedback(null), HIDE_FEEDBACK_MS);
      return;
    }
    if (wasFast) {
      return;
    }
    if (event.pointerType === 'mouse') {
      // A mouse plays and pauses on the picture, as it always has.
      if (event.button === 0) {
        onTogglePlay();
      }
      return;
    }
    const now = Date.now();
    const paired = isDoubleTap(lastTap.current, now, state.zone);
    lastTap.current = { at: now, zone: state.zone };
    if (!paired) {
      run.current = 0;
      // Waiting out the pair keeps a single tap from acting on the way to a
      // double one, which would flash the controls between two skips.
      window.setTimeout(() => {
        if (lastTap.current?.at === now) {
          onTap();
        }
      }, DOUBLE_TAP_MS);
      return;
    }
    if (state.zone === 'middle') {
      run.current = 0;
      onToggleFullscreen();
      return;
    }
    // Taps that keep coming go further each time, as the viewer expects.
    run.current += 1;
    const seconds = step * run.current;
    onSkip(state.zone === 'left' ? -seconds : seconds);
    show({ kind: 'skip', zone: state.zone, seconds });
  };

  return (
    <>
      <div
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={() => {
          drag.current = null;
          stopHolding();
        }}
        onDoubleClick={(event) => {
          // A mouse keeps its old double click for the full screen.
          if (event.target === event.currentTarget) {
            onToggleFullscreen();
          }
        }}
      />
      {feedback ? <FeedbackMark feedback={feedback} /> : null}
    </>
  );
}

/** What a gesture shows while it works: a number, a bar, an arrow. */
function FeedbackMark({ feedback }: { feedback: NonNullable<Feedback> }) {
  if (feedback.kind === 'skip') {
    const Icon = feedback.zone === 'left' ? Rewind : FastForward;
    return (
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 flex w-1/3 flex-col items-center justify-center gap-2 bg-vein/8 text-vein ${
          feedback.zone === 'left' ? 'left-0' : 'right-0'
        }`}
      >
        <Icon className="size-8 fill-current" />
        <span className="text-sm font-semibold tabular-nums">{feedback.seconds}s</span>
      </div>
    );
  }

  if (feedback.kind === 'fast') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[12%] flex justify-center"
      >
        <span className="flex items-center gap-2 rounded-full bg-onyx/80 px-4 py-1.5 text-sm font-semibold backdrop-blur-sm">
          <FastForward className="size-4 fill-current" />
          {feedback.rate}×
        </span>
      </div>
    );
  }

  const Icon = feedback.kind === 'volume' ? Volume2 : Sun;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 flex w-40 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-sm bg-onyx/80 px-4 py-4 backdrop-blur-sm"
    >
      <Icon className="size-6" />
      <span className="h-1 w-full bg-vein/25">
        <span className="block h-full bg-sard" style={{ width: `${feedback.value * 100}%` }} />
      </span>
      <span className="text-xs tabular-nums">{Math.round(feedback.value * 100)}%</span>
    </div>
  );
}
