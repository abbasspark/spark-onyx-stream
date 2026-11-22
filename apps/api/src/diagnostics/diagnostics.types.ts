// SPDX-License-Identifier: AGPL-3.0-only

/**
 * "off" is something that is not set up, by choice or not yet. It is no fault
 * and is counted with neither the warnings nor the problems.
 */
export type CheckStatus = 'ok' | 'warning' | 'problem' | 'off';

export type CheckGroup =
  'core' | 'processing' | 'storage' | 'protection' | 'delivery' | 'live' | 'connections' | 'setup';

/** One thing that was looked at, and what was found. */
export interface Check {
  /** Stable name, such as "backups" or "storage:<pool id>". Alerts are told apart by it. */
  id: string;
  group: CheckGroup;
  title: string;
  status: CheckStatus;
  /** One sentence: what is the case. */
  summary: string;
  /** What to do about it. Only where there is something to do. */
  hint?: string;
  /** The page of the panel where it is dealt with. */
  link?: { label: string; to: string };
  /** Figures behind the summary, for the curious and for bug reports. */
  facts?: [label: string, value: string][];
}

/** One running process of the application, as it last reported in. */
export interface ProcessReport {
  id: string;
  roles: string[];
  host: string;
  pid: number;
  version: string;
  node: string;
  /** When it started and when it last reported, as ISO dates. */
  startedAt: string;
  seenAt: string;
  /** Memory it holds, in bytes. */
  memoryBytes: number;
}

export interface VersionInfo {
  version: string;
  /** The commit the installation was built from, when it is known. */
  commit: string | null;
  node: string;
  /**
   * Whether a newer version exists. "unknown" when the check is switched off,
   * failed, or there is no commit to compare with.
   */
  update: 'current' | 'available' | 'unknown';
  /** The newest commit, when it was looked up. */
  latestCommit: string | null;
  /** Why the answer is "unknown", in words. */
  updateNote: string | null;
}

export interface DiagnosticsSummary {
  status: 'ok' | 'warning' | 'problem';
  problems: number;
  warnings: number;
  checkedAt: string;
}

export interface AlertSettings {
  /** Whether the owners get an email when a problem appears. */
  emailAlerts: boolean;
}

export interface DiagnosticsReport extends DiagnosticsSummary {
  /** How long looking at everything took, in milliseconds. */
  tookMs: number;
  version: VersionInfo;
  checks: Check[];
  processes: ProcessReport[];
  alerts: AlertSettings & {
    /** Whether email is set up at all. */
    mailEnabled: boolean;
    /** Who gets the emails: the owners that can sign in. */
    recipients: string[];
  };
}
