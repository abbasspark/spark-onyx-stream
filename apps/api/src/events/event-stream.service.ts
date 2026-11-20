// SPDX-License-Identifier: AGPL-3.0-only
import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Permission } from '../auth/permissions.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import {
  EVENT_PERMISSIONS,
  LIVE_EVENTS_CHANNEL,
  type LiveEvent,
  parseLiveEvent,
} from './live-events.js';

/** A comment line is sent this often, so proxies do not close a quiet connection. */
export const HEARTBEAT_MS = 20_000;
/**
 * A stream is ended after this time and the panel connects again. That checks
 * the session anew, so a revoked session stops receiving events.
 */
export const MAX_STREAM_MS = 15 * 60_000;
/** Open streams per process. More are refused, so a faulty client cannot use up all sockets. */
export const MAX_STREAMS = 500;

/** The part of an HTTP response the stream needs. Kept small so tests can stand in for it. */
export interface StreamTarget {
  write(chunk: string): boolean;
  end(): void;
}

interface Listener {
  target: StreamTarget;
  permissions: ReadonlySet<Permission>;
  timer: NodeJS.Timeout;
}

/** Formats one event as a server-sent event. */
export function toServerSentEvent(event: LiveEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Passes live events on to the admin panels connected to this API process.
 *
 * Events arrive on a Redis channel, so it does not matter which process
 * caused them. Each listener only gets the kinds of events its permissions allow.
 */
@Injectable()
export class EventStreamService
  implements OnApplicationBootstrap, BeforeApplicationShutdown, OnApplicationShutdown
{
  private readonly logger = new Logger(EventStreamService.name);
  private readonly listeners = new Set<Listener>();
  private subscriber: Redis | null = null;
  private heartbeat: NodeJS.Timeout | undefined;
  private stopping = false;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationBootstrap(): Promise<void> {
    // A connection in subscriber mode cannot run other commands, so it needs its own.
    this.subscriber = this.redis.duplicate();
    this.subscriber.on('error', (error: Error) =>
      this.logger.warn(`Event channel error: ${error.message}`),
    );
    this.subscriber.on('message', (_channel: string, message: string) => {
      const event = parseLiveEvent(message);
      if (event) {
        this.deliver(event);
      }
    });
    await this.subscriber.subscribe(LIVE_EVENTS_CHANNEL);

    this.heartbeat = setInterval(() => this.writeToAll(': keep-alive\n\n'), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  /**
   * Ends every stream before the HTTP server closes. An open stream would
   * otherwise keep the server, and with it the whole process, from stopping.
   */
  beforeApplicationShutdown(): void {
    this.stopping = true;
    clearInterval(this.heartbeat);
    for (const listener of this.listeners) {
      clearTimeout(listener.timer);
      listener.target.end();
    }
    this.listeners.clear();
  }

  onApplicationShutdown(): void {
    this.subscriber?.disconnect();
  }

  /** Number of open streams, for tests and health information. */
  get size(): number {
    return this.listeners.size;
  }

  /**
   * Starts sending events to a response.
   *
   * @returns A function that stops it, to call when the client disconnects.
   * Null when too many streams are open already or the process is stopping.
   */
  add(target: StreamTarget, permissions: readonly Permission[]): (() => void) | null {
    if (this.stopping || this.listeners.size >= MAX_STREAMS) {
      return null;
    }

    const listener: Listener = {
      target,
      permissions: new Set(permissions),
      timer: setTimeout(() => {
        this.remove(listener);
        target.end();
      }, MAX_STREAM_MS),
    };
    listener.timer.unref();
    this.listeners.add(listener);

    // Tells the browser how long to wait before connecting again, and confirms the stream works.
    target.write('retry: 3000\n: connected\n\n');
    return () => this.remove(listener);
  }

  /** Sends an event to every listener that may see it. */
  deliver(event: LiveEvent): void {
    const needed = EVENT_PERMISSIONS[event.type];
    const text = toServerSentEvent(event);
    for (const listener of this.listeners) {
      if (listener.permissions.has(needed)) {
        this.write(listener, text);
      }
    }
  }

  private writeToAll(text: string): void {
    for (const listener of this.listeners) {
      this.write(listener, text);
    }
  }

  private write(listener: Listener, text: string): void {
    try {
      listener.target.write(text);
    } catch {
      // The connection is gone. Its close handler removes it; removing here too is harmless.
      this.remove(listener);
    }
  }

  private remove(listener: Listener): void {
    clearTimeout(listener.timer);
    this.listeners.delete(listener);
  }
}
