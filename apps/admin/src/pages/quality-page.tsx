// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  HeartPulse,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Hourglass,
  Minus,
  PlayCircle,
  Timer,
  Unplug,
  XCircle,
} from 'lucide-react';
import { Fragment, type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { qualityApi } from '@/api/endpoints';
import type {
  PlayDevice,
  QualityDay,
  QualityError,
  QualityFailure,
  QualityFigures,
  QualityGroup,
  QualityRange,
  QualitySubject,
} from '@/api/types';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorNote,
  PageHeader,
  Pagination,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Select } from '@/components/ui/form';
import { Tooltip } from '@/components/ui/overlay';
import { ValueBars } from '@/components/value-bars';
import { useAddressParams } from '@/lib/address-params';
import {
  bucketDays,
  DEVICE_LABELS,
  formatChartDay,
  formatCount,
  formatShare,
  formatWatchTime,
  RANGE_PRESETS,
  type RangePreset,
  rangeOfPreset,
} from '@/lib/analytics';
import { titlePath } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import {
  errorLook,
  formatKbps,
  formatMetric,
  formatMs,
  formatRate,
  type Grade,
  GRADE_LOOKS,
  gradeOf,
  heightShares,
  mergeDays,
  METRIC_LOOKS,
  MIN_TO_GRADE,
  playbackFailureRate,
  QUALITY_METRICS,
  qualityChange,
  type QualityMetric,
  serverLabel,
  startFailureRate,
  valueOf,
  verdictOf,
} from '@/lib/quality';

const PAGE_SIZE = 10;
const DEVICES: PlayDevice[] = ['DESKTOP', 'MOBILE', 'TABLET', 'TV', 'OTHER'];

const METRIC_ICONS: Record<QualityMetric, typeof Timer> = {
  startupMs: Timer,
  rebufferRatio: Hourglass,
  startFailureRate: XCircle,
  playbackFailureRate: Unplug,
};

const GRADE_ICONS: Record<Grade, typeof CheckCircle2> = {
  good: CheckCircle2,
  fair: CircleAlert,
  poor: AlertTriangle,
};

/** What the chart can show over time. */
type Charted = QualityMetric | 'attempts';
const CHARTED: { value: Charted; label: string }[] = [
  ...QUALITY_METRICS.map((value) => ({ value, label: METRIC_LOOKS[value].label })),
  { value: 'attempts', label: 'Playbacks' },
];

/** The value the chart draws: seconds and percent, so that the scale reads in round numbers. */
function chartValue(metric: Charted, figures: QualityFigures): number {
  if (metric === 'attempts') {
    return figures.attempts;
  }
  const value = valueOf(metric, figures) ?? 0;
  return metric === 'startupMs' ? value / 1000 : value * 100;
}

const chartFormat = (metric: Charted) => (value: number) =>
  metric === 'attempts'
    ? formatCount(value)
    : metric === 'startupMs'
      ? `${Number(value.toFixed(1))} s`
      : `${Number(value.toFixed(value < 1 ? 2 : 1))} %`;

