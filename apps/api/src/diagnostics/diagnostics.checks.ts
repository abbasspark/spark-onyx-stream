// SPDX-License-Identifier: AGPL-3.0-only
import type { BackupOverview } from '../backups/backups.service.js';
import type { P2pStatus } from '../p2p/p2p.service.js';
import type { Check, CheckStatus, DiagnosticsSummary, ProcessReport } from './diagnostics.types.js';

/**
 * What each finding means. Everything here is a plain function of what was
 * measured, so every sentence an admin can be shown is covered by a test.
 */

const KB = 1024;
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
  let amount = bytes;
  let unit = 0;
  while (amount >= KB && unit < UNITS.length - 1) {
    amount /= KB;
    unit += 1;
  }
  return `${unit === 0 || amount >= 100 ? Math.round(amount) : amount.toFixed(1)} ${UNITS[unit]}`;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** The result of trying something that can fail or hang. */
export type Probe<T> = { ok: true; value: T; tookMs: number } | { ok: false; error: string };

// --- Core ---------------------------------------------------------------------

export interface DatabaseFacts {
  version: string;
  sizeBytes: number;
  /** Migrations that were started and never finished. */
  failedMigrations: number;
}

export function databaseCheck(probe: Probe<DatabaseFacts>): Check {
  const base = { id: 'database', group: 'core', title: 'Database' } as const;
  if (!probe.ok) {
    return {
      ...base,
      status: 'problem',
      summary: `PostgreSQL does not answer: ${probe.error}`,
      hint: 'Check that the database server runs and that DATABASE_URL is right.',
    };
  }
  const { version, sizeBytes, failedMigrations } = probe.value;
  const facts: Check['facts'] = [
    ['Server', `PostgreSQL ${version}`],
    ['Size', formatBytes(sizeBytes)],
    ['Answered in', `${probe.tookMs} ms`],
  ];
  if (failedMigrations > 0) {
    return {
      ...base,
      status: 'problem',
      summary: `${plural(failedMigrations, 'migration')} of the database did not finish.`,
      hint: 'An update was cut off half way. Restore the backup from before it, or see the logs of the "migrate" service.',
      facts,
    };
  }
  if (probe.tookMs > 1000) {
    return {
      ...base,
      status: 'warning',
      summary: `PostgreSQL took ${probe.tookMs} ms to answer a trivial question.`,
      hint: 'The database server is overloaded or far away.',
      facts,
    };
  }
  return {
    ...base,
    status: 'ok',
    summary: `PostgreSQL ${version} answers, and holds ${formatBytes(sizeBytes)}.`,
    facts,
  };
}

export interface RedisFacts {
  version: string;
  usedBytes: number;
  /** 0 when Redis may use all the memory there is. */
  maxBytes: number;
  /** What Redis does when its memory is full. */
  policy: string;
}

export function redisCheck(probe: Probe<RedisFacts>): Check {
  const base = { id: 'redis', group: 'core', title: 'Redis' } as const;
  if (!probe.ok) {
    return {
      ...base,
      status: 'problem',
      summary: `Redis does not answer: ${probe.error}`,
      hint: 'Check that Redis runs and that REDIS_URL is right. Without it nothing is processed and nobody can sign in.',
    };
  }
  const { version, usedBytes, maxBytes, policy } = probe.value;
  const facts: Check['facts'] = [
    ['Server', `Redis ${version}`],
    ['Memory in use', formatBytes(usedBytes)],
    ['Answered in', `${probe.tookMs} ms`],
  ];
  if (maxBytes > 0) {
    facts.push(['Memory limit', formatBytes(maxBytes)]);
    if (policy !== 'noeviction') {
      return {
        ...base,
        status: 'warning',
        summary: `Redis may throw data away when its memory is full (policy "${policy}").`,
        hint: 'Waiting jobs would be lost. Set maxmemory-policy to noeviction.',
        facts,
      };
    }
    if (usedBytes > maxBytes * 0.9) {
      return {
        ...base,
        status: 'warning',
        summary: `Redis uses ${formatBytes(usedBytes)} of the ${formatBytes(maxBytes)} it may.`,
        hint: 'Raise its memory limit before it is full.',
        facts,
      };
    }
  }
  return {
    ...base,
    status: 'ok',
    summary: `Redis ${version} answers, and uses ${formatBytes(usedBytes)} of memory.`,
    facts,
  };
}

