// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Check,
  Copy,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  ScanSearch,
  Ticket,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { billingApi, prepaidApi } from '@/api/endpoints';
import type {
  PrepaidBatch,
  PrepaidBatchInput,
  PrepaidCode,
  PrepaidCodeLookup,
  PrepaidSummary,
} from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  ErrorNote,
  Facts,
  PageHeader,
  Pagination,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { ValueBars } from '@/components/value-bars';
import { formatChartDay } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import {
  BATCH_LOOKS,
  type BatchForm,
  CODE_LOOKS,
  countCodes,
  DAY_PRESETS,
  describeDays,
  describeForm,
  describeGives,
  emptyForm,
  formatCodeInput,
  formProblem,
  isCompleteCode,
  toDayField,
  toInput,
  usedShare,
  endOfDay,
} from '@/lib/prepaid';

type CodeFilter = 'all' | 'unused' | 'redeemed' | 'withdrawn';
const CODE_FILTERS: { value: CodeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unused', label: 'Unused' },
  { value: 'redeemed', label: 'Used' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

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

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Copying is blocked by the browser. Select the text and copy it by hand.');
  }
}

const untilText = (batch: Pick<PrepaidBatch, 'expiresAt'>) =>
  batch.expiresAt ? formatDateTime(batch.expiresAt) : 'Without end';

/**
 * Prepaid codes: made in batches, sold or given away outside the site, and
 * entered by a viewer to start a plan or to add days to it.
 */
