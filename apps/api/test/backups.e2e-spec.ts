// SPDX-License-Identifier: AGPL-3.0-only
//
// End-to-end tests of backups: the settings, asking for a backup, the runner
// that makes it, downloading it, and the command line tool that restores it.
//
// Skipped unless TEST_DATABASE_URL is set. The tests that make a backup also
// need pg_dump, pg_restore and psql, no older than the database server. They
// are skipped where those are missing.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { AdminsModule } from '../src/admins/admins.module.js';
import { runBackupCli } from '../src/backups/backup-cli.js';
import { BACKUP_LOCK, BackupRunner } from '../src/backups/backup-runner.service.js';
import { BackupsModule, BackupsSchedulerModule } from '../src/backups/backups.module.js';
import type { BackupOverview, BackupView } from '../src/backups/backups.service.js';
import { connectionEnv, majorOf, runPgTool, toolVersion } from '../src/backups/pg-tools.js';
import { createTestApp, OWNER, TEST_DATABASE_URL, type TestApp } from './support/test-app.js';

const MASTER_KEY = 'c'.repeat(64);
const EDITOR = {
  email: 'editor@example.com',
  displayName: 'Eddie Editor',
  password: 'editor-password-123',
  role: 'EDITOR',
};

async function query(statement: string, databaseUrl: string): Promise<string> {
  const run = runPgTool(
    'psql',
    ['-X', '-q', '-t', '-A', '-c', statement],
    connectionEnv(databaseUrl),
    {
      output: 'pipe',
    },
  );
  const printed = text(run.stdout as NodeJS.ReadableStream);
  await run.done;
  return (await printed).trim();
}

/** Whether the tools on this machine can back up the test database. */
async function toolsFit(): Promise<boolean> {
  if (!TEST_DATABASE_URL) {
    return false;
  }
  const versions = await Promise.all([toolVersion('pg_dump'), toolVersion('pg_restore')]);
  if (versions.some((version) => version === null)) {
    return false;
  }
  try {
    const server = await query('SHOW server_version', TEST_DATABASE_URL);
    return versions.every((version) => majorOf(version as string) >= majorOf(server));
  } catch {
    return false;
  }
}
const TOOLS = await toolsFit();
/** pg_dump and pg_restore start a process each time, which can take a while under load. */
const TOOL_TIMEOUT_MS = 120_000;

