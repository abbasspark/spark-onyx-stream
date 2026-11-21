// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, Gift, Infinity as InfinityIcon, Search, Undo2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { purchasesApi, titlesApi } from '@/api/endpoints';
import type { Purchase, TitleSummary } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import { Badge, ErrorNote, Skeleton } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { formatMoney, parsePrice } from '@/lib/billing';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';

const SEARCH_DELAY_MS = 250;

/** How a rented or bought title stands, in words and a tone for its badge. */
export function describePurchase(
  purchase: Pick<Purchase, 'kind' | 'status' | 'valid' | 'startedAt'>,
): {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
} {
  if (purchase.status === 'REVOKED') {
    return { label: 'Taken back', tone: 'neutral' };
  }
  if (!purchase.valid) {
    return { label: 'Ran out', tone: 'neutral' };
  }
  if (purchase.kind === 'BUY') {
    return { label: 'Bought', tone: 'success' };
  }
  return purchase.startedAt
    ? { label: 'Rented, watching', tone: 'warning' }
    : { label: 'Rented, not started', tone: 'success' };
}

/**
 * The titles one viewer rented or bought, in the sheet of the Viewers page,
 * and giving a title by hand or taking one back.
 */
export function ViewerPurchases({
  viewerId,
  viewerName,
}: {
  viewerId: string;
  viewerName: string;
}) {
  const { can } = useSession();
  const mayRead = can('billing:read');
  const mayWrite = can('billing:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [giving, setGiving] = useState(false);

  const purchases = useQuery({
    queryKey: ['billing', 'viewer-purchases', viewerId],
    queryFn: ({ signal }) => purchasesApi.ofViewer(viewerId, signal),
    enabled: mayRead,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['billing'] });
  const revoke = useMutation({
    mutationFn: (purchase: Purchase) => purchasesApi.revoke(purchase.id),
    onSuccess: (purchase) => {
      toast.success(`${purchase.title.name} taken back`);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!mayRead) {
    return null;
  }
  const items = purchases.data?.items ?? [];

  const askRevoke = async (purchase: Purchase) => {
    const confirmed = await confirm({
      title: `Take ${purchase.title.name} back from ${viewerName}?`,
      description:
        purchase.source === 'STRIPE'
          ? 'They can no longer watch it, starting now. Money is not returned by this: refund the payment in Stripe, which takes the title back by itself when all of it is returned.'
          : 'They can no longer watch it, starting now. You can give it again at any time.',
      confirmLabel: 'Take back',
      destructive: true,
    });
    if (confirmed) {
      revoke.mutate(purchase);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-medium">Rented and bought</h3>
        {mayWrite ? (
          <Button size="sm" variant="ghost" onClick={() => setGiving(true)}>
            <Gift />
            Give a title
          </Button>
        ) : null}
      </div>
      <ErrorNote error={purchases.error} />
      {purchases.isPending ? <Skeleton className="h-14 rounded-lg" /> : null}
      {purchases.data && items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No single titles.
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {items.map((purchase) => {
            const state = describePurchase(purchase);
            return (
              <li key={purchase.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={cn('font-medium', !purchase.valid && 'text-muted-foreground')}>
                      {purchase.title.name}
                    </span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {purchase.valid ? (
                      purchase.expiresAt ? (
                        <>
                          <Clock className="size-3" aria-hidden="true" />
                          {purchase.startedAt ? 'Until' : 'To start by'}{' '}
                          {formatDateTime(purchase.expiresAt)} ({formatRelative(purchase.expiresAt)}
                          )
                        </>
                      ) : (
                        <>
                          <InfinityIcon className="size-3" aria-hidden="true" />
                          No end
                        </>
                      )
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateTime(purchase.purchasedAt)},{' '}
                    {purchase.amount !== null && purchase.currency
                      ? formatMoney(purchase.amount, purchase.currency)
                      : 'no payment'}
                    {purchase.source === 'STRIPE' ? ', online' : ''}
                    {purchase.grantedBy ? `, given by ${purchase.grantedBy.displayName}` : ''}
                  </p>
                  {purchase.note ? <p className="mt-1 text-xs">{purchase.note}</p> : null}
                </div>
                {mayWrite && purchase.valid ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Take back ${purchase.title.name}`}
                    onClick={() => void askRevoke(purchase)}
                  >
                    <Undo2 />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <GiveDialog
        open={giving}
        viewerId={viewerId}
        viewerName={viewerName}
        onOpenChange={setGiving}
        onSaved={() => {
          setGiving(false);
          refresh();
        }}
      />
    </div>
  );
}

interface GiveDialogProps {
  open: boolean;
  viewerId: string;
  viewerName: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function GiveDialog({ open, viewerId, viewerName, onOpenChange, onSaved }: GiveDialogProps) {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [title, setTitle] = useState<TitleSummary | null>(null);
  const [kind, setKind] = useState<'RENT' | 'BUY'>('BUY');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setSearch('');
      setQ('');
      setTitle(null);
      setKind('BUY');
      setAmount('');
      setNote('');
    }
  }, [open]);
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const currencyQuery = useQuery({
    queryKey: ['billing', 'currency'],
    queryFn: ({ signal }) => purchasesApi.currency(signal),
    enabled: open,
    staleTime: 300_000,
  });
  const currency = currencyQuery.data ?? 'EUR';
  const titles = useQuery({
    queryKey: ['titles', 'give-picker', q],
    queryFn: ({ signal }) =>
      titlesApi.list(
        { page: 1, q: q || undefined, access: 'PAID', pageSize: 6, sort: 'name', order: 'asc' },
        signal,
      ),
    enabled: open && title === null,
  });

  const parsed = parsePrice(amount, currency);
  const amountBad = parsed === 'invalid';
  const save = useMutation({
    mutationFn: () =>
      purchasesApi.grant(viewerId, {
        titleId: (title as TitleSummary).id,
        kind,
        amount: typeof parsed === 'number' ? parsed : null,
        note: note.trim() || null,
      }),
    onSuccess: (purchase) => {
      toast.success(`${viewerName} can watch ${purchase.title.name}`);
      onSaved();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Give ${viewerName} a title`}
        description="For a title paid in cash, or as a gift. The viewer can watch it whatever plan they have. Nothing is charged."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            {title ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                  <span className="truncate">{title.name}</span>
                  {title.releaseYear ? (
                    <span className="font-normal text-muted-foreground">{title.releaseYear}</span>
                  ) : null}
                </p>
                <Button type="button" size="sm" variant="ghost" onClick={() => setTitle(null)}>
                  Choose another
                </Button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    autoFocus
                    placeholder="Search paid titles by name"
                    aria-label="Search paid titles by name"
                    className="pl-9"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <ErrorNote error={titles.error} className="mt-2" />
                {titles.isPending ? (
                  <Skeleton className="mt-2 h-24 rounded-lg" />
                ) : (titles.data?.items.length ?? 0) === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    {q
                      ? 'No paid title matches.'
                      : 'There are no paid titles. A free title needs no giving.'}
                  </p>
                ) : (
                  <ul className="mt-2 divide-y rounded-lg border">
                    {titles.data?.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 p-2.5 text-left text-sm hover:bg-accent"
                          onClick={() => setTitle(item)}
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{item.name}</span>
                            {item.releaseYear ? (
                              <span className="text-muted-foreground"> {item.releaseYear}</span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {item.type === 'SERIES' ? 'Series' : 'Movie'}
                            {item.status === 'PUBLISHED' ? '' : ', not published'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="As"
                hint={kind === 'RENT' ? 'Runs like a rental paid online.' : 'Theirs for good.'}
              >
                {(id) => (
                  <Select
                    id={id}
                    value={kind}
                    onValueChange={(value) => setKind(value as 'RENT' | 'BUY')}
                    options={[
                      { value: 'BUY', label: 'Bought' },
                      { value: 'RENT', label: 'Rented' },
                    ]}
                  />
                )}
              </Field>
              <Field
                label={`Received (${currency})`}
                hint={
                  amountBad
                    ? 'Write the amount as a number, such as 3.99.'
                    : 'Goes into the revenue figures. Empty for a gift.'
                }
              >
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    placeholder="Nothing"
                    aria-invalid={amountBad}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label="Note" hint="Only admins see it.">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={300}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              )}
            </Field>
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={title === null || amountBad}
            >
              Give title
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
