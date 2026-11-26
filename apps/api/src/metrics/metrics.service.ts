// SPDX-License-Identifier: AGPL-3.0-only
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import type { Queue } from 'bullmq';
import type { NextFunction, Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { appVersion } from '../common/app-version.js';
import { AppConfig } from '../config/app-config.js';
import { ProcessBeacon } from '../diagnostics/process-beacon.service.js';
import { HealthService } from '../health/health.service.js';
import { healthKey } from '../live/live-state.js';
import { PROCESSING_QUEUE } from '../queue/queue.constants.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { staleBefore } from '../streams/stream-rules.js';

/** The states of a job that are worth a graph. */
const JOB_STATES = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const;

/** The roles a process can have, so that a role nobody has still shows up, as 0. */
const ROLES = ['api', 'worker', 'scheduler', 'live'] as const;

/** How long one figure may take. A slow database must not hold up every other number. */
const COLLECT_TIMEOUT_MS = 3000;

/** What a request is called when no route matched it, so that stray addresses do not make a series each. */
const UNMATCHED_ROUTE = 'unmatched';

/**
 * The numbers a monitoring system reads from `/v1/metrics`, in the Prometheus
 * text format.
 *
 * Request counts and times are kept by route pattern, never by address: the
 * address of a playback request carries a token, and a series per token would
 * grow without end.
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry = new Registry();
  /** What reads the figures that are only known when asked. Run before every answer. */
  private readonly readers: (() => Promise<void>)[] = [];
  private readonly requests: Counter<'method' | 'route' | 'status'>;
  private readonly durations: Histogram<'method' | 'route'>;

  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(HealthService) private readonly health: HealthService,
    @Inject(ProcessBeacon) private readonly beacon: ProcessBeacon,
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectQueue(PROCESSING_QUEUE) private readonly processingQueue: Queue,
  ) {
    const registry = this.registry;
    collectDefaultMetrics({ register: registry, prefix: 'onyx_' });

    new Gauge({
      name: 'onyx_build_info',
      help: 'The version of the running application. Always 1.',
      labelNames: ['version'],
      registers: [registry],
    }).set({ version: appVersion() }, 1);

    this.requests = new Counter({
      name: 'onyx_http_requests_total',
      help: 'Requests the API has answered, by method, route and status.',
      labelNames: ['method', 'route', 'status'],
      registers: [registry],
    });

    this.durations = new Histogram({
      name: 'onyx_http_request_duration_seconds',
      help: 'How long the API took to answer, by method and route.',
      labelNames: ['method', 'route'],
      buckets: [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    });

    const failures = new Counter({
      name: 'onyx_metrics_collect_failures_total',
      help: 'Times a figure could not be read while answering a scrape, by figure.',
      labelNames: ['figure'],
      registers: [registry],
    });
    // One figure that cannot be read leaves out only itself. Otherwise Redis being
    // down would take the whole answer with it, when it is most needed.
    const guarded = (figure: string, read: () => Promise<void>) => async (): Promise<void> => {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('took too long')), COLLECT_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
        failures.inc({ figure });
        this.logger.debug(`Metric ${figure} could not be read: ${(error as Error).message}`);
      } finally {
        clearTimeout(timer);
      }
    };

    const jobs = new Gauge({
      name: 'onyx_queue_jobs',
      help: 'Jobs in a queue, by state.',
      labelNames: ['queue', 'state'],
      registers: [registry],
    });
    this.readers.push(
      guarded('queue_jobs', async () => {
        const counts = await this.processingQueue.getJobCounts(...JOB_STATES);
        for (const state of JOB_STATES) {
          jobs.set({ queue: PROCESSING_QUEUE, state }, counts[state] ?? 0);
        }
      }),
    );

    const dependencies = new Gauge({
      name: 'onyx_dependency_up',
      help: 'Whether a dependency answers: 1 up, 0 down.',
      labelNames: ['dependency'],
      registers: [registry],
    });
    this.readers.push(
      guarded('dependency_up', async () => {
        const report = await this.health.check();
        dependencies.set(
          { dependency: 'database' },
          report.checks.database.status === 'up' ? 1 : 0,
        );
        dependencies.set({ dependency: 'redis' }, report.checks.redis.status === 'up' ? 1 : 0);
      }),
    );

    // The other processes have no HTTP server. They report to Redis every fifteen
    // seconds, and this process says what they said.
    const memory = new Gauge({
      name: 'onyx_instance_memory_bytes',
      help: 'Memory a process holds, by process.',
      labelNames: ['host', 'pid', 'roles'],
      registers: [registry],
    });
    const uptime = new Gauge({
      name: 'onyx_instance_uptime_seconds',
      help: 'How long a process has been running, by process.',
      labelNames: ['host', 'pid', 'roles', 'version'],
      registers: [registry],
    });
    const diskFree = new Gauge({
      name: 'onyx_disk_free_bytes',
      help: 'Free space of a working folder of a process.',
      labelNames: ['host', 'pid', 'folder'],
      registers: [registry],
    });
    const diskTotal = new Gauge({
      name: 'onyx_disk_total_bytes',
      help: 'Size of the disk of a working folder of a process.',
      labelNames: ['host', 'pid', 'folder'],
      registers: [registry],
    });
    const instances = new Gauge({
      name: 'onyx_instances',
      help: 'Processes that reported in lately, by role. 0 for a role nobody has.',
      labelNames: ['role'],
      registers: [registry],
    });
    this.readers.push(
      guarded('instances', async () => {
        const now = Date.now();
        const beacons = await this.beacon.list();
        for (const gauge of [memory, uptime, diskFree, diskTotal]) {
          gauge.reset();
        }
        for (const role of ROLES) {
          instances.set({ role }, beacons.filter((beacon) => beacon.roles.includes(role)).length);
        }
        for (const beacon of beacons) {
          const who = { host: beacon.host, pid: String(beacon.pid) };
          const roles = [...beacon.roles].sort().join(',');
          memory.set({ ...who, roles }, beacon.memoryBytes);
          uptime.set(
            { ...who, roles, version: beacon.version },
            Math.max(0, Math.round((now - new Date(beacon.startedAt).getTime()) / 1000)),
          );
          for (const disk of beacon.disks) {
            // A folder that could not be read has no sizes to report.
            if (disk.error === undefined) {
              diskFree.set({ ...who, folder: disk.name }, disk.freeBytes);
              diskTotal.set({ ...who, folder: disk.name }, disk.totalBytes);
            }
          }
        }
      }),
    );

    const channels = new Gauge({
      name: 'onyx_live_channels',
      help: 'Live channels: switched on ("wanted") and with a live process running them. A gap is a channel that is down.',
      labelNames: ['state'],
      registers: [registry],
    });
    this.readers.push(
      guarded('live_channels', async () => {
        const [wanted, running] = await Promise.all([
          this.prisma.channel.count({ where: { enabled: true } }),
          this.countRunningChannels(),
        ]);
        channels.set({ state: 'wanted' }, wanted);
        channels.set({ state: 'running' }, running);
      }),
    );

    const streams = new Gauge({
      name: 'onyx_streams_active',
      help: 'Videos being played right now by viewers who are signed in.',
      registers: [registry],
    });
    this.readers.push(
      guarded('streams_active', async () => {
        streams.set(
          await this.prisma.viewerStream.count({
            where: { lastSeenAt: { gte: staleBefore(new Date()) } },
          }),
        );
      }),
    );
  }

  /** Channels a live process reported on within the lease. Counted without KEYS, which would stop Redis. */
  private async countRunningChannels(): Promise<number> {
    const pattern = healthKey('*');
    let cursor = '0';
    let found = 0;
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      found += keys.length;
    } while (cursor !== '0');
    return found;
  }

  /** Whether a token is set. Without one the endpoint does not exist. */
  get enabled(): boolean {
    return this.config.metricsToken !== '';
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async render(): Promise<string> {
    // Read first and render after: the registry would otherwise render a figure
    // while the read that fills it is still running.
    await Promise.all(this.readers.map((read) => read()));
    return this.registry.metrics();
  }

  /** Express middleware that counts and times every request once it is answered. */
  httpMiddleware(): (request: Request, response: Response, next: NextFunction) => void {
    return (request, response, next) => {
      const startedAt = process.hrtime.bigint();
      response.once('finish', () => {
        const method = request.method;
        // The route is only known once a handler has matched, which is why this waits for the end.
        const pattern = request.route as { path?: unknown } | undefined;
        const path =
          typeof pattern?.path === 'string' ? `${request.baseUrl}${pattern.path}` : undefined;
        // Nest keeps a wildcard route under its prefix. What lands on it matched nothing.
        const route = path === undefined || path.includes('*') ? UNMATCHED_ROUTE : path;
        this.requests.inc({ method, route, status: String(response.statusCode) });
        this.durations.observe(
          { method, route },
          Number(process.hrtime.bigint() - startedAt) / 1e9,
        );
      });
      next();
    };
  }
}