/** How playback goes: what players reported about starting, waiting, quality and problems. */
export function QualityPage() {
  const [params, change] = useAddressParams();
  const preset = (
    RANGE_PRESETS.some((entry) => entry.value === params.get('days')) ? params.get('days') : '7'
  ) as RangePreset;
  const kind = (['VIDEO', 'LIVE'].includes(params.get('kind') ?? '') ? params.get('kind') : '') as
    'VIDEO' | 'LIVE' | '';
  const device = (
    DEVICES.includes(params.get('device') as PlayDevice) ? params.get('device') : ''
  ) as PlayDevice | '';
  const server = params.get('server') ?? '';
  const code = params.get('problem') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [metric, setMetric] = useState<Charted>('startupMs');

  // The days are those of the admin's own clock, and so is where a day begins.
  const range = useMemo<QualityRange>(
    () => ({
      ...rangeOfPreset(preset, new Date()),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      kind: kind || undefined,
      device: device || undefined,
      server: server || undefined,
    }),
    [preset, kind, device, server],
  );
  const days = RANGE_PRESETS.find((entry) => entry.value === preset)?.days ?? 7;

  const summary = useQuery({
    queryKey: ['quality', 'summary', range],
    queryFn: ({ signal }) => qualityApi.summary(range, signal),
    placeholderData: keepPreviousData,
  });
  const failures = useQuery({
    queryKey: ['quality', 'failures', range, code, page],
    queryFn: ({ signal }) =>
      qualityApi.failures({ ...range, code: code || undefined, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  });

  const data = summary.data;
  const buckets = useMemo(
    () => bucketDays(data?.days ?? [], (slice: readonly QualityDay[]) => mergeDays(slice)),
    [data?.days],
  );
  const weekly = buckets.length > 0 && buckets[0]?.from !== buckets[0]?.to;
  const verdict = data ? verdictOf(data.totals) : null;
  const filtered = Boolean(kind || device || server);

  return (
    <>
      <PageHeader
        title="Playback quality"
        description="How watching goes for your viewers: how fast videos start, how often they stop to load, in what quality they play and what breaks. Counted from what players report."
        actions={
          <>
            <Select
              aria-label="What was played"
              className="w-44"
              value={kind || 'ALL'}
              onValueChange={(value) =>
                change({ kind: value === 'ALL' ? null : value, page: null })
              }
              options={[
                { value: 'ALL', label: 'Videos and channels' },
                { value: 'VIDEO', label: 'Videos' },
                { value: 'LIVE', label: 'Live channels' },
              ]}
            />
            <Select
              aria-label="Kind of device"
              className="w-36"
              value={device || 'ALL'}
              onValueChange={(value) =>
                change({ device: value === 'ALL' ? null : value, page: null })
              }
              options={[
                { value: 'ALL', label: 'All devices' },
                ...DEVICES.map((value) => ({ value, label: DEVICE_LABELS[value] })),
              ]}
            />
            {data && (data.knownServers.length > 1 || server) ? (
              <Select
                aria-label="Server"
                className="w-48"
                value={server || 'ALL'}
                onValueChange={(value) =>
                  change({ server: value === 'ALL' ? null : value, page: null })
                }
                options={[
                  { value: 'ALL', label: 'All servers' },
                  ...[...new Set([...data.knownServers, ...(server ? [server] : [])])].map(
                    (value) => ({ value, label: serverLabel(value) }),
                  ),
                ]}
              />
            ) : null}
            <Select
              aria-label="Days"
              className="w-40"
              value={preset}
              onValueChange={(value) => change({ days: value === '7' ? null : value, page: null })}
              options={RANGE_PRESETS.map((entry) => ({ value: entry.value, label: entry.label }))}
            />
          </>
        }
      />

      <ErrorNote error={summary.error} className="mb-4" />
      {data && !data.recording ? (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          This installation takes no reports from players (<code>PLAYBACK_REPORTS=off</code>), so
          the figures stay as they are. Set it to <code>on</code> to count again.
        </p>
      ) : null}

      {summary.isPending ? (
        <div className="grid gap-4">
          <Skeleton className="h-16 rounded-xl" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : null}

      {data && verdict ? (
        data.totals.attempts === 0 && data.previous.attempts === 0 ? (
          <EmptyState icon={HeartPulse} title="No player has reported yet">
            {filtered
              ? 'Nothing was reported for this choice in these days. Widen it above.'
              : 'The website reports by itself as soon as someone plays a video there. Apps report to the address that comes with every playback: see "Playback quality" in the API reference.'}
          </EmptyState>
        ) : (
          // One column that may shrink: a wide table inside scrolls by itself.
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <Verdict verdict={verdict} figures={data.totals} keptDays={data.keptDays} />
            <Scorecard totals={data.totals} previous={data.previous} days={days} />

            <Card>
              <CardHeader
                title={`${CHARTED.find((entry) => entry.value === metric)?.label} per ${weekly ? 'week' : 'day'}`}
                description={
                  metric === 'attempts'
                    ? 'Playbacks a player reported on.'
                    : `${METRIC_LOOKS[metric].about} ${METRIC_LOOKS[metric].goal}.`
                }
                actions={
                  <div
                    role="radiogroup"
                    aria-label="Figure"
                    className="flex flex-wrap rounded-lg border bg-muted/40 p-0.5"
                  >
                    {CHARTED.map((entry) => (
                      <button
                        key={entry.value}
                        type="button"
                        role="radio"
                        aria-checked={metric === entry.value}
                        onClick={() => setMetric(entry.value)}
                        className={cn(
                          'h-7 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                          metric === entry.value && 'bg-background text-foreground shadow-sm',
                        )}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                }
              />
              <CardContent>
                <ValueBars
                  bars={buckets.map((bucket) => ({
                    key: bucket.from,
                    label: bucket.label,
                    value: chartValue(metric, bucket.value),
                    from: bucket.from,
                    to: bucket.to,
                    figures: bucket.value,
                  }))}
                  label={`${CHARTED.find((entry) => entry.value === metric)?.label} per ${weekly ? 'week' : 'day'}.`}
                  format={chartFormat(metric)}
                  details={(bar) => (
                    <div className="grid gap-1.5">
                      <p className="font-medium">
                        {bar.from === bar.to
                          ? formatChartDay(bar.from, true)
                          : `${formatChartDay(bar.from)} to ${formatChartDay(bar.to)}`}
                      </p>
                      <Line label="Playbacks" value={formatCount(bar.figures.attempts)} />
                      {QUALITY_METRICS.map((entry) => (
                        <Line
                          key={entry}
                          label={METRIC_LOOKS[entry].label}
                          value={formatMetric(entry, valueOf(entry, bar.figures))}
                          strong={entry === metric}
                        />
                      ))}
                    </div>
                  )}
                />
              </CardContent>
            </Card>

            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-2">
              <Problems
                errors={data.errors}
                attempts={data.totals.attempts}
                chosen={code}
                onChoose={(next) => change({ problem: next === code ? null : next, page: null })}
              />
              <Troubled subjects={data.troubled} />
            </div>

            <Breakdowns devices={data.devices} servers={data.servers} players={data.players} />

            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Picture heights={data.heights} totals={data.totals} />
              <Outcomes totals={data.totals} />
            </div>

            <Card>
              <CardHeader
                title={code ? `Failed playbacks: ${errorLook(code).label}` : 'Failed playbacks'}
                description="Each playback a problem ended, the newest first. No viewer is named: only what was played, and on what."
                actions={
                  code ? (
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => change({ problem: null, page: null })}
                    >
                      Show all problems
                    </button>
                  ) : null
                }
              />
              <CardContent className="grid gap-3">
                <ErrorNote error={failures.error} />
                <Failures items={failures.data?.items ?? []} loading={failures.isPending} />
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={failures.data?.total ?? 0}
                  onChange={(next) => change({ page: next === 1 ? null : String(next) })}
                />
              </CardContent>
            </Card>
          </div>
        )
      ) : null}
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className={cn('flex justify-between gap-4', strong && 'font-medium')}>
      <span className={strong ? undefined : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </p>
  );
}

/** A grade as a sign with its word: never by colour alone. */
function GradeBadge({ grade }: { grade: Grade | null }) {
  if (!grade) {
    return <Badge>Too few to grade</Badge>;
  }
  const Icon = GRADE_ICONS[grade];
  return (
    <Badge tone={GRADE_LOOKS[grade].tone}>
      <Icon className="size-3" aria-hidden="true" />
      {GRADE_LOOKS[grade].label}
    </Badge>
  );
}

/** The whole picture in one line: the worst of the four figures decides. */
function Verdict({
  verdict,
  figures,
  keptDays,
}: {
  verdict: ReturnType<typeof verdictOf>;
  figures: QualityFigures;
  keptDays: number;
}) {
  const Icon = verdict.grade ? GRADE_ICONS[verdict.grade] : HeartPulse;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3',
        verdict.grade === 'good' && 'border-success/30 bg-success/[0.06]',
        verdict.grade === 'fair' && 'border-warning/40 bg-warning/[0.08]',
        verdict.grade === 'poor' && 'border-destructive/30 bg-destructive/[0.06]',
        verdict.grade === null && 'bg-card',
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'size-5 shrink-0',
          verdict.grade === 'good' && 'text-success',
          verdict.grade === 'fair' && 'text-warning',
          verdict.grade === 'poor' && 'text-destructive',
          verdict.grade === null && 'text-muted-foreground',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{verdict.title}</p>
        <p className="text-sm text-muted-foreground first-letter:uppercase">{verdict.detail}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {formatCount(figures.attempts)} {figures.attempts === 1 ? 'playback' : 'playbacks'} ·{' '}
        {formatWatchTime(figures.playedSeconds)} played
        {keptDays > 0 ? ` · reports are kept ${keptDays} days` : ''}
      </p>
    </div>
  );
}

/** The four figures that say how watching goes, each with its grade and how it moved. */
function Scorecard({
  totals,
  previous,
  days,
}: {
  totals: QualityFigures;
  previous: QualityFigures;
  days: number;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {QUALITY_METRICS.map((metric) => {
        const Icon = METRIC_ICONS[metric];
        const value = valueOf(metric, totals);
        const moved = qualityChange(metric, value, valueOf(metric, previous));
        const Arrow =
          moved?.label.startsWith('+') === true
            ? ArrowUpRight
            : moved?.label.startsWith('−') === true
              ? ArrowDownRight
              : Minus;
        const second =
          metric === 'startupMs'
            ? `95 of 100 within ${formatMs(totals.startupP95Ms)}`
            : metric === 'rebufferRatio'
              ? `${formatShare(totals.started > 0 ? totals.stalledSessions / totals.started : 0)} of playbacks stopped to load`
              : metric === 'startFailureRate'
                ? `${formatCount(totals.startFailures)} of ${formatCount(totals.attempts)} playbacks`
                : `${formatCount(totals.playbackFailures)} of ${formatCount(totals.started)} started`;
        return (
          <li key={metric} className="rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <Tooltip content={`${METRIC_LOOKS[metric].about} ${METRIC_LOOKS[metric].goal}.`}>
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                  {METRIC_LOOKS[metric].label}
                </p>
              </Tooltip>
              <GradeBadge grade={gradeOf(metric, totals)} />
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
              {formatMetric(metric, value)}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{second}</p>
            <p className="mt-2 flex items-center gap-1 border-t pt-2 text-xs text-muted-foreground">
              {moved ? (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-0.5 font-medium whitespace-nowrap tabular-nums',
                    moved.direction === 'better' && 'text-success',
                    moved.direction === 'worse' && 'text-destructive',
                  )}
                >
                  <Arrow className="size-3.5" aria-hidden="true" />
                  {moved.label}
                  <span className="sr-only">
                    {moved.direction === 'same' ? '' : `, ${moved.direction}`}
                  </span>
                </span>
              ) : null}
              <span className="truncate">
                {moved ? `vs the ${days} days before` : 'No figures before'}
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** What ended playbacks, by the kind of problem. Choosing one narrows the list of failures. */
function Problems({
  errors,
  attempts,
  chosen,
  onChoose,
}: {
  errors: QualityError[];
  attempts: number;
  chosen: string;
  onChoose: (code: string) => void;
}) {
  const most = Math.max(1, ...errors.map((error) => error.sessions));
  return (
    <Card>
      <CardHeader
        title="What went wrong"
        description="The problems that ended playbacks, by kind. Choose one to see its playbacks below."
      />
      <CardContent>
        {errors.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            No playback was ended by a problem in these days.
          </p>
        ) : (
          <ul className="grid gap-1">
            {errors.map((error) => {
              const look = errorLook(error.code);
              return (
                <li key={error.code}>
                  <button
                    type="button"
                    aria-pressed={chosen === error.code}
                    onClick={() => onChoose(error.code)}
                    className={cn(
                      'grid w-full gap-1.5 rounded-lg border border-transparent px-3 py-2.5 text-left hover:bg-accent/60',
                      chosen === error.code && 'border-border bg-accent',
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium">{look.label}</span>
                      <span className="shrink-0 tabular-nums">
                        {formatCount(error.sessions)}
                        <span className="ml-2 text-muted-foreground">
                          {formatRate(attempts > 0 ? error.sessions / attempts : 0)}
                        </span>
                      </span>
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-(--series-2)"
                        style={{ width: `${(error.sessions / most) * 100}%` }}
                      />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {look.about}{' '}
                      {error.beforeStart > 0
                        ? `${formatCount(error.beforeStart)} of them never started. `
                        : ''}
                      Last {formatRelative(error.lastAt)}.
                    </span>
                    {error.message ? (
                      <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {error.message}
                      </code>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** The titles and channels where the most goes wrong. */
function Troubled({ subjects }: { subjects: QualitySubject[] }) {
  return (
    <Card>
      <CardHeader
        title="Where it goes wrong"
        description="Titles and channels with the largest share of failed playbacks, then the most waiting. Only those played at least five times."
      />
      <CardContent>
        {subjects.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            No title or channel stands out.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Title or channel</Th>
                <Th className="text-right">Playbacks</Th>
                <Th className="text-right">Failed</Th>
                <Th className="text-right">Waiting</Th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((subject) => {
                const failed = subject.startFailures + subject.playbackFailures;
                return (
                  <Tr key={`${subject.kind}:${subject.id}`}>
                    <Td className="max-w-0">
                      <Link
                        to={
                          subject.kind === 'channel'
                            ? '/channels'
                            : titlePath({ id: subject.id, type: subject.type ?? 'MOVIE' })
                        }
                        className="block truncate font-medium hover:underline"
                      >
                        {subject.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {subject.kind === 'channel'
                          ? 'Live channel'
                          : subject.type === 'SERIES'
                            ? 'Series'
                            : 'Movie'}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">{formatCount(subject.attempts)}</Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">
                      {formatCount(failed)}
                      <span className="ml-2 text-muted-foreground">
                        {formatRate(failed / subject.attempts)}
                      </span>
                    </Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">
                      {formatRate(subject.rebufferRatio)}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

type Dimension = 'devices' | 'servers' | 'players';
const DIMENSIONS: Record<Dimension, { label: string; column: string; about: string }> = {
  devices: {
    label: 'Devices',
    column: 'Kind of device',
    about:
      'The same video on different devices: a figure that is poor on one kind points at the device, or its app.',
  },
  servers: {
    label: 'Servers',
    column: 'Server',
    about:
      'Where players were sent for the files. A figure that is poor on one server points at that server, or the way to it.',
  },
  players: {
    label: 'Players',
    column: 'Player and version',
    about:
      'What the player says it is. A figure that got worse with a version points at that release.',
  },
};

/** The four figures side by side for each kind of device, each server, or each player. */
function Breakdowns({
  devices,
  servers,
  players,
}: {
  devices: QualityGroup[];
  servers: QualityGroup[];
  players: QualityGroup[];
}) {
  const [dimension, setDimension] = useState<Dimension>('devices');
  const groups = { devices, servers, players }[dimension];
  const name = (key: string) =>
    dimension === 'devices'
      ? (DEVICE_LABELS[key as PlayDevice] ?? key)
      : dimension === 'servers'
        ? serverLabel(key)
        : key === 'unknown'
          ? 'Not said'
          : key;
  const cell = (metric: QualityMetric, group: QualityGroup): ReactNode => {
    const grade = gradeOf(metric, group);
    return (
      <Td className="text-right tabular-nums">
        <span
          className={cn(
            'inline-flex items-center justify-end gap-1.5',
            grade === 'poor' && 'font-medium text-destructive',
            grade === 'fair' && 'text-warning',
          )}
        >
          {grade === 'poor' ? (
            <AlertTriangle className="size-3.5" aria-label="Poor" />
          ) : grade === 'fair' ? (
            <CircleAlert className="size-3.5" aria-label="Fair" />
          ) : null}
          {formatMetric(metric, valueOf(metric, group))}
        </span>
      </Td>
    );
  };

  return (
    <Card>
      <CardHeader
        title="Compared"
        description={DIMENSIONS[dimension].about}
        actions={
          <div
            role="radiogroup"
            aria-label="Compare by"
            className="flex rounded-lg border bg-muted/40 p-0.5"
          >
            {(Object.keys(DIMENSIONS) as Dimension[]).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={dimension === value}
                onClick={() => setDimension(value)}
                className={cn(
                  'h-7 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                  dimension === value && 'bg-background text-foreground shadow-sm',
                )}
              >
                {DIMENSIONS[value].label}
              </button>
            ))}
          </div>
        }
      />
      <CardContent className="overflow-x-auto">
        <Table className="min-w-[44rem]">
          <thead>
            <tr>
              <Th>{DIMENSIONS[dimension].column}</Th>
              <Th className="text-right">Playbacks</Th>
              {QUALITY_METRICS.map((metric) => (
                <Th key={metric} className="text-right">
                  {METRIC_LOOKS[metric].label}
                </Th>
              ))}
              <Th className="text-right">Bitrate</Th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Tr key={group.key}>
                <Td className="font-medium">{name(group.key)}</Td>
                <Td className="text-right tabular-nums">{formatCount(group.attempts)}</Td>
                {QUALITY_METRICS.map((metric) => (
                  <Fragment key={metric}>{cell(metric, group)}</Fragment>
                ))}
                <Td className="text-right text-muted-foreground tabular-nums">
                  {formatKbps(group.bitrateKbps)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">
          A figure is marked from {MIN_TO_GRADE} playbacks on. Below that it is shown and not
          graded.
        </p>
      </CardContent>
    </Card>
  );
}

/** The shades of one colour, the highest picture the darkest. */
const HEIGHT_SHADES = ['#1e4f8f', '#2a78d6', '#6ea3e6', '#a9c8f0', '#d3e2f7'];

/** In what height of picture the time was played. */
function Picture({
  heights,
  totals,
}: {
  heights: { height: number; sessions: number; playedSeconds: number }[];
  totals: QualityFigures;
}) {
  const shares = heightShares(heights);
  return (
    <Card>
      <CardHeader
        title="Picture"
        description="The height of the picture viewers watched in, by time played. Players lower it when the connection cannot keep up."
      />
      <CardContent className="grid gap-4">
        {shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">No player said in what quality it played.</p>
        ) : (
          <>
            <div
              role="img"
              aria-label={`Time played by height: ${shares.map((entry) => `${entry.label} ${formatShare(entry.share)}`).join(', ')}`}
              className="flex h-3 gap-0.5 overflow-hidden rounded-full"
            >
              {shares.map((entry, index) => (
                <Tooltip key={entry.height} content={`${entry.label}: ${formatRate(entry.share)}`}>
                  <span
                    className="h-full min-w-[3px]"
                    style={{
                      width: `${entry.share * 100}%`,
                      background: HEIGHT_SHADES[Math.min(index, HEIGHT_SHADES.length - 1)],
                    }}
                  />
                </Tooltip>
              ))}
            </div>
            <ul className="grid gap-1.5 text-sm">
              {shares.map((entry, index) => (
                <li key={entry.height} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-[3px]"
                      style={{
                        background: HEIGHT_SHADES[Math.min(index, HEIGHT_SHADES.length - 1)],
                      }}
                    />
                    {entry.label}
                  </span>
                  <span className="tabular-nums">{formatRate(entry.share)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t pt-3 text-sm">
          <dt className="text-muted-foreground">Average bitrate</dt>
          <dd className="text-right tabular-nums">{formatKbps(totals.bitrateKbps)}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

/** What became of the playbacks: every one is in exactly one of these. */
function Outcomes({ totals }: { totals: QualityFigures }) {
  const fine = totals.started - totals.playbackFailures;
  const parts: {
    label: string;
    about: string;
    value: number;
    color: string;
    icon: typeof Timer;
  }[] = [
    {
      label: 'Played',
      about: 'Started, and no problem ended it.',
      value: fine,
      color: 'var(--series-3)',
      icon: PlayCircle,
    },
    {
      label: 'Left before it started',
      about: 'The viewer went away while it was loading. Slow starts make this grow.',
      value: totals.leftBeforeStart,
      color: 'var(--series-rest)',
      icon: Minus,
    },
    {
      label: 'Failed to start',
      about: 'A problem ended it before the first picture.',
      value: totals.startFailures,
      color: 'var(--series-2)',
      icon: XCircle,
    },
    {
      label: 'Broke while playing',
      about: 'A problem ended it after it had started.',
      value: totals.playbackFailures,
      color: 'var(--series-4)',
      icon: Unplug,
    },
  ];
  const total = Math.max(1, totals.attempts);
  return (
    <Card>
      <CardHeader
        title="What became of the playbacks"
        description="Every playback a player reported on is in one of these four."
      />
      <CardContent className="grid gap-4">
        <div
          role="img"
          aria-label={parts
            .map((part) => `${part.label} ${formatRate(part.value / total)}`)
            .join(', ')}
          className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted"
        >
          {parts
            .filter((part) => part.value > 0)
            .map((part) => (
              <Tooltip key={part.label} content={`${part.label}: ${formatCount(part.value)}`}>
                <span
                  className="h-full min-w-[3px]"
                  style={{ width: `${(part.value / total) * 100}%`, background: part.color }}
                />
              </Tooltip>
            ))}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {parts.map((part) => (
            <li key={part.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2.5">
              <span
                aria-hidden="true"
                className="mt-1.5 size-2.5 rounded-[3px]"
                style={{ background: part.color }}
              />
              <span className="min-w-0">
                <span className="block text-sm">{part.label}</span>
                <span className="block text-xs text-muted-foreground">{part.about}</span>
              </span>
              <span className="text-right text-sm tabular-nums">
                {formatCount(part.value)}
                <span className="block text-xs text-muted-foreground">
                  {formatRate(part.value / total)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Failed to start: {formatRate(startFailureRate(totals))} of all playbacks. Broke while
          playing: {formatRate(playbackFailureRate(totals))} of those that started.
        </p>
      </CardContent>
    </Card>
  );
}

/** The playbacks a problem ended, one per line. */
function Failures({ items, loading }: { items: QualityFailure[]; loading: boolean }) {
  if (loading) {
    return <Skeleton className="h-40 rounded-lg" />;
  }
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
        Nothing failed in these days.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[52rem]">
        <thead>
          <tr>
            <Th>When</Th>
            <Th>What</Th>
            <Th>Problem</Th>
            <Th>Device and player</Th>
            <Th>Server</Th>
            <Th className="text-right">Got to</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const look = errorLook(item.code);
            const path =
              item.channelId !== null
                ? '/channels'
                : item.titleId !== null
                  ? titlePath({ id: item.titleId, type: item.titleType ?? 'MOVIE' })
                  : null;
            return (
              <Tr key={item.id}>
                <Td className="whitespace-nowrap text-muted-foreground">
                  <Tooltip content={formatDateTime(item.startedAt)}>
                    <span>{formatRelative(item.startedAt)}</span>
                  </Tooltip>
                </Td>
                <Td className="max-w-56">
                  {path && item.subject ? (
                    <Link to={path} className="block truncate font-medium hover:underline">
                      {item.subject}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Deleted since</span>
                  )}
                </Td>
                <Td className="max-w-72">
                  <span className="block truncate">{look.label}</span>
                  {item.message ? (
                    <Tooltip content={item.message}>
                      <code className="block truncate font-mono text-[11px] text-muted-foreground">
                        {item.message}
                      </code>
                    </Tooltip>
                  ) : null}
                </Td>
                <Td>
                  <span className="block">{DEVICE_LABELS[item.device]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.player
                      ? `${item.player}${item.playerVersion ? ` ${item.playerVersion}` : ''}`
                      : 'Player not said'}
                  </span>
                </Td>
                <Td className="max-w-40 truncate text-muted-foreground">
                  {serverLabel(item.server)}
                </Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  {item.startupMs === null ? (
                    <Badge tone="danger">Never started</Badge>
                  ) : (
                    <>
                      {formatWatchTime(item.atSeconds ?? item.playedSeconds)}
                      <span className="block text-xs text-muted-foreground">
                        started in {formatMs(item.startupMs)}
                      </span>
                    </>
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
