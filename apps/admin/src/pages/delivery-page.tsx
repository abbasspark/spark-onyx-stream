// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CircleAlert, Table2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { edgesApi } from '@/api/endpoints';
import type { TrafficRange } from '@/api/types';
import { colorOf, PLOT_HEIGHT, StackedBars } from '@/components/stacked-bars';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, PageHeader, Skeleton } from '@/components/ui/display';
import { cn } from '@/lib/cn';
import {
  formatRatio,
  type OverviewBucket,
  type OverviewChart,
  overviewChartOf,
  TRAFFIC_RANGES,
} from '@/lib/edges';
import { formatBytes } from '@/lib/format';

/** Who delivers your video: the main server, the edges, or the viewers among themselves. */
export function DeliveryPage() {
  const [range, setRange] = useState<TrafficRange>('24h');
  const [asTable, setAsTable] = useState(false);

  const overview = useQuery({
    queryKey: ['delivery', 'overview', range],
    queryFn: ({ signal }) => edgesApi.overview(range, signal),
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
  const chart = overview.data ? overviewChartOf(overview.data) : null;
  const counted = overview.data?.gatewayCounted ?? true;
  const rangeLabel = TRAFFIC_RANGES.find((option) => option.value === range)?.label ?? '';

  return (
    <>
      <PageHeader
        title="Delivery"
        description="Where the video your viewers watch comes from. Everything an edge serves from its copies, and everything viewers pass to each other, is traffic your main server does not carry."
        actions={
          <div className="flex gap-1 rounded-lg border p-1" role="group" aria-label="Time range">
            {TRAFFIC_RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                  range === option.value
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />
      <ErrorNote error={overview.error} className="mb-4" />

      {!counted ? (
        <Card className="mb-4 flex items-start gap-3 border-warning/40 p-4">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="grid gap-1 text-sm">
            <p className="font-medium">
              What the main server sends to viewers itself is not counted
            </p>
            <p className="text-muted-foreground">
              The gateway counts it, and the API reads the count from there. Set{' '}
              <span className="font-mono text-xs text-foreground">GATEWAY_INTERNAL_URL</span> of the
              API to the address of the gateway, such as{' '}
              <span className="font-mono text-xs text-foreground">http://gateway:8080</span>. Until
              then the main server&apos;s share below is only what edges fetched from it, and the
              share taken off it is too high.
            </p>
          </div>
        </Card>
      ) : null}

      {!chart ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <Card className="mb-4 grid grid-cols-[minmax(0,1fr)] divide-y lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)] lg:divide-x lg:divide-y-0">
            <div className="grid content-start gap-1 p-5">
              <p className="text-xs text-muted-foreground">Taken off the main server</p>
              <p className="text-4xl font-semibold tracking-tight tabular-nums">
                {formatRatio(chart.offload)}
              </p>
              <p className="text-sm text-muted-foreground">
                {chart.offload === null
                  ? `Nothing was delivered in the last ${rangeLabel}.`
                  : `of the ${formatBytes(chart.bytes)} your viewers got in the last ${rangeLabel}.`}
              </p>
            </div>
            <dl className="grid grid-cols-[minmax(0,1fr)] divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Source
                slot={-1}
                name="Main server"
                bytes={chart.fromMain}
                total={chart.bytes}
                note="Sent to viewers itself, and to edges that did not have the file yet."
              />
              <Source
                slot={0}
                name="Edges"
                bytes={chart.fromEdges}
                total={chart.bytes}
                note={
                  <>
                    Served from the copies they keep.{' '}
                    <Link to="/edges" className="underline underline-offset-4">
                      Edge servers
                    </Link>
                  </>
                }
              />
              <Source
                slot={1}
                name="Other viewers"
                bytes={chart.fromViewers}
                total={chart.bytes}
                note={
                  <>
                    Passed between players, as they report it.{' '}
                    <Link to="/p2p" className="underline underline-offset-4">
                      P2P
                    </Link>
                  </>
                }
              />
            </dl>
          </Card>

          <Card className="p-4">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="grid gap-0.5">
                <h2 className="text-sm font-medium">Who delivered</h2>
                <p className="text-xs text-muted-foreground">
                  {range === '24h' ? 'Hour by hour' : 'Day by day'}, in what reached viewers.
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-pressed={asTable}
                aria-label={asTable ? 'Show as a chart' : 'Show as a table'}
                onClick={() => setAsTable(!asTable)}
              >
                {asTable ? <BarChart3 /> : <Table2 />}
              </Button>
            </div>
            {asTable ? (
              <OverviewTable chart={chart} />
            ) : (
              <div style={{ minHeight: PLOT_HEIGHT }}>
                <StackedBars
                  series={chart.series}
                  buckets={chart.buckets}
                  peak={chart.peak}
                  label="Bar chart of what reached viewers, split into what the main server sent, what edges served from their copies and what viewers passed to each other. The table view lists every value."
                  details={(bucket) => <BucketDetails chart={chart} bucket={bucket} />}
                />
              </div>
            )}
          </Card>

          <p className="mt-4 max-w-4xl text-xs text-muted-foreground">
            The main server and the edges count what they send. What viewers pass to each other is
            counted by their players and cannot be checked, so treat that part as a good estimate.
            Pictures, pages and the API are not in these figures: they are small beside video.
          </p>
        </>
      )}
    </>
  );
}

function Source({
  slot,
  name,
  bytes,
  total,
  note,
}: {
  slot: number;
  name: string;
  bytes: number;
  total: number;
  note: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1 p-5">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className="size-2.5 shrink-0 rounded-[3px]"
          style={{ background: colorOf(slot) }}
          aria-hidden="true"
        />
        {name}
      </dt>
      <dd className="grid gap-1">
        <span className="text-xl font-semibold tabular-nums">{formatBytes(bytes)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {total > 0 ? formatRatio(bytes / total) : '–'} of everything
        </span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </dd>
    </div>
  );
}

function BucketDetails({ chart, bucket }: { chart: OverviewChart; bucket: OverviewBucket }) {
  return (
    <>
      <p className="mb-2 font-medium">{bucket.title}</p>
      <ul className="mb-2 grid gap-1">
        {chart.series.map((series, index) => (
          <li key={series.id} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: colorOf(series.slot) }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{series.name}</span>
            <span className="tabular-nums">{formatBytes(bucket.parts[index] ?? 0)}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        {bucket.bytes > 0
          ? `${formatRatio((bucket.fromEdges + bucket.fromViewers) / bucket.bytes)} taken off the main server`
          : 'Nothing was delivered'}
      </p>
    </>
  );
}

/** The same figures as text, for reading exact values and for screen readers. */
function OverviewTable({ chart }: { chart: OverviewChart }) {
  const rows = [...chart.buckets].reverse().filter((bucket) => bucket.bytes > 0);
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing to list.</p>;
  }
  return (
    <div className="max-h-96 overflow-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2 font-medium">Time</th>
            {chart.series.map((series) => (
              <th key={series.id} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                {series.name}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Taken off</th>
          </tr>
        </thead>
        <tbody className="divide-y tabular-nums">
          {rows.map((bucket) => (
            <tr key={bucket.start}>
              <td className="px-3 py-1.5 whitespace-nowrap">{bucket.title}</td>
              {bucket.parts.map((bytes, index) => (
                <td
                  key={chart.series[index]?.id}
                  className="px-3 py-1.5 text-right whitespace-nowrap"
                >
                  {bytes > 0 ? formatBytes(bytes) : '–'}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right font-medium">
                {formatRatio((bucket.fromEdges + bucket.fromViewers) / bucket.bytes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
