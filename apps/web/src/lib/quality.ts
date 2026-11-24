// SPDX-License-Identifier: AGPL-3.0-only
//
// How a playback went, counted in the player and reported to the server for
// the figures in the panel: how long the video took to start, how often it
// stopped to load, in what quality it played and what ended it. Nothing here
// is needed for watching, so nothing here may get in its way.

/** The player reports about this often while a video is on. */
export const REPORT_EVERY_MS = 30_000;
/** Two positions further apart than this are a jump, not time played. */
const MAX_STEP_SECONDS = 2;

/** What this player calls itself in its reports. */
export const PLAYER_NAME = 'web';

export type ErrorCode =
  'network' | 'media' | 'unsupported' | 'expired' | 'key' | 'timeout' | 'other';

/** Everything counted since the playback began. Each report holds all of it. */
export interface QualityReport {
  startupMs?: number;
  played: number;
  stalls: number;
  stallMs: number;
  qualityChanges: number;
  bitrateKbps?: number;
  height?: number;
  droppedFrames?: number;
  recoveredErrors?: number;
  error?: { code: ErrorCode; message?: string; position?: number };
  ended?: boolean;
  player: { name: string; version?: string };
}

/**
 * Counts how one playback goes, from what the video element and the
 * streaming library tell.
 *
 * - **The start** runs from the wish to play to the first picture. When the
 *   browser refuses to start by itself, the wish is the viewer's click, not
 *   the opening of the page.
 * - **A stall** is the video stopping to load after it had started. Loading
 *   after a jump is the viewer's doing and is not counted, and neither is
 *   anything while the video is paused.
 * - **Time played** is counted from the positions the video passes through,
 *   so a jump adds nothing.
 */