export function PrepaidCodesPage() {
  const { can } = useSession();
  const mayWrite = can('billing:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PrepaidBatch | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  /** The batch that was just made, while its codes wait to be downloaded. */
  const [made, setMade] = useState<PrepaidBatch | null>(null);

  const summary = useQuery({
    queryKey: ['prepaid', 'summary'],
    queryFn: ({ signal }) => prepaidApi.summary(signal),
  });
  const batches = useQuery({
    queryKey: ['prepaid', 'batches', page],
    queryFn: ({ signal }) => prepaidApi.batches(page, signal),
    placeholderData: keepPreviousData,
  });
  const plans = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: ({ signal }) => billingApi.plans(signal),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['prepaid'] });
    void queryClient.invalidateQueries({ queryKey: ['billing', 'overview'] });
  };
  const onError = (error: Error) => toast.error(error.message);

  const exportCsv = useMutation({
    mutationFn: ({ batch, all }: { batch: PrepaidBatch; all: boolean }) =>
      prepaidApi.exportCsv(batch.id, all),
    onSuccess: ({ blob, fileName }) => saveFile(blob, fileName ?? 'codes.csv'),
    onError,
  });
  const withdraw = useMutation({
    mutationFn: (batch: PrepaidBatch) => prepaidApi.withdraw(batch.id),
    onSuccess: (batch) => {
      toast.success(`${batch.name} withdrawn`, {
        description: `${countCodes(batch.withdrawn)} no longer work.`,
      });
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (batch: PrepaidBatch) => prepaidApi.remove(batch.id),
    onSuccess: (_result, batch) => {
      toast.success(`${batch.name} deleted`);
      setOpenId(null);
      refresh();
    },
    onError,
  });

  const askWithdraw = async (batch: PrepaidBatch) => {
    const confirmed = await confirm({
      title: `Withdraw ${batch.name}?`,
      description: `${countCodes(batch.left)} that nobody used stop working, for good. ${
        batch.redeemed > 0
          ? `The ${batch.redeemed} that were used keep what they gave.`
          : 'Nobody has used a code of it yet.'
      }`,
      confirmLabel: 'Withdraw the batch',
      destructive: true,
    });
    if (confirmed) {
      withdraw.mutate(batch);
    }
  };
  const askDelete = async (batch: PrepaidBatch) => {
    const confirmed = await confirm({
      title: `Delete ${batch.name}?`,
      description: `The batch and its ${countCodes(batch.total)} are removed. Nobody used one, so no viewer loses anything. Codes that were handed out stop working.`,
      confirmLabel: 'Delete the batch',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(batch);
    }
  };

  const items = batches.data?.items ?? [];
  const open = items.find((batch) => batch.id === openId) ?? null;
  const noPlans = plans.data !== undefined && plans.data.length === 0;

  const actions = (
    <>
      <Button onClick={() => setLookingUp(true)}>
        <ScanSearch />
        Look up a code
      </Button>
      {mayWrite ? (
        <Button variant="primary" disabled={noPlans} onClick={() => setCreating(true)}>
          <Plus />
          New batch
        </Button>
      ) : null}
    </>
  );

  const menu = (batch: PrepaidBatch) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`More for ${batch.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={() => setOpenId(batch.id)}>
          <Eye />
          Open
        </DropdownMenuItem>
        {mayWrite ? (
          <>
            <DropdownMenuItem
              disabled={batch.left === 0}
              onSelect={() => exportCsv.mutate({ batch, all: false })}
            >
              <Download />
              Download unused codes
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditing(batch)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {batch.state !== 'withdrawn' && batch.redeemed > 0 ? (
              <DropdownMenuItem destructive onSelect={() => void askWithdraw(batch)}>
                <Ban />
                Withdraw
              </DropdownMenuItem>
            ) : null}
            {batch.redeemed === 0 ? (
              <DropdownMenuItem destructive onSelect={() => void askDelete(batch)}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <PageHeader
        title="Prepaid codes"
        description="Codes you sell or give away outside the site: on cards, through resellers, or by message. A viewer enters one and the plan starts, or runs longer. No card and no online payment is needed."
        actions={actions}
      />

      {noPlans ? (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <span className="font-medium">There is no plan yet.</span>{' '}
            <span className="text-muted-foreground">
              A code gives days of a plan, so a plan comes first.
            </span>{' '}
            <Link to="/plans" className="underline underline-offset-4">
              Make a plan
            </Link>
          </p>
        </div>
      ) : null}

      <ErrorNote error={batches.error ?? summary.error} className="mb-4" />
      {batches.isPending ? <Skeleton className="h-64 rounded-xl" /> : null}

      {batches.data && batches.data.total === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No codes yet"
          action={
            mayWrite ? (
              <Button variant="primary" disabled={noPlans} onClick={() => setCreating(true)}>
                <Plus />
                New batch
              </Button>
            ) : null
          }
        >
          Make a batch for a shop, a reseller or a promotion. You choose the plan, how many days one
          code gives and how many codes there are, then download them for printing or sending.
        </EmptyState>
      ) : null}

      {batches.data && batches.data.total > 0 ? (
        <>
          {summary.data ? <Summary summary={summary.data} /> : null}

          <Card className="overflow-hidden">
            <Table>
              <thead>
                <tr>
                  <Th>Batch</Th>
                  <Th className="hidden md:table-cell">One code gives</Th>
                  <Th>Used</Th>
                  <Th className="hidden text-right sm:table-cell">Left</Th>
                  <Th className="hidden lg:table-cell">Usable until</Th>
                  <Th>State</Th>
                  {/* Positioned, so the words for screen readers stay inside the table. */}
                  <Th className="relative w-10">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {items.map((batch) => {
                  const look = BATCH_LOOKS[batch.state];
                  const share = usedShare(batch);
                  return (
                    <Tr
                      key={batch.id}
                      className="cursor-pointer"
                      onClick={() => setOpenId(batch.id)}
                    >
                      <Td>
                        <button
                          type="button"
                          className="block max-w-64 truncate text-left font-medium hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenId(batch.id);
                          }}
                        >
                          {batch.name}
                        </button>
                        <p className="max-w-64 truncate text-xs text-muted-foreground md:hidden">
                          {describeGives(batch)}
                        </p>
                        <p className="hidden max-w-64 truncate text-xs text-muted-foreground md:block">
                          {batch.note ?? `Made ${formatRelative(batch.createdAt)}`}
                        </p>
                      </Td>
                      <Td className="hidden md:table-cell">
                        <span className="font-medium">{describeDays(batch.days)}</span>
                        <p className="max-w-40 truncate text-xs text-muted-foreground">
                          of {batch.plan.name}
                        </p>
                      </Td>
                      <Td>
                        <span className="tabular-nums">
                          {batch.redeemed.toLocaleString('en')} of{' '}
                          {batch.total.toLocaleString('en')}
                        </span>
                        <div
                          className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(share * 100)}
                          aria-label={`${batch.name}: codes used`}
                        >
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${share * 100}%` }}
                          />
                        </div>
                      </Td>
                      <Td className="hidden text-right tabular-nums sm:table-cell">
                        {batch.left.toLocaleString('en')}
                      </Td>
                      <Td className="hidden text-muted-foreground lg:table-cell">
                        {untilText(batch)}
                      </Td>
                      <Td>
                        <Badge tone={look.tone} title={look.about}>
                          {look.label}
                        </Badge>
                      </Td>
                      <Td className="text-right">{menu(batch)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
          <Pagination
            page={batches.data.page}
            pageSize={batches.data.pageSize}
            total={batches.data.total}
            onChange={setPage}
          />
        </>
      ) : null}

      <BatchDialog
        open={creating}
        batch={null}
        plans={plans.data ?? []}
        onOpenChange={setCreating}
        onSaved={(batch) => {
          setCreating(false);
          setMade(batch);
          refresh();
        }}
      />
      <BatchDialog
        open={editing !== null}
        batch={editing}
        plans={plans.data ?? []}
        onOpenChange={(next) => (next ? undefined : setEditing(null))}
        onSaved={(batch) => {
          setEditing(null);
          toast.success(`${batch.name} saved`);
          refresh();
        }}
      />

      <Dialog open={made !== null} onOpenChange={(next) => (next ? undefined : setMade(null))}>
        <DialogContent
          size="sm"
          title="The codes are ready"
          description={made ? `${countCodes(made.total)}, each for ${describeGives(made)}.` : null}
        >
          <DialogBody>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success/10 text-success">
                <Check className="size-4" aria-hidden="true" />
              </span>
              <p className="text-sm text-muted-foreground">
                Download them as a file for a spreadsheet, a card printer or a reseller. Treat the
                file like cash: whoever has a code can use it. You can download it again later, and
                every download is written to the audit log.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => {
                if (made) {
                  setOpenId(made.id);
                }
                setMade(null);
              }}
            >
              Open the batch
            </Button>
            <Button
              variant="primary"
              loading={exportCsv.isPending}
              onClick={() => (made ? exportCsv.mutate({ batch: made, all: false }) : undefined)}
            >
              <Download />
              Download the codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BatchSheet
        batch={open}
        mayWrite={mayWrite}
        exporting={exportCsv.isPending}
        onClose={() => setOpenId(null)}
        onChanged={refresh}
        onEdit={setEditing}
        onExport={(batch, all) => exportCsv.mutate({ batch, all })}
        onWithdraw={(batch) => void askWithdraw(batch)}
        onDelete={(batch) => void askDelete(batch)}
      />

      <LookupDialog
        open={lookingUp}
        mayWrite={mayWrite}
        onOpenChange={setLookingUp}
        onChanged={refresh}
      />
    </>
  );
}