// --- Processes ------------------------------------------------------------------

const ROLE_NEEDS: Record<string, { title: string; missing: string; hint: string }> = {
  worker: {
    title: 'Worker',
    missing: 'No worker is running. Uploaded videos wait and are not made ready to watch.',
    hint: 'Start a process with APP_ROLE=worker. With Docker Compose that is the "worker" service.',
  },
  scheduler: {
    title: 'Scheduler',
    missing:
      'No scheduler is running. Backups are not made, the guide is not refreshed, and expired subscriptions stay active.',
    hint: 'Start a process with the scheduler role. With Docker Compose the "api" service has it: APP_ROLE=api,scheduler.',
  },
  live: {
    title: 'Live process',
    missing: 'No live process is running. Channels that are switched on do not play.',
    hint: 'Start a process with APP_ROLE=live. With Docker Compose that is the "live" service.',
  },
};

/**
 * Whether each role has a process that does its work.
 *
 * @param liveNeeded Whether any channel is switched on. Without one, a missing live process is nothing to act on.
 */
export function roleChecks(processes: readonly ProcessReport[], liveNeeded: boolean): Check[] {
  return (['worker', 'scheduler', 'live'] as const).map((role): Check => {
    const running = processes.filter((process) => process.roles.includes(role));
    const need = ROLE_NEEDS[role] as (typeof ROLE_NEEDS)[string];
    const base = {
      id: `role:${role}`,
      group: role === 'live' ? 'live' : 'processing',
      title: need.title,
    } as const;
    if (running.length > 0) {
      const hosts = [...new Set(running.map((process) => process.host))];
      return {
        ...base,
        status: 'ok',
        summary: `${plural(running.length, 'process', 'processes')} on ${hosts.join(', ')}.`,
      };
    }
    if (role === 'live' && !liveNeeded) {
      return {
        ...base,
        status: 'off',
        summary: 'No live process is running, and no channel is switched on.',
      };
    }
    return { ...base, status: 'problem', summary: need.missing, hint: need.hint };
  });
}

/** Processes of different versions run side by side only while an update is half done. */
export function versionsCheck(processes: readonly ProcessReport[]): Check | null {
  const versions = [...new Set(processes.map((process) => process.version))].sort();
  if (versions.length < 2) {
    return null;
  }
  return {
    id: 'versions',
    group: 'core',
    title: 'Versions',
    status: 'warning',
    summary: `Processes of different versions are running: ${versions.join(' and ')}.`,
    hint: 'Start the ones that lag behind again, so everything runs the same version.',
  };
}

// --- Processing -----------------------------------------------------------------

export interface QueueFacts {
  waiting: number;
  active: number;
  /** Jobs that failed during the last 24 hours. */
  failedToday: number;
  /** How long the job at the front has been waiting, in milliseconds. Null when nothing waits. */
  oldestWaitingMs: number | null;
  /** Videos that have been "processing" for longer than a job can take. */
  stuckAssets: number;
}

const HOUR_MS = 60 * 60 * 1000;

