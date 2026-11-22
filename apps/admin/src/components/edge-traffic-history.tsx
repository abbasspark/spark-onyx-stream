// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Table2 } from 'lucide-react';
import { useState } from 'react';
import { edgesApi } from '@/api/endpoints';
import type { TrafficRange } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Skeleton } from '@/components/ui/display';
import { cn } from '@/lib/cn';
import {
  formatRatio,
  labelEvery,
  niceCeiling,
  OTHER_SERIES,
  TRAFFIC_RANGES,
  type TrafficBucket,
  type TrafficChart,
  trafficChartOf,
} from '@/lib/edges';
import { formatBytes } from '@/lib/format';

/** The colour of a series, by its fixed place in the order. */
const colorOf = (slot: number) => (slot < 7 ? `var(--series-${slot + 1})` : 'var(--series-rest)');

const PLOT_HEIGHT = 168;

/** What the edges delivered over the last day, week or month, edge by edge. */
export function EdgeTrafficHistory() {
  const [range, setRange] = useState<TrafficRange>('24h');
  const [asTable, setAsTable] = useState(false);

  const traffic = useQuery({
    queryKey: ['edges', 'traffic', range],
    queryFn: ({ signal }) => edgesApi.traffic(range, signal),
    // The running hour grows with every report of an edge.
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
  const chart = traffic.data ? trafficChartOf(traffic.data) : null;

  return (
    <Card className="mb-4 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="grid gap-0.5">
          <h2 className="text-sm font-medium">Delivered by the edges</h2>
          <p className="text-xs text-muted-foreground">
            {chart
              ? chart.bytes > 0
                ? `${formatBytes(chart.bytes)} in ${chart.requests.toLocaleString()} requests, ${formatRatio(chart.hitRatio)} of them from copies`
                : 'Nothing was delivered in this time.'
              : 'Loading'}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      <ErrorNote error={traffic.error} className="mb-3" />
      {!chart ? (
        <Skeleton style={{ height: PLOT_HEIGHT + 40 }} />
      ) : asTable ? (
        <TrafficTable chart={chart} />
      ) : (
        <TrafficBars chart={chart} />
      )}
    </Card>
  );
}

function TrafficBars({ chart }: { chart: TrafficChart }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const top = niceCeiling(chart.peak);
  const every = labelEvery(chart.buckets.length, 8);
  const active = hovered === null ? null : (chart.buckets[hovered] ?? null);
  // The tooltip stays inside the plot: it hangs to the left of bars on the right half.
  const onRight = hovered !== null && hovered > chart.buckets.length / 2;

  return (
    <div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
        {/* The scale: three quiet lines with their values. */}
        <div
          className="flex flex-col justify-between text-right text-[11px] text-muted-foreground tabular-nums"
          style={{ height: PLOT_HEIGHT }}
          aria-hidden="true"
        >
          <span className="-translate-y-1/2">{formatBytes(top)}</span>
          <span>{formatBytes(top / 2)}</span>
          <span className="translate-y-1/2">0</span>
        </div>

        <div className="relative" style={{ height: PLOT_HEIGHT }}>
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            <div className="border-t border-dashed border-border" />
            <div className="border-t border-dashed border-border" />
            <div className="border-t border-border" />
          </div>

          <div
            className="absolute inset-0 flex items-end"
            onMouseLeave={() => setHovered(null)}
            role="img"
            aria-label={`Bar chart of what the edges delivered. The highest bar is ${formatBytes(chart.peak)}. The table view lists every value.`}
          >
            {chart.buckets.map((bucket, index) => (
              // The whole column answers to the pointer, not only the bar in it.
              <div
                key={bucket.start}
                className={cn(
                  'flex h-full min-w-0 flex-1 flex-col justify-end px-[1px]',
                  hovered === index && 'bg-accent/60',
                )}
                onMouseEnter={() => setHovered(index)}
              >
                <div
                  className="flex flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
                  style={{ height: `${(bucket.bytes / top) * 100}%` }}
                >
                  {bucket.parts.map((bytes, part) =>
                    bytes > 0 ? (
                      <div
                        key={chart.series[part]?.id}
                        style={{
                          flexGrow: bytes,
                          flexBasis: 0,
                          minHeight: 1,
                          background: colorOf(chart.series[part]?.slot ?? 7),
                        }}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>

          {active && hovered !== null ? (
            <div
              className={cn(
                'pointer-events-none absolute top-0 z-10 w-60 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg',
              )}
              style={
                onRight
                  ? { right: `${((chart.buckets.length - hovered) / chart.buckets.length) * 100}%` }
                  : { left: `${((hovered + 1) / chart.buckets.length) * 100}%` }
              }
            >
              <BucketDetails chart={chart} bucket={active} />
            </div>
          ) : null}
        </div>

        <div />
        <div className="mt-1.5 flex text-[11px] text-muted-foreground" aria-hidden="true">
          {chart.buckets.map((bucket, index) => (
            <div key={bucket.start} className="relative h-4 min-w-0 flex-1">
              {index % every === 0 ? (
                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                  {bucket.label}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {chart.series.length > 1 ? (
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          {chart.series.map((series) => (
            <li key={series.id} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: colorOf(series.slot) }}
                aria-hidden="true"
              />
              <span>{series.id === OTHER_SERIES ? `${series.name} edges` : series.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatBytes(series.bytes)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BucketDetails({ chart, bucket }: { chart: TrafficChart; bucket: TrafficBucket }) {
  const answered = bucket.hits + bucket.misses;
  return (
    <>
      <p className="mb-2 font-medium">{bucket.title}</p>
      <p className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold tabular-nums">{formatBytes(bucket.bytes)}</span>
        <span className="text-muted-foreground tabular-nums">
          {bucket.requests.toLocaleString()} requests
        </span>
      </p>
      {chart.series.length > 1 ? (
        <ul className="mb-2 grid gap-1">
          {chart.series.map((series, index) =>
            (bucket.parts[index] ?? 0) > 0 ? (
              <li key={series.id} className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: colorOf(series.slot) }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{series.name}</span>
                <span className="tabular-nums">{formatBytes(bucket.parts[index] ?? 0)}</span>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
      <p className="text-muted-foreground">
        {answered > 0
          ? `${formatRatio(bucket.hits / answered)} served from copies`
          : 'Nothing was asked for'}
      </p>
    </>
  );
}

/** The same figures as text, for reading exact values and for screen readers. */
function TrafficTable({ chart }: { chart: TrafficChart }) {
  // Newest first, and only the times something happened in.
  const rows = [...chart.buckets].reverse().filter((bucket) => bucket.bytes > 0);
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing to list.</p>;
  }
  return (
    <div className="max-h-80 overflow-auto rounded-lg border">
      <table className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2 font-medium">Time</th>
            {chart.series.map((series) => (
              <th key={series.id} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                <span
                  className="mr-1.5 inline-block size-2 rounded-[2px]"
                  style={{ background: colorOf(series.slot) }}
                  aria-hidden="true"
                />
                {series.name}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Together</th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">From copies</th>
          </tr>
        </thead>
        <tbody className="divide-y tabular-nums">
          {rows.map((bucket) => (
            <tr key={bucket.start}>
              <td className="px-3 py-1.5 whitespace-nowrap">{bucket.title}</td>
              {chart.series.map((series, index) => (
                <td key={series.id} className="px-3 py-1.5 text-right whitespace-nowrap">
                  {(bucket.parts[index] ?? 0) > 0 ? formatBytes(bucket.parts[index] ?? 0) : '–'}
                </td>
              ))}
              <td className="px-3 py-1.5 text-right font-medium whitespace-nowrap">
                {formatBytes(bucket.bytes)}
              </td>
              <td className="px-3 py-1.5 text-right">
                {bucket.hits + bucket.misses > 0
                  ? formatRatio(bucket.hits / (bucket.hits + bucket.misses))
                  : '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