export class QualityMeter {
  private wishedAt: number | null;
  private startupMs: number | null = null;
  private last: number | null = null;
  private played = 0;
  private stalls = 0;
  private stallMs = 0;
  private stallSince: number | null = null;
  /** True from a jump until the video plays again. */
  private jumping = false;
  private paused = false;
  private changes = 0;
  private bitrate: number | null = null;
  private height: number | null = null;
  private bitrateSeconds = 0;
  private bitrateSum = 0;
  private readonly heightSeconds = new Map<number, number>();
  private dropped = 0;
  private recovered = 0;
  private error: QualityReport['error'];
  private ended = false;
  private sentAt: number;
  private changed = false;

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly version?: string,
  ) {
    this.wishedAt = this.now();
    this.sentAt = this.now();
  }

  get hasStarted(): boolean {
    return this.startupMs !== null;
  }

  /** The browser did not start the video by itself: the clock waits for the viewer. */
  hold(): void {
    if (!this.hasStarted) {
      this.wishedAt = null;
    }
  }

  /** The video was told to play. After a hold, this is the wish to play. */
  play(): void {
    this.paused = false;
    if (!this.hasStarted && this.wishedAt === null) {
      this.wishedAt = this.now();
    }
  }

  pause(): void {
    this.paused = true;
    // Whoever pauses a loading video is not waiting for it any more.
    this.endStall();
  }

  /** Pictures are moving. */
  playing(): void {
    this.paused = false;
    if (!this.hasStarted) {
      this.startupMs = this.wishedAt === null ? 0 : Math.max(0, this.now() - this.wishedAt);
      this.changed = true;
    }
    this.endStall();
    this.jumping = false;
  }

  /** The video stopped to load. */
  waiting(): void {
    if (this.hasStarted && !this.jumping && !this.paused && !this.ended && !this.error) {
      if (this.stallSince === null) {
        this.stallSince = this.now();
        this.stalls += 1;
      }
    }
  }

  /** The viewer jumped to another place. */
  seeking(): void {
    this.jumping = true;
    // A stall that a jump interrupts ends there.
    this.endStall();
    this.last = null;
  }

  /** The position of the video, as often as it tells. */
  tick(time: number): void {
    if (!Number.isFinite(time) || time < 0) {
      return;
    }
    if (this.last !== null) {
      const step = time - this.last;
      if (step > 0 && step <= MAX_STEP_SECONDS) {
        this.played += step;
        if (this.bitrate !== null) {
          this.bitrateSeconds += step;
          this.bitrateSum += step * this.bitrate;
        }
        if (this.height !== null) {
          this.heightSeconds.set(this.height, (this.heightSeconds.get(this.height) ?? 0) + step);
        }
      }
    }
    this.last = time;
  }

  /** The quality that plays now. The first one is not a change. */
  level(height: number | null, bitsPerSecond: number | null): void {
    const next = height && height > 0 ? height : null;
    if (this.height !== null && next !== null && next !== this.height) {
      this.changes += 1;
    }
    this.height = next ?? this.height;
    this.bitrate = bitsPerSecond && bitsPerSecond > 0 ? bitsPerSecond / 1000 : this.bitrate;
  }

  /** Frames the device skipped so far, as the browser counts them. */
  droppedFrames(count: number | undefined): void {
    if (count !== undefined && Number.isFinite(count) && count > this.dropped) {
      this.dropped = count;
    }
  }

  /** The player got over a problem by itself. */
  recoveredError(): void {
    this.recovered += 1;
  }

  /** A problem ended the playback. The first one is the one that counts. */
  fail(code: ErrorCode, message?: string, position?: number): void {
    this.endStall();
    if (!this.error) {
      this.error = {
        code,
        ...(message ? { message } : {}),
        ...(position !== undefined && Number.isFinite(position) ? { position } : {}),
      };
      this.changed = true;
    }
  }

  /** The video ended or is being left. */
  end(): void {
    this.endStall();
    if (!this.ended) {
      this.ended = true;
      this.changed = true;
    }
  }

  /** True when there is news worth a report right away, or the usual time has passed. */
  get due(): boolean {
    return this.changed || this.now() - this.sentAt >= REPORT_EVERY_MS;
  }

  /** Everything counted so far. Taking it starts the wait for the next report. */
  take(): QualityReport {
    this.sentAt = this.now();
    this.changed = false;
    const openStall = this.stallSince === null ? 0 : this.now() - this.stallSince;
    const mostPlayed = [...this.heightSeconds].sort((a, b) => b[1] - a[1])[0]?.[0] ?? this.height;
    return {
      ...(this.startupMs === null ? {} : { startupMs: Math.round(this.startupMs) }),
      played: Math.round(this.played * 10) / 10,
      stalls: this.stalls,
      stallMs: Math.round(this.stallMs + openStall),
      qualityChanges: this.changes,
      ...(this.bitrateSeconds > 0
        ? { bitrateKbps: Math.round(this.bitrateSum / this.bitrateSeconds) }
        : {}),
      ...(mostPlayed ? { height: mostPlayed } : {}),
      ...(this.dropped > 0 ? { droppedFrames: this.dropped } : {}),
      ...(this.recovered > 0 ? { recoveredErrors: this.recovered } : {}),
      ...(this.error ? { error: this.error } : {}),
      ...(this.ended ? { ended: true } : {}),
      player: { name: PLAYER_NAME, ...(this.version ? { version: this.version } : {}) },
    };
  }

  private endStall(): void {
    if (this.stallSince !== null) {
      this.stallMs += Math.max(0, this.now() - this.stallSince);
      this.stallSince = null;
    }
  }
}

/**
 * Sends a report. It may be the last thing a page does, so the browser is
 * asked to finish it by itself. Nothing depends on the answer, and a report
 * that fails is not worth a word to the viewer.
 */
export function sendQualityReport(qualityId: string, report: QualityReport): void {
  try {
    void fetch(`/v1/playback/sessions/${encodeURIComponent(qualityId)}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // A browser without fetch plays the video all the same.
  }
}
