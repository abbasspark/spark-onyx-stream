// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Table2 } from 'lucide-react';
import { useState } from 'react';
import { edgesApi } from '@/api/endpoints';
import type { TrafficRange } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Skeleton } from '@/components/ui/display';
import { colorOf, PLOT_HEIGHT, StackedBars } from '@/components/stacked-bars';
import { cn } from '@/lib/cn';
import {
  formatRatio,
  OTHER_SERIES,
  TRAFFIC_RANGES,
  type TrafficBucket,
  type TrafficChart,
  trafficChartOf,
} from '@/lib/edges';
import { formatBytes } from '@/lib/format';

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
                ? `${formatBytes(chart.bytes)} in ${chart.requests.toLocaleString()} requests, ${formatRatio(chart.hitRatio)} of them from copies.${
                    chart.offload === null
                      ? ''
                      : ` The main server sent ${formatBytes(chart.fetched)} of that: the edges took ${formatRatio(chart.offload)} off it.`
                  }`
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
        <StackedBars
          series={chart.series.map((series) =>
            series.id === OTHER_SERIES ? { ...series, name: `${series.name} edges` } : series,
          )}
          buckets={chart.buckets}
          peak={chart.peak}
          label="Bar chart of what the edges delivered. The table view lists every value."
          details={(bucket) => <BucketDetails chart={chart} bucket={bucket} />}
        />
      )}
    </Card>
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
        {bucket.fetched > 0 ? `, ${formatBytes(bucket.fetched)} fetched from the main server` : ''}
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
