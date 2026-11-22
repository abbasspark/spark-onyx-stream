// SPDX-License-Identifier: AGPL-3.0-only
import {
  backupsCheck,
  channelsCheck,
  databaseCheck,
  decideAlerts,
  edgesCheck,
  formatBytes,
  mailCheck,
  poolCheck,
  type PoolFacts,
  queueCheck,
  redisCheck,
  roleChecks,
  setupChecks,
  sortChecks,
  summarize,
  trackerCheck,
  versionsCheck,
  workDiskCheck,
  workDiskChecks,
} from './diagnostics.checks.js';
import type { Check, ProcessReport } from './diagnostics.types.js';
import { sameCommit } from './update-check.service.js';

const GB = 1024 ** 3;
const NOW = new Date('2026-11-22T12:00:00Z');
const ok = <T>(value: T, tookMs = 3) => ({ ok: true as const, value, tookMs });
const failed = (error: string) => ({ ok: false as const, error });

const process = (roles: string[], over: Partial<ProcessReport> = {}): ProcessReport => ({
  id: roles.join('+'),
  roles,
  host: 'server-1',
  pid: 7,
  version: '0.1.0',
  node: '24.1.0',
  startedAt: '2026-11-22T10:00:00Z',
  seenAt: '2026-11-22T11:59:55Z',
  memoryBytes: 200 * 1024 ** 2,
  ...over,
});

describe('formatBytes', () => {
  it('reads like a person would say it', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(250 * 1024 ** 2)).toBe('250 MB');
    expect(formatBytes(3.2 * GB)).toBe('3.2 GB');
  });
});

describe('database and Redis', () => {
  const facts = { version: '17.2', sizeBytes: 48 * 1024 ** 2, failedMigrations: 0 };

  it('are fine when they answer', () => {
    expect(databaseCheck(ok(facts))).toMatchObject({
      status: 'ok',
      summary: 'PostgreSQL 17.2 answers, and holds 48.0 MB.',
    });
    expect(
      redisCheck(
        ok({ version: '7.4.1', usedBytes: 2 * 1024 ** 2, maxBytes: 0, policy: 'noeviction' }),
      ),
    ).toMatchObject({ status: 'ok', summary: 'Redis 7.4.1 answers, and uses 2.0 MB of memory.' });
  });

  it('are a problem when they do not', () => {
    const database = databaseCheck(failed('connection refused'));
    expect(database.status).toBe('problem');
    expect(database.summary).toBe('PostgreSQL does not answer: connection refused');
    expect(database.hint).toMatch(/DATABASE_URL/);
    expect(redisCheck(failed('no answer within 5 seconds')).status).toBe('problem');
  });

  it('notice a migration that was cut off', () => {
    const check = databaseCheck(ok({ ...facts, failedMigrations: 1 }));
    expect(check.status).toBe('problem');
    expect(check.summary).toBe('1 migration of the database did not finish.');
  });

  it('notice a slow database', () => {
    expect(databaseCheck(ok(facts, 1800)).status).toBe('warning');
  });

  it('warn when Redis may drop jobs or is nearly full', () => {
    const dropping = redisCheck(
      ok({ version: '7', usedBytes: 10, maxBytes: 1000, policy: 'allkeys-lru' }),
    );
    expect(dropping.status).toBe('warning');
    expect(dropping.hint).toMatch(/noeviction/);
    expect(
      redisCheck(ok({ version: '7', usedBytes: 950, maxBytes: 1000, policy: 'noeviction' })).status,
    ).toBe('warning');
    expect(
      redisCheck(ok({ version: '7', usedBytes: 500, maxBytes: 1000, policy: 'noeviction' })).status,
    ).toBe('ok');
  });
});

