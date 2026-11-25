// SPDX-License-Identifier: AGPL-3.0-only

/** 3725 seconds as "1:02:05"; 125 as "2:05". */
export function clock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** Minutes as the viewer reads them: "95 min", "2 h 5 min". */
export function runtime(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) {
    return null;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Whether a title has been watched far enough to count as started and not finished. */
export function resumePoint(position: number, duration: number): number {
  if (duration <= 0 || position < 30) {
    return 0;
  }
  // Within the last minute or ninety-five percent the film is taken as seen.
  if (duration - position < 60 || position / duration > 0.95) {
    return 0;
  }
  return position;
}
