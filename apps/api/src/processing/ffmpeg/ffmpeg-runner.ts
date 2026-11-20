// SPDX-License-Identifier: AGPL-3.0-only
import { spawn } from 'node:child_process';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { ProgressReader } from './progress.js';

/** How much of the program's error output is kept for the error message. */
const STDERR_TAIL_BYTES = 4_000;
/** Largest accepted ffprobe output. Probe results are a few kilobytes. */
const MAX_STDOUT_BYTES = 20 * 1024 * 1024;

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderrTail: string,
  ) {
    super(message);
    this.name = 'FfmpegError';
  }
}

/** Thrown when a run is stopped through its abort signal. */
export class FfmpegAbortedError extends Error {
  constructor() {
    super('The media process was cancelled');
    this.name = 'FfmpegAbortedError';
  }
}

/** Thrown when the program itself cannot be started. */
export class FfmpegNotFoundError extends Error {
  constructor(program: string) {
    super(
      `Could not start "${program}". Install FFmpeg, or set FFMPEG_PATH and FFPROBE_PATH to its location`,
    );
    this.name = 'FfmpegNotFoundError';
  }
}

export interface RunOptions {
  /** Stops the process when aborted. */
  signal?: AbortSignal;
  /** Called with the output position in milliseconds while FFmpeg works. */
  onPosition?: (outTimeMs: number) => void;
}

/**
 * Starts FFmpeg and ffprobe as child processes.
 *
 * Arguments are always passed as an array and never through a shell, so file
 * names and other values cannot be interpreted as commands.
 */
@Injectable()
export class FfmpegRunner {
  constructor(@Inject(AppConfig) private readonly config: AppConfig) {}

  /** Runs FFmpeg to completion. Progress reporting is added to the arguments automatically. */
  async ffmpeg(args: readonly string[], options: RunOptions = {}): Promise<void> {
    const reader = options.onPosition ? new ProgressReader(options.onPosition) : null;
    await this.run(
      this.config.ffmpegPath,
      [
        '-hide_banner',
        '-nostdin',
        '-nostats',
        '-loglevel',
        'error',
        '-progress',
        'pipe:1',
        ...args,
      ],
      options.signal,
      (chunk) => reader?.push(chunk),
    );
  }

  /** Runs ffprobe and returns what it printed. */
  async ffprobe(args: readonly string[], signal?: AbortSignal): Promise<string> {
    let output = '';
    await this.run(this.config.ffprobePath, ['-v', 'error', ...args], signal, (chunk) => {
      output += chunk;
      if (output.length > MAX_STDOUT_BYTES) {
        throw new Error('ffprobe produced more output than expected');
      }
    });
    return output;
  }

  /** Returns the first line of "ffmpeg -version", for logging at startup. */
  async version(): Promise<string> {
    let output = '';
    await this.run(this.config.ffmpegPath, ['-version'], undefined, (chunk) => {
      output += chunk;
    });
    return output.split('\n')[0]?.trim() ?? 'unknown';
  }

  private run(
    program: string,
    args: readonly string[],
    signal: AbortSignal | undefined,
    onStdout: (chunk: string) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new FfmpegAbortedError());
        return;
      }

      const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderrTail = '';
      let settled = false;
      let stdoutFailure: Error | null = null;

      const settle = (error?: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };

      const onAbort = (): void => {
        child.kill('SIGKILL');
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        try {
          onStdout(chunk);
        } catch (error) {
          stdoutFailure = error instanceof Error ? error : new Error(String(error));
          child.kill('SIGKILL');
        }
      });

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_BYTES);
      });

      child.on('error', (error: NodeJS.ErrnoException) => {
        settle(error.code === 'ENOENT' ? new FfmpegNotFoundError(program) : error);
      });

      child.on('close', (exitCode) => {
        if (signal?.aborted) {
          settle(new FfmpegAbortedError());
        } else if (stdoutFailure) {
          settle(stdoutFailure);
        } else if (exitCode === 0) {
          settle();
        } else {
          const detail = stderrTail.trim().split('\n').slice(-6).join(' | ');
          settle(
            new FfmpegError(
              `The media process failed${exitCode === null ? '' : ` with exit code ${exitCode}`}: ${detail || 'no error output'}`,
              exitCode,
              stderrTail,
            ),
          );
        }
      });
    });
  }
}
