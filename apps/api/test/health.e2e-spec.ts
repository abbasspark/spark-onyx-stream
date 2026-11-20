// SPDX-License-Identifier: AGPL-3.0-only
import { Global, type INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@onyx/database';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppConfig } from '../src/config/app-config.js';
import { ConfigModule } from '../src/config/config.module.js';
import { validateEnv } from '../src/config/env.schema.js';
import { HealthModule } from '../src/health/health.module.js';
import { REDIS_CLIENT } from '../src/redis/redis.module.js';

const config = new AppConfig(
  validateEnv({
    NODE_ENV: 'test',
    APP_ROLE: 'api',
    DATABASE_URL: 'postgresql://onyx:secret@localhost:5432/onyx',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'a'.repeat(64),
    PLAYBACK_SIGNING_SECRET: 'b'.repeat(64),
    MASTER_KEY: 'c'.repeat(64),
  }),
);

/** Builds the health endpoints on top of fake infrastructure clients. */
async function createApp(fakes: {
  queryRaw: () => Promise<unknown>;
  ping: () => Promise<unknown>;
}): Promise<INestApplication<App>> {
  @Global()
  @Module({
    providers: [
      { provide: PrismaClient, useValue: { $queryRaw: fakes.queryRaw } },
      { provide: REDIS_CLIENT, useValue: { ping: fakes.ping } },
    ],
    exports: [PrismaClient, REDIS_CLIENT],
  })
  class FakeInfrastructureModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot(config), FakeInfrastructureModule, HealthModule],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('v1');
  await app.init();
  return app;
}

describe('Health endpoints (e2e)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app.close();
  });

  it('GET /v1/health returns 200 when dependencies are up', async () => {
    app = await createApp({ queryRaw: async () => [], ping: async () => 'PONG' });

    const response = await request(app.getHttpServer()).get('/v1/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.checks.database.status).toBe('up');
    expect(response.body.checks.redis.status).toBe('up');
  });

  it('GET /v1/health returns 503 when a dependency is down', async () => {
    app = await createApp({
      queryRaw: async () => {
        throw new Error('connection refused');
      },
      ping: async () => 'PONG',
    });

    const response = await request(app.getHttpServer()).get('/v1/health').expect(503);

    expect(response.body.status).toBe('degraded');
    expect(response.body.checks.database.status).toBe('down');
  });

  it('GET /v1/health/live returns 200 without checking dependencies', async () => {
    app = await createApp({
      queryRaw: async () => {
        throw new Error('connection refused');
      },
      ping: async () => {
        throw new Error('connection refused');
      },
    });

    await request(app.getHttpServer()).get('/v1/health/live').expect(200, { status: 'ok' });
  });
});
