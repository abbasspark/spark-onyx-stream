// SPDX-License-Identifier: AGPL-3.0-only
import type { MediaInfo } from '../processing/media/media-info.js';
import {
  ChannelRunner,
  type LiveEngine,
  type LiveProcessHandlers,
  retryDelaySeconds,
  type RunnerState,
} from './channel-runner.js';
import type { EncoderState } from './ingest-client.js';
import { parseSource } from './live-source.js';

const H264: MediaInfo = {
  container: 'mpegts',
  durationMs: null,
  sizeBytes: null,
  bitrate: null,
  video: {
    index: 0,
    codec: 'h264',
    width: 1280,
    height: 720,
    frameRate: 25,
    pixelFormat: 'yuv420p',
    profile: 'High',
    level: 31,
    rotation: 0,
  },
  audio: [],
  subtitles: [],
};

/** Stands in for FFmpeg: tests decide what a probe finds and what each process does. */
class FakeEngine implements LiveEngine {
  probes = 0;
  probeResult: () => Promise<MediaInfo> = async () => H264;
  processes: { args: string[]; handlers: LiveProcessHandlers; stopped: boolean }[] = [];

  async probe(_source: unknown, signal: AbortSignal): Promise<MediaInfo> {
    this.probes += 1;
    return Promise.race([
      this.probeResult(),
      new Promise<MediaInfo>((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted'))),
      ),
    ]);
  }

  async prepare(): Promise<void> {}

  start(args: string[], handlers: LiveProcessHandlers) {
    const entry = { args, handlers, stopped: false };
    this.processes.push(entry);
    return {
      pid: 1000 + this.processes.length,
      stop: () => {
        if (!entry.stopped) {
          entry.stopped = true;
          // A stopped process ends a moment later, as a real one does.
          setTimeout(() => handlers.onExit(255), 10);
        }
      },
    };
  }

  get last() {
    const process = this.processes.at(-1);
    if (!process) {
      throw new Error('No process was started');
    }
    return process;
  }
}

function setup(
  url = 'https://user:secret@example.com/a/live.m3u8',
  encoder?: () => Promise<EncoderState>,
) {
  const engine = new FakeEngine();
  const states: RunnerState[] = [];
  const runner = new ChannelRunner({
    source: parseSource(url),
    directory: '/tmp/onyx-live-test',
    processing: { mode: 'COPY', qualities: [] },
    preset: 'veryfast',
    segmentSeconds: 4,
    playlistSegments: 6,
    engine,
    encoder,
    onState: (state) => states.push(state),
  });
  return { engine, states, runner, status: () => states.at(-1)?.status };
}

/** Stops a runner while the clock is faked: the process needs a moment to end. */
async function halt(runner: ChannelRunner): Promise<void> {
  const stopping = runner.stop();
  await vi.advanceTimersByTimeAsync(20);
  await stopping;
}

const progress = (outTimeMs: number) => ({ outTimeMs, speed: 1 });

describe('retryDelaySeconds', () => {
  it('grows and then stays at half a minute', () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(retryDelaySeconds)).toEqual([1, 2, 5, 10, 30, 30, 30]);
  });
});