export function queueCheck(probe: Probe<QueueFacts>, workers: number): Check {
  const base = {
    id: 'queue',
    group: 'processing',
    title: 'Processing queue',
    link: { label: 'Open Jobs', to: '/jobs' },
  } as const;
  if (!probe.ok) {
    return { ...base, status: 'problem', summary: `The queue cannot be read: ${probe.error}` };
  }
  const { waiting, active, failedToday, oldestWaitingMs, stuckAssets } = probe.value;
  const facts: Check['facts'] = [
    ['Waiting', String(waiting)],
    ['Running', String(active)],
    ['Failed in the last 24 hours', String(failedToday)],
  ];
  if (stuckAssets > 0) {
    return {
      ...base,
      status: 'warning',
      summary: `${plural(stuckAssets, 'video')} ${stuckAssets === 1 ? 'has' : 'have'} been processing for over 12 hours.`,
      hint: 'A worker was probably stopped in the middle. Open the video and start its processing again.',
      link: { label: 'Open Library', to: '/assets?status=PROCESSING' },
      facts,
    };
  }
  if (waiting > 0 && oldestWaitingMs !== null && oldestWaitingMs > HOUR_MS && workers > 0) {
    return {
      ...base,
      status: 'warning',
      summary: `${plural(waiting, 'job')} waiting, the first one for ${Math.round(oldestWaitingMs / HOUR_MS)} hours.`,
      hint: 'The workers do not keep up. Start another worker, or raise WORKER_CONCURRENCY.',
      facts,
    };
  }
  if (failedToday > 0) {
    return {
      ...base,
      status: 'warning',
      summary: `${plural(failedToday, 'job')} failed in the last 24 hours.`,
      hint: 'Each failed job says why. Most are files FFmpeg cannot read.',
      link: { label: 'Open failed jobs', to: '/jobs?status=FAILED' },
      facts,
    };
  }
  return {
    ...base,
    status: 'ok',
    summary:
      waiting + active === 0
        ? 'Nothing is waiting.'
        : `${plural(active, 'job')} running, ${waiting} waiting.`,
    facts,
  };
}

// --- Storage --------------------------------------------------------------------

export interface DiskFacts {
  freeBytes: number;
  totalBytes: number;
}

export interface PoolFacts {
  id: string;
  name: string;
  driver: 'LOCAL' | 'S3';
  isDefault: boolean;
  usedBytes: number;
  quotaBytes: number | null;
  /** For a local pool: its disk. For a bucket: whether it answered. */
  probe: Probe<DiskFacts | null>;
}

/** Below this share of free disk a warning is due, and below the second a problem. */
const DISK_WARNING = 0.1;
const DISK_PROBLEM = 0.04;

function diskStatus(disk: DiskFacts): CheckStatus {
  const free = disk.totalBytes > 0 ? disk.freeBytes / disk.totalBytes : 1;
  // A large disk can be 96 % full and still have room for weeks.
  if (free < DISK_PROBLEM && disk.freeBytes < 20 * KB ** 3) {
    return 'problem';
  }
  return free < DISK_WARNING && disk.freeBytes < 100 * KB ** 3 ? 'warning' : 'ok';
}

export function poolCheck(pool: PoolFacts): Check {
  const base = {
    id: `storage:${pool.id}`,
    group: 'storage',
    title: `Storage pool "${pool.name}"`,
    link: { label: 'Open Storage', to: '/storage' },
  } as const;
  const where = pool.driver === 'S3' ? 'The bucket' : 'The folder';
  if (!pool.probe.ok) {
    return {
      ...base,
      status: 'problem',
      summary: `${where} cannot be reached: ${pool.probe.error}`,
      hint:
        pool.driver === 'S3'
          ? 'Check the address, the bucket and the keys of the pool, and that the bucket still exists.'
          : 'Check that the folder exists and that the application may write to it.',
    };
  }
  const facts: Check['facts'] = [['Holds', formatBytes(pool.usedBytes)]];
  if (pool.quotaBytes !== null) {
    facts.push(['Limit', formatBytes(pool.quotaBytes)]);
    const used = pool.quotaBytes > 0 ? pool.usedBytes / pool.quotaBytes : 1;
    if (used >= 0.9) {
      return {
        ...base,
        status: used >= 1 ? 'problem' : 'warning',
        summary: `${formatBytes(pool.usedBytes)} of its limit of ${formatBytes(pool.quotaBytes)} ${used >= 1 ? 'are used: the pool is full' : 'are used'}.`,
        hint: 'Raise the limit of the pool, delete videos, or add a pool and make it the default.',
        facts,
      };
    }
  }
  const disk = pool.probe.value;
  if (disk) {
    facts.push([
      'Free on its disk',
      `${formatBytes(disk.freeBytes)} of ${formatBytes(disk.totalBytes)}`,
    ]);
    const status = diskStatus(disk);
    if (status !== 'ok') {
      return {
        ...base,
        status,
        summary: `Only ${formatBytes(disk.freeBytes)} are free on its disk.`,
        hint:
          status === 'problem'
            ? 'Uploads and processing fail when the disk is full. Free space now, or move videos to a pool on another disk.'
            : 'Free space, grow the disk, or add a pool on another disk before it is full.',
        facts,
      };
    }
    return {
      ...base,
      status: 'ok',
      summary: `Holds ${formatBytes(pool.usedBytes)}. ${formatBytes(disk.freeBytes)} are free on its disk.`,
      facts,
    };
  }
  return {
    ...base,
    status: 'ok',
    summary: `${where} answers. It holds ${formatBytes(pool.usedBytes)}.`,
    facts,
  };
}

