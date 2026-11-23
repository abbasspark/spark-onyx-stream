// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Clock,
  Eye,
  Film,
  Flag,
  Minus,
  MonitorSmartphone,
  Radio,
  Tv,
  Users,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { apiUrl } from '@/api/client';
import { analyticsApi, type AnalyticsRange } from '@/api/endpoints';
import type {
  AnalyticsTitleRef,
  DeviceFigures,
  TitleRanking,
  TitleType,
  TitleViewFigures,
  ViewDay,
  ViewFigures,
} from '@/api/types';
import { Button } from '@/components/ui/button';
import {
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
import { Dialog, DialogBody, DialogContent } from '@/components/ui/overlay';
import { ValueBars } from '@/components/value-bars';
import {
  bucketDays,
  busiestHours,
  changeOf,
  DEVICE_LABELS,
  formatChartDay,
  formatCount,
  formatHour,
  formatShare,
  formatWatchTime,
  RANGE_PRESETS,
  type RangePreset,
  rangeOfPreset,
} from '@/lib/analytics';
import { useAddressParams } from '@/lib/address-params';
import { titlePath } from '@/lib/catalog';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 10;
const NOW_EVERY_MS = 30_000;

type Metric = 'views' | 'viewers' | 'watchSeconds';
const METRICS: Record<Metric, { label: string; format: (value: number) => string }> = {
  views: { label: 'Views', format: formatCount },
  viewers: { label: 'Viewers', format: formatCount },
  watchSeconds: { label: 'Time watched', format: formatWatchTime },
};

const RANKINGS: Record<TitleRanking, string> = {
  views: 'Most views',
  viewers: 'Most viewers',
  watchSeconds: 'Most time watched',
  completion: 'Watched to the end most often',
};

/** What is watched on the website: how much, by how many, and which titles. */
export function AnalyticsPage() {
  const [params, change] = useAddressParams();
  const preset = (
    RANGE_PRESETS.some((entry) => entry.value === params.get('days')) ? params.get('days') : '28'
  ) as RangePreset;
  const type = (
    ['MOVIE', 'SERIES'].includes(params.get('type') ?? '') ? params.get('type') : ''
  ) as TitleType | '';
  const sort = (
    Object.keys(RANKINGS).includes(params.get('sort') ?? '') ? params.get('sort') : 'views'
  ) as TitleRanking;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const openId = params.get('title');
  const [metric, setMetric] = useState<Metric>('views');

  // The days are those of the admin's own clock, and so is where a day begins.
  const range = useMemo<AnalyticsRange>(
    () => ({
      ...rangeOfPreset(preset, new Date()),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      type: type || undefined,
    }),
    [preset, type],
  );
  const days = RANGE_PRESETS.find((entry) => entry.value === preset)?.days ?? 28;

  const summary = useQuery({
    queryKey: ['analytics', 'summary', range],
    queryFn: ({ signal }) => analyticsApi.summary(range, signal),
    placeholderData: keepPreviousData,
  });
  const titles = useQuery({
    queryKey: ['analytics', 'titles', range, sort, page],
    queryFn: ({ signal }) =>
      analyticsApi.titles({ ...range, sort, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: keepPreviousData,
  });
  const now = useQuery({
    queryKey: ['analytics', 'now'],
    queryFn: ({ signal }) => analyticsApi.now(signal),
    refetchInterval: NOW_EVERY_MS,
  });

  const data = summary.data;
  const buckets = useMemo(
    () =>
      bucketDays(data?.days ?? [], (slice: readonly ViewDay[]) => ({
        views: slice.reduce((sum, day) => sum + day.views, 0),
        // Viewers of several days cannot be added up: the same person may be in each.
        viewers: Math.max(0, ...slice.map((day) => day.viewers)),
        watchSeconds: slice.reduce((sum, day) => sum + day.watchSeconds, 0),
      })),
    [data?.days],
  );
  const weekly = buckets.length > 0 && buckets[0]?.from !== buckets[0]?.to;
  const topViews = titles.data?.items[0]?.views ?? 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="What is watched on your site: how much, by how many, and which titles. A view is a play that lasted at least half a minute."
        actions={
          <>
            <Select
              aria-label="Kind of title"
              className="w-44"
              value={type || 'ALL'}
              onValueChange={(value) =>
                change({ type: value === 'ALL' ? null : value, page: null })
              }
              options={[
                { value: 'ALL', label: 'Movies and series' },
                { value: 'MOVIE', label: 'Movies' },
                { value: 'SERIES', label: 'Series' },
              ]}
            />
            <Select
              aria-label="Days"
              className="w-44"
              value={preset}
              onValueChange={(value) => change({ days: value === '28' ? null : value, page: null })}
              options={RANGE_PRESETS.map((entry) => ({ value: entry.value, label: entry.label }))}
            />
          </>
        }
      />

      <ErrorNote error={summary.error} className="mb-4" />
      {data && !data.recording ? (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          This installation records nothing about what is watched (
          <code>VIEWING_STATISTICS=off</code>), so the figures stay as they are. Set it to{' '}
          <code>on</code> to count again.
        </p>
      ) : null}

      <WatchingNow watching={now.data?.watching ?? null} titles={now.data?.titles ?? []} />

      {summary.isPending ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : null}

      {data ? (
        <div className="grid gap-4">
          <Tiles totals={data.totals} previous={data.previous} days={days} />

          <Card>
            <CardHeader
              title={`${METRICS[metric].label} per ${weekly ? 'week' : 'day'}`}
              description={
                metric === 'viewers'
                  ? weekly
                    ? 'The busiest day of each week. Viewers of several days cannot be added up.'
                    : 'Different viewers per day. A visitor who is not signed in counts once per day.'
                  : metric === 'watchSeconds'
                    ? 'Everything that was played, also plays too short to count as a view.'
                    : 'Plays that lasted at least half a minute.'
              }
              actions={
                <div
                  role="radiogroup"
                  aria-label="Figure"
                  className="flex rounded-lg border bg-muted/40 p-0.5"
                >
                  {(Object.keys(METRICS) as Metric[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={metric === value}
                      onClick={() => setMetric(value)}
                      className={cn(
                        'h-7 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                        metric === value && 'bg-background text-foreground shadow-sm',
                      )}
                    >
                      {METRICS[value].label}
                    </button>
                  ))}
                </div>
              }
            />
            <CardContent>
              {data.totals.watchSeconds === 0 && data.totals.views === 0 ? (
                <EmptyState icon={BarChart3} title="Nothing was watched in these days">
                  Figures appear here as soon as someone plays a video on the website. Plays in this
                  panel are not counted.
                </EmptyState>
              ) : (
                <ValueBars
                  bars={buckets.map((bucket) => ({
                    key: bucket.from,
                    label: bucket.label,
                    value: bucket.value[metric],
                    from: bucket.from,
                    to: bucket.to,
                    figures: bucket.value,
                  }))}
                  label={`${METRICS[metric].label} per ${weekly ? 'week' : 'day'}.`}
                  format={METRICS[metric].format}
                  details={(bar) => (
                    <div className="grid gap-1.5">
                      <p className="font-medium">
                        {bar.from === bar.to
                          ? formatChartDay(bar.from, true)
                          : `${formatChartDay(bar.from)} to ${formatChartDay(bar.to)}`}
                      </p>
                      <Line
                        label="Views"
                        value={formatCount(bar.figures.views)}
                        strong={metric === 'views'}
                      />
                      <Line
                        label={bar.from === bar.to ? 'Viewers' : 'Viewers, busiest day'}
                        value={formatCount(bar.figures.viewers)}
                        strong={metric === 'viewers'}
                      />
                      <Line
                        label="Time watched"
                        value={formatWatchTime(bar.figures.watchSeconds)}
                        strong={metric === 'watchSeconds'}
                      />
                    </div>
                  )}
                />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="overflow-hidden">
              <CardHeader
                title="Titles"
                description="What was watched in these days. Open a title for its days, its episodes and how far viewers get."
                actions={
                  <Select
                    aria-label="Order of the titles"
                    className="w-60"
                    value={sort}
                    onValueChange={(value) =>
                      change({ sort: value === 'views' ? null : value, page: null })
                    }
                    options={(Object.keys(RANKINGS) as TitleRanking[]).map((value) => ({
                      value,
                      label: RANKINGS[value],
                    }))}
                  />
                }
              />
              <ErrorNote error={titles.error} className="mx-6 mb-4" />
              {titles.data && titles.data.items.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  No title had a view in these days.
                </p>
              ) : null}
              {titles.data && titles.data.items.length > 0 ? (
                <Table>
                  <thead>
                    <tr>
                      <Th className="w-8">#</Th>
                      <Th>Title</Th>
                      <Th className="text-right">Views</Th>
                      <Th className="hidden text-right sm:table-cell">Viewers</Th>
                      <Th className="hidden text-right md:table-cell">Time watched</Th>
                      <Th className="hidden text-right lg:table-cell">To the end</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {titles.data.items.map((item, index) => (
                      <TitleRow
                        key={item.title?.id ?? 'deleted'}
                        item={item}
                        place={(page - 1) * PAGE_SIZE + index + 1}
                        share={topViews > 0 && sort === 'views' ? item.views / topViews : null}
                        onOpen={item.title ? () => change({ title: item.title?.id ?? null }) : null}
                      />
                    ))}
                  </tbody>
                </Table>
              ) : null}
              {titles.data && titles.data.total > PAGE_SIZE ? (
                <div className="border-t px-4 py-2">
                  <Pagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={titles.data.total}
                    onChange={(next) => change({ page: next === 1 ? null : String(next) })}
                  />
                </div>
              ) : null}
            </Card>

            <div className="grid content-start gap-4">
              <Card>
                <CardHeader title="Devices" description="What views were watched on." />
                <CardContent>
                  <Devices devices={data.devices} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader
                  title="Who watched"
                  description="Views by kind of viewer and of title."
                />
                <CardContent className="grid gap-4">
                  <Split
                    parts={[
                      { label: 'Signed in', value: data.audience.signedIn },
                      { label: 'Visitors', value: data.audience.visitors },
                    ]}
                  />
                  <Split
                    parts={[
                      { label: 'Paid titles', value: data.audience.paid },
                      { label: 'Free titles', value: data.audience.free },
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader
                  title="Time of day"
                  description={busiestHours(data.hours) ?? 'When views begin, by your clock.'}
                />
                <CardContent>
                  <ValueBars
                    height={96}
                    labels={6}
                    bars={data.hours.map((views, hour) => ({
                      key: String(hour),
                      label: formatHour(hour),
                      value: views,
                    }))}
                    label="Views by the hour of the day they began in."
                    format={formatCount}
                    details={(bar) => (
                      <Line
                        label={`${formatHour(Number(bar.key))} to ${formatHour((Number(bar.key) + 1) % 24)}`}
                        value={`${formatCount(bar.value)} views`}
                        strong
                      />
                    )}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      ) : null}

      {openId ? (
        <TitleSheet
          id={openId}
          range={{ from: range.from, to: range.to, timezone: range.timezone }}
          days={days}
          onClose={() => change({ title: null })}
        />
      ) : null}
    </>
  );
}

/** A label and its value on one line of a tooltip. */
function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', strong && 'font-semibold')}>{value}</span>
    </p>
  );
}

function WatchingNow({
  watching,
  titles,
}: {
  watching: number | null;
  titles: { title: AnalyticsTitleRef; watching: number }[];
}) {
  if (watching === null) {
    return null;
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs">
      <span className="flex items-center gap-2 font-medium">
        <span className="relative flex size-2.5">
          {watching > 0 ? (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
          ) : null}
          <span
            className={cn(
              'relative inline-flex size-2.5 rounded-full',
              watching > 0 ? 'bg-success' : 'bg-muted-foreground/40',
            )}
          />
        </span>
        <Radio className="size-4 text-muted-foreground" aria-hidden="true" />
        {watching === 0
          ? 'Nobody is watching right now'
          : `${formatCount(watching)} watching right now`}
      </span>
      {titles.slice(0, 4).map((entry) => (
        <span key={entry.title.id} className="text-muted-foreground">
          {entry.title.name}
          <span className="ml-1.5 tabular-nums text-foreground">{entry.watching}</span>
        </span>
      ))}
      {titles.length > 4 ? (
        <span className="text-muted-foreground">and {titles.length - 4} more titles</span>
      ) : null}
    </div>
  );
}

/** The headline figures, each with how it changed against the days before. */
function Tiles({
  totals,
  previous,
  days,
  narrow,
}: {
  totals: ViewFigures;
  previous: ViewFigures;
  days: number;
  /** In a panel at the side: fewer tiles beside each other. */
  narrow?: boolean;
}) {
  const tiles: {
    label: string;
    icon: typeof Eye;
    value: string;
    current: number;
    before: number;
    about: string;
  }[] = [
    {
      label: 'Views',
      icon: Eye,
      value: formatCount(totals.views),
      current: totals.views,
      before: previous.views,
      about: 'Plays that lasted at least half a minute',
    },
    {
      label: 'Viewers',
      icon: Users,
      value: formatCount(totals.viewers),
      current: totals.viewers,
      before: previous.viewers,
      about: 'Signed-in viewers count once. A visitor counts once per day',
    },
    {
      label: 'Time watched',
      icon: Clock,
      value: formatWatchTime(totals.watchSeconds),
      current: totals.watchSeconds,
      before: previous.watchSeconds,
      about: 'Everything that was played',
    },
    {
      label: 'Per view',
      icon: MonitorSmartphone,
      value: formatWatchTime(totals.averageSeconds),
      current: totals.averageSeconds,
      before: previous.averageSeconds,
      about: 'Time watched in an average view',
    },
    {
      label: 'Watched to the end',
      icon: Flag,
      value: totals.views > 0 ? formatShare(totals.completionRate) : '–',
      current: Math.round(totals.completionRate * 100),
      before: Math.round(previous.completionRate * 100),
      about: 'Views that played at least 85 % of the video',
    },
  ];
  return (
    <ul
      className={cn('grid grid-cols-2 gap-4', narrow ? 'gap-3 sm:grid-cols-3' : 'lg:grid-cols-5')}
    >
      {tiles.map((tile) => {
        const change = changeOf(tile.current, tile.before);
        const Arrow =
          change?.direction === 'up'
            ? ArrowUpRight
            : change?.direction === 'down'
              ? ArrowDownRight
              : Minus;
        return (
          <li
            key={tile.label}
            className="rounded-xl border bg-card p-4 shadow-xs"
            title={tile.about}
          >
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <tile.icon className="size-4" aria-hidden="true" />
              {tile.label}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{tile.value}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              {change ? (
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-0.5 font-medium whitespace-nowrap tabular-nums',
                    change.direction === 'up' && 'text-success',
                    change.direction === 'down' && 'text-destructive',
                  )}
                >
                  <Arrow className="size-3.5" aria-hidden="true" />
                  {change.label}
                </span>
              ) : null}
              <span className="truncate">
                {change ? `vs the ${days} days before` : 'No figures before'}
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function TitleRow({
  item,
  place,
  share,
  onOpen,
}: {
  item: TitleViewFigures;
  place: number;
  /** How its views compare with the first of the list, for a bar. Null: no bar. */
  share: number | null;
  onOpen: (() => void) | null;
}) {
  const Icon = item.title?.type === 'SERIES' ? Tv : Film;
  return (
    <Tr className={onOpen ? 'cursor-pointer' : undefined} onClick={onOpen ?? undefined}>
      <Td className="text-muted-foreground tabular-nums">{place}</Td>
      <Td>
        <div className="flex items-center gap-3">
          <span className="flex aspect-[2/3] w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground">
            {item.title?.poster ? (
              <img
                src={apiUrl(item.title.poster.url)}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <Icon className="size-4" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            {item.title && onOpen ? (
              <button
                type="button"
                className="block max-w-full truncate text-left font-medium hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen();
                }}
              >
                {item.title.name}
              </button>
            ) : (
              <span className="text-muted-foreground italic">Titles deleted since</span>
            )}
            {share !== null ? (
              <div className="mt-1.5 h-1 max-w-56 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-(--series-1)"
                  style={{ width: `${Math.max(2, share * 100)}%` }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </Td>
      <Td className="text-right font-medium tabular-nums">{formatCount(item.views)}</Td>
      <Td className="hidden text-right tabular-nums sm:table-cell">{formatCount(item.viewers)}</Td>
      <Td className="hidden text-right tabular-nums md:table-cell">
        {formatWatchTime(item.watchSeconds)}
      </Td>
      <Td className="hidden text-right tabular-nums lg:table-cell">
        {formatShare(item.completionRate)}
      </Td>
    </Tr>
  );
}

/** Shares of a whole as labelled bars, the largest first. */
function Devices({ devices }: { devices: DeviceFigures[] }) {
  const total = devices.reduce((sum, entry) => sum + entry.views, 0);
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No views in these days.</p>;
  }
  return (
    <ul className="grid gap-3">
      {devices.map((entry) => (
        <li key={entry.device} className="grid gap-1 text-sm">
          <div className="flex justify-between gap-3">
            <span>{DEVICE_LABELS[entry.device]}</span>
            <span className="tabular-nums">
              {formatShare(entry.views / total)}
              <span className="ml-2 text-muted-foreground">{formatCount(entry.views)}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-(--series-1)"
              style={{ width: `${(entry.views / total) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Two parts of a whole, side by side on one bar, each named with its share. */
function Split({
  parts,
}: {
  parts: [{ label: string; value: number }, { label: string; value: number }];
}) {
  const total = parts[0].value + parts[1].value;
  const first = total > 0 ? parts[0].value / total : 0;
  return (
    <div className="grid gap-1.5 text-sm">
      <div className="flex justify-between gap-3">
        {parts.map((part, index) => (
          <span key={part.label} className={index === 1 ? 'text-right' : undefined}>
            {part.label}{' '}
            <span className="text-muted-foreground tabular-nums">
              {total > 0 ? formatShare(part.value / total) : '–'}
            </span>
          </span>
        ))}
      </div>
      <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-muted">
        {total > 0 ? (
          <>
            <div className="h-full bg-(--series-1)" style={{ width: `${first * 100}%` }} />
            <div className="h-full flex-1 bg-(--series-2)" />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** One title: its figures, its days, its episodes, and how far viewers get. */
function TitleSheet({
  id,
  range,
  days,
  onClose,
}: {
  id: string;
  range: Omit<AnalyticsRange, 'type'>;
  days: number;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ['analytics', 'title', id, range],
    queryFn: ({ signal }) => analyticsApi.title(id, range, signal),
  });
  const data = detail.data;
  const buckets = useMemo(
    () =>
      bucketDays(data?.days ?? [], (slice: readonly ViewDay[]) =>
        slice.reduce((sum, day) => sum + day.views, 0),
      ),
    [data?.days],
  );
  const section = (title: string, about: string, children: ReactNode) => (
    <section className="grid content-start gap-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{about}</p>
      </div>
      {children}
    </section>
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        variant="sheet"
        size="lg"
        title={data?.title.name ?? 'Title'}
        description={`How it was watched in the last ${days} days.`}
      >
        <DialogBody>
          <ErrorNote error={detail.error} />
          {detail.isPending ? <Skeleton className="h-96 rounded-xl" /> : null}
          {data ? (
            <>
              <div className="flex justify-end">
                <Button asChild size="sm">
                  <Link to={titlePath(data.title)}>Open the title</Link>
                </Button>
              </div>
              <Tiles totals={data.totals} previous={data.previous} days={days} narrow />

              {section(
                'Views over time',
                buckets[0] && buckets[0].from !== buckets[0].to ? 'Per week.' : 'Per day.',
                <ValueBars
                  height={140}
                  bars={buckets.map((bucket) => ({
                    key: bucket.from,
                    label: bucket.label,
                    value: bucket.value,
                    from: bucket.from,
                    to: bucket.to,
                  }))}
                  label="Views over time."
                  format={formatCount}
                  details={(bar) => (
                    <Line
                      label={
                        bar.from === bar.to
                          ? formatChartDay(bar.from, true)
                          : `${formatChartDay(bar.from)} to ${formatChartDay(bar.to)}`
                      }
                      value={`${formatCount(bar.value)} views`}
                      strong
                    />
                  )}
                />,
              )}

              {data.totals.views > 0
                ? section(
                    'How far viewers get',
                    data.title.type === 'SERIES'
                      ? 'Of all views of its episodes, the share that reached each part of the video.'
                      : 'Of all views, the share that reached each part of the video. A drop marks where people leave.',
                    <ValueBars
                      height={120}
                      labels={10}
                      top={1}
                      bars={data.reach.map((share, index) => ({
                        key: String(index),
                        label: `${(index + 1) * 10} %`,
                        value: share,
                      }))}
                      label="The share of views that reached each tenth of the video."
                      format={formatShare}
                      details={(bar) => (
                        <Line
                          label={`Reached ${bar.label} of the video`}
                          value={formatShare(bar.value)}
                          strong
                        />
                      )}
                    />,
                  )
                : null}

              {data.episodes.length > 0
                ? section(
                    'Episodes',
                    'The episodes that were watched in these days.',
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <thead>
                          <tr>
                            <Th>Episode</Th>
                            <Th className="text-right">Views</Th>
                            <Th className="text-right">Viewers</Th>
                            <Th className="hidden text-right sm:table-cell">Time watched</Th>
                            <Th className="text-right">To the end</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.episodes.map((episode) => (
                            <Tr key={episode.id}>
                              <Td>
                                <span className="font-mono text-xs text-muted-foreground">
                                  S{String(episode.seasonNumber).padStart(2, '0')}E
                                  {String(episode.number).padStart(2, '0')}
                                </span>{' '}
                                {episode.name ?? ''}
                              </Td>
                              <Td className="text-right font-medium tabular-nums">
                                {formatCount(episode.views)}
                              </Td>
                              <Td className="text-right tabular-nums">
                                {formatCount(episode.viewers)}
                              </Td>
                              <Td className="hidden text-right tabular-nums sm:table-cell">
                                {formatWatchTime(episode.watchSeconds)}
                              </Td>
                              <Td className="text-right tabular-nums">
                                {formatShare(episode.completionRate)}
                              </Td>
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>,
                  )
                : null}

              <div className="grid gap-6 sm:grid-cols-2">
                {section(
                  'Devices',
                  'What its views were watched on.',
                  <Devices devices={data.devices} />,
                )}
                {section(
                  'Around it',
                  'Plays of what belongs to the title, however short.',
                  <dl className="grid content-start gap-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Trailer</dt>
                      <dd className="tabular-nums">{formatCount(data.trailerPlays)} plays</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Extras</dt>
                      <dd className="tabular-nums">{formatCount(data.extraPlays)} plays</dd>
                    </div>
                  </dl>,
                )}
              </div>
            </>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
