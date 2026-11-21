// SPDX-License-Identifier: AGPL-3.0-only
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { FfmpegRunner } from '../processing/ffmpeg/ffmpeg-runner.js';
import { type MediaInfo, parseProbe } from '../processing/media/media-info.js';
import type { LiveEngine, LiveProcess, LiveProcessHandlers } from './channel-runner.js';
import { buildProbeArgs } from './live-command.js';
import { LiveProgressReader } from './live-progress.js';
import type { LiveSource } from './live-source.js';

/** Time a process gets to end by itself before it is killed. */
const KILL_AFTER_MS = 5000;
/** Holds the process id of the FFmpeg that writes into a channel's folder. Never served. */
const PID_FILE = 'ffmpeg.pid';
const run = promisify(execFile);

/** Runs the FFmpeg processes of live channels. */
@Injectable()
export class FfmpegLiveEngine implements LiveEngine {
  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(FfmpegRunner) private readonly ffmpeg: FfmpegRunner,
  ) {}

  async probe(source: LiveSource, signal: AbortSignal): Promise<MediaInfo> {
    return parseProbe(await this.ffmpeg.ffprobe(buildProbeArgs(source), signal));
  }

  async prepare(directory: string): Promise<void> {
    await this.endLeftover(directory);
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
  }

  /**
   * Ends an FFmpeg that a live process left behind when it was killed. It
   * would go on writing into the folder and hold on to the source.
   *
   * A process id can be given to another program later, so the process is
   * only ended when it is an FFmpeg that writes into this very folder.
   */
  private async endLeftover(directory: string): Promise<void> {
    const pid = Number(await readFile(path.join(directory, PID_FILE), 'utf8').catch(() => ''));
    if (!Number.isInteger(pid) || pid <= 1) {
      return;
    }
    const command = await commandOf(pid);
    if (!command?.includes(directory)) {
      return;
    }
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      return;
    }
    for (let waited = 0; waited < 3000 && isAlive(pid); waited += 50) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  start(args: string[], handlers: LiveProcessHandlers, directory: string): LiveProcess {
    // Arguments go as a list and never through a shell.
    const child = spawn(this.config.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    if (child.pid) {
      void writeFile(path.join(directory, PID_FILE), String(child.pid)).catch(() => undefined);
    }
    const reader = new LiveProgressReader(handlers.onProgress);
    let ended = false;
    let pending = '';

    child.stdout.setEncoding('utf8').on('data', (chunk: string) => reader.push(chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        handlers.onLog(line);
      }
    });

    const finish = (code: number | null): void => {
      if (ended) {
        return;
      }
      ended = true;
      if (pending) {
        handlers.onLog(pending);
      }
      handlers.onExit(code);
    };
    child.on('error', (error) => {
      handlers.onLog(`FFmpeg could not be started: ${error.message}`);
      finish(null);
    });
    child.on('close', (code) => finish(code));

    return {
      pid: child.pid ?? null,
      stop: () => {
        if (ended || child.exitCode !== null) {
          return;
        }
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!ended) {
            child.kill('SIGKILL');
          }
        }, KILL_AFTER_MS).unref();
      },
    };
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The command line of a running process. Null when it is gone or cannot be read. */
async function commandOf(pid: number): Promise<string | null> {
  try {
    return (await readFile(`/proc/${pid}/cmdline`, 'utf8')).replaceAll('\0', ' ');
  } catch {
    // No /proc, as on macOS.
  }
  try {
    return (await run('ps', ['-p', String(pid), '-o', 'args='])).stdout;
  } catch {
    return null;
  }
}