describe('processes', () => {
  it('are fine when every role has one', () => {
    const checks = roleChecks(
      [process(['api', 'scheduler']), process(['worker']), process(['live'])],
      true,
    );
    expect(checks.map((check) => check.status)).toEqual(['ok', 'ok', 'ok']);
    expect(checks[0]?.summary).toBe('1 process on server-1.');
  });

  it('say what stops without a worker or a scheduler', () => {
    const [worker, scheduler] = roleChecks([process(['api'])], false);
    expect(worker).toMatchObject({ id: 'role:worker', status: 'problem' });
    expect(worker?.summary).toMatch(/Uploaded videos wait/);
    expect(scheduler?.summary).toMatch(/Backups are not made/);
    expect(scheduler?.hint).toMatch(/APP_ROLE=api,scheduler/);
  });

  it('need a live process only when a channel is switched on', () => {
    expect(roleChecks([process(['api'])], false)[2]).toMatchObject({ status: 'off' });
    expect(roleChecks([process(['api'])], true)[2]).toMatchObject({ status: 'problem' });
  });

  it('count processes across servers', () => {
    const [worker] = roleChecks(
      [process(['worker']), process(['worker'], { host: 'server-2' })],
      false,
    );
    expect(worker?.summary).toBe('2 processes on server-1, server-2.');
  });

  it('notice versions running side by side', () => {
    expect(versionsCheck([process(['api']), process(['worker'])])).toBeNull();
    const mixed = versionsCheck([process(['api']), process(['worker'], { version: '0.2.0' })]);
    expect(mixed).toMatchObject({ status: 'warning' });
    expect(mixed?.summary).toMatch(/0\.1\.0 and 0\.2\.0/);
  });
});

describe('the queue', () => {
  const quiet = { waiting: 0, active: 0, failedToday: 0, oldestWaitingMs: null, stuckAssets: 0 };

  it('is fine when nothing waits or things move', () => {
    expect(queueCheck(ok(quiet), 1)).toMatchObject({
      status: 'ok',
      summary: 'Nothing is waiting.',
    });
    expect(
      queueCheck(ok({ ...quiet, waiting: 3, active: 1, oldestWaitingMs: 60_000 }), 1).summary,
    ).toBe('1 job running, 3 waiting.');
  });

  it('warns about jobs that failed, wait for hours or never ended', () => {
    const failedJobs = queueCheck(ok({ ...quiet, failedToday: 2 }), 1);
    expect(failedJobs).toMatchObject({
      status: 'warning',
      summary: '2 jobs failed in the last 24 hours.',
    });
    expect(failedJobs.link?.to).toBe('/jobs?status=FAILED');
    expect(queueCheck(ok({ ...quiet, waiting: 5, oldestWaitingMs: 3 * 3600_000 }), 1).summary).toBe(
      '5 jobs waiting, the first one for 3 hours.',
    );
    expect(queueCheck(ok({ ...quiet, stuckAssets: 1 }), 1).summary).toBe(
      '1 video has been processing for over 12 hours.',
    );
  });

  it('leaves a long wait to the missing worker to explain', () => {
    expect(queueCheck(ok({ ...quiet, waiting: 5, oldestWaitingMs: 3 * 3600_000 }), 0).status).toBe(
      'ok',
    );
  });
});

