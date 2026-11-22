// SPDX-License-Identifier: AGPL-3.0-only
import type {
  CheckGroup,
  CheckStatus,
  DiagnosticCheck,
  DiagnosticsReport,
  DiagnosticsSummary,
  ProcessReport,
} from '@/api/types';

/** The parts of an installation, in the order a person would walk through them. */
export const GROUPS: { id: CheckGroup; title: string; about: string }[] = [
  { id: 'core', title: 'Core', about: 'What everything else stands on' },
  { id: 'processing', title: 'Processing', about: 'Making uploads ready to watch' },
  { id: 'storage', title: 'Storage', about: 'Where videos are kept and worked on' },
  { id: 'protection', title: 'Backups', about: 'The way back after a loss' },
  { id: 'delivery', title: 'Delivery', about: 'Bringing video to viewers' },
  { id: 'live', title: 'Live', about: 'Channels' },
  { id: 'connections', title: 'Connections', about: 'Services outside the installation' },
  { id: 'setup', title: 'Setup', about: 'How the installation is reached' },
];

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The one sentence at the top of the page. */
export function headlineOf(summary: Pick<DiagnosticsSummary, 'problems' | 'warnings'>): string {
  if (summary.problems > 0) {
    return summary.problems === 1
      ? 'One problem needs attention'
      : `${summary.problems} problems need attention`;
  }
  if (summary.warnings > 0) {
    return summary.warnings === 1
      ? 'Everything works, with one thing to look at'
      : `Everything works, with ${summary.warnings} things to look at`;
  }
  return 'Everything works';
}

/** "14 fine, 1 warning, 6 not set up" */
export function tallyOf(checks: readonly DiagnosticCheck[]): string {
  const of = (status: CheckStatus) => checks.filter((check) => check.status === status).length;
  return [
    of('problem') > 0 ? count(of('problem'), 'problem') : null,
    of('warning') > 0 ? count(of('warning'), 'warning') : null,
    `${of('ok')} fine`,
    of('off') > 0 ? `${of('off')} not set up` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** The checks that ask for something to be done, problems first. */
export function attentionOf(checks: readonly DiagnosticCheck[]): DiagnosticCheck[] {
  return [
    ...checks.filter((check) => check.status === 'problem'),
    ...checks.filter((check) => check.status === 'warning'),
  ];
}

/** The checks that ask for nothing, by part of the installation. Parts with none are left out. */
export function quietByGroup(
  checks: readonly DiagnosticCheck[],
): { id: CheckGroup; title: string; about: string; checks: DiagnosticCheck[] }[] {
  return GROUPS.map((group) => ({
    ...group,
    checks: checks.filter(
      (check) => check.group === group.id && (check.status === 'ok' || check.status === 'off'),
    ),
  })).filter((group) => group.checks.length > 0);
}

/** What the mark in the header says. Null when there is nothing to say. */
export function markOf(
  summary: DiagnosticsSummary | null,
): { tone: 'danger' | 'warning'; label: string } | null {
  if (!summary || summary.status === 'ok') {
    return null;
  }
  return summary.problems > 0
    ? { tone: 'danger', label: count(summary.problems, 'problem') }
    : { tone: 'warning', label: count(summary.warnings, 'warning') };
}

/** "3 d 4 h", "5 h 12 min", "8 min", "just now" */
export function runningFor(startedAt: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - new Date(startedAt).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  }
  return hours % 24 ? `${Math.floor(hours / 24)} d ${hours % 24} h` : `${Math.floor(hours / 24)} d`;
}

const ROLE_ORDER = ['api', 'scheduler', 'worker', 'live'];

/** The roles of a process, in the same order everywhere. */
export function rolesOf(process: ProcessReport): string[] {
  return [...process.roles].sort(
    (a, b) => ((ROLE_ORDER.indexOf(a) + 99) % 99) - ((ROLE_ORDER.indexOf(b) + 99) % 99),
  );
}

export const shortCommit = (commit: string | null) => (commit ? commit.slice(0, 7) : null);

/** What the page says about newer versions. */
export function updateLook(version: DiagnosticsReport['version']): {
  tone: 'success' | 'info' | 'neutral';
  label: string;
  note: string | null;
} {
  switch (version.update) {
    case 'current':
      return { tone: 'success', label: 'Up to date', note: null };
    case 'available':
      return {
        tone: 'info',
        label: 'A newer version is there',
        note: 'Install it on the server with the command below. It goes back by itself if the new version does not come up.',
      };
    case 'unknown':
      return { tone: 'neutral', label: 'Not compared', note: version.updateNote };
  }
}

const MARKS: Record<CheckStatus, string> = {
  problem: 'PROBLEM',
  warning: 'WARNING',
  ok: 'ok',
  off: 'off',
};

/**
 * The whole report as text, to paste into a bug report or a message to
 * whoever helps. It holds no password and no key.
 */
export function reportText(report: DiagnosticsReport, now: number = Date.now()): string {
  const { version } = report;
  const lines = [
    `Spark Onyx Stream ${version.version}${version.commit ? ` (${shortCommit(version.commit)})` : ''}, Node ${version.node}`,
    `Checked ${report.checkedAt}: ${headlineOf(report).toLowerCase()} (${tallyOf(report.checks)})`,
    `Newer version: ${version.update === 'unknown' ? `not compared. ${version.updateNote ?? ''}`.trim() : version.update === 'available' ? `yes (${shortCommit(version.latestCommit)})` : 'no'}`,
    '',
  ];
  for (const check of report.checks) {
    lines.push(`[${MARKS[check.status]}] ${check.title}: ${check.summary}`);
    for (const [label, value] of check.facts ?? []) {
      lines.push(`    ${label}: ${value}`);
    }
  }
  lines.push('', 'Processes:');
  if (report.processes.length === 0) {
    lines.push('  none reported in');
  }
  for (const process of report.processes) {
    lines.push(
      `  ${rolesOf(process).join(', ')} on ${process.host}, version ${process.version}, running for ${runningFor(process.startedAt, now)}`,
    );
  }
  return lines.join('\n');
}
