// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { jobsApi } from '../api/endpoints';
import type { Job } from '../api/types';
import { useSession } from '../auth/session';
import { formatDateTime, formatElapsed, humanize } from '../lib/format';
import { ErrorNote, ProgressBar, StatusBadge } from './ui';

/** A table of processing jobs with their progress and the actions an admin may take. */
export function JobTable({ jobs, showAsset }: { jobs: readonly Job[]; showAsset: boolean }) {
  const { can } = useSession();
  const queryClient = useQueryClient();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
    void queryClient.invalidateQueries({ queryKey: ['asset'] });
  };
  const cancel = useMutation({ mutationFn: jobsApi.cancel, onSuccess: refresh });
  const retry = useMutation({ mutationFn: jobsApi.retry, onSuccess: refresh });
  const busy = cancel.isPending || retry.isPending;

  return (
    <>
      <ErrorNote error={cancel.error ?? retry.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>Status</th>
              <th className="col-progress">Progress</th>
              <th>Attempt</th>
              <th>Time</th>
              <th>Queued</th>
              {showAsset ? <th>Asset</th> : null}
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{humanize(job.type)}</td>
                <td>
                  <StatusBadge status={job.status} />
                  {job.error ? <div className="job-error">{job.error}</div> : null}
                </td>
                <td className="col-progress">
                  {job.status === 'RUNNING' ? (
                    <ProgressBar percent={job.progress} label={`${humanize(job.type)} progress`} />
                  ) : job.status === 'COMPLETED' ? (
                    '100%'
                  ) : (
                    '–'
                  )}
                </td>
                <td>
                  {job.attempts} of {job.maxAttempts}
                </td>
                <td>{formatElapsed(job.startedAt, job.finishedAt)}</td>
                <td>{formatDateTime(job.queuedAt)}</td>
                {showAsset ? (
                  <td>{job.assetId ? <Link to={`/assets/${job.assetId}`}>Open</Link> : '–'}</td>
                ) : null}
                <td className="col-actions">
                  {can('jobs:write') && (job.status === 'QUEUED' || job.status === 'RUNNING') ? (
                    <button
                      type="button"
                      className="button button-quiet"
                      disabled={busy}
                      onClick={() => cancel.mutate(job.id)}
                    >
                      Cancel
                    </button>
                  ) : null}
                  {can('jobs:write') &&
                  job.assetId &&
                  (job.status === 'FAILED' || job.status === 'CANCELLED') ? (
                    <button
                      type="button"
                      className="button button-quiet"
                      disabled={busy}
                      onClick={() => retry.mutate(job.id)}
                    >
                      Retry
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
