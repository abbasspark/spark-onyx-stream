// SPDX-License-Identifier: AGPL-3.0-only
import type { PrismaClient } from '@onyx/database';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config.js';
import { validateEnv } from '../config/env.schema.js';
import { HealthService } from './health.service.js';

function createConfig(nodeEnv: 'development' | 'production' = 'development'): AppConfig {
  return new AppConfig(
    validateEnv({
      NODE_ENV: nodeEnv,
      APP_ROLE: 'api',
      DATABASE_URL: 'postgresql://onyx:secret@localhost:5432/onyx',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'a'.repeat(64),
      PLAYBACK_SIGNING_SECRET: 'b'.repeat(64),
      MASTER_KEY: 'c'.repeat(64),
    }),
  );
}

function createService(options: {
  database?: () => Promise<unknown>;
  redis?: () => Promise<unknown>;
  nodeEnv?: 'development' | 'production';
}): HealthService {
  const prisma = { $queryRaw: options.database ?? (async () => [{ '?column?': 1 }]) };
  const redis = { ping: options.redis ?? (async () => 'PONG') };

  return new HealthService(
    createConfig(options.nodeEnv),
    prisma as unknown as PrismaClient,
    redis as unknown as Redis,
  );
}

describe('HealthService', () => {
  it('reports ok when every dependency is up', async () => {
    const report = await createService({}).check();

    expect(report.status).toBe('ok');
    expect(report.roles).toEqual(['api']);
    expect(report.checks.database.status).toBe('up');
    expect(report.checks.redis.status).toBe('up');
    expect(report.checks.database.error).toBeUndefined();
  });

  it('reports degraded with the error when the database is down', async () => {
    const report = await createService({
      database: async () => {
        throw new Error('connection refused');
      },
    }).check();

    expect(report.status).toBe('degraded');
    expect(report.checks.database).toMatchObject({ status: 'down', error: 'connection refused' });
    expect(report.checks.redis.status).toBe('up');
  });

  it('reports degraded when Redis is down', async () => {
    const report = await createService({
      redis: async () => {
        throw new Error('ECONNREFUSED');
      },
    }).check();

    expect(report.status).toBe('degraded');
    expect(report.checks.redis.status).toBe('down');
  });

  it('hides error details in production', async () => {
    const report = await createService({
      nodeEnv: 'production',
      database: async () => {
        throw new Error('password authentication failed for user "onyx"');
      },
    }).check();

    expect(report.checks.database.error).toBe('Dependency unavailable');
  });
});
