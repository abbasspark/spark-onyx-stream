// SPDX-License-Identifier: AGPL-3.0-only
import { getQueueToken } from '@nestjs/bullmq';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppConfig } from '../config/app-config.js';
import { HealthService } from '../health/health.service.js';
import { PROCESSING_QUEUE } from '../queue/queue.constants.js';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

const TOKEN = 't'.repeat(40);

let nest: INestApplication<App> | undefined;

afterEach(async () => {
  await nest?.close();
  nest = undefined;
});

interface Setup {
  token?: string;
  database?: 'up' | 'down';
  jobs?: Record<string, number>;
}

/** The controller and the service, built the way the API builds them, on fake infrastructure. */
async function app({ token = TOKEN, database = 'up', jobs = {} }: Setup = {}): Promise<App> {
  const moduleRef = await Test.createTestingModule({
    controllers: [MetricsController],
    providers: [
      MetricsService,
      { provide: AppConfig, useValue: { metricsToken: token } },
      {
        provide: HealthService,
        useValue: {
          check: () =>
            Promise.resolve({
              status: database === 'up' ? 'ok' : 'degraded',
              checks: { database: { status: database }, redis: { status: 'up' } },
            }),
        },
      },
      {
        provide: getQueueToken(PROCESSING_QUEUE),
        useValue: { getJobCounts: () => Promise.resolve(jobs) },
      },
      { provide: RateLimitService, useValue: { hit: () => Promise.resolve({ allowed: true }) } },
    ],
  }).compile();
  nest = moduleRef.createNestApplication<INestApplication<App>>();
  nest.setGlobalPrefix('v1');
  nest.use(nest.get(MetricsService).httpMiddleware());
  await nest.init();
  return nest.getHttpServer();
}

describe('GET /v1/metrics', () => {
  it('does not exist while no token is set', async () => {
    const response = await request(await app({ token: '' })).get('/v1/metrics');
    expect(response.status).toBe(404);
  });

  it('turns away a request without the token', async () => {
    const server = await app();
    expect((await request(server).get('/v1/metrics')).status).toBe(401);
    const wrong = await request(server)
      .get('/v1/metrics')
      .set('Authorization', `Bearer ${'x'.repeat(40)}`);
    expect(wrong.status).toBe(401);
    const other = await request(server).get('/v1/metrics').set('Authorization', `Basic ${TOKEN}`);
    expect(other.status).toBe(401);
  });

  it('answers in the Prometheus text format when the token is right', async () => {
    const response = await request(await app())
      .get('/v1/metrics')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/plain/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toMatch(/^onyx_build_info\{version="[^"]+"\} 1$/m);
    expect(response.text).toContain('onyx_process_cpu_user_seconds_total');
  });

  it('reports the jobs of the queue by state', async () => {
    const response = await request(await app({ jobs: { waiting: 4, active: 2, failed: 1 } }))
      .get('/v1/metrics')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(response.text).toContain('onyx_queue_jobs{queue="processing",state="waiting"} 4');
    expect(response.text).toContain('onyx_queue_jobs{queue="processing",state="active"} 2');
    expect(response.text).toContain('onyx_queue_jobs{queue="processing",state="delayed"} 0');
  });

  it('reports a dependency that is down', async () => {
    const response = await request(await app({ database: 'down' }))
      .get('/v1/metrics')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(response.text).toContain('onyx_dependency_up{dependency="database"} 0');
    expect(response.text).toContain('onyx_dependency_up{dependency="redis"} 1');
  });

  it('counts requests by the pattern of the route, and the rest as unmatched', async () => {
    const server = await app();
    await request(server).get('/v1/metrics'); // 401
    await request(server).get('/v1/nowhere/at/all');
    const response = await request(server)
      .get('/v1/metrics')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(response.text).toContain(
      'onyx_http_requests_total{method="GET",route="/v1/metrics",status="401"} 1',
    );
    expect(response.text).toContain(
      'onyx_http_requests_total{method="GET",route="unmatched",status="404"} 1',
    );
    expect(response.text).toMatch(
      /onyx_http_request_duration_seconds_count\{method="GET",route="\/v1\/metrics"\} 1/,
    );
  });
});
