// SPDX-License-Identifier: AGPL-3.0-only
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { LIVE_PLAYLIST_NAME } from '../live/live-command.js';
import { parseVariants } from '../live/live-playlist.js';
import { buildRecordArgs, parseDatedSegments, pickStart } from './recording-plan.js';

/** Wait between looks at a channel that has nothing to record yet. */
const WAIT_MS = 2000;
/** Time after the planned end in which the last segments may still arrive. */
const TAIL_MS = 20_000;
/** A part shorter than this is not worth keeping. */
const MIN_PART_SECONDS = 1;

export interface RecordingRunnerOptions {
  /** Directory of the channel's playlist and segments. */
  channelDirectory: string;
  /** Directory the parts of this recording are written to. */
  workDirectory: string;
  startsAt: Date;
  endsAt: Date;
  ffmpegPath: string;
  /** Length of a written file in seconds. 0 when it cannot be read. */
  measure(file: string): Promise<number>;
}

export interface RecordedParts {
  /** The files that were written, in order. */
  parts: string[];
  /** What they hold together, in seconds. */
  seconds: number;
}

/**
 * Records a stretch of a channel by copying from the channel's own playlist.
 *
 * It goes on from the segment that covers the wanted start, which reaches
 * back as far as the channel keeps. When the channel is off air or restarts,
 * it waits and continues in a new part, so a recording has gaps where the
 * channel had them and is otherwise complete.
 */
export class RecordingRunner {
  private stopped = false;
  private endsAt: number;
  private child: ChildProcess | null = null;
  private wake: (() => void) | null = null;

  constructor(private readonly options: RecordingRunnerOptions) {
    this.endsAt = options.endsAt.getTime();
  }

  /** Ends the recording at another moment than planned. Now, to stop it and keep what is there. */
  setEnd(endsAt: Date): void {
    this.endsAt = endsAt.getTime();
    if (this.endsAt <= Date.now()) {
      this.interrupt();
    }
  }

  /** Stops writing at once. What was written so far stays on disk. */
  stop(): void {
    this.stopped = true;
    this.interrupt();
  }

  async run(): Promise<RecordedParts> {
    const { workDirectory, measure } = this.options;
    await mkdir(workDirectory, { recursive: true });

    // Parts from before a restart of the live process are kept and counted.
    const parts: string[] = [];
    let seconds = 0;
    for (const name of (await readdir(workDirectory)).filter(isPart).sort(byNumber)) {
      const file = path.join(workDirectory, name);
      const length = await measure(file);
      if (length >= MIN_PART_SECONDS) {
        parts.push(file);
        seconds += length;
      } else {
        await rm(file, { force: true });
      }
    }
    let number = parts.length === 0 ? 0 : partNumber(path.basename(parts.at(-1) as string)) + 1;
    /** Everything before this moment is recorded, or lost. */
    let position = Math.max(this.options.startsAt.getTime(), parts.length > 0 ? Date.now() : 0);

    while (!this.stopped && position < this.endsAt - 1000 && Date.now() < this.endsAt + TAIL_MS) {
      const playlist = await this.playlist();
      const start = playlist ? pickStart(playlist.segments, position) : null;
      if (!playlist || !start) {
        await this.sleep(WAIT_MS);
        continue;
      }
      const wanted = (this.endsAt - start.at) / 1000;
      if (wanted < MIN_PART_SECONDS) {
        break;
      }

      const file = path.join(workDirectory, `part-${number}.mp4`);
      number += 1;
      await this.copy(buildRecordArgs(playlist.path, start.index, wanted, file));

      const length = await measure(file);
      if (length >= MIN_PART_SECONDS) {
        parts.push(file);
        seconds += length;
        position = start.at + length * 1000;
      } else {
        await rm(file, { force: true });
        // Nothing came of it: the channel went away. Look again in a moment.
        await this.sleep(WAIT_MS);
      }
    }
    return { parts, seconds };
  }

  /**
   * The playlist to record from, with its segments: the channel's own for a
   * channel in one quality, the best one for a channel in several.
   */
  private async playlist(): Promise<{
    path: string;
    segments: ReturnType<typeof parseDatedSegments>;
  } | null> {
    const directory = this.options.channelDirectory;
    try {
      let file = path.join(directory, LIVE_PLAYLIST_NAME);
      let text = await readFile(file, 'utf8');
      const best = parseVariants(text)[0];
      if (best !== undefined) {
        if (path.basename(best) !== best) {
          return null;
        }
        file = path.join(directory, best);
        text = await readFile(file, 'utf8');
      }
      return { path: file, segments: parseDatedSegments(text) };
    } catch {
      // The channel is not on air.
      return null;
    }
  }

  /** Runs FFmpeg until it has copied what was asked, the channel ends, or the time is up. */
  private copy(args: string[]): Promise<void> {
    return new Promise((resolve) => {
      const child = spawn(this.options.ffmpegPath, args, { stdio: 'ignore' });
      this.child = child;
      // FFmpeg waits for segments that never come when a channel stops for good.
      const limit = setTimeout(
        () => this.interrupt(),
        Math.max(1000, this.endsAt + TAIL_MS - Date.now()),
      );
      const done = (): void => {
        clearTimeout(limit);
        if (this.child === child) {
          this.child = null;
        }
        resolve();
      };
      child.once('error', done);
      child.once('close', done);
      if (this.stopped) {
        this.interrupt();
      }
    });
  }

  /** Asks FFmpeg to finish its file and end, and ends a wait. */
  private interrupt(): void {
    const child = this.child;
    if (child && child.exitCode === null) {
      child.kill('SIGINT');
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL');
        }
      }, 5000).unref();
    }
    this.wake?.();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wake = done;
    });
  }
}

function isPart(name: string): boolean {
  return /^part-\d+\.mp4$/.test(name);
}

function partNumber(name: string): number {
  return Number(/^part-(\d+)\.mp4$/.exec(name)?.[1] ?? 0);
}

function byNumber(a: string, b: string): number {
  return partNumber(a) - partNumber(b);
}
