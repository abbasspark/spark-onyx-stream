// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  ClipboardCopy,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { diagnosticsApi } from '@/api/endpoints';
import type { DiagnosticCheck, DiagnosticsReport, ProcessReport } from '@/api/types';
import { useSession } from '@/auth/session';
import { CopyField } from '@/components/copy-field';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  ErrorNote,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { ToggleRow } from '@/components/ui/form';
import { Tooltip } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import {
  attentionOf,
  headlineOf,
  quietByGroup,
  reportText,
  rolesOf,
  runningFor,
  shortCommit,
  tallyOf,
  updateLook,
} from '@/lib/diagnostics';
import { formatBytes, formatRelative } from '@/lib/format';

const QUERY_KEY = ['diagnostics', 'report'];

/** What every part of the installation says about itself, and what to do where something is wrong. */
export function DiagnosticsPage() {
  const { can } = useSession();
  const report = useQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) => diagnosticsApi.report(signal),
    // Looking costs the server a second, so not on every glance at the tab.
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
  const data = report.data;
  const queryClient = useQueryClient();
  // The mark in the header says the same as this page, at once.
  useEffect(() => {
    if (data) {
      queryClient.setQueryData(['diagnostics', 'summary'], {
        summary: {
          status: data.status,
          problems: data.problems,
          warnings: data.warnings,
          checkedAt: data.checkedAt,
        },
      });
    }
  }, [data, queryClient]);

  const copy = async () => {
    if (!data) {
      return;
    }
    try {
      await navigator.clipboard.writeText(reportText(data));
      toast.success('Report copied. It holds no password and no key.');
    } catch {
      toast.error('Copying is blocked by the browser');
    }
  };

  return (
    <>
      <PageHeader
        title="Diagnostics"
        description="What every part of the installation says about itself. It is looked at again when you open this page, and every five minutes in the background."
        actions={
          <>
            <Tooltip content="As text, for a bug report or for whoever helps you">
              <Button variant="secondary" onClick={() => void copy()} disabled={!data}>
                <ClipboardCopy />
                Copy report
              </Button>
            </Tooltip>
            <Button onClick={() => void report.refetch()} disabled={report.isFetching}>
              <RefreshCw className={cn(report.isFetching && 'animate-spin')} />
              Check again
            </Button>
          </>
        }
      />
      <ErrorNote error={report.error} className="mb-4" />
      {report.isPending ? (
        <div className="grid gap-6">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : null}
      {data ? (
        <div className="grid grid-cols-1 gap-6">
          <StateCard report={data} />
          <Attention checks={attentionOf(data.checks)} />
          {/* Columns, so cards of different heights leave no holes. */}
          <div className="-mb-6 gap-6 xl:columns-2">
            {quietByGroup(data.checks).map((group) => (
              <Card key={group.id} className="mb-6 break-inside-avoid">
                <CardHeader title={group.title} description={group.about} />
                <ul className="divide-y border-t">
                  {group.checks.map((check) => (
                    <QuietRow key={check.id} check={check} />
                  ))}
                </ul>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <ProcessesCard processes={data.processes} />
            <AlertsCard report={data} mayWrite={can('settings:write')} />
          </div>
        </div>
      ) : null}
    </>
  );
}

const STATE_STYLES = {
  ok: { icon: ShieldCheck, ring: 'bg-success/10 text-success' },
  warning: { icon: ShieldAlert, ring: 'bg-warning/10 text-warning' },
  problem: { icon: ShieldX, ring: 'bg-destructive/10 text-destructive' },
} as const;

function StateCard({ report }: { report: DiagnosticsReport }) {
  const style = STATE_STYLES[report.status];
  const Icon = style.icon;
  const { version } = report;
  const update = updateLook(version);
  // The age of the look moves on while the page stays open.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card>
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-full',
              style.ring,
            )}
          >
            <Icon className="size-6" aria-hidden="true" />
          </div>
          <div className="grid gap-1">
            <h2 className="text-lg leading-tight font-semibold">{headlineOf(report)}</h2>
            <p className="text-sm text-muted-foreground">
              {tallyOf(report.checks)}. Looked at{' '}
              {Date.now() - new Date(report.checkedAt).getTime() < 15_000
                ? 'just now'
                : formatRelative(report.checkedAt)}
              , which took{' '}
              {report.tookMs < 1000
                ? `${report.tookMs} ms`
                : `${(report.tookMs / 1000).toFixed(1)} s`}
              .
            </p>
          </div>
        </div>
        <div className="grid min-w-0 gap-3 rounded-lg border bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Version {version.version}
              {version.commit ? (
                <Tooltip content={version.commit}>
                  <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                    {shortCommit(version.commit)}
                  </span>
                </Tooltip>
              ) : null}
            </p>
            <Badge tone={update.tone} dot>
              {update.label}
            </Badge>
          </div>
          {update.note ? <p className="text-xs text-muted-foreground">{update.note}</p> : null}
          {version.update === 'available' ? (
            <CopyField label="On the server" value="onyx update" />
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/** What asks for something to be done: said in full, with what to do and where. */
function Attention({ checks }: { checks: DiagnosticCheck[] }) {
  if (checks.length === 0) {
    return null;
  }
  return (
    <section aria-label="What needs attention" className="grid gap-3">
      {checks.map((check) => {
        const problem = check.status === 'problem';
        const Icon = problem ? CircleAlert : TriangleAlert;
        return (
          <article
            key={check.id}
            className={cn(
              'grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-4',
              problem ? 'border-destructive/40' : 'border-warning/40',
            )}
          >
            <div
              className={cn(
                'flex size-9 items-center justify-center rounded-full',
                problem ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning',
              )}
            >
              <Icon className="size-4.5" aria-hidden="true" />
            </div>
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{check.title}</h3>
                <Badge tone={problem ? 'danger' : 'warning'}>
                  {problem ? 'Problem' : 'Warning'}
                </Badge>
              </div>
              <p className="text-sm break-words">{check.summary}</p>
              {check.hint ? (
                <p className="text-sm break-words text-muted-foreground">{check.hint}</p>
              ) : null}
              <Facts check={check} />
            </div>
            {check.link ? (
              <Button asChild variant="secondary" size="sm" className="justify-self-start">
                <Link to={check.link.to}>
                  {check.link.label}
                  <ArrowRight />
                </Link>
              </Button>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

function Facts({ check }: { check: DiagnosticCheck }) {
  if (!check.facts?.length) {
    return null;
  }
  return (
    <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
      {check.facts.map(([label, value]) => (
        <div key={label} className="flex gap-1.5">
          <dt>{label}</dt>
          <dd className="font-medium text-foreground tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A check that asks for nothing. Its figures open on a click. */
function QuietRow({ check }: { check: DiagnosticCheck }) {
  const [open, setOpen] = useState(false);
  const off = check.status === 'off';
  const hasFacts = Boolean(check.facts?.length);
  const body = (
    <>
      {off ? (
        <CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      )}
      <span className="grid min-w-0 flex-1 gap-0.5 text-left">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {check.title}
          {off ? (
            <span className="text-xs font-normal text-muted-foreground">Not set up</span>
          ) : null}
        </span>
        <span className="text-sm break-words text-muted-foreground">{check.summary}</span>
      </span>
      {hasFacts ? (
        <ChevronDown
          className={cn(
            'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
  return (
    <li>
      {hasFacts ? (
        <button
          type="button"
          className="flex w-full items-start gap-3 px-6 py-3 outline-none hover:bg-muted/40 focus-visible:bg-muted/60"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-6 py-3">{body}</div>
      )}
      {open ? (
        <div className="px-6 pb-3 pl-13">
          <Facts check={check} />
        </div>
      ) : null}
    </li>
  );
}

const ROLE_TONES: Record<string, 'primary' | 'info' | 'warning' | 'success'> = {
  api: 'primary',
  scheduler: 'info',
  worker: 'warning',
  live: 'success',
};

function ProcessesCard({ processes }: { processes: ProcessReport[] }) {
  return (
    <Card>
      <CardHeader
        title="Processes"
        description="Every running process of the application reports in every fifteen seconds. One that is silent for a minute is taken to be gone."
      />
      {processes.length === 0 ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            None has reported in yet. They do within a few seconds of starting.
          </p>
        </CardContent>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Does</Th>
              <Th>Server</Th>
              <Th>Version</Th>
              <Th className="text-right">Running for</Th>
              <Th className="text-right">Memory</Th>
              <Th className="text-right">Last heard</Th>
            </tr>
          </thead>
          <tbody>
            {processes.map((process) => (
              <Tr key={process.id}>
                <Td>
                  <span className="flex flex-wrap gap-1.5">
                    {rolesOf(process).map((role) => (
                      <Badge key={role} tone={ROLE_TONES[role] ?? 'neutral'}>
                        {role}
                      </Badge>
                    ))}
                  </span>
                </Td>
                <Td>
                  <p className="font-mono text-xs">{process.host}</p>
                  <p className="text-xs text-muted-foreground">Process {process.pid}</p>
                </Td>
                <Td>
                  <p className="tabular-nums">{process.version}</p>
                  <p className="text-xs text-muted-foreground">Node {process.node}</p>
                </Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  {runningFor(process.startedAt)}
                </Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  {formatBytes(process.memoryBytes)}
                </Td>
                <Td className="text-right text-xs whitespace-nowrap text-muted-foreground">
                  {formatRelative(process.seenAt)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function AlertsCard({ report, mayWrite }: { report: DiagnosticsReport; mayWrite: boolean }) {
  const queryClient = useQueryClient();
  const { alerts } = report;
  const save = useMutation({
    mutationFn: (emailAlerts: boolean) => diagnosticsApi.saveSettings({ emailAlerts }),
    onSuccess: ({ emailAlerts }) => {
      toast.success(emailAlerts ? 'Alerts are on' : 'Alerts are off');
      queryClient.setQueryData<DiagnosticsReport>(QUERY_KEY, (current) =>
        current ? { ...current, alerts: { ...current.alerts, emailAlerts } } : current,
      );
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader
        title="Alerts"
        description="A problem that nobody hears of is the worst kind. The owners can be told by email."
      />
      <CardContent className="grid gap-4">
        <ToggleRow
          label="Email the owners when a problem appears"
          description="Once when a problem has been there for two looks in a row, and once more when it is gone. Warnings are not sent."
          checked={alerts.emailAlerts}
          onCheckedChange={(checked) => save.mutate(checked)}
          disabled={!mayWrite || save.isPending}
        />
        {alerts.mailEnabled ? (
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">
              {alerts.emailAlerts ? 'Goes to' : 'Would go to'} the owners who can sign in:
            </p>
            <ul className="grid gap-1.5">
              {alerts.recipients.map((email) => (
                <li key={email} className="flex items-center gap-2 text-sm">
                  <Check className="size-3.5 text-success" aria-hidden="true" />
                  <span className="truncate">{email}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            <Mail className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p>
              Email is not set up, so nothing can be sent.{' '}
              <Link to="/email" className="font-medium underline underline-offset-2">
                Set it up
              </Link>{' '}
              to get alerts.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
