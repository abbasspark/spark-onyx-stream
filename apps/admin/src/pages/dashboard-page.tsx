// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  Film,
  type LucideIcon,
  Upload,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { auditApi, statsApi } from '@/api/endpoints';
import { ASSET_STATUSES, type AssetStatus, type OverviewStats } from '@/api/types';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorNote,
  PageHeader,
  Progress,
  Skeleton,
} from '@/components/ui/display';
import { Tooltip } from '@/components/ui/overlay';
import { describeAction, subjectOf } from '@/lib/audit';
import { cn } from '@/lib/cn';
import { usePollInterval } from '@/live/live';
import {
  formatBytes,
  formatDateTime,
  formatHours,
  formatRelative,
  humanize,
  usagePercent,
} from '@/lib/format';

const STATUS_COLORS: Record<Exclude<AssetStatus, 'DELETED'>, string> = {
  READY: 'bg-success',
  PROCESSING: 'bg-warning',
  UPLOADED: 'bg-info',
  UPLOADING: 'bg-info/60',
  FAILED: 'bg-destructive',
};

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'default' | 'danger';
  to?: string;
}

function StatTile({ icon: Icon, label, value, detail, tone = 'default', to }: StatTileProps) {
  const body = (
    <Card className={cn('h-full transition-colors', to && 'hover:border-primary/40')}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        <span
          className={cn(
            'flex size-9 items-center justify-center rounded-lg',
            tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
  return to ? (
    <Link to={to} className="rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

/** A bar chart of uploads per day, drawn with plain elements so it follows the theme. */
function UploadsChart({ days }: { days: OverviewStats['uploadsPerDay'] }) {
  const max = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const dayLabel = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  return (
    <div>
      <div
        className="flex h-40 items-end gap-1.5"
        role="img"
        aria-label={`${total} uploads in the last ${days.length} days`}
      >
        {days.map((day) => (
          <Tooltip
            key={day.date}
            content={`${dayLabel.format(new Date(day.date))}: ${day.count} ${day.count === 1 ? 'upload' : 'uploads'}`}
          >
            <div className="group flex h-full flex-1 flex-col justify-end">
              <div
                className={cn(
                  'w-full rounded-t-sm transition-colors',
                  day.count > 0 ? 'bg-primary/70 group-hover:bg-primary' : 'bg-muted',
                )}
                style={{
                  height: day.count > 0 ? `${Math.max(6, (day.count / max) * 100)}%` : '3px',
                }}
              />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{dayLabel.format(new Date(days[0]?.date ?? Date.now()))}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/** One bar split by status, with a legend. */
function StatusBreakdown({ stats }: { stats: OverviewStats['assets'] }) {
  const entries = ASSET_STATUSES.map((status) => ({
    status,
    count: stats.byStatus[status] ?? 0,
  })).filter((entry) => entry.count > 0);

  if (stats.total === 0) {
    return <p className="text-sm text-muted-foreground">No videos yet.</p>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {entries.map((entry) => (
          <div
            key={entry.status}
            className={STATUS_COLORS[entry.status]}
            style={{ width: `${(entry.count / stats.total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="grid gap-2 text-sm">
        {entries.map((entry) => (
          <li key={entry.status}>
            <Link
              to={`/assets?status=${entry.status}`}
              className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-accent"
            >
              <span
                className={cn('size-2 rounded-full', STATUS_COLORS[entry.status])}
                aria-hidden="true"
              />
              <span className="flex-1">{humanize(entry.status)}</span>
              <span className="font-medium tabular-nums">{entry.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The first page after signing in: the state of the installation at a glance. */
export function DashboardPage() {
  const { state, can } = useSession();
  const mayRead = can('assets:read') && can('jobs:read');
  const pollInterval = usePollInterval();

  const stats = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: ({ signal }) => statsApi.overview(signal),
    enabled: mayRead,
    refetchInterval: pollInterval(true),
  });
  const activity = useQuery({
    queryKey: ['audit', 'recent'],
    queryFn: ({ signal }) => auditApi.list({ page: 1, pageSize: 6 }, signal),
    enabled: can('audit:read'),
    refetchInterval: pollInterval(true),
  });

  const name = state.status === 'signedIn' ? state.me.displayName.split(' ')[0] : '';
  const data = stats.data;
  const storagePercent = data
    ? usagePercent(data.storage.usedBytes, data.storage.quotaBytes)
    : null;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${name}`}
        description="The state of your installation at a glance."
        actions={
          can('assets:write') ? (
            <Button variant="primary" asChild>
              <Link to="/assets?upload=1">
                <Upload />
                Upload videos
              </Link>
            </Button>
          ) : null
        }
      />

      {!mayRead ? (
        <EmptyState icon={Film} title="Nothing to show">
          Your role does not include the library. Ask an owner if you need access.
        </EmptyState>
      ) : null}
      <ErrorNote error={stats.error} className="mb-4" />

      {mayRead && stats.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : null}

      {data ? (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={Film}
              label="Videos"
              value={data.assets.total}
              detail={`${formatHours(data.assets.readyDurationMs)} ready to play`}
              to="/assets"
            />
            <StatTile
              icon={Activity}
              label="Processing now"
              value={data.jobs.running}
              detail={`${data.jobs.queued} waiting in the queue`}
              to="/jobs"
            />
            <StatTile
              icon={CheckCircle2}
              label="Jobs finished, last 24 hours"
              value={data.jobs.completedLast24h}
              detail={
                data.jobs.failedLast24h > 0 ? `${data.jobs.failedLast24h} failed` : 'None failed'
              }
              tone={data.jobs.failedLast24h > 0 ? 'danger' : 'default'}
              to={data.jobs.failedLast24h > 0 ? '/jobs?status=FAILED' : '/jobs'}
            />
            <StatTile
              icon={Database}
              label="Storage used"
              value={formatBytes(data.storage.usedBytes)}
              detail={
                data.storage.quotaBytes
                  ? `of ${formatBytes(data.storage.quotaBytes)} in ${data.storage.pools} ${data.storage.pools === 1 ? 'pool' : 'pools'}`
                  : 'No limit set'
              }
              to={can('storage:read') ? '/storage' : undefined}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="Uploads"
                description="Videos added per day in the last two weeks."
              />
              <CardContent>
                <UploadsChart days={data.uploadsPerDay} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader title="Library by status" />
              <CardContent className="grid gap-5">
                <StatusBreakdown stats={data.assets} />
                {storagePercent !== null ? (
                  <div className="grid gap-1.5 border-t pt-4">
                    <p className="text-[13px] font-medium text-muted-foreground">Storage</p>
                    <Progress value={storagePercent} label="Storage used" />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader
                title="Recent failures"
                actions={
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/jobs?status=FAILED">
                      All failed jobs
                      <ArrowRight />
                    </Link>
                  </Button>
                }
              />
              <CardContent>
                {data.recentFailures.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                    No job has failed.
                  </p>
                ) : (
                  <ul className="grid gap-3">
                    {data.recentFailures.map((failure) => (
                      <li key={failure.jobId} className="flex items-start gap-3">
                        <AlertTriangle
                          className="mt-0.5 size-4 shrink-0 text-destructive"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {failure.assetId ? (
                              <Link to={`/assets/${failure.assetId}`} className="hover:underline">
                                {failure.assetTitle}
                              </Link>
                            ) : (
                              (failure.assetTitle ?? 'Deleted video')
                            )}
                            <span className="font-normal text-muted-foreground">
                              {' '}
                              · {humanize(failure.type)}
                            </span>
                          </p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {failure.error}
                          </p>
                        </div>
                        <Tooltip content={formatDateTime(failure.finishedAt)}>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatRelative(failure.finishedAt)}
                          </span>
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {can('audit:read') ? (
              <Card>
                <CardHeader
                  title="Recent activity"
                  actions={
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/audit">
                        Audit log
                        <ArrowRight />
                      </Link>
                    </Button>
                  }
                />
                <CardContent>
                  <ErrorNote error={activity.error} />
                  {activity.isPending ? <Skeleton className="h-32" /> : null}
                  <ul className="grid gap-3">
                    {activity.data?.items.map((entry) => (
                      <li key={entry.id} className="flex items-center gap-3 text-sm">
                        <Clock
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {describeAction(entry.action)}
                          {subjectOf(entry.metadata) ? (
                            <span className="text-muted-foreground">
                              {' '}
                              · {subjectOf(entry.metadata)}
                            </span>
                          ) : null}
                        </span>
                        <Tooltip content={formatDateTime(entry.createdAt)}>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatRelative(entry.createdAt)}
                          </span>
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
