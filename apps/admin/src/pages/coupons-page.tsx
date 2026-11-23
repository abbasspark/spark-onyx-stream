// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  Dices,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Tag,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { billingApi, couponsApi } from '@/api/endpoints';
import type { Coupon, CouponInput, CouponState, Plan } from '@/api/types';
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
import { Field, Input, Select, ToggleRow } from '@/components/ui/form';
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
import { formatMoney, toPriceText } from '@/lib/billing';
import { cn } from '@/lib/cn';
import {
  type CouponForm,
  describeLasts,
  describeOff,
  describeScope,
  describeUses,
  exampleOf,
  formProblem,
  generateCode,
  SCOPE_LABELS,
  STATE_LOOKS,
  toForm,
  toInput,
  usedShare,
} from '@/lib/coupons';
import { formatDateTime, formatDay, formatRelative } from '@/lib/format';

type Shown = 'all' | 'active' | 'scheduled' | 'over';
const SHOWN: { value: Shown; label: string; states: CouponState[] | null }[] = [
  { value: 'all', label: 'All', states: null },
  { value: 'active', label: 'Active', states: ['ACTIVE'] },
  { value: 'scheduled', label: 'Scheduled', states: ['SCHEDULED'] },
  { value: 'over', label: 'Over', states: ['ENDED', 'USED_UP', 'OFF'] },
];

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success(`${code} copied`);
  } catch {
    toast.error('The code could not be copied. Select it and copy it by hand.');
  }
}