describe('ChannelRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is running once the first data arrived', async () => {
    const { engine, runner, states, status } = setup();
    runner.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(status()).toBe('STARTING');
    expect(states.at(-1)?.streams).toMatchObject({ videoCodec: 'h264', height: 720 });
    expect(engine.processes).toHaveLength(1);

    engine.last.handlers.onProgress(progress(0));
    expect(status()).toBe('STARTING');
    engine.last.handlers.onProgress(progress(1000));
    expect(status()).toBe('RUNNING');
    expect(states.at(-1)?.startedAt).toBeInstanceOf(Date);

    await halt(runner);
  });

  it('starts over with growing waits when the source goes away', async () => {
    const { engine, runner, states, status } = setup();
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    engine.last.handlers.onProgress(progress(1000));

    engine.last.handlers.onLog('Connection reset by peer');
    engine.last.handlers.onExit(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(status()).toBe('RECONNECTING');
    expect(states.at(-1)).toMatchObject({
      message: 'The stream stopped: Connection reset by peer. Trying again in 1 s',
      startedAt: null,
      restartCount: 1,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.processes).toHaveLength(2);
    engine.last.handlers.onExit(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)?.message).toContain('Trying again in 2 s');

    await vi.advanceTimersByTimeAsync(1999);
    expect(engine.processes).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.processes).toHaveLength(3);

    await halt(runner);
  });

  it('gives the last thing FFmpeg said as the reason, not a note of its own', async () => {
    const { engine, runner, states } = setup();
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    engine.last.handlers.onLog('[mp4] Malformed AAC bitstream detected');
    engine.last.handlers.onProgress(progress(1000));
    engine.last.handlers.onExit(255);
    await vi.advanceTimersByTimeAsync(0);

    expect(states.at(-1)?.message).toBe(
      'The stream stopped: [mp4] Malformed AAC bitstream detected. Trying again in 1 s',
    );
    await halt(runner);
  });

  it('shows a channel as failed after five attempts, and keeps trying', async () => {
    const { engine, runner, states, status } = setup();
    engine.probeResult = async () => {
      throw Object.assign(new Error('ffprobe failed'), {
        stderrTail: 'https://user:secret@example.com/a/live.m3u8: Server returned 404 Not Found\n',
      });
    };
    runner.start();

    await vi.advanceTimersByTimeAsync(0);
    expect(status()).toBe('RECONNECTING');
    // 1 + 2 + 5 + 10 seconds of waiting lead to the fifth attempt.
    await vi.advanceTimersByTimeAsync(18_000);
    expect(engine.probes).toBe(5);
    expect(status()).toBe('FAILED');
    expect(states.at(-1)?.message).toBe(
      'The source could not be read: https://example.com/…/live.m3u8: Server returned 404 Not Found. Trying again in 30 s',
    );

    await vi.advanceTimersByTimeAsync(30_000);
    expect(engine.probes).toBe(6);

    // When the source is back, so is the channel.
    engine.probeResult = async () => H264;
    await vi.advanceTimersByTimeAsync(30_000);
    engine.last.handlers.onProgress(progress(500));
    expect(status()).toBe('RUNNING');

    await halt(runner);
  });

  it('begins with short waits again after a healthy run', async () => {
    const { engine, runner, states } = setup();
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      engine.last.handlers.onExit(1);
      await vi.advanceTimersByTimeAsync(5000);
    }
    expect(engine.processes).toHaveLength(4);

    engine.last.handlers.onProgress(progress(1000));
    for (let second = 1; second <= 40; second += 1) {
      await vi.advanceTimersByTimeAsync(1000);
      engine.last.handlers.onProgress(progress(1000 + second * 1000));
    }
    engine.last.handlers.onExit(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)?.message).toContain('Trying again in 1 s');

    await halt(runner);
  });

  it('restarts a stream that stopped delivering', async () => {
    const { engine, runner, states } = setup();
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    engine.last.handlers.onProgress(progress(1000));

    // The process is alive and reports, but the position does not move.
    for (let second = 0; second < 22; second += 1) {
      await vi.advanceTimersByTimeAsync(1000);
      engine.processes[0]?.handlers.onProgress(progress(1000));
    }
    expect(engine.processes[0]?.stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(20);
    expect(states.at(-1)?.message).toContain('The source stopped sending');

    await halt(runner);
  });

  it('gives up on a source that never sends anything', async () => {
    const { engine, runner, states } = setup();
    runner.start();
    await vi.advanceTimersByTimeAsync(32_000);
    expect(engine.processes[0]?.stopped).toBe(true);
    expect(states.at(-1)?.message).toContain('The source sent nothing');
    await halt(runner);
  });

  it('gives a probe fifteen seconds', async () => {
    const { engine, runner, states } = setup();
    engine.probeResult = () => new Promise(() => undefined);
    runner.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(states.at(-1)?.message).toContain('The source did not answer');
    await halt(runner);
  });

  it('says so when the video would need re-encoding', async () => {
    const { engine, runner, states, status } = setup();
    engine.probeResult = async () => ({
      ...H264,
      video: H264.video && { ...H264.video, codec: 'mpeg2video' },
    });
    runner.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(status()).toBe('FAILED');
    expect(states.at(-1)?.message).toContain('MPEG2VIDEO');
    expect(engine.processes).toHaveLength(0);
    await halt(runner);
  });

  it('stops the process and stays stopped', async () => {
    const { engine, runner, states } = setup();
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    engine.last.handlers.onProgress(progress(1000));
    const reported = states.length;

    await halt(runner);

    expect(engine.last.stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(engine.processes).toHaveLength(1);
    expect(states).toHaveLength(reported);
  });

  it('can be stopped while it waits for the next attempt', async () => {
    const { engine, runner } = setup();
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    engine.last.handlers.onExit(1);
    await vi.advanceTimersByTimeAsync(0);

    await halt(runner);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(engine.processes).toHaveLength(1);
  });

  it('keeps the password of the source out of the log', async () => {
    const { engine, runner } = setup();
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    engine.last.handlers.onLog(
      '[https @ 0x55d1c2] Opening https://user:secret@example.com/a/live.m3u8 failed',
    );
    engine.last.handlers.onLog(
      '[https @ 0x77aa00] Opening https://user:secret@example.com/a/live.m3u8 failed',
    );

    const log = runner.snapshot().log;
    expect(log.join('\n')).not.toContain('secret');
    // The same line from another address in memory is the same line.
    expect(log.filter((line) => line.includes('Opening'))).toEqual([
      '[https] Opening https://example.com/…/live.m3u8 failed',
    ]);
    await halt(runner);
  });

  describe('for a channel that an encoder pushes', () => {
    it('waits for the encoder without counting failures', async () => {
      let encoder: EncoderState = 'absent';
      const { engine, runner, states, status } = setup(undefined, async () => encoder);
      runner.start();
      await vi.advanceTimersByTimeAsync(60_000);

      expect(status()).toBe('IDLE');
      expect(states.at(-1)).toMatchObject({ message: null, restartCount: 0 });
      expect(engine.probes).toBe(0);
      // Waiting is one state, not one report a second.
      expect(states).toHaveLength(1);

      encoder = 'ready';
      await vi.advanceTimersByTimeAsync(1000);
      expect(status()).toBe('STARTING');
      engine.last.handlers.onProgress(progress(1000));
      expect(status()).toBe('RUNNING');

      await halt(runner);
    });

    it('goes back to waiting when the encoder disconnects', async () => {
      let encoder: EncoderState = 'ready';
      const { engine, runner, states, status } = setup(undefined, async () => encoder);
      runner.start();
      await vi.advanceTimersByTimeAsync(0);
      engine.last.handlers.onProgress(progress(1000));
      expect(status()).toBe('RUNNING');

      encoder = 'absent';
      engine.last.handlers.onExit(0);
      await vi.advanceTimersByTimeAsync(0);
      expect(status()).toBe('IDLE');
      expect(states.at(-1)).toMatchObject({ startedAt: null, restartCount: 0 });

      encoder = 'ready';
      await vi.advanceTimersByTimeAsync(1000);
      expect(engine.processes).toHaveLength(2);

      await halt(runner);
    });

    it('still reports a stream that breaks while the encoder is sending', async () => {
      const { engine, runner, states, status } = setup(undefined, async () => 'ready');
      runner.start();
      await vi.advanceTimersByTimeAsync(0);
      engine.last.handlers.onExit(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(status()).toBe('RECONNECTING');
      expect(states.at(-1)?.restartCount).toBe(1);
      await halt(runner);
    });

    it('says so when the ingest server is away', async () => {
      const { runner, states, status } = setup(undefined, async () => 'unreachable');
      runner.start();
      await vi.advanceTimersByTimeAsync(3000);
      expect(status()).toBe('IDLE');
      expect(states.at(-1)?.message).toContain('ingest server cannot be reached');
      await halt(runner);
    });

    it('can be stopped while it waits', async () => {
      const { engine, runner } = setup(undefined, async () => 'absent');
      runner.start();
      await vi.advanceTimersByTimeAsync(2500);
      await halt(runner);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(engine.probes).toBe(0);
    });
  });
});