/** The folders uploads and processing work in. They fill up before the pools do. */
const WORK_DISKS = {
  uploads: {
    title: 'Disk for uploads',
    setting: 'UPLOAD_TEMP_PATH',
    hint: 'An upload needs room for the whole file. Free space or grow the disk.',
  },
  processing: {
    title: 'Disk for processing',
    setting: 'PROCESSING_TEMP_PATH',
    hint: 'Processing a video needs room for the file and everything made from it. Free space or grow the disk.',
  },
  live: {
    title: 'Disk for live channels',
    setting: 'LIVE_PATH',
    hint: 'Live channels stop when their disk is full. Free space, or shorten how far viewers can go back.',
  },
} as const;

export function workDiskCheck(name: keyof typeof WORK_DISKS, probe: Probe<DiskFacts>): Check {
  const { title, setting, hint } = WORK_DISKS[name];
  const base = { id: `disk:${name}`, group: name === 'live' ? 'live' : 'storage', title } as const;
  if (!probe.ok) {
    return {
      ...base,
      status: 'problem',
      summary: `Its folder cannot be read: ${probe.error}`,
      hint: `Check ${setting}.`,
    };
  }
  const disk = probe.value;
  const status = diskStatus(disk);
  const facts: Check['facts'] = [
    ['Free', `${formatBytes(disk.freeBytes)} of ${formatBytes(disk.totalBytes)}`],
  ];
  if (status === 'ok') {
    return { ...base, status, summary: `${formatBytes(disk.freeBytes)} are free.`, facts };
  }
  return {
    ...base,
    status,
    summary: `Only ${formatBytes(disk.freeBytes)} are free.`,
    hint,
    facts,
  };
}

export interface WorkDisk {
  name: keyof typeof WORK_DISKS;
  freeBytes: number;
  totalBytes: number;
  error?: string;
}

const WORK_NAMES = { uploads: 'uploads', processing: 'processing', live: 'live channels' } as const;

/**
 * The checks of the working folders, without saying the same thing twice.
 *
 * On one server the pool, the uploads, the processing and the live channels
 * are often all on the same disk. A full disk is then one problem and not
 * four: folders on a disk a pool already reported are added to that pool's
 * check as a fact, and folders that share a disk among themselves get one
 * check together. Two folders are taken to share a disk when their disks
 * are of exactly the same size.
 *
 * @param pools The checks of the pools, with the disk of each local one. Their facts are added to.
 */
export function workDiskChecks(
  pools: readonly { check: Check; disk: DiskFacts | null }[],
  disks: readonly WorkDisk[],
): Check[] {
  const checks: Check[] = [];
  const order = ['uploads', 'processing', 'live'] as const;
  const groups = new Map<number, WorkDisk[]>();
  for (const name of order) {
    const reports = disks.filter((disk) => disk.name === name);
    const broken = reports.find((disk) => disk.error);
    if (broken) {
      checks.push(workDiskCheck(name, { ok: false, error: broken.error as string }));
      continue;
    }
    if (reports.length === 0) {
      continue;
    }
    // Of several processes with this kind of folder, the one with the least room counts.
    const tightest = reports.reduce((least, disk) =>
      disk.freeBytes < least.freeBytes ? disk : least,
    );
    groups.set(tightest.totalBytes, [...(groups.get(tightest.totalBytes) ?? []), tightest]);
  }
  for (const [totalBytes, sharing] of groups) {
    const names = sharing.map((disk) => WORK_NAMES[disk.name]).join(', ');
    const pool = pools.find((candidate) => candidate.disk?.totalBytes === totalBytes);
    if (pool) {
      pool.check.facts = [...(pool.check.facts ?? []), ['Its disk is also used for', names]];
      continue;
    }
    const first = sharing[0] as WorkDisk;
    const check = workDiskCheck(first.name, { ok: true, value: first, tookMs: 0 });
    if (sharing.length > 1) {
      check.facts = [...(check.facts ?? []), ['The same disk is used for', names]];
    }
    checks.push(check);
  }
  return checks;
}