describe('storage', () => {
  const pool = (over: Partial<PoolFacts> = {}): PoolFacts => ({
    id: 'p1',
    name: 'Local storage',
    driver: 'LOCAL',
    isDefault: true,
    usedBytes: 12 * GB,
    quotaBytes: null,
    probe: ok({ freeBytes: 300 * GB, totalBytes: 500 * GB }),
    ...over,
  });

  it('is fine with room to spare', () => {
    expect(poolCheck(pool())).toMatchObject({
      id: 'storage:p1',
      status: 'ok',
      summary: 'Holds 12.0 GB. 300 GB are free on its disk.',
    });
  });

  it('warns before the disk is full, and is a problem when it nearly is', () => {
    expect(
      poolCheck(pool({ probe: ok({ freeBytes: 30 * GB, totalBytes: 500 * GB }) })).status,
    ).toBe('warning');
    const full = poolCheck(pool({ probe: ok({ freeBytes: 6 * GB, totalBytes: 500 * GB }) }));
    expect(full.status).toBe('problem');
    expect(full.summary).toBe('Only 6.0 GB are free on its disk.');
  });

  it('does not cry wolf on a very large disk', () => {
    expect(
      poolCheck(pool({ probe: ok({ freeBytes: 300 * GB, totalBytes: 8000 * GB }) })).status,
    ).toBe('ok');
  });

  it('watches the limit of a pool', () => {
    expect(poolCheck(pool({ usedBytes: 95 * GB, quotaBytes: 100 * GB })).status).toBe('warning');
    const over = poolCheck(pool({ usedBytes: 100 * GB, quotaBytes: 100 * GB }));
    expect(over.status).toBe('problem');
    expect(over.summary).toMatch(/the pool is full/);
  });

  it('says when a bucket or a folder cannot be reached', () => {
    const bucket = poolCheck(
      pool({ driver: 'S3', name: 'Offsite', probe: failed('access denied') }),
    );
    expect(bucket).toMatchObject({
      status: 'problem',
      summary: 'The bucket cannot be reached: access denied',
    });
    expect(poolCheck(pool({ probe: failed('ENOENT') })).summary).toMatch(
      /^The folder cannot be reached/,
    );
    expect(poolCheck(pool({ driver: 'S3', probe: ok(null) })).summary).toBe(
      'The bucket answers. It holds 12.0 GB.',
    );
  });

  it('watches the folders work is done in', () => {
    expect(
      workDiskCheck('uploads', ok({ freeBytes: 200 * GB, totalBytes: 500 * GB })),
    ).toMatchObject({
      id: 'disk:uploads',
      status: 'ok',
    });
    const tight = workDiskCheck('processing', ok({ freeBytes: 3 * GB, totalBytes: 500 * GB }));
    expect(tight.status).toBe('problem');
    expect(tight.hint).toMatch(/everything made from it/);
    expect(workDiskCheck('live', failed('ENOENT')).hint).toBe('Check LIVE_PATH.');
    expect(workDiskCheck('live', ok({ freeBytes: 1, totalBytes: 2 })).group).toBe('live');
  });
});

describe('folders that share a disk', () => {
  const disk = (name: 'uploads' | 'processing' | 'live', freeGb: number, totalGb = 500) => ({
    name,
    freeBytes: freeGb * GB,
    totalBytes: totalGb * GB,
  });
  const poolOn = (totalGb: number) => ({
    check: {
      id: 'storage:p1',
      group: 'storage',
      title: 'Pool',
      status: 'ok',
      summary: '',
    } as Check,
    disk: { freeBytes: 3 * GB, totalBytes: totalGb * GB },
  });

  it('say a full disk once, on the pool that is on it', () => {
    const pool = poolOn(500);
    const checks = workDiskChecks(
      [pool],
      [disk('uploads', 3), disk('processing', 3), disk('live', 3)],
    );
    expect(checks).toEqual([]);
    expect(pool.check.facts).toEqual([
      ['Its disk is also used for', 'uploads, processing, live channels'],
    ]);
  });

  it('get a check of their own on another disk, one per disk', () => {
    const pool = poolOn(2000);
    const checks = workDiskChecks(
      [pool],
      [disk('uploads', 200), disk('processing', 3, 100), disk('live', 2.5, 100)],
    );
    expect(checks.map(({ id, status }) => [id, status])).toEqual([
      ['disk:uploads', 'ok'],
      ['disk:processing', 'problem'],
    ]);
    expect(checks[1]?.facts?.at(-1)).toEqual([
      'The same disk is used for',
      'processing, live channels',
    ]);
    expect(pool.check.facts).toBeUndefined();
  });

  it('go by the process with the least room', () => {
    const [check] = workDiskChecks([], [disk('processing', 200), disk('processing', 2, 100)]);
    expect(check).toMatchObject({ status: 'problem', summary: 'Only 2.0 GB are free.' });
  });

  it('report a folder that cannot be read by itself', () => {
    const checks = workDiskChecks(
      [poolOn(500)],
      [{ ...disk('uploads', 0), error: 'ENOENT' }, disk('live', 3)],
    );
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ id: 'disk:uploads', status: 'problem' });
  });
});

