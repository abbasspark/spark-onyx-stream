// SPDX-License-Identifier: AGPL-3.0-only
import type { AppRole } from '../roles/app-role.js';

export type DependencyStatus = 'up' | 'down';

export interface DependencyCheck {
  status: DependencyStatus;
  /** Time the check took, in milliseconds. */
  latencyMs: number;
  /** Present only when the dependency is down. */
  error?: string;
}

export interface HealthReport {
  /** "ok" when every dependency is up, otherwise "degraded". */
  status: 'ok' | 'degraded';
  roles: readonly AppRole[];
  uptimeSeconds: number;
  checks: {
    database: DependencyCheck;
    redis: DependencyCheck;
  };
}
