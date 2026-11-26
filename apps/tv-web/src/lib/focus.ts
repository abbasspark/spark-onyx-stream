// SPDX-License-Identifier: AGPL-3.0-only

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const centre = (box: Box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

/**
 * Of the places that lie in the direction of the press, the one a viewer
 * expects to land on: the closest, with a pull to stay in line.
 *
 * Distance along the direction counts once, distance across it counts double,
 * so that pressing right on a row moves along the row, and a card in the row
 * below does not win just because it is a little nearer.
 */
export function nearest<Id>(
  from: Box,
  candidates: readonly { id: Id; box: Box }[],
  direction: Direction,
): Id | null {
  const start = centre(from);
  let best: { id: Id; score: number } | null = null;

  for (const candidate of candidates) {
    const point = centre(candidate.box);
    const along =
      direction === 'right'
        ? point.x - start.x
        : direction === 'left'
          ? start.x - point.x
          : direction === 'down'
            ? point.y - start.y
            : start.y - point.y;
    if (along <= 1) {
      continue;
    }
    const across =
      direction === 'left' || direction === 'right'
        ? Math.abs(point.y - start.y)
        : Math.abs(point.x - start.x);
    const score = along + across * 2;
    if (best === null || score < best.score) {
      best = { id: candidate.id, score };
    }
  }
  return best ? best.id : null;
}
