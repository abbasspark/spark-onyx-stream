// SPDX-License-Identifier: AGPL-3.0-only
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FfmpegLiveEngine } from './ffmpeg-live-engine.js';

/** A process that does nothing for a minute, with extra words on its command line. */
function idle(...words: string[]): ChildProcess {
  return spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', ...words], {
    stdio: 'ignore',
  });
}

const ended = (child: ChildProcess): Promise<void> =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
    } else {
      child.once('exit', () => resolve());
    }
  });

describe('FfmpegLiveEngine.prepare', () => {
  const engine = new FfmpegLiveEngine({ ffmpegPath: 'ffmpeg' } as never, {} as never);
  let root: string;
  let directory: string;
  const children: ChildProcess[] = [];

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'onyx-live-engine-'));
    directory = path.join(root, 'channel');
    await mkdir(directory);
  });
  afterEach(async () => {
    for (const child of children.splice(0)) {
      child.kill('SIGKILL');
    }
    await rm(root, { recursive: true, force: true });
  });

  it('empties the folder and creates it when missing', async () => {
    await writeFile(path.join(directory, 'seg-1.m4s'), 'old');
    await engine.prepare(directory);
    expect(await readdir(directory)).toEqual([]);

    await engine.prepare(path.join(root, 'new'));
    expect(await readdir(path.join(root, 'new'))).toEqual([]);
  });

  it('ends a process that was left writing into the folder', async () => {
    const leftover = idle(path.join(directory, 'index.m3u8'));
    children.push(leftover);
    await writeFile(path.join(directory, 'ffmpeg.pid'), String(leftover.pid));

    await engine.prepare(directory);
    await ended(leftover);
    expect(leftover.signalCode).toBe('SIGKILL');
  });

  it('leaves a process alone that only happens to have the remembered id', async () => {
    const stranger = idle('/somewhere/else/index.m3u8');
    children.push(stranger);
    await writeFile(path.join(directory, 'ffmpeg.pid'), String(stranger.pid));

    await engine.prepare(directory);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(stranger.exitCode).toBeNull();
    expect(stranger.signalCode).toBeNull();
  });

  it('copes with a remembered id that is nonsense or gone', async () => {
    await writeFile(path.join(directory, 'ffmpeg.pid'), 'not a number');
    await engine.prepare(directory);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'ffmpeg.pid'), '2147483646');
    await engine.prepare(directory);
    expect(await readdir(directory)).toEqual([]);
  });
});
