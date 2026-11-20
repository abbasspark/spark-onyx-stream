// SPDX-License-Identifier: AGPL-3.0-only
import { Global, type INestApplication, Module, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@onyx/database';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AuditModule } from '../../src/audit/audit.module.js';
import { AuthModule } from '../../src/auth/auth.module.js';
import { AppConfig } from '../../src/config/app-config.js';
import { ConfigModule } from '../../src/config/config.module.js';
import { validateEnv } from '../../src/config/env.schema.js';
import { CryptoModule } from '../../src/crypto/crypto.module.js';
import { DatabaseModule } from '../../src/database/database.module.js';
import { REDIS_CLIENT } from '../../src/redis/redis.module.js';

/**
 * Database used by end-to-end tests. The suites delete data in it, so it has
 * to be separate from the development database. Suites are skipped when it is
 * not set.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL && TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not point at the development database');
}

/** Minimal in-memory stand-in for the Redis commands the login throttle uses. */
export class FakeRedis {
  private readonly counters = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    const value = this.counters.get(key);
    return value === undefined ? null : String(value);
  }

  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(): Promise<number> {
    return 1;
  }

  async ttl(key: string): Promise<number> {
    return this.counters.has(key) ? 900 : -2;
  }

  async del(key: string): Promise<number> {
    return this.counters.delete(key) ? 1 : 0;
  }

  clear(): void {
    this.counters.clear();
  }
}

export const OWNER = {
  email: 'owner@example.com',
  displayName: 'Olivia Owner',
  password: 'owner-password-123',
};

export interface TestApp {
  app: INestApplication<App>;
  prisma: PrismaClient;
  redis: FakeRedis;
  /** Starts a request against the running application. */
  http: () => ReturnType<typeof request>;
  /** Header for an authenticated request. */
  bearer: (token: string) => { Authorization: string };
  /** Signs in and returns the session token. */
  login: (email: string, password: string) => Promise<string>;
  /** Creates the first owner through the setup endpoint and signs in. */
  setupOwner: () => Promise<string>;
  /** Removes all data the suites create, in dependency order. */
  resetDatabase: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Starts the application for end-to-end tests with the real database, a fake
 * Redis, and authentication and audit always loaded.
 *
 * @param featureModules The modules under test.
 * @param overrides Extra environment values, for example STORAGE_LOCAL_PATH.
 */
export async function createTestApp(
  featureModules: Type[],
  overrides: Record<string, string> = {},
): Promise<TestApp> {
  const redis = new FakeRedis();
  const config = new AppConfig(
    validateEnv({
      NODE_ENV: 'test',
      APP_ROLE: 'api',
      DATABASE_URL: TEST_DATABASE_URL,
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'a'.repeat(64),
      PLAYBACK_SIGNING_SECRET: 'b'.repeat(64),
      MASTER_KEY: 'c'.repeat(64),
      ...overrides,
    }),
  );

  @Global()
  @Module({
    providers: [{ provide: REDIS_CLIENT, useValue: redis }],
    exports: [REDIS_CLIENT],
  })
  class FakeRedisModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot(config),
      DatabaseModule,
      FakeRedisModule,
      CryptoModule,
      AuthModule,
      AuditModule,
      ...featureModules,
    ],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('v1');
  await app.init();

  const prisma = app.get(PrismaClient);
  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (email: string, password: string): Promise<string> => {
    const response = await http().post('/v1/auth/login').send({ email, password }).expect(200);
    return response.body.token as string;
  };

  return {
    app,
    prisma,
    redis,
    http,
    bearer,
    login,
    setupOwner: async () => {
      await http().post('/v1/auth/setup').send(OWNER).expect(201);
      return login(OWNER.email, OWNER.password);
    },
    resetDatabase: async () => {
      redis.clear();
      await prisma.auditLog.deleteMany();
      await prisma.asset.deleteMany();
      await prisma.storagePool.deleteMany();
      await prisma.adminUser.deleteMany();
    },
    close: () => app.close(),
  };
}
