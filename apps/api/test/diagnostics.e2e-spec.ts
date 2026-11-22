// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of diagnostics: what the page is told about a real
// installation, the mark in the header, the look for newer versions, and the
// emails to the owners. A small HTTP server stands in for the place newer
// versions are looked up at.
//
// Skipped unless TEST_DATABASE_URL is set.
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminsModule } from '../src/admins/admins.module.js';
import { DeliveryCoreModule } from '../src/delivery/delivery.module.js';
import {
  ALERT_MEMORY_KEY,
  DiagnosticsWatch,
  WATCH_LOCK,
} from '../src/diagnostics/diagnostics-watch.service.js';
import { DiagnosticsModule } from '../src/diagnostics/diagnostics.module.js';
import type { Check, DiagnosticsReport } from '../src/diagnostics/diagnostics.types.js';
import {
  ProcessBeacon,
  ProcessBeaconModule,
  PROCESSES_KEY,
} from '../src/diagnostics/process-beacon.service.js';
import { LATEST_COMMIT_KEY } from '../src/diagnostics/update-check.service.js';
import { createTestApp, OWNER, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

// The disks of the machine the tests run on must not decide how they end.
const disk = vi.hoisted(() => ({ freeBytes: 300 * 1024 ** 3, totalBytes: 500 * 1024 ** 3 }));
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  statfs: async () => ({
    bsize: 4096,
    bavail: Math.floor(disk.freeBytes / 4096),
    blocks: Math.floor(disk.totalBytes / 4096),
  }),
}));

const INSTALLED = 'a'.repeat(40);
const NEWER = 'b'.repeat(40);
const EDITOR = {
  email: 'editor@example.com',
  displayName: 'Eddie Editor',
  password: 'editor-password-123',
  role: 'EDITOR',
};

