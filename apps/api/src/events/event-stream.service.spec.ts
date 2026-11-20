// SPDX-License-Identifier: AGPL-3.0-only
import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import {
  EventStreamService,
  HEARTBEAT_MS,
  MAX_STREAM_MS,
  MAX_STREAMS,
  type StreamTarget,
  toServerSentEvent,
} from './event-stream.service.js';
import { LIVE_EVENTS_CHANNEL, type LiveEvent, parseLiveEvent } from './live-events.js';

/** Stands in for the Redis connection in subscriber mode. */
class FakeSubscriber extends EventEmitter {
  channels: string[] = [];
  disconnected = false;
  async subscribe(channel: string): Promise<void> {
    this.channels.push(channel);
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeTarget implements StreamTarget {
  written: string[] = [];
  ended = false;
  write(chunk: string): boolean {
    this.written.push(chunk);
    return true;
  }
  end(): void {
    this.ended = true;
  }
  /** Everything written after the greeting. */
  get events(): string[] {
    return this.written.slice(1);
  }
}

const JOB_EVENT: LiveEvent = {
  type: 'job',
  jobId: 'job-1',
  assetId: 'asset-1',
  jobType: 'TRANSCODE',
  status: 'RUNNING',
  progress: 40,
};
const ASSET_EVENT: LiveEvent = { type: 'asset', assetId: 'asset-1', change: 'updated' };

describe('EventStreamService', () => {
  let subscriber: FakeSubscriber;
  let service: EventStreamService;

  beforeEach(async () => {
    vi.useFakeTimers();
    subscriber = new FakeSubscriber();
    service = new EventStreamService({ duplicate: () => subscriber } as unknown as Redis);
    await service.onApplicationBootstrap();
  });

  afterEach(() => {
    service.beforeApplicationShutdown();
    service.onApplicationShutdown();
    vi.useRealTimers();
  });

  it('listens on the event channel and greets a new listener', () => {
    const target = new FakeTarget();
    service.add(target, ['jobs:read']);

    expect(subscriber.channels).toEqual([LIVE_EVENTS_CHANNEL]);
    expect(target.written).toEqual(['retry: 3000\n: connected\n\n']);
    expect(service.size).toBe(1);
  });

  it('passes on an event from the channel in server-sent event form', () => {
    const target = new FakeTarget();
    service.add(target, ['jobs:read', 'assets:read']);

    subscriber.emit('message', LIVE_EVENTS_CHANNEL, JSON.stringify(JOB_EVENT));

    expect(target.events).toEqual([`event: job\ndata: ${JSON.stringify(JOB_EVENT)}\n\n`]);
  });

  it('sends each listener only what its permissions allow', () => {
    const jobsOnly = new FakeTarget();
    const assetsOnly = new FakeTarget();
    const nothing = new FakeTarget();
    service.add(jobsOnly, ['jobs:read']);
    service.add(assetsOnly, ['assets:read']);
    service.add(nothing, ['audit:read']);

    service.deliver(JOB_EVENT);
    service.deliver({ type: 'job-progress', jobId: 'job-1', progress: 55 });
    service.deliver(ASSET_EVENT);

    expect(jobsOnly.events).toHaveLength(2);
    expect(assetsOnly.events).toEqual([toServerSentEvent(ASSET_EVENT)]);
    expect(nothing.events).toEqual([]);
  });

  it('ignores channel messages that are not events', () => {
    const target = new FakeTarget();
    service.add(target, ['jobs:read', 'assets:read']);

    subscriber.emit('message', LIVE_EVENTS_CHANNEL, 'not json');
    subscriber.emit('message', LIVE_EVENTS_CHANNEL, JSON.stringify({ type: 'secret', value: 1 }));
    subscriber.emit('message', LIVE_EVENTS_CHANNEL, 'null');

    expect(target.events).toEqual([]);
  });

  it('stops sending after the listener was removed', () => {
    const target = new FakeTarget();
    const stop = service.add(target, ['jobs:read']);

    stop?.();
    service.deliver(JOB_EVENT);

    expect(target.events).toEqual([]);
    expect(service.size).toBe(0);
  });

  it('sends a keep-alive line to quiet connections', () => {
    const target = new FakeTarget();
    service.add(target, []);

    vi.advanceTimersByTime(HEARTBEAT_MS);

    expect(target.events).toEqual([': keep-alive\n\n']);
  });

  it('ends a stream after the maximum time, so the session is checked again', () => {
    const target = new FakeTarget();
    service.add(target, ['jobs:read']);

    vi.advanceTimersByTime(MAX_STREAM_MS);

    expect(target.ended).toBe(true);
    expect(service.size).toBe(0);
  });

  it('drops a listener whose connection breaks while writing', () => {
    const broken: StreamTarget = {
      write: vi
        .fn()
        .mockReturnValueOnce(true)
        .mockImplementation(() => {
          throw new Error('socket closed');
        }),
      end: vi.fn(),
    };
    const healthy = new FakeTarget();
    service.add(broken, ['jobs:read']);
    service.add(healthy, ['jobs:read']);

    service.deliver(JOB_EVENT);

    expect(service.size).toBe(1);
    expect(healthy.events).toHaveLength(1);
  });

  it('refuses more streams than the limit', () => {
    for (let index = 0; index < MAX_STREAMS; index += 1) {
      expect(service.add(new FakeTarget(), [])).not.toBeNull();
    }

    expect(service.add(new FakeTarget(), [])).toBeNull();
    expect(service.size).toBe(MAX_STREAMS);
  });

  it('ends every stream before the server closes, and refuses new ones', () => {
    const target = new FakeTarget();
    service.add(target, []);

    service.beforeApplicationShutdown();

    expect(target.ended).toBe(true);
    expect(service.size).toBe(0);
    expect(service.add(new FakeTarget(), [])).toBeNull();

    // No keep-alive is written to a closed stream.
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    expect(target.events).toEqual([]);
  });

  it('ends the subscription on shutdown', () => {
    service.onApplicationShutdown();

    expect(subscriber.disconnected).toBe(true);
  });
});

describe('parseLiveEvent', () => {
  it('reads valid events and rejects everything else', () => {
    expect(parseLiveEvent(JSON.stringify(ASSET_EVENT))).toEqual(ASSET_EVENT);
    expect(parseLiveEvent('{"type":"other"}')).toBeNull();
    expect(parseLiveEvent('{"type":42}')).toBeNull();
    expect(parseLiveEvent('[]')).toBeNull();
    expect(parseLiveEvent('')).toBeNull();
  });
});