/** Coupons: codes viewers enter before paying, for a lower price. */
export function CouponsPage() {
  const { can } = useSession();
  const mayWrite = can('billing:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown>('all');
  const [search, setSearch] = useState('');

  const overview = useQuery({
    queryKey: ['billing', 'overview'],
    queryFn: ({ signal }) => billingApi.overview(signal),
  });
  const coupons = useQuery({
    queryKey: ['coupons'],
    queryFn: ({ signal }) => couponsApi.list(signal),
  });
  const currency = overview.data?.currency ?? 'EUR';
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['coupons'] });
  const onError = (error: Error) => toast.error(error.message);

  const toggle = useMutation({
    mutationFn: (coupon: Coupon) => couponsApi.update(coupon.id, { isActive: !coupon.isActive }),
    onSuccess: (updated) => {
      toast.success(
        updated.isActive ? `${updated.code} takes uses again` : `${updated.code} is switched off`,
      );
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (coupon: Coupon) => couponsApi.remove(coupon.id),
    onSuccess: (_result, coupon) => {
      toast.success(`${coupon.code} deleted`);
      setOpenId(null);
      refresh();
    },
    onError,
  });

  const all = useMemo(() => coupons.data ?? [], [coupons.data]);
  const items = useMemo(() => {
    const states = SHOWN.find((entry) => entry.value === shown)?.states ?? null;
    const q = search.trim().toLowerCase();
    return all.filter(
      (coupon) =>
        (!states || states.includes(coupon.state)) &&
        (!q || coupon.code.toLowerCase().includes(q) || coupon.note?.toLowerCase().includes(q)),
    );
  }, [all, shown, search]);
  const open = all.find((coupon) => coupon.id === openId) ?? null;

  const askDelete = async (coupon: Coupon) => {
    const confirmed = await confirm({
      title: `Delete ${coupon.code}?`,
      description:
        'The code was never used, so nothing is lost with it. A code that was used stays in the books and can only be switched off.',
      confirmLabel: 'Delete coupon',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(coupon);
    }
  };

  const newButton = mayWrite ? (
    <Button variant="primary" onClick={() => setEditing('new')}>
      <Plus />
      New coupon
    </Button>
  ) : null;

  const menu = (coupon: Coupon) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`More for ${coupon.code}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={() => void copyCode(coupon.code)}>
          <Copy />
          Copy the code
        </DropdownMenuItem>
        {mayWrite ? (
          <>
            <DropdownMenuItem onSelect={() => setEditing(coupon)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toggle.mutate(coupon)}>
              {coupon.isActive ? <PowerOff /> : <Power />}
              {coupon.isActive ? 'Switch off' : 'Switch on'}
            </DropdownMenuItem>
            {coupon.used === 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => void askDelete(coupon)}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Codes a viewer enters before paying, for a lower price on a plan or on renting and buying a title."
        actions={newButton}
      />

      {overview.data && !overview.data.checkout ? (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <span className="font-medium">Viewers cannot use codes yet.</span>{' '}
            <span className="text-muted-foreground">
              A code is entered on the way to the payment page, and online payment is not set up on
              this site. You can prepare coupons now.
            </span>{' '}
            <Link to="/plans" className="underline underline-offset-4">
              Set up online payment
            </Link>
          </p>
        </div>
      ) : null}

      <ErrorNote error={coupons.error} className="mb-4" />
      {coupons.isPending ? <Skeleton className="h-64 rounded-xl" /> : null}

      {coupons.data && all.length === 0 ? (
        <EmptyState icon={Tag} title="No coupons yet" action={newButton}>
          Make a code for a newsletter, a partner or a season. You decide what it takes off, what it
          is for, how long it runs and how often it can be used.
        </EmptyState>
      ) : null}

      {all.length > 0 ? (
        <>
          <Summary coupons={all} currency={currency} />

          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div
              role="radiogroup"
              aria-label="Which coupons to show"
              className="inline-flex rounded-lg border bg-card p-0.5"
            >
              {SHOWN.map((entry) => {
                const count = entry.states
                  ? all.filter((coupon) => entry.states?.includes(coupon.state)).length
                  : all.length;
                return (
                  <button
                    key={entry.value}
                    type="button"
                    role="radio"
                    aria-checked={shown === entry.value}
                    onClick={() => setShown(entry.value)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground',
                      shown === entry.value && 'bg-accent text-foreground',
                    )}
                  >
                    {entry.label}
                    <span className="text-xs tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative min-w-48 flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                className="pl-9"
                placeholder="Search by code or note"
                aria-label="Search by code or note"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <Card className="overflow-hidden">
            {items.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No coupon matches.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Code</Th>
                    <Th>Takes off</Th>
                    <Th className="hidden lg:table-cell">For</Th>
                    <Th>Used</Th>
                    <Th className="hidden md:table-cell">Runs</Th>
                    <Th>State</Th>
                    {/* Positioned, so the words for screen readers stay inside the table. */}
                    <Th className="relative w-10">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((coupon) => {
                    const share = usedShare(coupon);
                    const lasts = describeLasts(coupon);
                    const look = STATE_LOOKS[coupon.state];
                    return (
                      <Tr
                        key={coupon.id}
                        className="cursor-pointer"
                        onClick={() => setOpenId(coupon.id)}
                      >
                        <Td>
                          <button
                            type="button"
                            className="block max-w-56 truncate font-mono text-[13px] font-semibold tracking-wide hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenId(coupon.id);
                            }}
                          >
                            {coupon.code}
                          </button>
                          {coupon.note ? (
                            <p className="max-w-56 truncate text-xs text-muted-foreground">
                              {coupon.note}
                            </p>
                          ) : null}
                        </Td>
                        <Td>
                          <span className="font-medium">{describeOff(coupon, currency)}</span>
                          {lasts ? (
                            <p className="text-xs text-muted-foreground">on {lasts}</p>
                          ) : null}
                        </Td>
                        <Td className="hidden max-w-56 truncate text-muted-foreground lg:table-cell">
                          {describeScope(coupon)}
                        </Td>
                        <Td>
                          <span className="tabular-nums">{describeUses(coupon)}</span>
                          {share !== null ? (
                            <div
                              className="mt-1.5 h-1 w-24 overflow-hidden rounded-full bg-muted"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(share * 100)}
                              aria-label={`${coupon.code}: uses`}
                            >
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  share >= 1 ? 'bg-warning' : 'bg-primary',
                                )}
                                style={{ width: `${share * 100}%` }}
                              />
                            </div>
                          ) : null}
                        </Td>
                        <Td className="hidden text-muted-foreground md:table-cell">
                          {describeRuns(coupon)}
                        </Td>
                        <Td>
                          <Badge tone={look.tone} title={look.about}>
                            {look.label}
                          </Badge>
                        </Td>
                        <Td className="text-right">{menu(coupon)}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      ) : null}

      <CouponDialog
        coupon={editing === 'new' ? null : editing}
        open={editing !== null}
        currency={currency}
        onOpenChange={(next) => {
          if (!next) {
            setEditing(null);
          }
        }}
        onSaved={(saved, created) => {
          setEditing(null);
          toast.success(created ? `${saved.code} is ready to hand out` : `${saved.code} saved`);
          refresh();
        }}
      />

      <CouponSheet
        coupon={open}
        currency={currency}
        mayWrite={mayWrite}
        onClose={() => setOpenId(null)}
        onEdit={(coupon) => setEditing(coupon)}
        onToggle={(coupon) => toggle.mutate(coupon)}
        onDelete={(coupon) => void askDelete(coupon)}
      />
    </>
  );
}

/** From when until when a coupon can be entered, in a few words. */
function describeRuns(coupon: Pick<Coupon, 'startsAt' | 'endsAt'>): string {
  if (coupon.startsAt && coupon.endsAt) {
    return `${formatDay(coupon.startsAt)} to ${formatDay(coupon.endsAt)}`;
  }
  if (coupon.endsAt) {
    return `Until ${formatDay(coupon.endsAt)}`;
  }
  if (coupon.startsAt) {
    return `From ${formatDay(coupon.startsAt)}`;
  }
  return 'Without end';
}

function Summary({ coupons, currency }: { coupons: Coupon[]; currency: string }) {
  const active = coupons.filter((coupon) => coupon.state === 'ACTIVE').length;
  const scheduled = coupons.filter((coupon) => coupon.state === 'SCHEDULED').length;
  const used = coupons.reduce((sum, coupon) => sum + coupon.used, 0);
  const given = coupons.reduce((sum, coupon) => sum + coupon.discountTotal, 0);
  const best = [...coupons].sort((a, b) => b.used - a.used)[0];
  const figures = [
    {
      label: 'Active codes',
      value: String(active),
      note: scheduled > 0 ? `${scheduled} more scheduled` : `Of ${coupons.length} in all`,
    },
    { label: 'Uses', value: used.toLocaleString('en'), note: 'Checkouts completed with a code' },
    {
      label: 'Taken off',
      value: formatMoney(given, currency),
      note: 'From first payments, by all codes',
    },
    {
      label: 'Most used',
      value: best && best.used > 0 ? best.code : 'None yet',
      note: best && best.used > 0 ? `${best.used} ${best.used === 1 ? 'use' : 'uses'}` : ' ',
    },
  ];
  return (
    <Card className="mb-4">
      <CardContent className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 xl:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label} className="min-w-0">
            <p className="text-xs text-muted-foreground">{figure.label}</p>
            <p className="mt-1 truncate text-2xl font-semibold tabular-nums">{figure.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{figure.note}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface CouponSheetProps {
  coupon: Coupon | null;
  currency: string;
  mayWrite: boolean;
  onClose: () => void;
  onEdit: (coupon: Coupon) => void;
  onToggle: (coupon: Coupon) => void;
  onDelete: (coupon: Coupon) => void;
}

/** One coupon: its terms, and who used it. */
function CouponSheet({
  coupon,
  currency,
  mayWrite,
  onClose,
  onEdit,
  onToggle,
  onDelete,
}: CouponSheetProps) {
  const [page, setPage] = useState(1);
  const id = coupon?.id;
  useEffect(() => setPage(1), [id]);
  const uses = useQuery({
    queryKey: ['coupons', 'redemptions', id, page],
    queryFn: ({ signal }) => couponsApi.redemptions(id as string, page, signal),
    enabled: id !== undefined,
    placeholderData: keepPreviousData,
  });
  const look = coupon ? STATE_LOOKS[coupon.state] : null;
  const lasts = coupon ? describeLasts(coupon) : null;

  return (
    <Dialog open={coupon !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        variant="sheet"
        size="md"
        title={coupon?.code ?? 'Coupon'}
        description={coupon?.note ?? 'A coupon code'}
      >
        {coupon && look ? (
          <DialogBody>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={look.tone}>{look.label}</Badge>
              <span className="text-sm text-muted-foreground">{look.about}</span>
              <Button size="sm" className="ml-auto" onClick={() => void copyCode(coupon.code)}>
                <Copy />
                Copy the code
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                ['Used', describeUses(coupon)],
                ['Taken off', formatMoney(coupon.discountTotal, currency)],
                ['Last used', coupon.lastUsedAt ? formatRelative(coupon.lastUsedAt) : 'Never'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            <Facts
              items={[
                ['Takes off', describeOff(coupon, currency)],
                ...(lasts ? ([['On', lasts]] as [string, string][]) : []),
                ['For', describeScope(coupon)],
                ['Runs', describeRuns(coupon)],
                ['Per viewer', coupon.oncePerViewer ? 'Once' : 'As often as they like'],
                [
                  'Who',
                  coupon.newCustomersOnly
                    ? 'Viewers who have not paid on this site yet'
                    : 'Every viewer',
                ],
                ['Made', formatDateTime(coupon.createdAt)],
              ]}
            />

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="text-[13px] font-medium">Who used it</h3>
                {uses.data && uses.data.total > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {uses.data.total} {uses.data.total === 1 ? 'checkout' : 'checkouts'}
                  </p>
                ) : null}
              </div>
              <ErrorNote error={uses.error} />
              {uses.isPending ? <Skeleton className="h-20 rounded-lg" /> : null}
              {uses.data && uses.data.items.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  Nobody has paid with this code yet. Opening the payment page does not count: a use
                  is written down when the checkout is completed.
                </p>
              ) : null}
              {uses.data && uses.data.items.length > 0 ? (
                <>
                  <ul className="divide-y rounded-lg border">
                    {uses.data.items.map((use) => (
                      <li key={use.id} className="flex items-start gap-3 p-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{use.viewer.email}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {
                              {
                                SUBSCRIPTION: 'Subscribed to',
                                RENTAL: 'Rented',
                                PURCHASE: 'Bought',
                              }[use.kind]
                            }{' '}
                            {use.subject}, {formatRelative(use.createdAt)}
                            {use.viewer.id === null ? ', account deleted since' : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-medium tabular-nums">
                            −{formatMoney(use.discountAmount, use.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            of {formatMoney(use.listAmount, use.currency)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {uses.data.total > uses.data.pageSize ? (
                    <div className="mt-2">
                      <Pagination
                        page={page}
                        pageSize={uses.data.pageSize}
                        total={uses.data.total}
                        onChange={setPage}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </DialogBody>
        ) : null}
        {coupon && mayWrite ? (
          <DialogFooter>
            {coupon.used === 0 ? (
              <Button variant="ghost" className="mr-auto" onClick={() => onDelete(coupon)}>
                <Trash2 />
                Delete
              </Button>
            ) : null}
            <Button onClick={() => onToggle(coupon)}>
              {coupon.isActive ? <PowerOff /> : <Power />}
              {coupon.isActive ? 'Switch off' : 'Switch on'}
            </Button>
            <Button variant="primary" onClick={() => onEdit(coupon)}>
              <Pencil />
              Edit
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface CouponDialogProps {
  coupon: Coupon | null;
  open: boolean;
  currency: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (coupon: Coupon, created: boolean) => void;
}

function CouponDialog({ coupon, open, currency, onOpenChange, onSaved }: CouponDialogProps) {
  const [form, setForm] = useState<CouponForm>(() => toForm(null, currency));
  const [problem, setProblem] = useState<string | null>(null);
  const set = (change: Partial<CouponForm>) => {
    setForm((current) => ({ ...current, ...change }));
    setProblem(null);
  };

  useEffect(() => {
    if (open) {
      setForm(toForm(coupon, currency));
      setProblem(null);
    }
  }, [open, coupon, currency]);

  const plans = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: ({ signal }) => billingApi.plans(signal),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: (input: CouponInput) =>
      coupon ? couponsApi.update(coupon.id, input) : couponsApi.create(input),
    onSuccess: (saved) => onSaved(saved, coupon === null),
    onError: (error: Error) => setProblem(error.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = formProblem(form, currency);
    if (found) {
      setProblem(found);
      return;
    }
    save.mutate(toInput(form, currency));
  };

  const forPlans = form.scope !== 'TITLES';
  // An example with a real price of the site, when there is one.
  const sample = samplePrice(plans.data, form);
  const after = sample ? exampleOf(form, sample.amount, currency) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={coupon ? `Edit ${coupon.code}` : 'New coupon'}
        description="A code a viewer enters before paying. The price is lowered on the payment page."
        size="lg"
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            {coupon && coupon.used > 0 ? (
              <p className="rounded-lg border border-info/25 bg-info/5 p-3 text-sm text-muted-foreground">
                This code was used {coupon.used} {coupon.used === 1 ? 'time' : 'times'}. Viewers who
                subscribed with it keep the terms they got: what you change counts from the next
                checkout on.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" hint="What the viewer types. Letters, digits and hyphens.">
                {(id) => (
                  <div className="flex gap-2">
                    <Input
                      id={id}
                      required
                      autoFocus={!coupon}
                      maxLength={40}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="WELCOME20"
                      className="font-mono tracking-wide uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case"
                      value={form.code}
                      onChange={(event) => set({ code: event.target.value })}
                    />
                    <Button
                      type="button"
                      size="icon"
                      aria-label="Make up a code"
                      title="Make up a code nobody will guess"
                      onClick={() => set({ code: generateCode() })}
                    >
                      <Dices />
                    </Button>
                  </div>
                )}
              </Field>
              <Field label="Note" hint="What it is for. Only admins see it.">
                {(id) => (
                  <Input
                    id={id}
                    maxLength={200}
                    placeholder="Newsletter of December"
                    value={form.note}
                    onChange={(event) => set({ note: event.target.value })}
                  />
                )}
              </Field>
            </div>

            <fieldset className="grid gap-3 rounded-lg border p-4">
              <legend className="px-1 text-[13px] font-medium">What it takes off</legend>
              <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,12rem)_minmax(0,1fr)] sm:items-end">
                <div
                  role="radiogroup"
                  aria-label="Kind of discount"
                  className="inline-flex h-9 rounded-lg border bg-muted/40 p-0.5"
                >
                  {(
                    [
                      ['PERCENT', 'A share'],
                      ['AMOUNT', 'A sum'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={form.kind === value}
                      onClick={() => set({ kind: value })}
                      className={cn(
                        'rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground',
                        form.kind === value && 'bg-card text-foreground shadow-xs',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {form.kind === 'PERCENT' ? (
                  <Field label="Percent off">
                    {(id) => (
                      <Input
                        id={id}
                        inputMode="numeric"
                        placeholder="20"
                        value={form.percent}
                        onChange={(event) => set({ percent: event.target.value })}
                      />
                    )}
                  </Field>
                ) : (
                  <Field label={`Sum off (${currency})`}>
                    {(id) => (
                      <Input
                        id={id}
                        inputMode="decimal"
                        placeholder={toPriceText(500, currency)}
                        value={form.amount}
                        onChange={(event) => set({ amount: event.target.value })}
                      />
                    )}
                  </Field>
                )}
                <p className="pb-2 text-sm text-muted-foreground" aria-live="polite">
                  {sample && after !== null ? (
                    <>
                      {sample.name}:{' '}
                      <s className="opacity-70">{formatMoney(sample.amount, currency)}</s>{' '}
                      <span className="font-medium text-foreground">
                        {after === 0 ? 'free' : formatMoney(after, currency)}
                      </span>
                    </>
                  ) : (
                    'The price is never lowered below nothing.'
                  )}
                </p>
              </div>
            </fieldset>

            <fieldset className="grid gap-4 rounded-lg border p-4">
              <legend className="px-1 text-[13px] font-medium">What it is for</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Applies to">
                  {(id) => (
                    <Select
                      id={id}
                      value={form.scope}
                      onValueChange={(value) => set({ scope: value as CouponForm['scope'] })}
                      options={(Object.keys(SCOPE_LABELS) as CouponForm['scope'][]).map(
                        (value) => ({
                          value,
                          label: SCOPE_LABELS[value].label,
                        }),
                      )}
                    />
                  )}
                </Field>
                {forPlans ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
                    <Field label="A subscription costs less">
                      {(id) => (
                        <Select
                          id={id}
                          value={form.duration}
                          onValueChange={(value) =>
                            set({ duration: value as CouponForm['duration'] })
                          }
                          options={[
                            { value: 'ONCE', label: 'On the first payment' },
                            { value: 'REPEATING', label: 'For a number of months' },
                            { value: 'FOREVER', label: 'On every payment' },
                          ]}
                        />
                      )}
                    </Field>
                    {form.duration === 'REPEATING' ? (
                      <Field label="Months">
                        {(id) => (
                          <Input
                            id={id}
                            inputMode="numeric"
                            value={form.months}
                            onChange={(event) => set({ months: event.target.value })}
                          />
                        )}
                      </Field>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {forPlans ? (
                <div className="grid gap-2">
                  <p className="text-[13px] font-medium">Plans</p>
                  {plans.data && plans.data.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      There are no plans yet. The code will be for every plan you make.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Chip chosen={form.planIds.length === 0} onClick={() => set({ planIds: [] })}>
                        Every plan
                      </Chip>
                      {plans.data?.map((plan) => {
                        const chosen = form.planIds.includes(plan.id);
                        return (
                          <Chip
                            key={plan.id}
                            chosen={chosen}
                            onClick={() =>
                              set({
                                planIds: chosen
                                  ? form.planIds.filter((entry) => entry !== plan.id)
                                  : [...form.planIds, plan.id],
                              })
                            }
                          >
                            {plan.name}
                          </Chip>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </fieldset>

            <fieldset className="grid gap-4 rounded-lg border p-4">
              <legend className="px-1 text-[13px] font-medium">Limits</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First day" hint="Empty: from now on.">
                  {(id) => (
                    <Input
                      id={id}
                      type="datetime-local"
                      value={form.from}
                      onChange={(event) => set({ from: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Last day" hint="Empty: until you switch it off.">
                  {(id) => (
                    <Input
                      id={id}
                      type="datetime-local"
                      value={form.until}
                      onChange={(event) => set({ until: event.target.value })}
                    />
                  )}
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-start">
                <ToggleRow
                  label="Limit how often it can be used in all"
                  description="For a number of free months to give away, or the first hundred to come."
                  checked={form.limited}
                  onCheckedChange={(limited) => set({ limited })}
                />
                {form.limited ? (
                  <Field label="Uses">
                    {(id) => (
                      <Input
                        id={id}
                        inputMode="numeric"
                        value={form.max}
                        onChange={(event) => set({ max: event.target.value })}
                      />
                    )}
                  </Field>
                ) : null}
              </div>
              <ToggleRow
                label="Once per viewer"
                description="Off, the same viewer can use it for every payment they start."
                checked={form.oncePerViewer}
                onCheckedChange={(oncePerViewer) => set({ oncePerViewer })}
              />
              <ToggleRow
                label="Only for a first payment"
                description="For viewers who have not paid anything on this site yet."
                checked={form.newCustomersOnly}
                onCheckedChange={(newCustomersOnly) => set({ newCustomersOnly })}
              />
            </fieldset>

            <ToggleRow
              label="Switched on"
              description="Off, the code is kept with its history and takes no more uses."
              checked={form.isActive}
              onCheckedChange={(isActive) => set({ isActive })}
            />
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
              {coupon ? 'Save' : 'Create coupon'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A price of the site to show the discount with: of a chosen plan, or of the first one. */
function samplePrice(
  plans: Plan[] | undefined,
  form: Pick<CouponForm, 'scope' | 'planIds'>,
): { name: string; amount: number } | null {
  if (form.scope === 'TITLES') {
    return null;
  }
  const sold = plans?.filter((entry) => entry.monthlyAmount !== null) ?? [];
  // A plan the code is limited to, else one viewers are offered, else any.
  const plan =
    sold.find((entry) => form.planIds.includes(entry.id)) ??
    sold.find((entry) => entry.isOffered) ??
    sold[0];
  return plan && plan.monthlyAmount !== null
    ? { name: `${plan.name} a month`, amount: plan.monthlyAmount }
    : null;
}

function Chip({
  chosen,
  onClick,
  children,
}: {
  chosen: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={chosen}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors hover:bg-accent',
        chosen && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
      )}
    >
      {chosen ? <Check className="size-3.5" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