describe('backups', () => {
  const facts = {
    protection: 'protected' as const,
    lastGoodAt: '2026-11-22T03:00:00Z',
    runner: { pgDump: '17.2', server: '17.2', problem: null },
    settings: { schedule: 'daily' as const, hour: 3, weekday: 0, keep: 14, storagePoolId: null },
    lastFailure: null,
  };

  it('is fine with a fresh backup', () => {
    expect(backupsCheck(ok(facts), NOW)).toMatchObject({
      status: 'ok',
      summary: 'The newest backup was made 9 hours ago.',
    });
  });

  it('does not count in zero hours', () => {
    expect(backupsCheck(ok({ ...facts, lastGoodAt: '2026-11-22T11:50:00Z' }), NOW).summary).toBe(
      'The newest backup was made less than an hour ago.',
    );
  });

  it('is a problem when one is overdue, failed, or cannot be made', () => {
    expect(
      backupsCheck(ok({ ...facts, protection: 'late', lastGoodAt: '2026-11-18T03:00:00Z' }), NOW)
        .summary,
    ).toBe('A backup is overdue: the newest one was made 4 days ago.');
    expect(
      backupsCheck(ok({ ...facts, lastFailure: 'pg_dump failed: disk full' }), NOW),
    ).toMatchObject({
      status: 'problem',
      summary: 'The last backup failed: pg_dump failed: disk full',
    });
    expect(
      backupsCheck(
        ok({
          ...facts,
          runner: { pgDump: null, server: '17.2', problem: 'pg_dump is not installed.' },
        }),
        NOW,
      ).summary,
    ).toBe('Backups cannot be made: pg_dump is not installed.');
  });

  it('warns when there is none yet or the schedule is off', () => {
    expect(backupsCheck(ok({ ...facts, protection: 'none', lastGoodAt: null }), NOW).status).toBe(
      'warning',
    );
    expect(backupsCheck(ok({ ...facts, protection: 'off', lastGoodAt: null }), NOW).summary).toBe(
      'Scheduled backups are off, and there is no backup.',
    );
  });
});

describe('delivery and live', () => {
  it('reads the tracker', () => {
    expect(trackerCheck({ state: 'off' }).status).toBe('off');
    expect(
      trackerCheck({
        state: 'unreachable',
        trackerUrl: 'wss://x/tracker',
        message: 'The tracker cannot be reached.',
      }),
    ).toMatchObject({ status: 'warning', summary: 'The tracker cannot be reached.' });
  });

  it('names the edges that are offline', () => {
    expect(edgesCheck([]).status).toBe('off');
    expect(edgesCheck([{ name: 'Frankfurt', status: 'ONLINE' }])).toMatchObject({
      status: 'ok',
      summary: '1 of 1 edge online.',
    });
    const check = edgesCheck([
      { name: 'Frankfurt', status: 'ONLINE' },
      { name: 'Paris', status: 'OFFLINE' },
      { name: 'Oslo', status: 'OFFLINE' },
      { name: 'Rome', status: 'DISABLED' },
    ]);
    expect(check).toMatchObject({ status: 'warning', summary: 'Paris, Oslo are offline.' });
  });

  it('names the channels in trouble', () => {
    expect(channelsCheck({ enabled: 0, failed: [], reconnecting: [] }).status).toBe('off');
    expect(channelsCheck({ enabled: 3, failed: [], reconnecting: [] }).summary).toBe(
      '3 channels switched on, none in trouble.',
    );
    expect(
      channelsCheck({ enabled: 3, failed: ['News 24'], reconnecting: ['Sport'] }),
    ).toMatchObject({
      status: 'problem',
      summary: 'News 24 has failed and is not playing.',
    });
    expect(
      channelsCheck({ enabled: 3, failed: [], reconnecting: ['Sport', 'Kids'] }),
    ).toMatchObject({
      status: 'warning',
      summary: 'Sport, Kids lost their source and are trying again.',
    });
  });
});

describe('connections and setup', () => {
  it('reads email', () => {
    expect(mailCheck(false, null).status).toBe('off');
    expect(mailCheck(true, null).status).toBe('ok');
    expect(mailCheck(true, { at: NOW, error: 'Invalid login' })).toMatchObject({
      status: 'problem',
      summary: 'The last email could not be sent: Invalid login',
    });
  });

  it('warns about a public site without HTTPS, and only then', () => {
    const site = (siteUrl: string) =>
      setupChecks({ siteUrl, production: true, stripe: false, tmdb: false })[0] as Check;
    expect(site('https://watch.example.com')).toMatchObject({ status: 'ok' });
    expect(site('http://watch.example.com')).toMatchObject({ status: 'warning' });
    expect(site('http://203.0.113.7:8080').summary).toMatch(/without HTTPS/);
    for (const local of [
      'http://localhost:8080',
      'http://192.168.1.20:8080',
      'http://10.0.0.5',
      'http://onyx.local',
    ]) {
      expect(site(local).status).toBe('ok');
    }
    expect(site('')).toMatchObject({
      status: 'warning',
      summary: expect.stringMatching(/SITE_URL is not set/),
    });
  });

  it('lists what is not set up without calling it a fault', () => {
    const checks = setupChecks({
      siteUrl: 'https://a.example',
      production: true,
      stripe: false,
      tmdb: true,
    });
    expect(checks.find((check) => check.id === 'stripe')?.status).toBe('off');
    expect(checks.find((check) => check.id === 'tmdb')?.status).toBe('ok');
  });
});

