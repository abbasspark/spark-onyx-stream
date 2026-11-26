// SPDX-License-Identifier: AGPL-3.0-only
import { getQueueToken } from '@nestjs/bullmq';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import { ProcessBeacon } from '../diagnostics/process-beacon.service.js';
import { HealthService } from '../health/health.service.js';
import { PROCESSING_QUEUE } from '../queue/queue.constants.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
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
  jobs?: Record<string, number> | Error;
  beacons?: object[];
  wantedChannels?: number;
  runningChannelKeys?: string[];
  streams?: number;
}

/** The controller and the service, built the way the API builds them, on fake infrastructure. */
async function app({
  token = TOKEN,
  database = 'up',
  jobs = {},
  beacons = [],
  wantedChannels = 0,
  runningChannelKeys = [],
  streams = 0,
}: Setup = {}): Promise<App> {
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
        useValue: {
          getJobCounts: () =>
            jobs instanceof Error ? Promise.reject(jobs) : Promise.resolve(jobs),
        },
      },
      { provide: ProcessBeacon, useValue: { list: () => Promise.resolve(beacons) } },
      {
        provide: PrismaClient,
        useValue: {
          channel: { count: () => Promise.resolve(wantedChannels) },
          viewerStream: { count: () => Promise.resolve(streams) },
        },
      },
      {
        provide: REDIS_CLIENT,
        // One page holds every key, which is all a fake has to show.
        useValue: { scan: () => Promise.resolve(['0', runningChannelKeys]) },
      },
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

const BEACON = {
  id: 'a',
  roles: ['worker'],
  host: 'node-1',
  pid: 42,
  version: '1.2.3',
  node: '24',
  startedAt: new Date(Date.now() - 90_000).toISOString(),
  seenAt: new Date().toISOString(),
  memoryBytes: 123_456,
  disks: [
    { name: 'processing', freeBytes: 500, totalBytes: 1000 },
    { name: 'live', freeBytes: 0, totalBytes: 0, error: 'ENOENT' },
  ],
};

describe('GET /v1/metrics, the other processes and the rest', () => {
  const scrape = async (setup: Setup) =>
    (
      await request(await app(setup))
        .get('/v1/metrics')
        .set('Authorization', `Bearer ${TOKEN}`)
    ).text;

  it('counts the processes of each role and shows 0 for a role nobody has', async () => {
    const text = await scrape({
      beacons: [
        BEACON,
        { ...BEACON, id: 'b', pid: 7, roles: ['api', 'worker'] },
        { ...BEACON, id: 'c', pid: 8, roles: ['scheduler'] },
      ],
    });

    expect(text).toContain('onyx_instances{role="api"} 1');
    expect(text).toContain('onyx_instances{role="worker"} 2');
    expect(text).toContain('onyx_instances{role="scheduler"} 1');
    expect(text).toContain('onyx_instances{role="live"} 0');
  });

  it('reports the memory, the age and the disks of each process, and skips a folder it could not read', async () => {
    const text = await scrape({ beacons: [BEACON] });

    expect(text).toContain(
      'onyx_instance_memory_bytes{host="node-1",pid="42",roles="worker"} 123456',
    );
    expect(text).toMatch(
      /onyx_instance_uptime_seconds\{host="node-1",pid="42",roles="worker",version="1\.2\.3"\} 9\d/,
    );
    expect(text).toContain('onyx_disk_free_bytes{host="node-1",pid="42",folder="processing"} 500');
    expect(text).toContain(
      'onyx_disk_total_bytes{host="node-1",pid="42",folder="processing"} 1000',
    );
    expect(text).not.toContain('folder="live"');
  });

  it('shows the channels that are switched on beside the ones that run', async () => {
    const text = await scrape({
      wantedChannels: 5,
      runningChannelKeys: ['onyx:live:health:a', 'onyx:live:health:b', 'onyx:live:health:c'],
    });

    expect(text).toContain('onyx_live_channels{state="wanted"} 5');
    expect(text).toContain('onyx_live_channels{state="running"} 3');
  });

  it('counts the videos playing now', async () => {
    expect(await scrape({ streams: 17 })).toContain('onyx_streams_active 17');
  });

  it('still answers, and says the database is down, when the queue cannot be read', async () => {
    const response = await request(
      await app({ database: 'down', jobs: new Error('Connection is closed.') }),
    )
      .get('/v1/metrics')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.text).toContain('onyx_dependency_up{dependency="database"} 0');
    expect(response.text).toContain('onyx_metrics_collect_failures_total{figure="queue_jobs"} 1');
    expect(response.text).not.toContain('onyx_queue_jobs{');
  });
});
