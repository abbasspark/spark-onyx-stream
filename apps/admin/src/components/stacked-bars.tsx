// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/cn';
import { labelEvery, niceCeiling } from '@/lib/edges';
import { formatBytes } from '@/lib/format';

/** The colour of a series, by its fixed place in the order. */
export const colorOf = (slot: number) =>
  slot >= 0 && slot < 7 ? `var(--series-${slot + 1})` : 'var(--series-rest)';

export const PLOT_HEIGHT = 168;

export interface BarSeries {
  id: string;
  name: string;
  /** Position in the colour order. */
  slot: number;
  bytes: number;
}

export interface BarBucket {
  start: number;
  label: string;
  bytes: number;
  parts: number[];
}

interface StackedBarsProps<Bucket extends BarBucket> {
  series: BarSeries[];
  buckets: Bucket[];
  /** The highest bucket. */
  peak: number;
  /** Says in words what the chart shows, for those who cannot see it. */
  label: string;
  /** What the tooltip of a bar holds. */
  details: (bucket: Bucket) => ReactNode;
}

/**
 * Bars over time, each split by series: amounts of bytes per hour or per day.
 * The whole column of a bar answers to the pointer and shows its details.
 */
export function StackedBars<Bucket extends BarBucket>({
  series,
  buckets,
  peak,
  label,
  details,
}: StackedBarsProps<Bucket>) {
  const [hovered, setHovered] = useState<number | null>(null);
  const top = niceCeiling(peak);
  const every = labelEvery(buckets.length, 8);
  const active = hovered === null ? null : (buckets[hovered] ?? null);
  // The tooltip stays inside the plot: it hangs to the left of bars on the right half.
  const onRight = hovered !== null && hovered > buckets.length / 2;

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
            aria-label={`${label} The highest bar is ${formatBytes(peak)}.`}
          >
            {buckets.map((bucket, index) => (
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
                        key={series[part]?.id}
                        style={{
                          flexGrow: bytes,
                          flexBasis: 0,
                          minHeight: 1,
                          background: colorOf(series[part]?.slot ?? 7),
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
                  ? { right: `${((buckets.length - hovered) / buckets.length) * 100}%` }
                  : { left: `${((hovered + 1) / buckets.length) * 100}%` }
              }
            >
              {details(active)}
            </div>
          ) : null}
        </div>

        <div />
        <div className="mt-1.5 flex text-[11px] text-muted-foreground" aria-hidden="true">
          {buckets.map((bucket, index) => (
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

      {series.length > 1 ? (
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          {series.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: colorOf(entry.slot) }}
                aria-hidden="true"
              />
              <span>{entry.name}</span>
              <span className="text-muted-foreground tabular-nums">{formatBytes(entry.bytes)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
