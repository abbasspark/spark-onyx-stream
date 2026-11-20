// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { jobsApi } from '../api/endpoints';
import { JOB_STATUSES, type JobStatus } from '../api/types';
import { JobTable } from '../components/job-table';
import { EmptyState, ErrorNote, PageHeader, Pagination, Spinner } from '../components/ui';
import { humanize } from '../lib/format';

const PAGE_SIZE = 25;
const REFRESH_MS = 2000;

/** The job monitor: every processing job, newest first, refreshed while it is open. */
export function JobsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const status = (params.get('status') ?? '') as JobStatus | '';

  const jobs = useQuery({
    queryKey: ['jobs', { page, status }],
    queryFn: ({ signal }) =>
      jobsApi.list({ page, pageSize: PAGE_SIZE, status: status || undefined }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
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
      <PageHeader title="Jobs" />
      <div className="toolbar">
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => change({ status: event.target.value, page: null })}
        >
          <option value="">All statuses</option>
          {JOB_STATUSES.map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
      </div>

      <ErrorNote error={jobs.error} />
      {jobs.isPending ? <Spinner label="Loading jobs" /> : null}
      {jobs.data && jobs.data.items.length === 0 ? (
        <EmptyState title="No jobs">Jobs appear here when a video is uploaded.</EmptyState>
      ) : null}
      {jobs.data && jobs.data.items.length > 0 ? (
        <JobTable jobs={jobs.data.items} showAsset />
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
