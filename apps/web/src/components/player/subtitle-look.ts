// SPDX-License-Identifier: AGPL-3.0-only
//
// Subtitles are drawn by the browser from the cues of a text track. What can
// be said about how they look goes through the ::cue rule, which only reads
// a handful of properties, so the settings are handed over as custom
// properties on the player and the stylesheet puts them to work.
//
// Where they sit, and when they show, the browser does not take from CSS at
// all: a cue carries its own line and its own two times. Those are set on the
// cues themselves, which is what the adjuster below does.

import type { CSSProperties } from 'react';
import type { SubtitleLook } from '@/lib/player-settings';

/** A cue as the player needs it, so this can be tested without a browser. */
export interface AdjustableCue {
  startTime: number;
  endTime: number;
  line: number | 'auto';
  snapToLines: boolean;
}

/** What the text is set off with, as a text-shadow. */
function edgeShadow(look: SubtitleLook): string {
  const dark = 'rgb(0 0 0 / 0.85)';
  switch (look.edge) {
    case 'outline':
      // Four shadows make an even edge; a stroke would need a property Safari lacks.
      return `-2px 0 ${dark}, 2px 0 ${dark}, 0 -2px ${dark}, 0 2px ${dark}`;
    case 'shadow':
      return `0 2px 4px ${dark}`;
    default:
      return 'none';
  }
}

/**
 * The custom properties the ::cue rule reads. They go on the element that
 * holds the video, so every player on the page can differ.
 *
 * The size is worked out against the height of the player rather than the
 * height of the window, so that a small window and a full screen read the
 * same. Before that height is known the window stands in for it.
 *
 * @param height Height of the player in pixels, or 0 while it is unknown.
 */
export function subtitleProperties(look: SubtitleLook, height: number): CSSProperties {
  const boxed = look.edge === 'box';
  const background = boxed ? Math.max(0.75, look.background) : look.background;
  return {
    ['--cue-size' as string]:
      height > 0 ? `${((height * look.size) / 100).toFixed(2)}px` : `${look.size}vh`,
    ['--cue-color' as string]: look.color,
    ['--cue-shadow' as string]: edgeShadow(look),
    ['--cue-background' as string]: `rgb(0 0 0 / ${background})`,
  };
}

/**
 * Where the bottom line sits, counted from the top of the picture, because
 * that is the way a cue counts.
 *
 * @param bottom How far above the lower edge, as a percentage of the height.
 */
export function cueLine(bottom: number): number {
  return Math.min(95, Math.max(5, 100 - bottom));
}

/**
 * Moves the cues of a track in time and puts them where the viewer asked for
 * them.
 *
 * One adjuster belongs to one player and remembers what every cue said to
 * begin with, so that changing the offset twice does not move a line twice,
 * and so that a cue the subtitler placed himself — a sign on a wall, a
 * speaker at the top of the picture — stays where he placed it.
 */
export function createCueAdjuster(): {
  apply: (cues: readonly AdjustableCue[] | null | undefined, look: SubtitleLook) => void;
} {
  const original = new WeakMap<AdjustableCue, { start: number; end: number; placed: boolean }>();

  return {
    apply(cues, look) {
      if (!cues) {
        return;
      }
      const line = cueLine(look.bottom);
      for (const cue of cues) {
        let began = original.get(cue);
        if (!began) {
          began = {
            start: cue.startTime,
            end: cue.endTime,
            placed: cue.line !== 'auto',
          };
          original.set(cue, began);
        }
        if (look.offset !== 0 || cue.startTime !== began.start) {
          // A cue cannot begin before the video does, and must still end after it begins.
          const start = Math.max(0, began.start + look.offset);
          cue.startTime = start;
          cue.endTime = Math.max(start + 0.1, began.end + look.offset);
        }
        if (!began.placed) {
          cue.snapToLines = false;
          cue.line = line;
        }
      }
    },
  };
}
