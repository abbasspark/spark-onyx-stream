// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef } from 'react';
import { type Box, type Direction, nearest } from './focus';
import { type Key, keyOf } from './platform';

type Handler = (key: Key) => boolean | void;

/** Screens in front have the first say. The one that returns true has handled the press. */
const handlers: Handler[] = [];
let listening = false;

/** The places a press of an arrow can land: everything that says it can be focused. */
const FOCUSABLE = '[data-focus]';

function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function visible(element: HTMLElement): boolean {
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/** Moves the focus one step in a direction. Returns whether it went anywhere. */
export function move(direction: Direction): boolean {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
  if (all.length === 0) {
    return false;
  }
  const current = document.activeElement;
  if (!(current instanceof HTMLElement) || !current.matches(FOCUSABLE)) {
    all[0]?.focus({ preventScroll: true });
    all[0]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return true;
  }
  const target = nearest(
    boxOf(current),
    all
      .filter((element) => element !== current)
      .map((element) => ({ id: element, box: boxOf(element) })),
    direction,
  );
  if (!target) {
    return false;
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

/** Puts the focus on the first place of a screen that has one, or on the one marked as first. */
export function focusFirst(root: ParentNode = document): void {
  const target =
    root.querySelector<HTMLElement>(`${FOCUSABLE}[data-autofocus]`) ??
    root.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus({ preventScroll: true });
}

function onKeyDown(event: KeyboardEvent) {
  const key = keyOf(event.keyCode);
  if (!key) {
    return;
  }
  // Typing in a field, such as a search box, is left to the field.
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (key !== 'back') {
      return;
    }
  }
  for (let index = handlers.length - 1; index >= 0; index -= 1) {
    if (handlers[index]?.(key) === true) {
      event.preventDefault();
      return;
    }
  }
  if (key === 'up' || key === 'down' || key === 'left' || key === 'right') {
    move(key);
    event.preventDefault();
  } else if (key === 'enter') {
    const current = document.activeElement;
    if (current instanceof HTMLElement && current.matches(FOCUSABLE)) {
      current.click();
      event.preventDefault();
    }
  }
}

/** Listens to the remote for as long as the calling screen is on. Latest screen first. */
export function useRemote(handler: Handler, active = true): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const mine: Handler = (key) => latest.current(key);
    handlers.push(mine);
    if (!listening) {
      listening = true;
      window.addEventListener('keydown', onKeyDown);
    }
    return () => {
      const at = handlers.indexOf(mine);
      if (at >= 0) {
        handlers.splice(at, 1);
      }
    };
  }, [active]);
}
