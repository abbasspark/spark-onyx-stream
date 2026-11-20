// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Reads the output FFmpeg writes with "-progress pipe:1": blocks of key=value
 * lines, each block ending with a "progress=continue" or "progress=end" line.
 *
 * Feed it chunks as they arrive. It reports the position in the output, in
 * milliseconds, once per finished block.
 */
export class ProgressReader {
  private pending = '';
  private outTimeMs: number | null = null;

  constructor(private readonly onPosition: (outTimeMs: number) => void) {}

  push(chunk: string): void {
    this.pending += chunk;
    const lines = this.pending.split('\n');
    this.pending = lines.pop() ?? '';

    for (const line of lines) {
      const separator = line.indexOf('=');
      if (separator === -1) {
        continue;
      }
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();

      if (key === 'out_time_us' || key === 'out_time_ms') {
        // Despite its name, FFmpeg reports out_time_ms in microseconds as well.
        const microseconds = Number(value);
        if (Number.isFinite(microseconds) && microseconds >= 0) {
          this.outTimeMs = Math.round(microseconds / 1000);
        }
      } else if (key === 'progress' && this.outTimeMs !== null) {
        this.onPosition(this.outTimeMs);
      }
    }
  }
}

/** Converts a position into a whole percentage from 0 to 100. Unknown durations give 0. */
export function toPercent(positionMs: number, durationMs: number | null | undefined): number {
  if (!durationMs || durationMs <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.floor((positionMs / durationMs) * 100)));
}
