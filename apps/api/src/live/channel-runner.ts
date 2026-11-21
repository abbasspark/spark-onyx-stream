// SPDX-License-Identifier: AGPL-3.0-only
import type { ChannelStatus } from '@onyx/database';
import type { MediaInfo } from '../processing/media/media-info.js';
import {
  buildLiveArgs,
  type ChannelProcessing,
  type OutputPlan,
  planOutput,
  type SourceStreams,
  UnsupportedSourceError,
} from './live-command.js';
import type { EncoderState } from './ingest-client.js';
import type { LiveProgress } from './live-progress.js';
import type { LiveSource } from './live-source.js';

/** Waits between attempts in seconds. The last one repeats for as long as the source is away. */
export const RETRY_DELAYS_SECONDS = [1, 2, 5, 10, 30] as const;
/** Failed attempts in a row after which a channel is shown as failed. It is still retried. */
export const FAILED_AFTER_ATTEMPTS = 5;
/** A run of this length counts as healthy: the next problem starts with short waits again. */
const HEALTHY_AFTER_MS = 30_000;
/** A running stream that delivers nothing for this long is restarted. */
const STALL_MS = 20_000;
/** Time a new process has to deliver its first data. */
const FIRST_DATA_MS = 30_000;
const PROBE_TIMEOUT_MS = 15_000;
/** How often a waiting channel asks whether its encoder has connected. */
const ENCODER_POLL_MS = 1000;
const LOG_LINES = 60;
/** What the H.264 reader says while it joins a running stream before the first key frame. Harmless and loud. */
const JOIN_NOISE = /non-existing PPS|decode_slice_header error|no frame!|Last message repeated/;

export function retryDelaySeconds(failures: number): number {
  const index = Math.min(Math.max(failures, 1), RETRY_DELAYS_SECONDS.length) - 1;
  return RETRY_DELAYS_SECONDS[index] as number;
}

/** A running FFmpeg process, as far as a runner needs it. */
export interface LiveProcess {
  readonly pid: number | null;
  /** Asks the process to end. The exit handler is called when it has. */
  stop(): void;
}

export interface LiveProcessHandlers {
  onProgress(progress: LiveProgress): void;
  onLog(line: string): void;
  onExit(code: number | null): void;
}

/** Everything a runner does outside its own memory. Replaced by a fake in tests. */
export interface LiveEngine {
  probe(source: LiveSource, signal: AbortSignal): Promise<MediaInfo>;
  /** Empties the output directory of a channel, creating it when missing, and ends what still writes into it. */
  prepare(directory: string): Promise<void>;
  /** Starts FFmpeg writing into a prepared directory. */
  start(args: string[], handlers: LiveProcessHandlers, directory: string): LiveProcess;
}

export interface RunnerState {
  status: ChannelStatus;
  message: string | null;
  /** When the current stream started delivering. Null while it is not running. */
  startedAt: Date | null;
  restartCount: number;
  /** Set once a probe succeeded. */
  streams: SourceStreams | null;
}

/** What a runner knows about its process, refreshed every second. */
export interface RunnerHealth {
  pid: number | null;
  /** 1 means the source arrives in real time. */
  speed: number | null;
  /** When data last arrived, as Unix milliseconds. */
  lastDataAt: number | null;
  /** The latest lines FFmpeg and the runner wrote, oldest first. */
  log: string[];
}

export interface RunnerOptions {
  source: LiveSource;
  directory: string;
  processing: ChannelProcessing;
  /** Speed setting of the H.264 encoder, for transcoded channels. */
  preset: string;
  segmentSeconds: number;
  playlistSegments: number;
  engine: LiveEngine;
  /**
   * Set for a channel that an encoder pushes: says whether the encoder is
   * sending. Such a channel waits for its encoder instead of failing.
   */
  encoder?: () => Promise<EncoderState>;
  onState(state: RunnerState): void;
}

/**
 * Keeps one channel running: probes the source, starts FFmpeg, watches that
 * data keeps arriving and starts over with growing waits when it does not.
 *
 * A runner never gives up. Live sources come back, sometimes after hours, and
 * a channel that has to be started by hand again is a channel that is down.
 */
export class ChannelRunner {
  private stopped = false;
  private finished: Promise<void> | null = null;
  private process: LiveProcess | null = null;
  private probeAbort: AbortController | null = null;
  private wake: (() => void) | null = null;

  private failures = 0;
  private state: RunnerState = {
    status: 'STARTING',
    message: null,
    startedAt: null,
    restartCount: 0,
    streams: null,
  };
  private readonly log: string[] = [];
  private speed: number | null = null;
  private lastDataAt: number | null = null;

  constructor(private readonly options: RunnerOptions) {}

  start(): void {
    this.finished ??= this.loop();
  }

