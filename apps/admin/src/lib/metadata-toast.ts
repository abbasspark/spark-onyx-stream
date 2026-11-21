// SPDX-License-Identifier: AGPL-3.0-only
import { toast } from 'sonner';
import type { ImportResult } from '@/api/types';
import { describeReport } from './metadata';

/** Tells the admin what an import did, and separately what it could not do. */
export function announceImport(
  { title, report }: ImportResult,
  kind: 'imported' | 'updated' = 'imported',
): void {
  toast.success(`${title.name} ${kind}`, { description: describeReport(report) });
  if (report.warnings.length > 0) {
    toast.warning('Some things could not be brought over', {
      description: report.warnings.join('. '),
      duration: 12_000,
    });
  }
}
