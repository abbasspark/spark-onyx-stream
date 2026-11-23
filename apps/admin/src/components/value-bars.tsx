// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactNode, useState } from 'react';
import { niceTop } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { labelEvery } from '@/lib/edges';

export interface ValueBar {
  key: string;
  /** Under the bar, where there is room. */
  label: string;
  value: number;
}

interface ValueBarsProps<Bar extends ValueBar> {
  bars: Bar[];
  /** Says in words what the chart shows, for those who cannot see it. */
  label: string;
  /** How a value is written on the scale. */
  format: (value: number) => string;
  /** What the tooltip of a bar holds. */
  details: (bar: Bar) => ReactNode;
  height?: number;
  /** How many labels fit under the bars. */
  labels?: number;
  /** The top of the scale. Left out, a round number above the highest bar. */
  top?: number;
  className?: string;
}

/**
 * One figure over time, or over steps, as bars. The whole column of a bar
 * answers to the pointer and to the keyboard, and shows its details.
 */
export function ValueBars<Bar extends ValueBar>({
  bars,
  label,
  format,
  details,
  height = 180,
  labels = 8,
  top: fixedTop,
  className,
}: ValueBarsProps<Bar>) {
  const [hovered, setHovered] = useState<number | null>(null);
  const peak = Math.max(0, ...bars.map((bar) => bar.value));
  const top = fixedTop ?? niceTop(peak);
  const every = labelEvery(bars.length, labels);
  const active = hovered === null ? null : (bars[hovered] ?? null);
  // The tooltip stays inside the plot: it hangs to the left of bars on the right half.
  const onRight = hovered !== null && hovered >= bars.length / 2;

  return (
    <div className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-3', className)}>
      <div
        className="flex flex-col justify-between text-right text-[11px] text-muted-foreground tabular-nums"
        style={{ height }}
        aria-hidden="true"
      >
        <span className="-translate-y-1/2">{format(top)}</span>
        <span>{format(top / 2)}</span>
        <span className="translate-y-1/2">{format(0)}</span>
      </div>

      <div className="relative" style={{ height }}>
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <div className="border-t border-dashed border-border" />
          <div className="border-t border-dashed border-border" />
          <div className="border-t border-border" />
        </div>
        <div
          className="absolute inset-0 flex items-end"
          role="img"
          aria-label={`${label} The highest is ${format(peak)}.`}
          onMouseLeave={() => setHovered(null)}
        >
          {bars.map((bar, index) => (
            <div
              key={bar.key}
              tabIndex={0}
              className={cn(
                'flex h-full min-w-0 flex-1 flex-col justify-end px-[1px] outline-none focus-visible:bg-accent',
                hovered === index && 'bg-accent/60',
              )}
              onMouseEnter={() => setHovered(index)}
              onFocus={() => setHovered(index)}
              onBlur={() => setHovered(null)}
            >
              <div
                className="rounded-t-[4px] bg-(--series-1) transition-[height] duration-300"
                style={{
                  height: `${top > 0 ? (bar.value / top) * 100 : 0}%`,
                  minHeight: bar.value > 0 ? 2 : 0,
                }}
              />
            </div>
          ))}
        </div>
        {active && hovered !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 w-56 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
            style={
              onRight
                ? { right: `${((bars.length - hovered) / bars.length) * 100}%` }
                : { left: `${((hovered + 1) / bars.length) * 100}%` }
            }
          >
            {details(active)}
          </div>
        ) : null}
      </div>

      <div />
      <div className="mt-1.5 flex text-[11px] text-muted-foreground" aria-hidden="true">
        {bars.map((bar, index) => (
          <div key={bar.key} className="relative h-4 min-w-0 flex-1">
            {index % every === 0 ? (
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
                {bar.label}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
