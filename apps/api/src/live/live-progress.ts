// SPDX-License-Identifier: AGPL-3.0-only

/** One progress report of a running FFmpeg process. */
export interface LiveProgress {
  /** Position of the output in milliseconds. */
  outTimeMs: number;
  /** 1 means the source arrives in real time. */
  speed: number | null;
}

/**
 * Reads the "key=value" lines FFmpeg prints with "-progress". A report is
 * complete at its "progress=" line.
 */
export class LiveProgressReader {
  private buffer = '';
  private current: Record<string, string> = {};

  constructor(private readonly onProgress: (progress: LiveProgress) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      this.line(this.buffer.slice(0, newline).trim());
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf('\n');
    }
  }

  private line(line: string): void {
    const separator = line.indexOf('=');
    if (separator <= 0) {
      return;
    }
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).trim();
    if (key !== 'progress') {
      this.current[key] = value;
      return;
    }

    const report = this.current;
    this.current = {};
    const outTimeUs = Number(report.out_time_us ?? report.out_time_ms);
    if (!Number.isFinite(outTimeUs)) {
      return;
    }
    this.onProgress({
      outTimeMs: Math.max(0, Math.round(outTimeUs / 1000)),
      speed: number(report.speed?.replace(/x$/, '')),
    });
  }
}

function number(value: string | undefined): number | null {
  if (value === undefined || value === 'N/A') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