describe.skipIf(!TEST_DATABASE_URL)('Diagnostics (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let storage: string;
  let versions: Server;
  let newest: { status: number; body: string };
  let asked: number;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);
  const report = async () =>
    (await http().get('/v1/diagnostics').set(admin()).expect(200)).body as DiagnosticsReport;
  const find = (from: DiagnosticsReport, id: string) =>
    from.checks.find((check) => check.id === id) as Check;
  /** Another process of the installation, as it would report itself. */
  const otherProcess = (roles: string[], over: Record<string, unknown> = {}) =>
    testApp.redis.hset(
      PROCESSES_KEY,
      roles.join('+'),
      JSON.stringify({
        id: roles.join('+'),
        roles,
        host: 'worker-1',
        pid: 9,
        version: '0.1.0',
        node: '24.0.0',
        startedAt: new Date(Date.now() - 3600_000).toISOString(),
        seenAt: new Date().toISOString(),
        memoryBytes: 1,
        disks: [],
        ...over,
      }),
    );
  /** An installation with every process it needs. */
  const allProcesses = async () => {
    await testApp.app.get(ProcessBeacon).report();
    await otherProcess(['worker']);
    await otherProcess(['scheduler']);
  };
  const look = async (now?: Date) => {
    await testApp.redis.del(WATCH_LOCK);
    await testApp.app.get(DiagnosticsWatch).look(now);
  };

  beforeAll(async () => {
    storage = mkdtempSync(path.join(tmpdir(), 'onyx-diagnostics-'));
    versions = createServer((_request, response) => {
      asked += 1;
      response.writeHead(newest.status, { 'Content-Type': 'text/plain' });
      response.end(newest.body);
    });
    await new Promise<void>((resolve) => versions.listen(0, '127.0.0.1', resolve));
    testApp = await createTestApp(
      [AdminsModule, DeliveryCoreModule, ProcessBeaconModule, DiagnosticsModule],
      {
        STORAGE_LOCAL_PATH: storage,
        UPLOAD_TEMP_PATH: storage,
        ONYX_COMMIT: INSTALLED,
        UPDATE_CHECK_URL: `http://127.0.0.1:${(versions.address() as AddressInfo).port}/newest`,
        SITE_URL: 'https://watch.example.com',
        SITE_NAME: 'Night Cinema',
        SMTP_URL: 'smtps://mailer:secret-password@smtp.example.com:465',
        MAIL_FROM: 'Night Cinema <no-reply@example.com>',
      },
    );
  });
  afterAll(async () => {
    await testApp.close();
    await new Promise<void>((resolve) => versions.close(() => resolve()));
    rmSync(storage, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    testApp.redis.clear();
    testApp.mail.clear();
    testApp.mail.failWith = null;
    ownerToken = await testApp.setupOwner();
    newest = { status: 200, body: INSTALLED };
    asked = 0;
    disk.freeBytes = 300 * 1024 ** 3;
  });

  describe('the report', () => {
    it('is closed to visitors and to editors', async () => {
      await http().get('/v1/diagnostics').expect(401);
      await http().get('/v1/diagnostics/summary').expect(401);
      await http().post('/v1/admins').set(admin()).send(EDITOR).expect(201);
      const editor = testApp.bearer(await testApp.login(EDITOR.email, EDITOR.password));
      await http().get('/v1/diagnostics').set(editor).expect(403);
      await http()
        .put('/v1/diagnostics/settings')
        .set(editor)
        .send({ emailAlerts: false })
        .expect(403);
    });

    it('finds a healthy installation healthy, but for the backup it does not have yet', async () => {
      await allProcesses();
      const result = await report();
      expect(result.status).toBe('warning');
      expect(result.problems).toBe(0);
      expect(
        result.checks.filter((check) => check.status === 'warning').map(({ id }) => id),
      ).toEqual(['backups']);
      expect(find(result, 'database')).toMatchObject({ status: 'ok', group: 'core' });
      expect(find(result, 'database').summary).toMatch(/^PostgreSQL \d+\.\d+ answers, and holds /);
      expect(find(result, 'redis').summary).toBe('Redis 7.4.1 answers, and uses 1.0 MB of memory.');
      expect(find(result, 'role:worker').summary).toBe('1 process on worker-1.');
      expect(find(result, 'queue').summary).toBe('Nothing is waiting.');
      expect(find(result, 'site-url').summary).toBe('https://watch.example.com, with HTTPS.');
      expect(find(result, 'mail').status).toBe('ok');
      // Not set up is no fault.
      for (const id of ['tracker', 'edges', 'channels', 'stripe', 'tmdb', 'role:live']) {
        expect(find(result, id).status).toBe('off');
      }
      const pool = result.checks.find((check) => check.id.startsWith('storage:')) as Check;
      expect(pool.status).toBe('ok');
      expect(pool.summary).toMatch(/are free on its disk\.$/);
      expect(result.tookMs).toBeGreaterThanOrEqual(0);
    });

    it('lists the processes that reported in, and forgets the ones that went silent', async () => {
      await allProcesses();
      await otherProcess(['live'], { seenAt: new Date(Date.now() - 10 * 60_000).toISOString() });
      const result = await report();
      expect(result.processes.map((process) => process.roles.join('+')).sort()).toEqual([
        'api',
        'scheduler',
        'worker',
      ]);
      const own = result.processes.find((process) => process.roles.includes('api'));
      expect(own).toMatchObject({ pid: process.pid, version: expect.stringMatching(/^\d+\./) });
      expect(own).not.toHaveProperty('disks');
      expect(Object.keys(await testApp.redis.hgetall(PROCESSES_KEY))).toHaveLength(3);
    });

    it('says what stops when a worker or the scheduler is missing', async () => {
      await testApp.app.get(ProcessBeacon).report();
      const result = await report();
      expect(result.status).toBe('problem');
      expect(result.problems).toBe(2);
      // The worst comes first.
      expect(result.checks.slice(0, 2).map(({ id }) => id)).toEqual([
        'role:worker',
        'role:scheduler',
      ]);
      expect(result.checks[0]?.hint).toMatch(/APP_ROLE=worker/);
    });

    it('notices what goes wrong in daily use', async () => {
      await allProcesses();
      // The pool every installation has is made on first use.
      await report();
      const pool = await testApp.prisma.storagePool.findFirstOrThrow();
      await testApp.prisma.storagePool.update({
        where: { id: pool.id },
        data: { usedBytes: 95n * 1024n ** 3n, quotaBytes: 100n * 1024n ** 3n },
      });
      await testApp.prisma.job.create({
        data: { type: 'PROBE', status: 'FAILED', finishedAt: new Date() },
      });
      await testApp.prisma.edgeServer.create({
        data: {
          name: 'Paris',
          publicUrl: 'https://paris.example.com',
          secretHash: 'x',
          lastSeenAt: new Date(Date.now() - 3600_000),
        },
      });
      await testApp.prisma.channel.create({
        data: { name: 'News 24', slug: 'news-24', sourceLabel: 'rtmp://x', status: 'FAILED' },
      });
      await testApp.prisma.backup.create({
        data: {
          trigger: 'SCHEDULED',
          status: 'FAILED',
          storagePoolId: pool.id,
          appVersion: '0.1.0',
          error: 'pg_dump failed: disk full',
        },
      });
      testApp.redis.infoText =
        'redis_version:7.4.1\r\nused_memory:10\r\nmaxmemory:1000\r\nmaxmemory_policy:allkeys-lru\r\n';

      const result = await report();
      expect(find(result, `storage:${pool.id}`)).toMatchObject({ status: 'warning' });
      expect(find(result, 'queue').summary).toBe('1 job failed in the last 24 hours.');
      expect(find(result, 'edges').summary).toBe('Paris is offline.');
      expect(find(result, 'channels')).toMatchObject({
        status: 'problem',
        summary: 'News 24 has failed and is not playing.',
      });
      // A channel is switched on, so the missing live process matters now.
      expect(find(result, 'role:live').status).toBe('problem');
      expect(find(result, 'backups').summary).toBe(
        'The last backup failed: pg_dump failed: disk full',
      );
      expect(find(result, 'redis').status).toBe('warning');
      expect(result.problems).toBe(3);
      testApp.redis.infoText =
        'redis_version:7.4.1\r\nused_memory:1048576\r\nmaxmemory:0\r\nmaxmemory_policy:noeviction\r\n';
    });

    it('raises the alarm when a disk is nearly full', async () => {
      disk.freeBytes = 3 * 1024 ** 3;
      await allProcesses();
      const result = await report();
      const pool = result.checks.find((check) => check.id.startsWith('storage:')) as Check;
      expect(pool).toMatchObject({
        status: 'problem',
        summary: 'Only 3.0 GB are free on its disk.',
      });
      // Uploads are on the same disk. That is one problem, not two.
      expect(pool.facts).toContainEqual(['Its disk is also used for', 'uploads']);
      expect(result.checks.some((check) => check.id === 'disk:uploads')).toBe(false);
      expect(result.problems).toBe(1);
    });

    it('notices versions running side by side', async () => {
      await allProcesses();
      await otherProcess(['worker', 'second'], { version: '0.0.9' });
      expect(find(await report(), 'versions')).toMatchObject({ status: 'warning' });
    });
  });

  describe('the mark in the header', () => {
    it('knows nothing until somebody looked, and then what was found', async () => {
      const before = await http().get('/v1/diagnostics/summary').set(admin()).expect(200);
      expect(before.body).toEqual({ summary: null });
      await allProcesses();
      const full = await report();
      const after = await http().get('/v1/diagnostics/summary').set(admin()).expect(200);
      expect(after.body.summary).toEqual({
        status: 'warning',
        problems: 0,
        warnings: 1,
        checkedAt: full.checkedAt,
      });
    });
  });

  describe('newer versions', () => {
    it('says that the installation is current', async () => {
      const { version } = await report();
      expect(version).toMatchObject({
        commit: INSTALLED,
        update: 'current',
        latestCommit: INSTALLED,
        updateNote: null,
      });
      expect(version.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('says that a newer one exists, and asks only once in a while', async () => {
      newest.body = `${NEWER}\n`;
      expect((await report()).version).toMatchObject({ update: 'available', latestCommit: NEWER });
      await report();
      await report();
      expect(asked).toBe(1);
    });

    it('says why it does not know, and tries again later', async () => {
      newest = { status: 500, body: 'no' };
      const { version } = await report();
      expect(version.update).toBe('unknown');
      expect(version.updateNote).toBe(
        'The newest version could not be looked up: the answer was 500',
      );

      await testApp.redis.del(LATEST_COMMIT_KEY);
      newest = { status: 200, body: '<html>not a commit</html>' };
      expect((await report()).version.updateNote).toMatch(/not a commit/);
    });
  });

  describe('alerts', () => {
    it('are on from the start and go to the owners', async () => {
      const { alerts } = await report();
      expect(alerts).toEqual({ emailAlerts: true, mailEnabled: true, recipients: [OWNER.email] });
    });

    it('can be switched off, which is written down', async () => {
      await http()
        .put('/v1/diagnostics/settings')
        .set(admin())
        .send({ emailAlerts: 'no' })
        .expect(400);
      await http()
        .put('/v1/diagnostics/settings')
        .set(admin())
        .send({ emailAlerts: false })
        .expect(200);
      expect((await report()).alerts.emailAlerts).toBe(false);
      const entry = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'diagnostics.settings' },
      });
      expect(entry.metadata).toEqual({ emailAlerts: false });
    });

    it('write to the owners when a problem stays, once, and again when it is solved', async () => {
      // No worker and no scheduler: two problems.
      await testApp.app.get(ProcessBeacon).report();
      await look();
      // One look that finds a problem is not worth an email.
      expect(testApp.mail.outbox).toHaveLength(0);

      await look();
      expect(testApp.mail.outbox).toHaveLength(1);
      const mail = testApp.mail.outbox[0];
      expect(mail?.to).toBe(OWNER.email);
      expect(mail?.subject).toBe('2 problems on Night Cinema');
      expect(mail?.text).toContain('Worker: No worker is running.');
      expect(mail?.text).toContain('Scheduler: No scheduler is running.');
      expect(mail?.text).toContain('https://watch.example.com/admin/diagnostics');

      await look();
      await look();
      expect(testApp.mail.outbox).toHaveLength(1);

      await otherProcess(['worker']);
      await look();
      expect(testApp.mail.outbox).toHaveLength(2);
      expect(testApp.mail.outbox[1]?.subject).toBe('Solved on Night Cinema: Worker');

      // The header of the panel knows without anyone opening the page.
      const summary = await http().get('/v1/diagnostics/summary').set(admin()).expect(200);
      expect(summary.body.summary).toMatchObject({ status: 'problem', problems: 1 });
    });

    it('name a single problem in the subject', async () => {
      await testApp.app.get(ProcessBeacon).report();
      await otherProcess(['scheduler']);
      await look();
      await look();
      expect(testApp.mail.outbox[0]?.subject).toBe('Problem on Night Cinema: Worker');
      expect(testApp.mail.outbox[0]?.text).toContain('Start a process with APP_ROLE=worker');
    });

    it('reach every owner, and nobody else', async () => {
      await http()
        .post('/v1/admins')
        .set(admin())
        .send({ ...EDITOR, email: 'second-owner@example.com', role: 'OWNER' })
        .expect(201);
      await http().post('/v1/admins').set(admin()).send(EDITOR).expect(201);
      await testApp.app.get(ProcessBeacon).report();
      await look();
      await look();
      expect(testApp.mail.outbox.map((mail) => mail.to).sort()).toEqual([
        OWNER.email,
        'second-owner@example.com',
      ]);
    });

    it('send nothing when they are switched off, but still keep watch', async () => {
      await http()
        .put('/v1/diagnostics/settings')
        .set(admin())
        .send({ emailAlerts: false })
        .expect(200);
      await testApp.app.get(ProcessBeacon).report();
      await look();
      await look();
      expect(testApp.mail.outbox).toHaveLength(0);
      expect(JSON.parse((await testApp.redis.get(ALERT_MEMORY_KEY)) as string)).toHaveProperty(
        'role:worker',
      );
    });

    it('survive a mail server that is down', async () => {
      await testApp.app.get(ProcessBeacon).report();
      testApp.mail.failWith = 'Connection refused';
      await look();
      await expect(look()).resolves.toBeUndefined();
    });

    it('let only one process look at a time', async () => {
      await testApp.app.get(ProcessBeacon).report();
      await look();
      // The lock of the look before is still held.
      await testApp.app.get(DiagnosticsWatch).look();
      expect(testApp.mail.outbox).toHaveLength(0);
    });
  });
});