  /** Stops the stream and resolves when the process has ended. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.probeAbort?.abort();
    this.process?.stop();
    this.wake?.();
    await this.finished;
  }

  snapshot(): RunnerHealth {
    return {
      pid: this.process?.pid ?? null,
      speed: this.process ? this.speed : null,
      lastDataAt: this.lastDataAt,
      log: [...this.log],
    };
  }

  current(): RunnerState {
    return this.state;
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      let reason: string;
      let unsupported = false;
      const attemptStartedAt = Date.now();

      if (!(await this.awaitEncoder())) {
        break;
      }

      try {
        // First, so nothing left over from an earlier run holds on to the source.
        await this.options.engine.prepare(this.options.directory);
        const plan = await this.probe();
        this.update({ streams: plan.streams });
        reason = await this.run(plan);
      } catch (error) {
        unsupported = error instanceof UnsupportedSourceError;
        reason = error instanceof Error ? error.message : String(error);
      }

      if (this.stopped) {
        break;
      }
      // An encoder that went away is not a fault of the channel: it waits for the next one.
      if (this.options.encoder && (await this.options.encoder()) !== 'ready') {
        this.failures = 0;
        this.note(this.clean(reason));
        continue;
      }

      const wasHealthy =
        this.state.startedAt !== null && Date.now() - attemptStartedAt >= HEALTHY_AFTER_MS;
      this.failures = wasHealthy ? 1 : this.failures + 1;
      const delay = unsupported ? 30 : retryDelaySeconds(this.failures);
      const message = `${this.clean(reason)}. Trying again in ${delay} s`;
      this.note(message);
      this.update({
        status: unsupported || this.failures >= FAILED_AFTER_ATTEMPTS ? 'FAILED' : 'RECONNECTING',
        message,
        startedAt: null,
        restartCount: this.state.restartCount + 1,
      });
      await this.sleep(delay * 1000);
    }
  }

  /**
   * For a pushed channel: waits until an encoder sends. Resolves at once for
   * other channels. False when the runner was stopped meanwhile.
   */
  private async awaitEncoder(): Promise<boolean> {
    const encoder = this.options.encoder;
    while (encoder && !this.stopped) {
      const state = await encoder();
      if (state === 'ready' || this.stopped) {
        break;
      }
      const message =
        state === 'unreachable'
          ? 'The ingest server cannot be reached, so encoders cannot connect'
          : null;
      if (this.state.status !== 'IDLE' || this.state.message !== message) {
        this.note(message ?? 'Waiting for the encoder to connect');
        this.update({ status: 'IDLE', message, startedAt: null });
      }
      await this.sleep(ENCODER_POLL_MS);
    }
    if (encoder && !this.stopped && this.state.status === 'IDLE') {
      this.note('The encoder connected');
      this.update({ status: 'STARTING', message: null });
    }
    return !this.stopped;
  }

  private async probe(): Promise<OutputPlan> {
    this.note(`Connecting to ${this.options.source.label}`);
    this.probeAbort = new AbortController();
    const timeout = setTimeout(() => this.probeAbort?.abort(), PROBE_TIMEOUT_MS);
    try {
      return planOutput(
        await this.options.engine.probe(this.options.source, this.probeAbort.signal),
        this.options.processing,
      );
    } catch (error) {
      if (error instanceof UnsupportedSourceError) {
        throw error;
      }
      throw new Error(
        this.probeAbort.signal.aborted
          ? 'The source did not answer'
          : `The source could not be read: ${lastLine(error)}`,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
      this.probeAbort = null;
    }
  }

  /** Runs FFmpeg until it ends. Resolves with the reason it ended. */
  private run(plan: OutputPlan): Promise<string> {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      let lastOutTimeMs = 0;
      let lastAdvanceAt = startedAt;
      let stalled = false;
      this.speed = null;

      const watchdog = setInterval(() => {
        const limit = this.state.startedAt ? STALL_MS : FIRST_DATA_MS;
        if (!stalled && Date.now() - lastAdvanceAt > limit) {
          stalled = true;
          this.process?.stop();
        }
      }, 1000);

      this.process = this.options.engine.start(
        buildLiveArgs(this.options.source, plan, {
          directory: this.options.directory,
          segmentSeconds: this.options.segmentSeconds,
          playlistSegments: this.options.playlistSegments,
          runId: startedAt.toString(36),
          preset: this.options.preset,
        }),
        {
          onProgress: (progress) => {
            this.speed = progress.speed;
            if (progress.outTimeMs <= lastOutTimeMs) {
              return;
            }
            lastOutTimeMs = progress.outTimeMs;
            lastAdvanceAt = Date.now();
            this.lastDataAt = lastAdvanceAt;
            if (!this.state.startedAt && !this.stopped) {
              this.note('The stream is running');
              this.update({ status: 'RUNNING', message: null, startedAt: new Date() });
            }
          },
          onLog: (line) => this.note(line),
          onExit: (code) => {
            clearInterval(watchdog);
            this.process = null;
            const last = this.log.at(-1);
            resolve(
              stalled
                ? this.state.startedAt
                  ? 'The source stopped sending'
                  : 'The source sent nothing'
                : code === 0
                  ? 'The source ended the stream'
                  : `The stream stopped${last ? `: ${last}` : ''}`,
            );
          },
        },
        this.options.directory,
      );
      if (this.stopped) {
        this.process.stop();
      }
    });
  }

  private update(change: Partial<RunnerState>): void {
    this.state = { ...this.state, ...change };
    this.options.onState(this.state);
  }

  /** Waits, unless the runner is stopped first. */
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

  /**
   * Adds a line to the log. FFmpeg repeats itself a lot while it joins a
   * running stream, so a line that was just written is not written again.
   */
  private note(line: string): void {
    const text = this.clean(line)
      .replace(/ @ 0x[0-9a-f]+\]/, ']')
      .trim();
    if (!text || JOIN_NOISE.test(text) || this.log.slice(-6).includes(text)) {
      return;
    }
    this.log.push(text.length > 300 ? `${text.slice(0, 300)}…` : text);
    if (this.log.length > LOG_LINES) {
      this.log.shift();
    }
  }

  /** The address of a source may carry a password. It never appears in a log or message. */
  private clean(text: string): string {
    return text.replaceAll(this.options.source.url, this.options.source.label).replace(/\.$/, '');
  }
}

function lastLine(error: unknown): string {
  const text =
    error !== null && typeof error === 'object' && 'stderrTail' in error && error.stderrTail
      ? String(error.stderrTail)
      : error instanceof Error
        ? error.message
        : String(error);
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .at(-1) ?? 'no details'
  );
}
