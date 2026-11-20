// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { jobsApi } from '@/api/endpoints';
import { JOB_STATUSES, type JobStatus } from '@/api/types';
import { JobTable } from '@/components/job-table';
import {
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Pagination,
  Skeleton,
} from '@/components/ui/display';
import { cn } from '@/lib/cn';
import { humanize } from '@/lib/format';
import { usePollInterval } from '@/live/live';

const PAGE_SIZE = 25;

/** The job monitor: every processing job, newest first, refreshed while it is open. */
export function JobsPage() {
  const [params, setParams] = useSearchParams();
  const pollInterval = usePollInterval();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const status = (params.get('status') ?? '') as JobStatus | '';

  const jobs = useQuery({
    queryKey: ['jobs', { page, status }],
    queryFn: ({ signal }) =>
      jobsApi.list({ page, pageSize: PAGE_SIZE, status: status || undefined }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: pollInterval(true),
  });

  const change = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Every processing step, newest first. Progress updates live."
      />

      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        {(['', ...JOB_STATUSES] as const).map((value) => (
          <button
            key={value || 'ALL'}
            type="button"
            aria-pressed={status === value}
            onClick={() => change({ status: value || null, page: null })}
            className={cn(
              'rounded-full border px-3 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground',
              status === value && 'border-primary/40 bg-primary/10 text-primary hover:text-primary',
            )}
          >
            {value ? humanize(value) : 'All'}
          </button>
        ))}
      </div>

      <ErrorNote error={jobs.error} className="mb-4" />
      {jobs.isPending ? <Skeleton className="h-64 rounded-xl" /> : null}
      {jobs.data && jobs.data.items.length === 0 ? (
        <EmptyState icon={Activity} title={status ? 'No jobs with this status' : 'No jobs yet'}>
          Jobs appear here when a video is uploaded.
        </EmptyState>
      ) : null}
      {jobs.data && jobs.data.items.length > 0 ? (
        <Card className="overflow-hidden">
          <JobTable jobs={jobs.data.items} showAsset />
        </Card>
      ) : null}
      {jobs.data ? (
        <Pagination
          page={jobs.data.page}
          pageSize={jobs.data.pageSize}
          total={jobs.data.total}
          onChange={(next) => change({ page: next > 1 ? String(next) : null })}
        />
      ) : null}
    </>
  );
}