// --- Protection -----------------------------------------------------------------

type BackupFacts = Pick<BackupOverview, 'protection' | 'lastGoodAt' | 'runner' | 'settings'> & {
  /** Why the newest backup failed, when it is newer than the newest good one. */
  lastFailure: string | null;
};

export function backupsCheck(probe: Probe<BackupFacts>, now: Date): Check {
  const base = {
    id: 'backups',
    group: 'protection',
    title: 'Backups',
    link: { label: 'Open Backups', to: '/backups' },
  } as const;
  if (!probe.ok) {
    return { ...base, status: 'problem', summary: `Backups cannot be read: ${probe.error}` };
  }
  const { protection, lastGoodAt, runner, lastFailure } = probe.value;
  const age = lastGoodAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(lastGoodAt).getTime()) / HOUR_MS))
    : null;
  const ageText =
    age === null
      ? ''
      : age < 1
        ? 'less than an hour ago'
        : age < 48
          ? `${plural(age, 'hour')} ago`
          : `${Math.round(age / 24)} days ago`;
  const facts: Check['facts'] = [
    ['Newest backup', lastGoodAt ?? 'none'],
    ['Schedule', probe.value.settings.schedule],
  ];
  if (runner?.problem) {
    return {
      ...base,
      status: 'problem',
      summary: `Backups cannot be made: ${runner.problem}`,
      facts,
    };
  }
  if (lastFailure) {
    return {
      ...base,
      status: 'problem',
      summary: `The last backup failed: ${lastFailure}`,
      hint: 'Solve the cause and make a backup by hand, or wait for the next scheduled one.',
      facts,
    };
  }
  switch (protection) {
    case 'protected':
      return { ...base, status: 'ok', summary: `The newest backup was made ${ageText}.`, facts };
    case 'late':
      return {
        ...base,
        status: 'problem',
        summary: `A backup is overdue: the newest one was made ${ageText}.`,
        hint: 'Make one now, and see why the scheduled ones were not made.',
        facts,
      };
    case 'none':
      return {
        ...base,
        status: 'warning',
        summary: 'No backup was made yet. Nothing protects the database.',
        hint: 'The first scheduled one is made soon. You can make one now.',
        facts,
      };
    case 'off':
      return {
        ...base,
        status: 'warning',
        summary: lastGoodAt
          ? `Scheduled backups are off. The newest one was made ${ageText}.`
          : 'Scheduled backups are off, and there is no backup.',
        hint: 'Turn the schedule on, unless something else backs the database up.',
        facts,
      };
  }
}

// --- Delivery and live ------------------------------------------------------------

export function trackerCheck(status: P2pStatus): Check {
  const base = {
    id: 'tracker',
    group: 'delivery',
    title: 'P2P tracker',
    link: { label: 'Open P2P', to: '/p2p' },
  } as const;
  if (status.state === 'off') {
    return { ...base, status: 'off', summary: 'P2P between viewers is not set up.' };
  }
  if (status.state === 'unreachable') {
    return {
      ...base,
      status: 'warning',
      summary: status.message,
      hint: 'Viewers still watch, straight from the servers. Start the tracker to get P2P back.',
    };
  }
  return {
    ...base,
    status: 'ok',
    summary: `The tracker answers at ${status.trackerUrl}.`,
  };
}

export interface EdgeFacts {
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'DISABLED' | 'NEVER_CONNECTED';
}