describe.skipIf(!TEST_DATABASE_URL)('Backups (e2e)', () => {
  let testApp: TestApp;
  let ownerToken: string;
  let storage: string;

  const http = () => testApp.http();
  const admin = () => testApp.bearer(ownerToken);
  const overview = async () =>
    (await http().get('/v1/backups').set(admin()).expect(200)).body as BackupOverview;
  const ask = async () =>
    (await http().post('/v1/backups').set(admin()).expect(202)).body as BackupView;
  const runner = () => testApp.app.get(BackupRunner);
  const look = async (now?: Date) => {
    await testApp.redis.del(BACKUP_LOCK);
    await runner().look(now);
  };
  /** Makes the runner believe what a test wants about its tools. */
  const pretendTools = (problem: string | null) => {
    (runner() as unknown as { tools: unknown }).tools = {
      at: Date.now(),
      report: { pgDump: problem ? null : '17.0', server: '17.0', problem },
    };
  };
  const saveSettings = (settings: Record<string, unknown>) =>
    http().put('/v1/backups/settings').set(admin()).send(settings);
  const OFF = { schedule: 'off', hour: 3, weekday: 0, keep: 14, storagePoolId: null };
  const fileOf = (backup: BackupView) => path.join(storage, 'backups', backup.fileName as string);
  /** A finished backup, asked for by hand. */
  const make = async (): Promise<BackupView> => {
    const asked = await ask();
    await look();
    const made = (await overview()).backups.find((backup) => backup.id === asked.id) as BackupView;
    expect(made.error).toBeNull();
    expect(made.status).toBe('COMPLETED');
    return made;
  };

  beforeAll(async () => {
    storage = mkdtempSync(path.join(tmpdir(), 'onyx-backups-'));
    testApp = await createTestApp([AdminsModule, BackupsModule, BackupsSchedulerModule], {
      STORAGE_LOCAL_PATH: storage,
    });
  });
  afterAll(async () => {
    await testApp.close();
    rmSync(storage, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await testApp.resetDatabase();
    testApp.redis.clear();
    ownerToken = await testApp.setupOwner();
    (runner() as unknown as { tools: unknown }).tools = undefined;
    rmSync(path.join(storage, 'backups'), { recursive: true, force: true });
  });

  describe('settings and permissions', () => {
    it('starts with a backup every night and none made yet', async () => {
      const view = await overview();
      expect(view.settings).toEqual({
        schedule: 'daily',
        hour: 3,
        weekday: 0,
        keep: 14,
        storagePoolId: null,
      });
      expect(view.protection).toBe('none');
      expect(view.lastGoodAt).toBeNull();
      expect(view.nextRunAt).not.toBeNull();
      // No process with the scheduler role has reported in.
      expect(view.runner).toBeNull();
      expect(view.backups).toEqual([]);
      expect(view.days).toHaveLength(30);
      expect(view.pools).toHaveLength(1);
      expect(view.pools[0]).toMatchObject({ isDefault: true, driver: 'LOCAL' });
    });

    it('is closed to visitors and to editors', async () => {
      await http().get('/v1/backups').expect(401);
      await http().post('/v1/admins').set(admin()).send(EDITOR).expect(201);
      const editor = testApp.bearer(await testApp.login(EDITOR.email, EDITOR.password));
      await http().get('/v1/backups').set(editor).expect(403);
      await http().post('/v1/backups').set(editor).expect(403);
      await http().put('/v1/backups/settings').set(editor).send(OFF).expect(403);
    });

    it('saves the settings and writes it down', async () => {
      const pool = (await overview()).pools[0] as { id: string };
      const wanted = { schedule: 'weekly', hour: 22, weekday: 5, keep: 4, storagePoolId: pool.id };
      await saveSettings(wanted).expect(200);
      const view = await overview();
      expect(view.settings).toEqual(wanted);
      expect(new Date(view.nextRunAt as string).getUTCDay()).toBe(5);
      expect(new Date(view.nextRunAt as string).getUTCHours()).toBe(22);
      const entry = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'backup.settings' },
      });
      expect(entry.metadata).toMatchObject({ schedule: 'weekly', keep: 4 });
    });

    it('refuses settings that make no sense', async () => {
      await saveSettings({ ...OFF, hour: 24 }).expect(400);
      await saveSettings({ ...OFF, keep: 0 }).expect(400);
      await saveSettings({ ...OFF, schedule: 'hourly' }).expect(400);
      await saveSettings({
        ...OFF,
        storagePoolId: '0192f0c0-0000-7000-8000-000000000000',
      }).expect(422);
      const pool = (await overview()).pools[0] as { id: string };
      await testApp.prisma.storagePool.update({
        where: { id: pool.id },
        data: { isActive: false },
      });
      const refused = await saveSettings({ ...OFF, storagePoolId: pool.id }).expect(422);
      expect(refused.body.message).toMatch(/switched off/);
    });

    it('tells no schedule apart from no backup', async () => {
      await saveSettings(OFF).expect(200);
      const view = await overview();
      expect(view.protection).toBe('off');
      expect(view.nextRunAt).toBeNull();
    });
  });

  describe('asking for a backup', () => {
    it('queues one, and only one at a time', async () => {
      const asked = await ask();
      expect(asked).toMatchObject({
        status: 'PENDING',
        trigger: 'MANUAL',
        createdBy: { displayName: OWNER.displayName },
        fileName: null,
      });
      const refused = await http().post('/v1/backups').set(admin()).expect(409);
      expect(refused.body.message).toMatch(/already/);
      expect(await testApp.prisma.auditLog.count({ where: { action: 'backup.create' } })).toBe(1);
      expect(testApp.redis.published.map(({ message }) => JSON.parse(message))).toContainEqual({
        type: 'backup',
        backupId: asked.id,
      });
    });

    it('fails with the reason when the tools are missing', async () => {
      pretendTools('pg_dump is not installed where the scheduler runs.');
      const asked = await ask();
      await look();
      const view = await overview();
      expect(view.backups[0]).toMatchObject({
        id: asked.id,
        status: 'FAILED',
        error: 'pg_dump is not installed where the scheduler runs.',
        sizeBytes: null,
      });
      expect(view.runner?.problem).toMatch(/not installed/);
      expect(view.protection).toBe('none');
      expect(existsSync(path.join(storage, 'backups'))).toBe(false);
      // The next one can be asked for: a failure does not block.
      await ask();
    });

    it('does not try a scheduled backup without the tools', async () => {
      pretendTools('pg_dump is not installed where the scheduler runs.');
      await look();
      expect(await testApp.prisma.backup.count()).toBe(0);
    });

    it('marks a backup as failed whose process was cut off', async () => {
      pretendTools(null);
      await saveSettings(OFF).expect(200);
      const pool = (await overview()).pools[0] as { id: string };
      const cut = await testApp.prisma.backup.create({
        data: {
          trigger: 'SCHEDULED',
          status: 'RUNNING',
          storagePoolId: pool.id,
          appVersion: '0.1.0',
          storageKey: 'backups/half.onyxbackup',
          startedAt: new Date(),
        },
      });
      writeFileSync(path.join(mkdirBackups(), 'half.onyxbackup'), 'half a file');
      await look();
      const after = await testApp.prisma.backup.findUniqueOrThrow({ where: { id: cut.id } });
      expect(after.status).toBe('FAILED');
      expect(after.error).toMatch(/server stopped/);
      expect(existsSync(path.join(storage, 'backups', 'half.onyxbackup'))).toBe(false);
    });

    it('deletes a backup with its file, but not one that is being made', async () => {
      const pool = (await overview()).pools[0] as { id: string };
      writeFileSync(path.join(mkdirBackups(), 'old.onyxbackup'), 'x');
      const [done, running] = await Promise.all(
        (['COMPLETED', 'RUNNING'] as const).map((status) =>
          testApp.prisma.backup.create({
            data: {
              trigger: 'MANUAL',
              status,
              storagePoolId: pool.id,
              appVersion: '0.1.0',
              storageKey: status === 'COMPLETED' ? 'backups/old.onyxbackup' : null,
            },
          }),
        ),
      );
      await http().delete(`/v1/backups/${running?.id}`).set(admin()).expect(409);
      await http().delete(`/v1/backups/${done?.id}`).set(admin()).expect(204);
      expect(existsSync(path.join(storage, 'backups', 'old.onyxbackup'))).toBe(false);
      expect(await testApp.prisma.backup.count()).toBe(1);
      const entry = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'backup.delete' },
      });
      expect(entry.metadata).toMatchObject({ file: 'old.onyxbackup' });
      await http().delete(`/v1/backups/${done?.id}`).set(admin()).expect(404);
    });
  });

  /** The driver creates directories as it writes. Tests that write by hand do it here. */
  function mkdirBackups(): string {
    const directory = path.join(storage, 'backups');
    mkdirSync(directory, { recursive: true });
    return directory;
  }

  describe.skipIf(!TOOLS)('making backups', { timeout: TOOL_TIMEOUT_MS }, () => {
    it('writes an encrypted file that was proven to open', async () => {
      await saveSettings(OFF).expect(200);
      const made = await make();
      expect(made.fileName).toMatch(/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ-[0-9a-f]{8}\.onyxbackup$/);
      expect(made.entries).toBeGreaterThan(50);
      expect(made.migration).toMatch(/^\d{14}_/);
      expect(made.startedAt).not.toBeNull();
      expect(made.finishedAt).not.toBeNull();

      const file = readFileSync(fileOf(made));
      expect(file.length).toBe(made.sizeBytes);
      expect(createHash('sha256').update(file).digest('hex')).toBe(made.sha256);
      expect(file.subarray(0, 8).toString()).toBe('ONYXBKP1');
      // Nothing of the database can be read in it, and it is no plain dump.
      expect(file.includes(OWNER.email)).toBe(false);
      expect(file.includes('PGDMP')).toBe(false);

      const view = await overview();
      expect(view.protection).toBe('off');
      expect(view.lastGoodAt).toBe(made.createdAt);
      expect(view.totalBytes).toBe(made.sizeBytes);
      expect(view.days.at(-1)).toMatchObject({ good: 1, failed: 0 });
      expect(view.runner).toMatchObject({ problem: null });
      expect(view.runner?.pgDump).toMatch(/^\d+\./);
    });

    it('makes the scheduled backup once per slot, and catches up', async () => {
      const monday = new Date('2026-11-23T03:00:10Z');
      await look(monday);
      let rows = await testApp.prisma.backup.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        trigger: 'SCHEDULED',
        status: 'COMPLETED',
        createdById: null,
      });
      expect((await overview()).protection).toBe('protected');

      // Later the same day, by the clock of the backup that was just made.
      await look(new Date(Date.now() + 60_000));
      expect(await testApp.prisma.backup.count()).toBe(1);

      // Two days on, after the server was off: one backup, not two.
      await look(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
      rows = await testApp.prisma.backup.findMany();
      expect(rows).toHaveLength(2);
    });

    it('lists the backup a database was restored from as ready again', async () => {
      await saveSettings(OFF).expect(200);
      const made = await make();
      // A backup holds its own entry as it was while it was being made.
      await testApp.prisma.backup.update({
        where: { id: made.id },
        data: { status: 'RUNNING', sizeBytes: null, sha256: null, entries: null, finishedAt: null },
      });
      await look();
      const again = (await overview()).backups[0] as BackupView;
      expect(again).toMatchObject({
        id: made.id,
        status: 'COMPLETED',
        sizeBytes: made.sizeBytes,
        sha256: made.sha256,
        entries: made.entries,
        error: null,
      });
      expect(existsSync(fileOf(made))).toBe(true);
    });

    it('makes none on its own when the schedule is off', async () => {
      await saveSettings(OFF).expect(200);
      await look();
      expect(await testApp.prisma.backup.count()).toBe(0);
    });

    it('keeps the newest backups and deletes the rest with their files', async () => {
      await saveSettings({ ...OFF, keep: 2 }).expect(200);
      const first = await make();
      const second = await make();
      expect(existsSync(fileOf(first))).toBe(true);
      const third = await make();
      const kept = (await overview()).backups.map((backup) => backup.id);
      expect(kept).toEqual([third.id, second.id]);
      expect(existsSync(fileOf(first))).toBe(false);
      expect(existsSync(fileOf(second))).toBe(true);
    });

    it('hands the file out through a link that works for a minute', async () => {
      await saveSettings(OFF).expect(200);
      const made = await make();
      const link = (await http().post(`/v1/backups/${made.id}/download`).set(admin()).expect(200))
        .body as { path: string; expiresAt: string };
      expect(new Date(link.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(60_000);

      // The link needs no sign-in: the browser follows it as it is.
      const download = await http()
        .get(link.path)
        .buffer(true)
        .parse(binary as never)
        .expect(200);
      expect(download.headers['content-disposition']).toBe(
        `attachment; filename="${made.fileName}"`,
      );
      expect(download.headers['content-length']).toBe(String(made.sizeBytes));
      expect(download.headers['cache-control']).toBe('no-store');
      expect((download.body as Buffer).equals(readFileSync(fileOf(made)))).toBe(true);

      await http()
        .get(`/v1/backups/${made.id}/file?token=1.${'A'.repeat(43)}`)
        .expect(403);
      await http().get(`/v1/backups/${made.id}/file`).expect(400);
      // A link is for one backup only.
      const other = await make();
      await http().get(link.path.replace(made.id, other.id)).expect(403);

      const entry = await testApp.prisma.auditLog.findFirstOrThrow({
        where: { action: 'backup.download' },
      });
      expect(entry.metadata).toMatchObject({ file: made.fileName });
    });

    it('offers no link for a backup that is not finished', async () => {
      const asked = await ask();
      await http().post(`/v1/backups/${asked.id}/download`).set(admin()).expect(409);
    });
  });

  describe.skipIf(!TOOLS)('the command line tool', { timeout: TOOL_TIMEOUT_MS }, () => {
    const SCRATCH = 'onyx_backup_restore_test';
    const scratchUrl = () => {
      const url = new URL(TEST_DATABASE_URL as string);
      url.pathname = `/${SCRATCH}`;
      return url.toString();
    };
    let lines: string[];
    const cli = (args: string[], env: Record<string, string> = {}) =>
      runBackupCli(args, {
        env: { DATABASE_URL: TEST_DATABASE_URL, MASTER_KEY, ...env },
        out: (line) => lines.push(line),
      });
    const said = () => lines.join('\n');

    beforeEach(async () => {
      lines = [];
      await saveSettings(OFF).expect(200);
      await query(`DROP DATABASE IF EXISTS ${SCRATCH}`, TEST_DATABASE_URL as string);
      await query(`CREATE DATABASE ${SCRATCH}`, TEST_DATABASE_URL as string);
    });
    afterAll(async () => {
      await query(`DROP DATABASE IF EXISTS ${SCRATCH}`, TEST_DATABASE_URL as string);
    });

    it('proves that a backup from the panel opens', async () => {
      const made = await make();
      expect(await cli(['verify', fileOf(made)])).toBe(0);
      expect(said()).toContain(`holds ${made.entries} database objects`);
      expect(said()).toContain(`Migration:  ${made.migration}`);

      lines = [];
      expect(await cli(['info', fileOf(made)], { MASTER_KEY: '' })).toBe(0);
      expect(said()).toContain('By version: ');
    });

    it('says why a backup does not open', async () => {
      const made = await make();
      expect(await cli(['verify', fileOf(made)], { MASTER_KEY: 'd'.repeat(64) })).toBe(1);
      expect(said()).toMatch(/another MASTER_KEY/);

      lines = [];
      const damaged = path.join(storage, 'damaged.onyxbackup');
      const bytes = readFileSync(fileOf(made));
      bytes[bytes.length - 40] = (bytes[bytes.length - 40] as number) ^ 1;
      writeFileSync(damaged, bytes);
      expect(await cli(['verify', damaged])).toBe(1);
      expect(said()).toMatch(/damaged/);

      lines = [];
      writeFileSync(damaged, 'not a backup at all');
      expect(await cli(['verify', damaged])).toBe(1);
      expect(said()).toMatch(/not a backup file/);
      expect(await cli(['verify', path.join(storage, 'missing')])).toBe(1);
    });

    it('restores only when told to, and then all of it', async () => {
      const made = await make();
      const target = { DATABASE_URL: scratchUrl() };

      expect(await cli(['restore', fileOf(made)], target)).toBe(0);
      expect(said()).toMatch(/Nothing was changed/);
      expect(said()).toContain(`database "${SCRATCH}"`);
      expect(
        await query("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'", scratchUrl()),
      ).toBe('0');

      lines = [];
      expect(await cli(['restore', fileOf(made), '--yes'], target)).toBe(0);
      expect(said()).toMatch(/The database is restored/);
      expect(await query('SELECT email FROM admin_users', scratchUrl())).toBe(OWNER.email);
      const tables = await query(
        "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'",
        TEST_DATABASE_URL as string,
      );
      expect(
        await query("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'", scratchUrl()),
      ).toBe(tables);
      expect(await query('SELECT count(*) FROM _prisma_migrations', scratchUrl())).toBe(
        await query('SELECT count(*) FROM _prisma_migrations', TEST_DATABASE_URL as string),
      );

      // A second restore replaces what is there, also what the backup does not know.
      await query('CREATE TABLE left_over (id int); DELETE FROM admin_users', scratchUrl());
      lines = [];
      const saved = path.join(storage, 'before-restore.onyxbackup');
      expect(await cli(['restore', fileOf(made), '--yes', '--save-current', saved], target)).toBe(
        0,
      );
      expect(await query('SELECT email FROM admin_users', scratchUrl())).toBe(OWNER.email);
      expect(
        await query("SELECT count(*) FROM pg_tables WHERE tablename = 'left_over'", scratchUrl()),
      ).toBe('0');
      // What was there before the restore was put aside first.
      lines = [];
      expect(await cli(['verify', saved])).toBe(0);
    });

    it('refuses to restore under a running application', async () => {
      const made = await make();
      // The test application itself is connected to this database.
      expect(await cli(['restore', fileOf(made), '--yes'])).toBe(1);
      expect(said()).toMatch(/connections to the database are open/);
      expect(await testApp.prisma.adminUser.count()).toBe(1);
    });

    it('does not touch the database for a backup that does not open', async () => {
      const made = await make();
      await cli(['restore', fileOf(made), '--yes'], { DATABASE_URL: scratchUrl() });
      lines = [];
      expect(
        await cli(['restore', fileOf(made), '--yes'], {
          DATABASE_URL: scratchUrl(),
          MASTER_KEY: 'd'.repeat(64),
        }),
      ).toBe(1);
      expect(await query('SELECT email FROM admin_users', scratchUrl())).toBe(OWNER.email);
    });

    it('writes a backup of its own, and the plain archive on request', async () => {
      const file = path.join(storage, 'by-hand.onyxbackup');
      expect(await cli(['create', file])).toBe(0);
      expect(said()).toMatch(
        /Backup written to .*by-hand\.onyxbackup: \d+ bytes, \d+ database objects/,
      );
      expect(readFileSync(file).includes(OWNER.email)).toBe(false);

      const plain = path.join(storage, 'plain.dump');
      expect(await cli(['decrypt', file, plain])).toBe(0);
      expect(readFileSync(plain).subarray(0, 5).toString()).toBe('PGDMP');
      expect(said()).toMatch(/NOT encrypted/);
    });

    it('explains itself', async () => {
      expect(await cli([])).toBe(0);
      expect(said()).toMatch(/backup restore <file>/);
      expect(await cli(['shred', 'everything'])).toBe(2);
      expect(await cli(['create', path.join(storage, 'x')], { DATABASE_URL: '' })).toBe(1);
      expect(said()).toMatch(/DATABASE_URL is not set/);
    });
  });
});

/** Collects a binary answer, which supertest would otherwise read as text. */
function binary(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}
