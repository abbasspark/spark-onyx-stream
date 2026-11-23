// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleSlash, Languages, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { translationJobsApi } from '@/api/endpoints';
import type { TranslationJob } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/display';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { isActiveJob, jobCounts, jobPercent, jobTimeLeft } from '@/lib/bulk';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { languageName } from '@/lib/translations';

const DISMISSED_KEY = 'onyx.admin.translation-jobs.dismissed';
/** A job that ended stays on the page this long, for whoever started it to see how it went. */
const SHOWN_AFTER_END_MS = 30 * 60_000;
const POLL_MS = 3000;

function readDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(DISMISSED_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

const ENDED = {
  COMPLETED: { icon: CheckCircle2, className: 'text-success', word: 'Translated into' },
  CANCELLED: {
    icon: CircleSlash,
    className: 'text-muted-foreground',
    word: 'Stopped translating into',
  },
  FAILED: {
    icon: TriangleAlert,
    className: 'text-destructive',
    word: 'Could not go on translating into',
  },
} as const;

/**
 * The jobs that translate many titles: those that run, with how far they are,
 * and those that ended a moment ago, with how they went.
 */
export function TranslationJobs({ className }: { className?: string }) {
  const { can } = useSession();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [failuresOf, setFailuresOf] = useState<TranslationJob | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const jobs = useQuery({
    queryKey: ['translation-jobs'],
    queryFn: ({ signal }) => translationJobsApi.list(signal),
    // Live events refresh it as well. The poll keeps the bar moving when they do not arrive.
    refetchInterval: (query) => (query.state.data?.some(isActiveJob) ? POLL_MS : false),
  });
  const active = jobs.data?.some(isActiveJob) ?? false;
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), POLL_MS);
    return () => window.clearInterval(timer);
  }, [active]);
  // Titles show their new language once a job has ended.
  const ended = (jobs.data ?? []).filter((job) => !isActiveJob(job)).length;
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ['translations'] });
  }, [ended, queryClient]);

  const cancel = useMutation({
    mutationFn: (job: TranslationJob) => translationJobsApi.cancel(job.id),
    onSuccess: () => {
      toast.success('The translation was stopped. What it did so far stays');
      void queryClient.invalidateQueries({ queryKey: ['translation-jobs'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
      void queryClient.invalidateQueries({ queryKey: ['translation-jobs'] });
    },
  });
  const askCancel = async (job: TranslationJob) => {
    const confirmed = await confirm({
      title: `Stop translating into ${languageName(job.language)}?`,
      description: `${job.done.toLocaleString('en')} of ${job.total.toLocaleString('en')} titles are done and keep what they got. The rest is left as it is.`,
      confirmLabel: 'Stop',
      destructive: true,
    });
    if (confirmed) {
      cancel.mutate(job);
    }
  };
  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50);
    setDismissed(next);
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      // Storage can be blocked. The card then comes back when the page is reloaded.
    }
  };

  const shown = (jobs.data ?? []).filter(
    (job) =>
      isActiveJob(job) ||
      (!dismissed.includes(job.id) &&
        job.finishedAt !== null &&
        now - new Date(job.finishedAt).getTime() < SHOWN_AFTER_END_MS),
  );
  if (shown.length === 0) {
    return null;
  }

  return (
    <>
      <ul className={cn('grid gap-2', className)} aria-label="Translations in progress">
        {shown.map((job) => {
          const running = isActiveJob(job);
          const language = languageName(job.language);
          const counts = jobCounts(job);
          const left = jobTimeLeft(job, now);
          const look = running ? null : ENDED[job.status as keyof typeof ENDED];
          const Icon = look?.icon ?? Languages;
          return (
            <li
              key={job.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 shadow-xs"
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted',
                  look?.className ?? 'text-primary',
                )}
              >
                <Icon className="size-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">
                  {running
                    ? job.status === 'QUEUED'
                      ? `Waiting to translate into ${language}`
                      : `Translating into ${language}`
                    : `${look?.word} ${language}`}
                  <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                    {job.done.toLocaleString('en')} of {job.total.toLocaleString('en')}
                  </span>
                </p>
                {running ? (
                  <Progress
                    className="mt-1.5 max-w-md"
                    value={jobPercent(job)}
                    label={`Translating into ${language}`}
                  />
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {[
                    counts,
                    left,
                    job.note,
                    job.overwrite ? 'replaces existing texts' : null,
                    job.createdBy ? `started by ${job.createdBy.displayName}` : null,
                    !running && job.finishedAt ? formatRelative(job.finishedAt) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {job.failures.length > 0 ? (
                  <Button size="sm" onClick={() => setFailuresOf(job)}>
                    Show what failed
                  </Button>
                ) : null}
                {running && can('catalog:write') ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={cancel.isPending && cancel.variables?.id === job.id}
                    onClick={() => void askCancel(job)}
                  >
                    Stop
                  </Button>
                ) : null}
                {!running ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Hide this message"
                    onClick={() => dismiss(job.id)}
                  >
                    <X />
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={failuresOf !== null}
        onOpenChange={(open) => (open ? undefined : setFailuresOf(null))}
      >
        <DialogContent
          title="Titles that could not be translated"
          description={
            failuresOf
              ? `${failuresOf.failed.toLocaleString('en')} of ${failuresOf.total.toLocaleString('en')}, into ${languageName(failuresOf.language)}. The others are done.`
              : undefined
          }
        >
          <DialogBody>
            <ul className="divide-y rounded-lg border">
              {(failuresOf?.failures ?? []).map((failure) => (
                <li key={failure.titleId} className="grid gap-0.5 px-3 py-2.5">
                  <Link
                    to={`/titles/${failure.titleId}`}
                    className="truncate text-sm font-medium hover:underline"
                    onClick={() => setFailuresOf(null)}
                  >
                    {failure.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{failure.reason}</p>
                </li>
              ))}
            </ul>
            {failuresOf && failuresOf.failed > failuresOf.failures.length ? (
              <p className="text-xs text-muted-foreground">
                And {(failuresOf.failed - failuresOf.failures.length).toLocaleString('en')} more
                that are not listed here.
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="primary" onClick={() => setFailuresOf(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
