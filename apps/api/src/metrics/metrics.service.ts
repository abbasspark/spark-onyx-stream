// SPDX-License-Identifier: AGPL-3.0-only
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { NextFunction, Request, Response } from 'express';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { appVersion } from '../common/app-version.js';
import { AppConfig } from '../config/app-config.js';
import { HealthService } from '../health/health.service.js';
import { PROCESSING_QUEUE } from '../queue/queue.constants.js';

/** The states of a job that are worth a graph. */
const JOB_STATES = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const;

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
  private readonly registry = new Registry();
  private readonly requests: Counter<'method' | 'route' | 'status'>;
  private readonly durations: Histogram<'method' | 'route'>;

  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(HealthService) private readonly health: HealthService,
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

    const jobs = new Gauge({
      name: 'onyx_queue_jobs',
      help: 'Jobs in a queue, by state.',
      labelNames: ['queue', 'state'],
      registers: [registry],
      collect: async () => {
        const counts = await this.processingQueue.getJobCounts(...JOB_STATES);
        for (const state of JOB_STATES) {
          jobs.set({ queue: PROCESSING_QUEUE, state }, counts[state] ?? 0);
        }
      },
    });

    const dependencies = new Gauge({
      name: 'onyx_dependency_up',
      help: 'Whether a dependency answers: 1 up, 0 down.',
      labelNames: ['dependency'],
      registers: [registry],
      collect: async () => {
        const report = await this.health.check();
        dependencies.set(
          { dependency: 'database' },
          report.checks.database.status === 'up' ? 1 : 0,
        );
        dependencies.set({ dependency: 'redis' }, report.checks.redis.status === 'up' ? 1 : 0);
      },
    });
  }

  /** Whether a token is set. Without one the endpoint does not exist. */
  get enabled(): boolean {
    return this.config.metricsToken !== '';
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  render(): Promise<string> {
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
