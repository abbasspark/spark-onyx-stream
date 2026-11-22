// SPDX-License-Identifier: AGPL-3.0-only
import type { DiagnosticCheck, DiagnosticsReport, ProcessReport } from '@/api/types';
import {
  attentionOf,
  headlineOf,
  markOf,
  quietByGroup,
  reportText,
  rolesOf,
  runningFor,
  tallyOf,
  updateLook,
} from './diagnostics';

const check = (
  id: string,
  status: DiagnosticCheck['status'],
  group: DiagnosticCheck['group'] = 'core',
): DiagnosticCheck => ({ id, group, title: `Title ${id}`, status, summary: `Summary ${id}.` });

const NOW = Date.parse('2026-11-22T12:00:00Z');
const process = (roles: string[], startedAt = '2026-11-22T06:48:00Z'): ProcessReport => ({
  id: roles.join(),
  roles,
  host: 'server-1',
  pid: 7,
  version: '0.1.0',
  node: '24.1.0',
  startedAt,
  seenAt: '2026-11-22T11:59:50Z',
  memoryBytes: 1,
});

const report = (over: Partial<DiagnosticsReport> = {}): DiagnosticsReport => ({
  status: 'problem',
  problems: 1,
  warnings: 1,
  checkedAt: '2026-11-22T12:00:00.000Z',
  tookMs: 180,
  version: {
    version: '0.1.0',
    commit: 'a1b2c3d4e5f60718',
    node: '24.1.0',
    update: 'available',
    latestCommit: 'ffeeddccbbaa0011',
    updateNote: null,
  },
  checks: [
    { ...check('worker', 'problem', 'processing'), facts: [['Waiting', '3']] },
    check('backups', 'warning', 'protection'),
    check('database', 'ok'),
    check('tracker', 'off', 'delivery'),
  ],
  processes: [process(['scheduler', 'api'])],
  alerts: { emailAlerts: true, mailEnabled: true, recipients: ['owner@example.com'] },
  ...over,
});

describe('the headline', () => {
  it('says how things are in one sentence', () => {
    expect(headlineOf({ problems: 0, warnings: 0 })).toBe('Everything works');
    expect(headlineOf({ problems: 0, warnings: 1 })).toBe(
      'Everything works, with one thing to look at',
    );
    expect(headlineOf({ problems: 0, warnings: 3 })).toBe(
      'Everything works, with 3 things to look at',
    );
    expect(headlineOf({ problems: 1, warnings: 3 })).toBe('One problem needs attention');
    expect(headlineOf({ problems: 2, warnings: 0 })).toBe('2 problems need attention');
  });

  it('counts what was looked at', () => {
    expect(tallyOf(report().checks)).toBe('1 problem, 1 warning, 1 fine, 1 not set up');
    expect(tallyOf([check('a', 'ok'), check('b', 'ok')])).toBe('2 fine');
  });
});

describe('sorting what was found', () => {
  it('puts what needs attention apart, problems first', () => {
    const checks = [
      check('a', 'warning'),
      check('b', 'ok'),
      check('c', 'problem'),
      check('d', 'off'),
    ];
    expect(attentionOf(checks).map(({ id }) => id)).toEqual(['c', 'a']);
  });

  it('groups the rest by part of the installation and leaves empty parts out', () => {
    const groups = quietByGroup(report().checks);
    expect(groups.map((group) => group.title)).toEqual(['Core', 'Delivery']);
    expect(groups[0]?.checks.map(({ id }) => id)).toEqual(['database']);
  });
});

describe('the mark in the header', () => {
  const summary = { checkedAt: '', status: 'problem' as const, problems: 2, warnings: 1 };

  it('stays away when all is well or nothing is known', () => {
    expect(markOf(null)).toBeNull();
    expect(markOf({ ...summary, status: 'ok', problems: 0, warnings: 0 })).toBeNull();
  });

  it('counts problems before warnings', () => {
    expect(markOf(summary)).toEqual({ tone: 'danger', label: '2 problems' });
    expect(markOf({ ...summary, status: 'warning', problems: 0 })).toEqual({
      tone: 'warning',
      label: '1 warning',
    });
  });
});

describe('processes', () => {
  it('says how long one has been running', () => {
    expect(runningFor('2026-11-22T11:59:40Z', NOW)).toBe('just now');
    expect(runningFor('2026-11-22T11:52:00Z', NOW)).toBe('8 min');
    expect(runningFor('2026-11-22T06:48:00Z', NOW)).toBe('5 h 12 min');
    expect(runningFor('2026-11-22T09:00:00Z', NOW)).toBe('3 h');
    expect(runningFor('2026-11-19T08:00:00Z', NOW)).toBe('3 d 4 h');
    expect(runningFor('2026-11-20T12:00:00Z', NOW)).toBe('2 d');
  });

  it('names roles in the same order everywhere', () => {
    expect(rolesOf(process(['live', 'scheduler', 'api', 'worker']))).toEqual([
      'api',
      'scheduler',
      'worker',
      'live',
    ]);
  });
});

describe('newer versions', () => {
  it('says what is known', () => {
    expect(updateLook(report().version)).toMatchObject({
      tone: 'info',
      label: 'A newer version is there',
    });
    expect(updateLook({ ...report().version, update: 'current' })).toEqual({
      tone: 'success',
      label: 'Up to date',
      note: null,
    });
    expect(
      updateLook({ ...report().version, update: 'unknown', updateNote: 'Switched off.' }),
    ).toEqual({ tone: 'neutral', label: 'Not compared', note: 'Switched off.' });
  });
});

describe('the report as text', () => {
  it('holds everything someone helping would ask for', () => {
    expect(reportText(report(), NOW)).toBe(
      [
        'Spark Onyx Stream 0.1.0 (a1b2c3d), Node 24.1.0',
        'Checked 2026-11-22T12:00:00.000Z: one problem needs attention (1 problem, 1 warning, 1 fine, 1 not set up)',
        'Newer version: yes (ffeeddc)',
        '',
        '[PROBLEM] Title worker: Summary worker.',
        '    Waiting: 3',
        '[WARNING] Title backups: Summary backups.',
        '[ok] Title database: Summary database.',
        '[off] Title tracker: Summary tracker.',
        '',
        'Processes:',
        '  api, scheduler on server-1, version 0.1.0, running for 5 h 12 min',
      ].join('\n'),
    );
  });

  it('copes with what is not known', () => {
    const text = reportText(
      report({
        processes: [],
        version: {
          ...report().version,
          commit: null,
          update: 'unknown',
          updateNote: 'Switched off.',
        },
      }),
      NOW,
    );
    expect(text).toContain('Spark Onyx Stream 0.1.0, Node 24.1.0');
    expect(text).toContain('Newer version: not compared. Switched off.');
    expect(text).toContain('  none reported in');
  });
});
