// SPDX-License-Identifier: AGPL-3.0-only

/** The player reports about this often while it plays. */
export const BEAT_SECONDS = 30;
/** Two positions further apart than this are a jump, not time watched. */
const MAX_STEP_SECONDS = 2;

export interface Beat {
  /** Where the player is, in seconds. */
  position: number;
  /** Seconds played since the report before. */
  watched: number;
}

/**
 * Counts how long a video actually played, from the positions the player
 * passes through. Seeking forward or back adds nothing: only time that went
 * by while the video ran counts.
 */
export class BeatMeter {
  private last: number | null = null;
  private watched = 0;
  private position = 0;

  /** Takes the position of the player, as often as it tells. */
  tick(time: number): void {
    if (!Number.isFinite(time) || time < 0) {
      return;
    }
    if (this.last !== null) {
      const step = time - this.last;
      if (step > 0 && step <= MAX_STEP_SECONDS) {
        this.watched += step;
      }
    }
    this.last = time;
    this.position = time;
  }

  /** True when enough has gathered for a report. */
  get due(): boolean {
    return this.watched >= BEAT_SECONDS;
  }

  /** What to report, or null when nothing played since the last report. */
  take(): Beat | null {
    if (this.watched < 1) {
      return null;
    }
    const beat = {
      position: Math.round(this.position),
      watched: Math.round(this.watched * 10) / 10,
    };
    this.watched = 0;
    return beat;
  }
}

/**
 * Sends a report. It may be the last thing a page does, so the browser is
 * asked to finish it by itself. Nothing depends on the answer, and a report
 * that fails is not worth a word to the viewer.
 */
export function sendBeat(playId: string, beat: Beat): void {
  try {
    void fetch(`/v1/catalog/plays/${encodeURIComponent(playId)}/beat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(beat),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // A browser without fetch plays the video all the same.
  }
}