function Summary({ summary }: { summary: PrepaidSummary }) {
  const lately = summary.days.reduce((sum, day) => sum + day.redeemed, 0);
  const figures = [
    {
      label: 'Codes left',
      value: summary.left.toLocaleString('en'),
      note: 'Unused, and still usable',
    },
    {
      label: 'Codes used',
      value: summary.redeemed.toLocaleString('en'),
      note: `Of ${summary.codes.toLocaleString('en')} made in ${summary.batches} ${summary.batches === 1 ? 'batch' : 'batches'}`,
    },
    {
      label: 'Watching through a code',
      value: summary.subscribers.toLocaleString('en'),
      note: summary.subscribers === 1 ? 'Viewer, right now' : 'Viewers, right now',
    },
  ];
  return (
    <Card className="mb-4">
      <CardContent className="grid gap-x-10 gap-y-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid content-start gap-5 sm:grid-cols-3 lg:grid-cols-1">
          {figures.map((figure) => (
            <div key={figure.label} className="min-w-0">
              <p className="text-xs text-muted-foreground">{figure.label}</p>
              <p className="mt-1 truncate text-2xl font-semibold tabular-nums">{figure.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{figure.note}</p>
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="text-[13px] font-medium">Codes used per day</h2>
            <p className="text-xs text-muted-foreground">
              {lately.toLocaleString('en')} in the last 30 days
            </p>
          </div>
          <ValueBars
            bars={summary.days.map((day) => ({
              key: day.day,
              label: formatChartDay(day.day),
              value: day.redeemed,
            }))}
            label="Codes used per day, over the last 30 days."
            format={(value) => String(Math.round(value))}
            height={150}
            labels={6}
            details={(bar) => (
              <div className="grid gap-1">
                <p className="font-medium">{formatChartDay(bar.key, true)}</p>
                <p className="text-muted-foreground">{countCodes(bar.value)} used</p>
              </div>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface BatchSheetProps {
  batch: PrepaidBatch | null;
  mayWrite: boolean;
  exporting: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (batch: PrepaidBatch) => void;
  onExport: (batch: PrepaidBatch, all: boolean) => void;
  onWithdraw: (batch: PrepaidBatch) => void;
  onDelete: (batch: PrepaidBatch) => void;
}

/** One batch: its terms, its figures, and every code with what became of it. */
function BatchSheet({
  batch,
  mayWrite,
  exporting,
  onClose,
  onChanged,
  onEdit,
  onExport,
  onWithdraw,
  onDelete,
}: BatchSheetProps) {
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<CodeFilter>('all');
  /** Codes shown in full, by the id of the code. They are forgotten when the sheet closes. */
  const [shown, setShown] = useState<Record<string, string>>({});
  const id = batch?.id;
  useEffect(() => {
    setPage(1);
    setFilter('all');
    setShown({});
  }, [id]);

  const codes = useQuery({
    queryKey: ['prepaid', 'codes', id, filter, page, batch?.redeemed, batch?.withdrawn],
    queryFn: ({ signal }) =>
      prepaidApi.codes(
        id as string,
        { page, state: filter === 'all' ? undefined : filter },
        signal,
      ),
    enabled: id !== undefined,
    placeholderData: keepPreviousData,
  });
  const reveal = useMutation({
    mutationFn: (code: PrepaidCode) => prepaidApi.reveal(code.id),
    onSuccess: ({ code }, asked) => setShown((current) => ({ ...current, [asked.id]: code })),
    onError: (error: Error) => toast.error(error.message),
  });
  const withdrawCode = useMutation({
    mutationFn: (code: PrepaidCode) => prepaidApi.withdrawCode(code.id),
    onSuccess: (_result, code) => {
      toast.success(`${code.masked} withdrawn`);
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const askWithdrawCode = async (code: PrepaidCode) => {
    const confirmed = await confirm({
      title: `Withdraw ${code.masked}?`,
      description:
        'The code stops working, for good. Use this for a card that was lost or handed out by mistake.',
      confirmLabel: 'Withdraw the code',
      destructive: true,
    });
    if (confirmed) {
      withdrawCode.mutate(code);
    }
  };

  const look = batch ? BATCH_LOOKS[batch.state] : null;

  return (
    <Dialog open={batch !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        variant="sheet"
        size="lg"
        title={batch?.name ?? 'Batch'}
        description={batch ? `One code gives ${describeGives(batch)}` : null}
      >
        {batch && look ? (
          <DialogBody>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={look.tone}>{look.label}</Badge>
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">{look.about}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Made', batch.total.toLocaleString('en')],
                ['Used', batch.redeemed.toLocaleString('en')],
                ['Left', batch.left.toLocaleString('en')],
                [
                  'Last used',
                  batch.lastRedeemedAt ? formatRelative(batch.lastRedeemedAt) : 'Never',
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            <Facts
              items={[
                ['Plan', batch.plan.name],
                ['One code gives', describeDays(batch.days)],
                ['Usable until', untilText(batch)],
                ...(batch.withdrawn > 0
                  ? ([['Withdrawn', countCodes(batch.withdrawn)]] as [string, string][])
                  : []),
                ...(batch.note ? ([['Note', batch.note]] as [string, string][]) : []),
                ['Made', formatDateTime(batch.createdAt)],
              ]}
            />

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[13px] font-medium">Codes</h3>
                <div
                  role="radiogroup"
                  aria-label="Which codes to show"
                  className="inline-flex rounded-lg border bg-card p-0.5"
                >
                  {CODE_FILTERS.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      role="radio"
                      aria-checked={filter === entry.value}
                      onClick={() => {
                        setFilter(entry.value);
                        setPage(1);
                      }}
                      className={cn(
                        'inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
                        filter === entry.value && 'bg-accent text-foreground',
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
              <ErrorNote error={codes.error} />
              {codes.isPending ? <Skeleton className="h-40 rounded-lg" /> : null}
              {codes.data && codes.data.items.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  {filter === 'redeemed'
                    ? 'Nobody has used a code of this batch yet.'
                    : 'No code of this batch is in this state.'}
                </p>
              ) : null}
              {codes.data && codes.data.items.length > 0 ? (
                <>
                  <ul className="divide-y rounded-lg border">
                    {codes.data.items.map((code) => {
                      const full = shown[code.id];
                      const state = CODE_LOOKS[code.state];
                      return (
                        <li
                          key={code.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                        >
                          <span className="font-mono text-[13px] font-medium tracking-wide">
                            {full ?? code.masked}
                          </span>
                          <Badge tone={state.tone}>{state.label}</Badge>
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                            {code.redeemedAt ? (
                              <>
                                {code.redeemedBy ? (
                                  <Link
                                    to={`/viewers?q=${encodeURIComponent(code.redeemedBy.email)}`}
                                    className="underline-offset-4 hover:text-foreground hover:underline"
                                  >
                                    {code.redeemedBy.email}
                                  </Link>
                                ) : (
                                  'A deleted account'
                                )}
                                , {formatRelative(code.redeemedAt)}
                              </>
                            ) : null}
                          </span>
                          {mayWrite && code.state === 'unused' ? (
                            <span className="flex items-center gap-1">
                              {full ? (
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Copy ${code.masked}`}
                                  title="Copy the code"
                                  onClick={() => void copyText(full, 'Code')}
                                >
                                  <Copy />
                                </Button>
                              ) : (
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={`Show ${code.masked} in full`}
                                  title="Show in full. Written to the audit log."
                                  disabled={reveal.isPending}
                                  onClick={() => reveal.mutate(code)}
                                >
                                  <Eye />
                                </Button>
                              )}
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Withdraw ${code.masked}`}
                                title="Withdraw this code"
                                onClick={() => void askWithdrawCode(code)}
                              >
                                <Ban />
                              </Button>
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  <Pagination
                    page={codes.data.page}
                    pageSize={codes.data.pageSize}
                    total={codes.data.total}
                    onChange={setPage}
                  />
                </>
              ) : null}
            </div>
          </DialogBody>
        ) : null}
        {batch && mayWrite ? (
          <DialogFooter>
            {batch.redeemed === 0 ? (
              <Button variant="ghost" className="mr-auto" onClick={() => onDelete(batch)}>
                <Trash2 />
                Delete
              </Button>
            ) : batch.state !== 'withdrawn' ? (
              <Button variant="ghost" className="mr-auto" onClick={() => onWithdraw(batch)}>
                <Ban />
                Withdraw
              </Button>
            ) : null}
            <Button onClick={() => onEdit(batch)}>
              <Pencil />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="primary" loading={exporting}>
                  <Download />
                  Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={batch.left === 0}
                  onSelect={() => onExport(batch, false)}
                >
                  Unused codes, to hand out
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onExport(batch, true)}>
                  All codes with their state
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface BatchDialogProps {
  open: boolean;
  /** The batch to change. Null: a new one is made. */
  batch: PrepaidBatch | null;
  plans: { id: string; name: string; isOffered?: boolean }[];
  onOpenChange: (open: boolean) => void;
  onSaved: (batch: PrepaidBatch) => void;
}

function BatchDialog({ open, batch, plans, onOpenChange, onSaved }: BatchDialogProps) {
  const [form, setForm] = useState<BatchForm>(() => emptyForm());
  const [problem, setProblem] = useState<string | null>(null);
  const set = (change: Partial<BatchForm>) => {
    setForm((current) => ({ ...current, ...change }));
    setProblem(null);
  };
  // The plan viewers are offered comes first: codes are seldom made for a retired one.
  const firstPlan = (plans.find((plan) => plan.isOffered !== false) ?? plans[0])?.id ?? '';

  useEffect(() => {
    if (open) {
      setForm(
        batch
          ? {
              name: batch.name,
              planId: batch.plan.id,
              days: String(batch.days),
              count: String(batch.total),
              until: toDayField(batch.expiresAt),
              note: batch.note ?? '',
            }
          : emptyForm(firstPlan),
      );
      setProblem(null);
    }
  }, [open, batch, firstPlan]);

  const save = useMutation({
    mutationFn: (input: PrepaidBatchInput) =>
      batch
        ? prepaidApi.update(batch.id, {
            name: input.name,
            expiresAt: input.expiresAt,
            note: input.note,
          })
        : prepaidApi.create(input),
    onSuccess: onSaved,
    onError: (error: Error) => setProblem(error.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // A batch whose last day has passed may keep that day while its name is changed.
    const unchangedEnd = batch !== null && form.until === toDayField(batch.expiresAt);
    const found = formProblem(unchangedEnd ? { ...form, until: '' } : form);
    if (found) {
      setProblem(found);
      return;
    }
    const input = toInput(form);
    save.mutate(unchangedEnd ? { ...input, expiresAt: batch.expiresAt } : input);
  };

  const planName = plans.find((plan) => plan.id === form.planId)?.name ?? null;
  const says = describeForm(form, planName);
  const today = toDayField(new Date().toISOString());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title={batch ? `Edit ${batch.name}` : 'New batch of codes'}
        description={
          batch
            ? 'The name, the note and the last day can change. What a code gives is fixed once codes exist.'
            : 'Every code works once. A viewer who enters one gets the plan for the days you set here.'
        }
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Name" hint="For you, to tell batches apart: where or how they are sold.">
              {(id) => (
                <Input
                  id={id}
                  autoFocus
                  maxLength={120}
                  placeholder="Kiosk cards, spring"
                  value={form.name}
                  onChange={(event) => set({ name: event.target.value })}
                />
              )}
            </Field>

            {batch ? null : (
              <>
                <Field label="Plan" hint="What a viewer can watch with a code.">
                  {(id) => (
                    <Select
                      id={id}
                      value={form.planId}
                      onValueChange={(planId) => set({ planId })}
                      options={plans.map((plan) => ({
                        value: plan.id,
                        label: plan.name,
                        description:
                          plan.isOffered === false ? 'Not offered to viewers' : undefined,
                      }))}
                      placeholder="Choose a plan"
                    />
                  )}
                </Field>

                <Field
                  label="One code gives"
                  hint="Days of watching, counted from the moment the code is entered. Entered while the plan runs, they are added to it."
                >
                  {(id) => (
                    <div className="grid gap-2">
                      <div
                        className="flex flex-wrap gap-1.5"
                        role="group"
                        aria-label="Usual lengths"
                      >
                        {DAY_PRESETS.map((preset) => (
                          <button
                            key={preset.days}
                            type="button"
                            aria-pressed={form.days === String(preset.days)}
                            onClick={() => set({ days: String(preset.days) })}
                            className={cn(
                              'h-8 rounded-md border px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground',
                              form.days === String(preset.days) &&
                                'border-primary/40 bg-primary/10 text-foreground',
                            )}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          id={id}
                          inputMode="numeric"
                          className="w-28 tabular-nums"
                          value={form.days}
                          onChange={(event) => set({ days: event.target.value })}
                        />
                        <span className="text-sm text-muted-foreground">days</span>
                      </div>
                    </div>
                  )}
                </Field>

                <Field label="How many codes" hint="Up to 5,000 in one batch.">
                  {(id) => (
                    <Input
                      id={id}
                      inputMode="numeric"
                      className="w-28 tabular-nums"
                      value={form.count}
                      onChange={(event) => set({ count: event.target.value })}
                    />
                  )}
                </Field>
              </>
            )}

            <Field
              label="Last day for using them"
              hint="Empty: the codes can be used at any time. A code that was used keeps its days after this day."
            >
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  className="w-48"
                  min={today}
                  value={form.until}
                  onChange={(event) => set({ until: event.target.value })}
                />
              )}
            </Field>

            <Field label="Note" hint="Optional. Only admins see it.">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={500}
                  value={form.note}
                  onChange={(event) => set({ note: event.target.value })}
                />
              )}
            </Field>

            {!batch && says ? (
              <p className="rounded-lg border border-info/25 bg-info/5 p-3 text-sm text-muted-foreground">
                {says}
                {form.until && endOfDay(form.until)
                  ? ` Usable until the end of ${formatChartDay(form.until, true)}.`
                  : ''}
              </p>
            ) : null}
            {problem ? (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {batch ? 'Save' : 'Make the codes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface LookupDialogProps {
  open: boolean;
  mayWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

/** For support: a viewer reads a code out, and the admin sees where it stands. */
function LookupDialog({ open, mayWrite, onOpenChange, onChanged }: LookupDialogProps) {
  const [code, setCode] = useState('');
  const [found, setFound] = useState<PrepaidCodeLookup | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setFound(null);
      setProblem(null);
    }
  }, [open]);

  const lookup = useMutation({
    mutationFn: (value: string) => prepaidApi.lookup(value),
    onSuccess: (result) => {
      setFound(result);
      setProblem(null);
    },
    onError: (error: Error) => {
      setFound(null);
      setProblem(error.message);
    },
  });
  const withdraw = useMutation({
    mutationFn: (target: PrepaidCodeLookup) => prepaidApi.withdrawCode(target.id),
    onSuccess: (_result, target) => {
      toast.success(`${target.masked} withdrawn`);
      setFound({ ...target, state: 'withdrawn' });
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isCompleteCode(code)) {
      lookup.mutate(code);
    } else {
      setProblem('A code has 16 letters and digits. This one is not complete.');
    }
  };
  const state = found ? CODE_LOOKS[found.state] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title="Look up a code"
        description="Type a code a viewer has, to see whether it is good and who used it."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Code">
              {(id) => (
                <div className="flex gap-2">
                  <Input
                    id={id}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono tracking-wider"
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    value={code}
                    onChange={(event) => {
                      setCode(formatCodeInput(event.target.value));
                      setProblem(null);
                    }}
                  />
                  <Button type="submit" variant="primary" loading={lookup.isPending}>
                    Look up
                  </Button>
                </div>
              )}
            </Field>
            {problem ? (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            ) : null}
            {found && state ? (
              <div className="grid gap-4 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[13px] font-semibold tracking-wide">
                    {found.code}
                  </span>
                  <Badge tone={state.tone}>{state.label}</Badge>
                </div>
                <Facts
                  items={[
                    ['Gives', `${describeDays(found.batch.days)} of ${found.batch.plan}`],
                    ['Batch', found.batch.name],
                    [
                      'Usable until',
                      found.batch.expiresAt ? formatDateTime(found.batch.expiresAt) : 'Without end',
                    ],
                    ...(found.redeemedAt
                      ? ([
                          [
                            'Used by',
                            found.redeemedBy ? (
                              <Link
                                key="viewer"
                                to={`/viewers?q=${encodeURIComponent(found.redeemedBy.email)}`}
                                className="underline underline-offset-4"
                              >
                                {found.redeemedBy.email}
                              </Link>
                            ) : (
                              'A deleted account'
                            ),
                          ],
                          ['Used', formatDateTime(found.redeemedAt)],
                        ] as [string, ReactNode][])
                      : []),
                  ]}
                />
                {mayWrite && found.state === 'unused' ? (
                  <Button
                    size="sm"
                    className="justify-self-start"
                    loading={withdraw.isPending}
                    onClick={() => withdraw.mutate(found)}
                  >
                    <Ban />
                    Withdraw this code
                  </Button>
                ) : null}
              </div>
            ) : null}
          </DialogBody>
        </form>
      </DialogContent>
    </Dialog>
  );
}
