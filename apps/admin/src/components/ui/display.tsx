// SPDX-License-Identifier: AGPL-3.0-only
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { humanize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from './button';

// --- Card ----------------------------------------------------------------------

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-xl border bg-card text-card-foreground shadow-xs', className)}
      {...props}
    />
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or other controls on the right. */
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, actions, className }: CardHeaderProps) {
  return (
    // On a narrow screen the controls go under the words instead of squeezing them.
    <header
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-5',
        className,
      )}
    >
      <div className="grid min-w-[min(100%,14rem)] flex-1 gap-1">
        <h2 className="flex flex-wrap items-center gap-2 text-[15px] leading-tight font-semibold">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex max-w-full shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-5', className)} {...props} />;
}

// --- Badge ---------------------------------------------------------------------

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        success: 'border-success/25 bg-success/10 text-success',
        warning: 'border-warning/30 bg-warning/10 text-warning',
        danger: 'border-destructive/25 bg-destructive/10 text-destructive',
        info: 'border-info/25 bg-info/10 text-info',
        primary: 'border-primary/25 bg-primary/10 text-primary',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

interface BadgeProps extends ComponentProps<'span'> {
  tone?: BadgeTone;
  /** Shows a small dot in front. Pulses when "live". */
  dot?: boolean | 'live';
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? (
        <span
          className={cn('size-1.5 rounded-full bg-current', dot === 'live' && 'animate-pulse')}
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, { tone: BadgeTone; live?: boolean }> = {
  READY: { tone: 'success' },
  COMPLETED: { tone: 'success' },
  PROCESSING: { tone: 'warning', live: true },
  RUNNING: { tone: 'warning', live: true },
  UPLOADING: { tone: 'info', live: true },
  UPLOADED: { tone: 'info' },
  QUEUED: { tone: 'neutral' },
  CANCELLED: { tone: 'neutral' },
  DELETED: { tone: 'neutral' },
  FAILED: { tone: 'danger' },
  PUBLISHED: { tone: 'success' },
  DRAFT: { tone: 'neutral' },
  ARCHIVED: { tone: 'warning' },
  ACTIVE: { tone: 'success' },
  DISABLED: { tone: 'danger' },
};

/** A colored label for an asset or job status. */
export function StatusBadge({ status }: { status: string }) {
  const look = STATUS_TONES[status] ?? { tone: 'neutral' as const };
  return (
    <Badge tone={look.tone} dot={look.live ? 'live' : true}>
      {humanize(status)}
    </Badge>
  );
}

// --- Progress, skeleton, spinner -------------------------------------------------

interface ProgressProps {
  /** 0 to 100. */
  value: number;
  label: string;
  className?: string;
  showValue?: boolean;
}

export function Progress({ value, label, className, showValue = true }: ProgressProps) {
  const percent = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      {showValue ? (
        <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">
          {percent}%
        </span>
      ) : null}
    </div>
  );
}

/** A grey placeholder shown while content loads. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--muted)_25%,var(--accent)_50%,var(--muted)_75%)] bg-[length:200%_100%]',
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn('flex items-center gap-2 py-2 text-sm text-muted-foreground', className)}
      role="status"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}…
    </div>
  );
}

// --- Messages --------------------------------------------------------------------

/** A message about something that went wrong. Announced to screen readers. Renders nothing without an error. */
export function ErrorNote({ error, className }: { error: unknown; className?: string }) {
  if (!error) {
    return null;
  }
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">
        {error instanceof Error ? error.message : String(error)}
      </span>
    </div>
  );
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {children ? <p className="max-w-sm text-sm text-muted-foreground">{children}</p> : null}
      </div>
      {action}
    </div>
  );
}

// --- Page header and pagination ----------------------------------------------------

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="grid min-w-0 gap-1">
        <h1 className="flex flex-wrap items-center gap-3 text-2xl leading-tight font-semibold tracking-tight break-words">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  if (total <= pageSize) {
    return null;
  }
  const pages = Math.ceil(total / pageSize);
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav className="mt-4 flex items-center justify-between gap-4 text-sm" aria-label="Pages">
      <span className="text-muted-foreground tabular-nums">
        {first}–{last} of {total}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground tabular-nums">
          Page {page} of {pages}
        </span>
        <Button
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <Button
          size="icon-sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

// --- Table -------------------------------------------------------------------------

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'h-10 border-b px-4 text-left text-xs font-medium whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('border-b px-4 py-3 align-middle', className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'transition-colors hover:bg-muted/40 data-[selected=true]:bg-primary/5 [&:last-child>td]:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

// --- Tabs --------------------------------------------------------------------------

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('flex gap-1 border-b', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px flex shrink-0 items-center gap-2 border-b-2 whitespace-nowrap border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-5 outline-none', className)} {...props} />;
}

// --- Description list ----------------------------------------------------------------

/** Label and value pairs, for showing the facts of one thing. */
export function Facts({ items }: { items: readonly [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2.5 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