export function edgesCheck(edges: readonly EdgeFacts[]): Check {
  const base = {
    id: 'edges',
    group: 'delivery',
    title: 'Edge servers',
    link: { label: 'Open Edge servers', to: '/edges' },
  } as const;
  if (edges.length === 0) {
    return {
      ...base,
      status: 'off',
      summary: 'No edge servers. The main server delivers everything.',
    };
  }
  const offline = edges.filter((edge) => edge.status === 'OFFLINE');
  const online = edges.filter((edge) => edge.status === 'ONLINE');
  const waiting = edges.filter((edge) => edge.status === 'NEVER_CONNECTED');
  const facts: Check['facts'] = [
    ['Online', String(online.length)],
    ['Offline', String(offline.length)],
    ['Never connected', String(waiting.length)],
    ['Paused', String(edges.length - online.length - offline.length - waiting.length)],
  ];
  if (offline.length > 0) {
    return {
      ...base,
      status: 'warning',
      summary: `${offline.map((edge) => edge.name).join(', ')} ${offline.length === 1 ? 'is' : 'are'} offline.`,
      hint: 'Viewers are sent to the other servers meanwhile. Check the agent on the server that is offline.',
      facts,
    };
  }
  return {
    ...base,
    status: 'ok',
    summary: `${online.length} of ${plural(edges.length, 'edge')} online.`,
    facts,
  };
}

export interface ChannelFacts {
  /** Channels that are switched on. */
  enabled: number;
  /** Names of channels that gave up. */
  failed: string[];
  /** Names of channels that lost their source and are trying again. */
  reconnecting: string[];
}

export function channelsCheck(channels: ChannelFacts): Check {
  const base = {
    id: 'channels',
    group: 'live',
    title: 'Live channels',
    link: { label: 'Open Channels', to: '/channels' },
  } as const;
  if (channels.failed.length > 0) {
    return {
      ...base,
      status: 'problem',
      summary: `${channels.failed.join(', ')} ${channels.failed.length === 1 ? 'has' : 'have'} failed and ${channels.failed.length === 1 ? 'is' : 'are'} not playing.`,
      hint: 'Open the channel to see why. Usually its source cannot be reached.',
    };
  }
  if (channels.reconnecting.length > 0) {
    return {
      ...base,
      status: 'warning',
      summary: `${channels.reconnecting.join(', ')} lost ${channels.reconnecting.length === 1 ? 'its' : 'their'} source and ${channels.reconnecting.length === 1 ? 'is' : 'are'} trying again.`,
    };
  }
  if (channels.enabled === 0) {
    return { ...base, status: 'off', summary: 'No channel is switched on.' };
  }
  return {
    ...base,
    status: 'ok',
    summary: `${plural(channels.enabled, 'channel')} switched on, none in trouble.`,
  };
}

// --- Connections and setup -----------------------------------------------------------

export function mailCheck(
  enabled: boolean,
  last: { at: Date; error: string | null } | null,
): Check {
  const base = {
    id: 'mail',
    group: 'connections',
    title: 'Email',
    link: { label: 'Open Email', to: '/email' },
  } as const;
  if (!enabled) {
    return {
      ...base,
      status: 'off',
      summary:
        'Email is not set up. Viewers cannot set a new password by themselves, and no alerts are sent.',
    };
  }
  if (last?.error) {
    return {
      ...base,
      status: 'problem',
      summary: `The last email could not be sent: ${last.error}`,
      hint: 'Check SMTP_URL, and send a test email from the Email page.',
    };
  }
  return {
    ...base,
    status: 'ok',
    summary: last
      ? 'The mail server took the last email.'
      : 'Email is set up. Nothing was sent since the last start.',
  };
}

export interface SetupFacts {
  siteUrl: string;
  production: boolean;
  stripe: boolean;
  tmdb: boolean;
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)|\.localhost$|\.local$/;

