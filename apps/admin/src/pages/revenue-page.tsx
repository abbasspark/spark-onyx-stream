// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  CloudDownload,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Gift,
  MoreHorizontal,
  Receipt,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { billingApi, paymentsApi } from '@/api/endpoints';
import type { Payment, PaymentStatus, RevenueMonth, RevenueReport } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
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
import { Input, Select } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/overlay';
import {
  browserTimeZone,
  describePayment,
  formatMoney,
  monthLabel,
  type PaymentPeriod,
  percentChange,
  periodRange,
} from '@/lib/billing';
import { useAddressParams } from '@/lib/address-params';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 300;
const RANGES = ['3', '6', '12', '24'] as const;
const PERIODS: readonly { value: PaymentPeriod; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-year', label: 'This year' },
];
const STATUSES: readonly PaymentStatus[] = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];

/** Saves a file the API built under the name it came with. */
function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** What came in: the figures, the months, the plans, and every payment. */
export function RevenuePage() {
  const { can } = useSession();
  const mayWrite = can('billing:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [params, change] = useAddressParams();

  const range = (RANGES as readonly string[]).includes(params.get('range') ?? '')
    ? Number(params.get('range'))
    : 12;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const source =
    params.get('source') === 'STRIPE' || params.get('source') === 'MANUAL'
      ? (params.get('source') as 'STRIPE' | 'MANUAL')
      : '';
  const status = (STATUSES as readonly string[]).includes(params.get('status') ?? '')
    ? (params.get('status') as PaymentStatus)
    : '';
  const period = PERIODS.some((option) => option.value === params.get('period'))
    ? (params.get('period') as PaymentPeriod)
    : 'all';
  const kind = (['SUBSCRIPTION', 'RENTAL', 'PURCHASE'] as const).find(
    (value) => value === params.get('kind'),
  );
  const filtered = Boolean(q || source || status || kind || period !== 'all');

  const [search, setSearch] = useState(q);
  useEffect(() => {
    if (search === q) {
      return;
    }
    const timer = window.setTimeout(() => change({ q: search, page: null }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const timeZone = browserTimeZone();
  const report = useQuery({
    queryKey: ['billing', 'revenue', range, timeZone],
    queryFn: ({ signal }) => paymentsApi.revenue({ months: range, timeZone }, signal),
    placeholderData: keepPreviousData,
  });
  const overview = useQuery({
    queryKey: ['billing', 'overview'],
    queryFn: ({ signal }) => billingApi.overview(signal),
    staleTime: 60_000,
  });
  const filters = {
    q: q || undefined,
    source: source || undefined,
    status: status || undefined,
    kind,
    ...periodRange(period),
  };
  const payments = useQuery({
    queryKey: ['billing', 'payments', { page, q, source, status, kind, period }],
    queryFn: ({ signal }) => paymentsApi.list({ page, pageSize: PAGE_SIZE, ...filters }, signal),
    placeholderData: keepPreviousData,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['billing'] });
  const exportCsv = useMutation({
    mutationFn: () => paymentsApi.exportCsv(filters),
    onSuccess: ({ blob, fileName }) => saveFile(blob, fileName ?? 'payments.csv'),
    onError: (error) => toast.error(error.message),
  });
  const importFromStripe = useMutation({
    mutationFn: () => paymentsApi.importFromStripe(),
    onSuccess: (result) => {
      toast.success(
        result.added === 0
          ? `Nothing new: all ${result.checked} invoices at Stripe are in the books`
          : `${result.added} ${result.added === 1 ? 'payment' : 'payments'} added from ${result.checked} invoices`,
        result.complete
          ? undefined
          : { description: 'Stripe has more invoices than one run reads. Run it again.' },
      );
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (payment: Payment) => paymentsApi.remove(payment.id),
    onSuccess: () => {
      toast.success('Payment taken out of the books');
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const askRemove = async (payment: Payment) => {
    const confirmed = await confirm({
      title: 'Take this payment out of the books?',
      description: `${formatMoney(payment.amount, payment.currency)} from ${payment.viewerEmail}, written down by hand. Use this for a payment that was entered by mistake. The access of the viewer does not change.`,
      confirmLabel: 'Delete payment',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(payment);
    }
  };

  const items = payments.data?.items ?? [];
  const stripeOn = overview.data?.stripe != null;

  return (
    <>
      <PageHeader
        title="Revenue"
        description="What viewers paid for their subscriptions: collected by Stripe, or received by you and written down."
        actions={
          <>
            <Select
              aria-label="Months shown"
              className="w-40"
              value={String(range)}
              onValueChange={(value) => change({ range: value === '12' ? null : value })}
              options={RANGES.map((value) => ({ value, label: `Last ${value} months` }))}
            />
            {mayWrite && stripeOn ? (
              <Tooltip content="Reads the paid invoices at Stripe into the books: for payments from before this page existed">
                <Button
                  loading={importFromStripe.isPending}
                  onClick={() => importFromStripe.mutate()}
                >
                  <CloudDownload />
                  Import from Stripe
                </Button>
              </Tooltip>
            ) : null}
          </>
        }
      />

      <ErrorNote error={report.error} className="mb-4" />
      {report.data ? (
        <Report report={report.data} />
      ) : report.isPending ? (
        <div className="grid gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : null}

      <Card className="mt-6">
        <CardHeader
          title="Payments"
          description={
            payments.data
              ? `${payments.data.total} ${payments.data.total === 1 ? 'payment' : 'payments'}${filtered ? ' match' : ''}`
              : undefined
          }
          actions={
            <Button
              size="sm"
              loading={exportCsv.isPending}
              disabled={payments.data?.total === 0}
              onClick={() => exportCsv.mutate()}
            >
              <Download />
              Export CSV
            </Button>
          }
        />
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="Email, name, title, invoice or note"
                aria-label="Search payments"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              aria-label="Filter by time"
              className="w-36"
              value={period}
              onValueChange={(value) =>
                change({ period: value === 'all' ? null : value, page: null })
              }
              options={[...PERIODS]}
            />
            <Select
              aria-label="Filter by source"
              className="w-40"
              value={source || 'ALL'}
              onValueChange={(value) =>
                change({ source: value === 'ALL' ? null : value, page: null })
              }
              options={[
                { value: 'ALL', label: 'Online and by hand' },
                { value: 'STRIPE', label: 'Paid online' },
                { value: 'MANUAL', label: 'Written down' },
              ]}
            />
            <Select
              aria-label="Filter by kind"
              className="w-40"
              value={kind || 'ALL'}
              onValueChange={(value) =>
                change({ kind: value === 'ALL' ? null : value, page: null })
              }
              options={[
                { value: 'ALL', label: 'Everything sold' },
                { value: 'SUBSCRIPTION', label: 'Subscriptions' },
                { value: 'RENTAL', label: 'Rentals' },
                { value: 'PURCHASE', label: 'Purchases' },
              ]}
            />
            <Select
              aria-label="Filter by state"
              className="w-40"
              value={status || 'ALL'}
              onValueChange={(value) =>
                change({ status: value === 'ALL' ? null : value, page: null })
              }
              options={[
                { value: 'ALL', label: 'Any state' },
                ...STATUSES.map((value) => ({
                  value,
                  label: describePayment({ status: value }).label,
                })),
              ]}
            />
            {filtered ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  change({
                    q: null,
                    source: null,
                    status: null,
                    kind: null,
                    period: null,
                    page: null,
                  });
                }}
              >
                <X />
                Clear
              </Button>
            ) : null}
          </div>

          <ErrorNote error={payments.error} className="mb-4" />
          {payments.isPending ? (
            <Skeleton className="h-40 rounded-lg" />
          ) : items.length === 0 ? (
            <EmptyState icon={Receipt} title={filtered ? 'No payment matches' : 'No payments yet'}>
              {filtered
                ? 'Try other words, or clear the filters.'
                : stripeOn
                  ? 'Payments appear here as viewers pay. Money you receive by hand is written down in a viewer on the Viewers page.'
                  : 'Money you receive by hand is written down in a viewer on the Viewers page. Connect Stripe on the Plans page to take payments online.'}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <thead>
                  <tr>
                    <Th>Paid</Th>
                    <Th>Viewer</Th>
                    <Th>For</Th>
                    <Th>Source</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>State</Th>
                    <Th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((payment) => (
                    <PaymentRow
                      key={payment.id}
                      payment={payment}
                      mayWrite={mayWrite}
                      onRemove={() => void askRemove(payment)}
                    />
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          {payments.data ? (
            <div className="mt-4">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={payments.data.total}
                onChange={(next) => change({ page: next === 1 ? null : String(next) })}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

function PaymentRow({
  payment,
  mayWrite,
  onRemove,
}: {
  payment: Payment;
  mayWrite: boolean;
  onRemove: () => void;
}) {
  const state = describePayment(payment);
  const hasMenu =
    payment.invoiceUrl !== null ||
    payment.externalUrl !== null ||
    (mayWrite && payment.source === 'MANUAL');
  return (
    <Tr>
      <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(payment.paidAt)}</Td>
      <Td>
        {payment.viewer ? (
          <Link
            to={`/viewers?q=${encodeURIComponent(payment.viewerEmail)}`}
            className="font-medium hover:underline"
          >
            {payment.viewer.displayName}
          </Link>
        ) : (
          <span className="text-muted-foreground">Deleted account</span>
        )}
        <div className="text-xs text-muted-foreground">{payment.viewerEmail}</div>
        {payment.note ? <div className="mt-0.5 text-xs">{payment.note}</div> : null}
      </Td>
      <Td>
        {payment.kind === 'SUBSCRIPTION' ? (
          (payment.planName ?? <span className="text-muted-foreground">None</span>)
        ) : (
          <>
            {payment.titleName ?? 'A title'}
            <div className="text-xs text-muted-foreground">
              {payment.kind === 'RENTAL' ? 'Rental' : 'Purchase'}
            </div>
          </>
        )}
      </Td>
      <Td>
        <Badge>
          {payment.source === 'STRIPE' ? (
            <CreditCard className="size-3" aria-hidden="true" />
          ) : (
            <Gift className="size-3" aria-hidden="true" />
          )}
          {payment.source === 'STRIPE' ? 'Online' : 'By hand'}
        </Badge>
        {payment.recordedBy ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            by {payment.recordedBy.displayName}
          </div>
        ) : null}
      </Td>
      <Td className="text-right whitespace-nowrap tabular-nums">
        <span
          className={cn('font-medium', payment.status === 'REFUNDED' && 'line-through opacity-60')}
        >
          {formatMoney(payment.amount, payment.currency)}
        </span>
        {payment.refundedAmount > 0 ? (
          <div className="text-xs text-muted-foreground">
            {formatMoney(payment.refundedAmount, payment.currency)} returned
          </div>
        ) : payment.taxAmount > 0 ? (
          <div className="text-xs text-muted-foreground">
            incl. {formatMoney(payment.taxAmount, payment.currency)} tax
          </div>
        ) : null}
      </Td>
      <Td>
        <Badge tone={state.tone} dot>
          {state.label}
        </Badge>
      </Td>
      <Td className="w-10 text-right">
        {hasMenu ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Actions for the payment of ${payment.viewerEmail}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {payment.invoiceUrl ? (
                <DropdownMenuItem asChild>
                  <a href={payment.invoiceUrl} target="_blank" rel="noreferrer">
                    <FileText />
                    Invoice {payment.invoiceNumber ?? ''}
                  </a>
                </DropdownMenuItem>
              ) : null}
              {payment.externalUrl ? (
                <DropdownMenuItem asChild>
                  <a href={payment.externalUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Open in Stripe, to refund
                  </a>
                </DropdownMenuItem>
              ) : null}
              {mayWrite && payment.source === 'MANUAL' ? (
                <DropdownMenuItem destructive onSelect={onRemove}>
                  <Trash2 />
                  Delete payment
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </Td>
    </Tr>
  );
}

function Change({ now, before }: { now: number; before: number }) {
  const change = percentChange(now, before);
  if (change === null) {
    return <span>No month before to compare with</span>;
  }
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', up ? 'text-success' : 'text-destructive')}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {Math.abs(change)}% {up ? 'more' : 'less'} than the month before
    </span>
  );
}

function Report({ report }: { report: RevenueReport }) {
  const { currency, months } = report;
  const money = (amount: number) => formatMoney(amount, currency);
  const current = months.at(-1);
  const previous = months.at(-2);
  const top = Math.max(1, ...report.byPlan.map((plan) => plan.net));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {report.otherCurrencies.length > 0 ? (
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          {report.otherCurrencies
            .map((other) => `${other.payments} in ${other.currency}`)
            .join(', ')}{' '}
          {report.otherCurrencies.reduce((sum, other) => sum + other.payments, 0) === 1
            ? 'payment is'
            : 'payments are'}{' '}
          left out of every figure here, which are in {currency}. They stay in the list and the
          export.
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <Figure
            label="Monthly recurring revenue"
            value={money(report.monthlyRecurring)}
            note={`${report.payingSubscribers} paying online${report.trialing > 0 ? `, ${report.trialing} in a trial` : ''}`}
            hint="What the subscriptions paid online bring in per month as they stand today: monthly prices, and a twelfth of yearly ones. Trials and cancelled subscriptions are not counted."
          />
          <Figure
            label={current ? `${monthLabel(current.month, true)}, so far` : 'This month'}
            value={money(current?.net ?? 0)}
            note={
              previous ? (
                <Change now={current?.net ?? 0} before={previous.net} />
              ) : (
                `${current?.payments ?? 0} payments`
              )
            }
          />
          <Figure
            label={`Last ${months.length} months`}
            value={money(report.totals.net)}
            note={`${report.totals.payments} ${report.totals.payments === 1 ? 'payment' : 'payments'}, after refunds`}
          />
          <Figure
            label="Returned"
            value={money(report.totals.refunded)}
            note={
              report.totals.gross > 0
                ? `${Math.round((report.totals.refunded / report.totals.gross) * 100)}% of ${money(report.totals.gross)} paid`
                : 'Nothing paid yet'
            }
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <Card>
          <CardHeader
            title="Revenue per month"
            description={`After refunds, in ${currency}. Months change at midnight in ${report.timeZone.replace(/_/g, ' ')}.`}
            actions={
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary" aria-hidden="true" />
                  Online
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-info" aria-hidden="true" />
                  By hand
                </span>
              </div>
            }
          />
          <CardContent className="p-5">
            <MonthChart months={months} currency={currency} />
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader
              title="By what was sold"
              description={`Last ${months.length} months, after refunds.`}
            />
            <CardContent className="grid gap-3.5 p-5">
              {report.byPlan.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments in these months.</p>
              ) : (
                report.byPlan.map((plan) => (
                  <div key={`${plan.planId ?? 'none'}-${plan.planName}`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{plan.planName}</span>
                      <span className="tabular-nums">{money(plan.net)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(2, (Math.max(0, plan.net) / top) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plan.payments} {plan.payments === 1 ? 'payment' : 'payments'}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader
              title="Subscribers paying online"
              description="Who started and who ended, by month."
            />
            <CardContent className="p-5">
              <Movement months={months.slice(-6)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  hint,
}: {
  label: string;
  value: string;
  note: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {hint ? (
          <Tooltip content={hint}>
            <span className="cursor-help underline decoration-dotted underline-offset-4">
              {label}
            </span>
          </Tooltip>
        ) : (
          label
        )}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/** Bars of what each month brought, split into online and by hand. Plain elements, so it follows the theme. */
function MonthChart({ months, currency }: { months: RevenueMonth[]; currency: string }) {
  const max = Math.max(1, ...months.map((month) => Math.max(0, month.net)));
  const total = months.reduce((sum, month) => sum + month.net, 0);
  const every = months.length > 12 ? 3 : 1;
  return (
    <div>
      <div
        className="flex h-56 items-end gap-1 border-b sm:gap-1.5 xl:h-80"
        role="img"
        aria-label={`${formatMoney(total, currency)} in ${months.length} months`}
      >
        {months.map((month) => {
          const net = Math.max(0, month.net);
          const height = net > 0 ? Math.max(3, (net / max) * 100) : 0;
          const onlineShare = net > 0 ? (Math.max(0, month.online) / net) * 100 : 0;
          return (
            <Tooltip
              key={month.month}
              content={
                <span className="grid gap-0.5 text-left">
                  <span className="font-medium">{monthLabel(month.month, true)}</span>
                  <span>{formatMoney(month.net, currency)} after refunds</span>
                  <span>
                    {formatMoney(month.online, currency)} online,{' '}
                    {formatMoney(month.byHand, currency)} by hand
                  </span>
                  {month.refunded > 0 ? (
                    <span>{formatMoney(month.refunded, currency)} returned</span>
                  ) : null}
                  <span>
                    {month.payments} {month.payments === 1 ? 'payment' : 'payments'}
                  </span>
                </span>
              }
            >
              <div className="group flex h-full min-w-0 flex-1 flex-col justify-end">
                {net > 0 ? (
                  <div
                    className="flex w-full flex-col overflow-hidden rounded-t-sm opacity-85 transition-opacity group-hover:opacity-100"
                    style={{ height: `${height}%` }}
                  >
                    <div className="bg-info" style={{ height: `${100 - onlineShare}%` }} />
                    <div className="bg-primary" style={{ height: `${onlineShare}%` }} />
                  </div>
                ) : (
                  <div className="h-[3px] w-full rounded-t-sm bg-muted" />
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1 text-xs text-muted-foreground sm:gap-1.5">
        {months.map((month, index) => (
          <span
            key={month.month}
            className={cn(
              'min-w-0 flex-1 text-center whitespace-nowrap',
              // A narrow screen has room for every second name.
              (months.length - 1 - index) % (every * 2) !== 0 && 'max-sm:invisible',
            )}
          >
            {(months.length - 1 - index) % every === 0 ? monthLabel(month.month) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function Movement({ months }: { months: RevenueMonth[] }) {
  if (months.every((month) => month.started === 0 && month.ended === 0)) {
    return (
      <p className="text-sm text-muted-foreground">Nobody subscribed online in these months.</p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="pb-2 font-normal">Month</th>
          <th className="pb-2 text-right font-normal">Started</th>
          <th className="pb-2 text-right font-normal">Ended</th>
          <th className="pb-2 text-right font-normal">Change</th>
        </tr>
      </thead>
      <tbody>
        {[...months].reverse().map((month) => {
          const change = month.started - month.ended;
          return (
            <tr key={month.month} className="border-t">
              <td className="py-1.5">{monthLabel(month.month, true)}</td>
              <td className="py-1.5 text-right tabular-nums">{month.started}</td>
              <td className="py-1.5 text-right tabular-nums">{month.ended}</td>
              <td
                className={cn(
                  'py-1.5 text-right font-medium tabular-nums',
                  change > 0 && 'text-success',
                  change < 0 && 'text-destructive',
                )}
              >
                {change > 0 ? `+${change}` : change}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
