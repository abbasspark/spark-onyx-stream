// SPDX-License-Identifier: AGPL-3.0-only
//
// What a finger on the picture means. The decisions are here, apart from the
// events that feed them, so they can be read and tested on their own.

export type Zone = 'left' | 'middle' | 'right';

/** The third of the picture a touch landed in. */
export function zoneOf(x: number, width: number): Zone {
  if (width <= 0) {
    return 'middle';
  }
  const part = x / width;
  if (part < 0.35) {
    return 'left';
  }
  return part > 0.65 ? 'right' : 'middle';
}

/** How long two taps may be apart and still count as one double tap. */
export const DOUBLE_TAP_MS = 320;
/** How long a finger must rest before the picture runs fast. */
export const HOLD_MS = 500;
/** How far a finger may wander and still count as resting. */
export const HOLD_SLACK_PX = 12;
/** What a drag of the whole height of the picture is worth, from 0 to 1. */
const DRAG_RANGE = 1.1;

/**
 * Whether a tap follows close enough on the last one, in the same third of
 * the picture, to be the second of a pair.
 *
 * @param last The time and zone of the tap before, or null when there was none.
 */
export function isDoubleTap(
  last: { at: number; zone: Zone } | null,
  now: number,
  zone: Zone,
): boolean {
  return last !== null && zone === last.zone && now - last.at < DOUBLE_TAP_MS;
}

/**
 * What a vertical drag comes to. Up raises, down lowers, and the whole
 * height of the picture covers a little more than the full range, so the
 * ends are easy to reach.
 *
 * @param moved Pixels the finger has travelled, positive downwards.
 * @param height Height of the picture.
 * @param from The value the drag started at, from 0 to 1.
 */
export function dragged(moved: number, height: number, from: number): number {
  if (height <= 0) {
    return from;
  }
  return Math.min(1, Math.max(0, from - (moved / height) * DRAG_RANGE));
}

/**
 * The CSS filter for a brightness the viewer dimmed by hand. Only ever
 * darkens: a player has no way to make a screen brighter than it is.
 *
 * @param brightness From 0 (as dark as it goes) to 1 (as the video is).
 */
export function brightnessFilter(brightness: number): string | undefined {
  // A picture that can go fully black would look broken, so a tenth is kept.
  return brightness >= 1 ? undefined : `brightness(${(0.1 + brightness * 0.9).toFixed(3)})`;
}