describe('summing up', () => {
  const check = (id: string, status: Check['status']): Check => ({
    id,
    group: 'core',
    title: id,
    status,
    summary: '',
  });

  it('counts problems and warnings, and nothing else', () => {
    const checks = [
      check('a', 'ok'),
      check('b', 'off'),
      check('c', 'warning'),
      check('d', 'problem'),
      check('e', 'problem'),
    ];
    expect(summarize(checks, NOW)).toEqual({
      status: 'problem',
      problems: 2,
      warnings: 1,
      checkedAt: '2026-11-22T12:00:00.000Z',
    });
    expect(summarize([check('a', 'ok'), check('b', 'off')], NOW).status).toBe('ok');
    expect(summarize([check('a', 'warning')], NOW).status).toBe('warning');
  });

  it('puts the worst first and keeps the order otherwise', () => {
    const sorted = sortChecks([
      check('a', 'ok'),
      check('b', 'off'),
      check('c', 'warning'),
      check('d', 'problem'),
      check('e', 'ok'),
    ]);
    expect(sorted.map(({ id }) => id)).toEqual(['d', 'c', 'a', 'e', 'b']);
  });
});

describe('alerts', () => {
  const problem = (id: string): Check => ({
    id,
    group: 'core',
    title: `Title ${id}`,
    status: 'problem',
    summary: 'Broken.',
  });
  const later = new Date(NOW.getTime() + 5 * 60_000);

  it('waits for a second look before writing', () => {
    const first = decideAlerts({}, [problem('a')], NOW);
    expect(first.appeared).toEqual([]);
    expect(first.memory.a).toMatchObject({ alerted: false });
    const second = decideAlerts(first.memory, [problem('a')], later);
    expect(second.appeared.map(({ id }) => id)).toEqual(['a']);
    expect(second.memory.a).toMatchObject({ alerted: true, since: NOW.toISOString() });
  });

  it('writes about a problem once', () => {
    const second = decideAlerts(
      decideAlerts({}, [problem('a')], NOW).memory,
      [problem('a')],
      later,
    );
    const third = decideAlerts(second.memory, [problem('a')], later);
    expect(third.appeared).toEqual([]);
    expect(third.solved).toEqual([]);
  });

  it('forgets a problem that was gone at the second look', () => {
    const first = decideAlerts({}, [problem('a')], NOW);
    const second = decideAlerts(first.memory, [], later);
    expect(second).toEqual({ memory: {}, appeared: [], solved: [] });
  });

  it('says when a problem it wrote about is solved', () => {
    const second = decideAlerts(
      decideAlerts({}, [problem('a'), problem('b')], NOW).memory,
      [problem('a'), problem('b')],
      later,
    );
    const third = decideAlerts(second.memory, [problem('b')], later);
    expect(third.solved).toEqual(['Title a']);
    expect(Object.keys(third.memory)).toEqual(['b']);
  });

  it('does not write about warnings', () => {
    const warning: Check = { ...problem('w'), status: 'warning' };
    const second = decideAlerts(decideAlerts({}, [warning], NOW).memory, [warning], later);
    expect(second.appeared).toEqual([]);
  });
});

describe('sameCommit', () => {
  it('matches a short commit with a long one', () => {
    expect(sameCommit('abc1234', 'abc1234def5678')).toBe(true);
    expect(sameCommit('abc1234def5678', 'abc1234def5678')).toBe(true);
    expect(sameCommit('abc1234', 'abc1235def5678')).toBe(false);
    expect(sameCommit('abc', 'abc1234')).toBe(false);
  });
});
