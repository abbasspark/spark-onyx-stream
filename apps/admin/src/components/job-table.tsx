// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Square } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { jobsApi } from '@/api/endpoints';
import type { Job } from '@/api/types';
import { useSession } from '@/auth/session';
import { formatDateTime, formatElapsed, formatRelative, humanize } from '@/lib/format';
import { Button } from './ui/button';
import { Progress, StatusBadge, Table, Td, Th, Tr } from './ui/display';
import { Tooltip } from './ui/overlay';

/** A table of processing jobs with their progress and the actions an admin may take. */
export function JobTable({ jobs, showAsset }: { jobs: readonly Job[]; showAsset: boolean }) {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const mayWrite = can('jobs:write');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
    void queryClient.invalidateQueries({ queryKey: ['asset'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  };
  const onError = (error: Error) => toast.error(error.message);
  const cancel = useMutation({
    mutationFn: jobsApi.cancel,
    onSuccess: () => {
      toast.success('The job is being stopped');
      refresh();
    },
    onError,
  });
  const retry = useMutation({
    mutationFn: jobsApi.retry,
    onSuccess: () => {
      toast.success('The step was queued again');
      refresh();
    },
    onError,
  });
  const busy = cancel.isPending || retry.isPending;

  return (
    <Table>
      <thead>
        <tr>
          <Th>Step</Th>
          <Th>Status</Th>
          <Th className="min-w-44">Progress</Th>
          <Th>Attempt</Th>
          <Th>Time</Th>
          <Th>Queued</Th>
          {showAsset ? <Th>Video</Th> : null}
          <Th className="w-10" aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <Tr key={job.id}>
            <Td className="font-medium">{humanize(job.type)}</Td>
            <Td>
              <StatusBadge status={job.status} />
              {job.error ? (
                <p className="mt-1 max-w-md text-xs break-words text-destructive">{job.error}</p>
              ) : null}
            </Td>
            <Td>
              {job.status === 'RUNNING' ? (
                <Progress value={job.progress} label={`${humanize(job.type)} progress`} />
              ) : job.status === 'COMPLETED' ? (
                <Progress value={100} label={`${humanize(job.type)} progress`} />
              ) : (
                <span className="text-muted-foreground">–</span>
              )}
            </Td>
            <Td className="whitespace-nowrap tabular-nums">
              {job.attempts} of {job.maxAttempts}
            </Td>
            <Td className="whitespace-nowrap tabular-nums">
              {formatElapsed(job.startedAt, job.finishedAt)}
            </Td>
            <Td className="whitespace-nowrap text-muted-foreground">
              <Tooltip content={formatDateTime(job.queuedAt)}>
                <span>{formatRelative(job.queuedAt)}</span>
              </Tooltip>
            </Td>
            {showAsset ? (
              <Td>
                {job.assetId && job.type !== 'CLEANUP' ? (
                  <Link to={`/assets/${job.assetId}`} className="text-primary hover:underline">
                    Open
                  </Link>
                ) : (
                  <span className="text-muted-foreground">–</span>
                )}
              </Td>
            ) : null}
            <Td>
              {mayWrite && (job.status === 'QUEUED' || job.status === 'RUNNING') ? (
                <Tooltip content="Cancel this job">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={`Cancel the ${humanize(job.type)} job`}
                    onClick={() => cancel.mutate(job.id)}
                  >
                    <Square />
                  </Button>
                </Tooltip>
              ) : null}
              {mayWrite &&
              job.assetId &&
              job.type !== 'CLEANUP' &&
              (job.status === 'FAILED' || job.status === 'CANCELLED') ? (
                <Tooltip content="Run this step again">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={`Retry the ${humanize(job.type)} job`}
                    onClick={() => retry.mutate(job.id)}
                  >
                    <RotateCcw />
                  </Button>
                </Tooltip>
              ) : null}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