export function setupChecks(setup: SetupFacts): Check[] {
  const checks: Check[] = [];
  let host = '';
  let https = false;
  try {
    const url = new URL(setup.siteUrl);
    host = url.hostname;
    https = url.protocol === 'https:';
  } catch {
    // An address that cannot be read is reported below as not set.
  }
  if (!host) {
    checks.push({
      id: 'site-url',
      group: 'setup',
      title: 'Address of the site',
      status: 'warning',
      summary: 'SITE_URL is not set. Links in emails and in search results lead nowhere.',
      hint: 'Set SITE_URL to the address viewers type, and start again.',
    });
  } else if (!https && !PRIVATE_HOST.test(host)) {
    checks.push({
      id: 'site-url',
      group: 'setup',
      title: 'Address of the site',
      status: 'warning',
      summary: `The site is reached without HTTPS (${setup.siteUrl}). Passwords and session tokens travel unprotected.`,
      hint: 'Point a domain at the server and switch HTTPS on. The README of deploy/compose says how.',
    });
  } else {
    checks.push({
      id: 'site-url',
      group: 'setup',
      title: 'Address of the site',
      status: 'ok',
      summary: https
        ? `${setup.siteUrl}, with HTTPS.`
        : `${setup.siteUrl}, reachable from this network only.`,
    });
  }
  checks.push(
    setup.stripe
      ? {
          id: 'stripe',
          group: 'connections',
          title: 'Stripe',
          status: 'ok',
          summary: 'Payments by card are set up.',
        }
      : {
          id: 'stripe',
          group: 'connections',
          title: 'Stripe',
          status: 'off',
          summary: 'Payments by card are not set up. Subscriptions can be given by hand.',
        },
    setup.tmdb
      ? {
          id: 'tmdb',
          group: 'connections',
          title: 'TMDB',
          status: 'ok',
          summary: 'Titles can be filled in from TMDB.',
        }
      : {
          id: 'tmdb',
          group: 'connections',
          title: 'TMDB',
          status: 'off',
          summary: 'Not set up. Descriptions and pictures of titles are entered by hand.',
        },
  );
  return checks;
}

// --- Summing up -----------------------------------------------------------------

export function summarize(checks: readonly Check[], checkedAt: Date): DiagnosticsSummary {
  const problems = checks.filter((check) => check.status === 'problem').length;
  const warnings = checks.filter((check) => check.status === 'warning').length;
  return {
    status: problems > 0 ? 'problem' : warnings > 0 ? 'warning' : 'ok',
    problems,
    warnings,
    checkedAt: checkedAt.toISOString(),
  };
}

const ORDER: Record<CheckStatus, number> = { problem: 0, warning: 1, ok: 2, off: 3 };

/** Worst first, and otherwise in the order they were made. */
export function sortChecks(checks: readonly Check[]): Check[] {
  return checks
    .map((check, index) => ({ check, index }))
    .sort((a, b) => ORDER[a.check.status] - ORDER[b.check.status] || a.index - b.index)
    .map(({ check }) => check);
}

// --- Alerts ---------------------------------------------------------------------

/** What is remembered between two looks, per problem. */
export interface AlertMemory {
  [checkId: string]: { title: string; since: string; alerted: boolean };
}

export interface AlertDecision {
  memory: AlertMemory;
  /** Problems to write about now. */
  appeared: Check[];
  /** Titles of problems that were written about and are gone. */
  solved: string[];
}

/**
 * Decides what to tell the owners.
 *
 * A problem is written about when it is seen a second time in a row: one
 * look that fails, during a restart for example, is not worth an email. A
 * problem that was written about is mentioned once more when it is gone.
 */
export function decideAlerts(
  previous: AlertMemory,
  checks: readonly Check[],
  now: Date,
): AlertDecision {
  const memory: AlertMemory = {};
  const appeared: Check[] = [];
  for (const check of checks) {
    if (check.status !== 'problem') {
      continue;
    }
    const known = previous[check.id];
    if (!known) {
      memory[check.id] = { title: check.title, since: now.toISOString(), alerted: false };
    } else if (known.alerted) {
      memory[check.id] = known;
    } else {
      memory[check.id] = { ...known, alerted: true };
      appeared.push(check);
    }
  }
  const solved = Object.entries(previous)
    .filter(([id, known]) => known.alerted && !(id in memory))
    .map(([, known]) => known.title);
  return { memory, appeared, solved };
}
