// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Table2 } from 'lucide-react';
import { useState } from 'react';
import { p2pApi } from '@/api/endpoints';
import type { TrafficRange } from '@/api/types';
import { colorOf, PLOT_HEIGHT, StackedBars } from '@/components/stacked-bars';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Skeleton } from '@/components/ui/display';
import { cn } from '@/lib/cn';
import {
  formatRatio,
  SHARING_KINDS,
  type SharingBucket,
  type SharingChart,
  sharingChartOf,
  type SharingKind,
  TRAFFIC_RANGES,
} from '@/lib/edges';
import { formatBytes } from '@/lib/format';

/**
 * How much of what viewers played came from other viewers, over the last day,
 * week or month. The figures are what the players themselves report.
 */
export function SharingHistory() {
  const [range, setRange] = useState<TrafficRange>('24h');
  const [kind, setKind] = useState<SharingKind>('all');
  const [asTable, setAsTable] = useState(false);

  const traffic = useQuery({
    queryKey: ['p2p', 'traffic', range],
    queryFn: ({ signal }) => p2pApi.traffic(range, signal),
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
  const chart = traffic.data ? sharingChartOf(traffic.data, kind) : null;

  return (
    <Card className="mb-4 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="grid gap-0.5">
          <h2 className="text-sm font-medium">Taken off your servers by viewers</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            {chart
              ? chart.ratio === null
                ? 'No player has reported in this time.'
                : `${formatBytes(chart.fromViewers)} came from other viewers, ${formatRatio(chart.ratio)} of what sharing players took in. Your servers sent them the other ${formatBytes(chart.fromServers)}.`
              : 'Loading'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="What" value={kind} options={SHARING_KINDS} onChange={setKind} />
          <Segmented
            label="Time range"
            value={range}
            options={TRAFFIC_RANGES}
            onChange={setRange}
          />
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
        <SharingTable chart={chart} />
      ) : (
        <StackedBars
          series={chart.series}
          buckets={chart.buckets}
          peak={chart.peak}
          label="Bar chart of what sharing players took in, split into what came from other viewers and what came from servers. The table view lists every value."
          details={(bucket) => <BucketDetails chart={chart} bucket={bucket} />}
        />
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Counted by the players of viewers who can share. Viewers on iPhones, on mobile data or with
        sharing switched off are not in these figures, and neither is what they took from your
        servers.
      </p>
    </Card>
  );
}

function Segmented<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border p-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
            value === option.value
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function BucketDetails({ chart, bucket }: { chart: SharingChart; bucket: SharingBucket }) {
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
          ? `${formatRatio(bucket.fromViewers / bucket.bytes)} from other viewers, in ${bucket.reports.toLocaleString()} reports`
          : 'No reports'}
      </p>
    </>
  );
}

/** The same figures as text, for reading exact values and for screen readers. */
function SharingTable({ chart }: { chart: SharingChart }) {
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
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
              From other viewers
            </th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">From servers</th>
            <th className="px-3 py-2 text-right font-medium">Share</th>
            <th className="px-3 py-2 text-right font-medium">Reports</th>
          </tr>
        </thead>
        <tbody className="divide-y tabular-nums">
          {rows.map((bucket) => (
            <tr key={bucket.start}>
              <td className="px-3 py-1.5 whitespace-nowrap">{bucket.title}</td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap">
                {formatBytes(bucket.fromViewers)}
              </td>
              <td className="px-3 py-1.5 text-right whitespace-nowrap">
                {formatBytes(bucket.fromServers)}
              </td>
              <td className="px-3 py-1.5 text-right font-medium">
                {formatRatio(bucket.fromViewers / bucket.bytes)}
              </td>
              <td className="px-3 py-1.5 text-right">{bucket.reports.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
