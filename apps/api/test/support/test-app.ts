// SPDX-License-Identifier: AGPL-3.0-only
import { DeliveryCoreModule } from '../../src/delivery/delivery.module.js';
import { getQueueToken } from '@nestjs/bullmq';
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
import { EventsModule } from '../../src/events/events.module.js';
import { DatabaseModule } from '../../src/database/database.module.js';
import type { QueuedJobData } from '../../src/jobs/jobs.service.js';
import { ProcessingCoreModule } from '../../src/processing/processing.module.js';
import { PROCESSING_QUEUE } from '../../src/queue/queue.constants.js';
import { MailModule } from '../../src/mail/mail.module.js';
import { MailService } from '../../src/mail/mail.service.js';
import { MAIL_TRANSPORT, MemoryTransport } from '../../src/mail/mail.transport.js';
import { RateLimitModule } from '../../src/rate-limit/rate-limit.module.js';
import { REDIS_CLIENT } from '../../src/redis/redis.module.js';
import { StorageModule } from '../../src/storage/storage.module.js';

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

  private readonly strings = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    const value = this.counters.get(key) ?? this.strings.get(key);
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

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      removed +=
        Number(this.counters.delete(key)) +
        Number(this.strings.delete(key)) +
        Number(this.lists.delete(key));
    }
    return removed;
  }

  /** "SET key value [PX ms] [NX]". Values set here do not run out. */
  async set(key: string, value: string, ...options: (string | number)[]): Promise<'OK' | null> {
    if (options.includes('NX') && this.strings.has(key)) {
      return null;
    }
    this.strings.set(key, value);
    return 'OK';
  }

  async pexpire(): Promise<number> {
    return 1;
  }

  private readonly lists = new Map<string, string[]>();

  async lpush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.unshift(...values.reverse());
    this.lists.set(key, list);
    return list.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    this.lists.set(key, (this.lists.get(key) ?? []).slice(start, stop + 1));
    return 'OK';
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return (this.lists.get(key) ?? []).slice(start, stop + 1);
  }

  /** Several commands sent together. Here they simply run one after the other. */
  multi() {
    const commands: (() => Promise<unknown>)[] = [];
    const chain = {
      set: (key: string, value: string, ...options: (string | number)[]) => {
        commands.push(() => this.set(key, value, ...options));
        return chain;
      },
      lpush: (key: string, ...values: string[]) => {
        commands.push(() => this.lpush(key, ...values));
        return chain;
      },
      ltrim: (key: string, start: number, stop: number) => {
        commands.push(() => this.ltrim(key, start, stop));
        return chain;
      },
      expire: () => chain,
      exec: async () => {
        const results: [null, unknown][] = [];
        for (const command of commands) {
          results.push([null, await command()]);
        }
        return results;
      },
    };
    return chain;
  }

  /** A second connection, as subscribers need one. It never receives anything. */
  duplicate() {
    return { on: () => undefined, subscribe: async () => 1, disconnect: () => undefined };
  }

  async publish(channel: string, message: string): Promise<number> {
    this.published.push({ channel, message });
    return 0;
  }

  /** Messages sent with publish, for tests to inspect. */
  readonly published: { channel: string; message: string }[] = [];

  clear(): void {
    this.counters.clear();
    this.strings.clear();
    this.lists.clear();
    this.published.length = 0;
  }
}

export interface FakeQueuedJob {
  name: string;
  data: QueuedJobData;
  attempts: number;
}

/**
 * Stand-in for the BullMQ queue. It records the jobs that were added, so a
 * test can run them one by one at the moment it chooses.
 */
export class FakeQueue {
  readonly waiting: FakeQueuedJob[] = [];

  async add(name: string, data: QueuedJobData, options: { attempts?: number } = {}) {
    this.waiting.push({ name, data, attempts: options.attempts ?? 1 });
    return { id: data.jobId };
  }

  async getJob(id: string) {
    const index = this.waiting.findIndex((job) => job.data.jobId === id);
    if (index === -1) {
      return undefined;
    }
    return {
      remove: async () => {
        this.waiting.splice(index, 1);
      },
    };
  }

  clear(): void {
    this.waiting.length = 0;
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
  queue: FakeQueue;
  /** Starts a request against the running application. */
  http: () => ReturnType<typeof request>;
  /** Header for an authenticated request. */
  bearer: (token: string) => { Authorization: string };
  /** Signs in and returns the session token. */
  login: (email: string, password: string) => Promise<string>;
  /** Creates the first owner through the setup endpoint and signs in. */
  setupOwner: () => Promise<string>;
  /** Removes all data the suites create, in dependency order. */
  /** Emails the application sent. Nothing leaves the process. */
  mail: MemoryTransport;
  mailSettled: () => Promise<void>;
  resetDatabase: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Starts the application for end-to-end tests with the real database, a fake
 * Redis and queue, and authentication and audit always loaded.
 *
 * @param featureModules The modules under test.
 * @param overrides Extra environment values, for example STORAGE_LOCAL_PATH.
 */
export async function createTestApp(
  featureModules: Type[],
  overrides: Record<string, string> = {},
): Promise<TestApp> {
  const redis = new FakeRedis();
  const queue = new FakeQueue();
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
    providers: [
      { provide: REDIS_CLIENT, useValue: redis },
      { provide: getQueueToken(PROCESSING_QUEUE), useValue: queue },
    ],
    exports: [REDIS_CLIENT, getQueueToken(PROCESSING_QUEUE)],
  })
  class FakeInfrastructureModule {}

  const mail = new MemoryTransport();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot(config),
      DatabaseModule,
      FakeInfrastructureModule,
      RateLimitModule,
      EventsModule,
      CryptoModule,
      AuthModule,
      AuditModule,
      StorageModule,
      ProcessingCoreModule,
      DeliveryCoreModule,
      MailModule,
      ...featureModules,
    ],
  })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(mail)
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>({ rawBody: true });
  app.setGlobalPrefix('v1');
  await app.init();

  const prisma = app.get(PrismaClient);
  const mailService = app.get(MailService);
  // A mail server that is down is tried again at once in tests.
  mailService.retryDelaysMs = [0];
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
    queue,
    http,
    bearer,
    login,
    setupOwner: async () => {
      await http().post('/v1/auth/setup').send(OWNER).expect(201);
      return login(OWNER.email, OWNER.password);
    },
    mail,
    /** Waits until every email handed over so far is in the outbox, or given up. */
    mailSettled: () => mailService.settled(),
    resetDatabase: async () => {
      redis.clear();
      await mailService.settled();
      mail.clear();
      queue.clear();
      await prisma.auditLog.deleteMany();
      await prisma.payment.deleteMany();
      await prisma.recording.deleteMany();
      await prisma.edgeServer.deleteMany();
      await prisma.sharingHour.deleteMany();
      await prisma.originTrafficHour.deleteMany();
      await prisma.channel.deleteMany();
      await prisma.guideSource.deleteMany();
      // Catalog rows point to assets, pictures and pools, so they go first.
      await prisma.title.deleteMany();
      await prisma.category.deleteMany();
      await prisma.image.deleteMany();
      await prisma.job.deleteMany();
      await prisma.asset.deleteMany();
      await prisma.encodingProfile.deleteMany();
      await prisma.storagePool.deleteMany();
      await prisma.adminUser.deleteMany();
      await prisma.viewer.deleteMany();
      // After the viewers, whose subscriptions point to plans.
      await prisma.plan.deleteMany();
      await prisma.package.deleteMany();
      await prisma.stripeEvent.deleteMany();
    },
    close: () => app.close(),
  };
}
