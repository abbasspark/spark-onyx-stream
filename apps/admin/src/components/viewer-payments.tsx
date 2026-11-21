// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, ExternalLink, FileText, Gift, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { billingApi, paymentsApi } from '@/api/endpoints';
import type { Payment } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import { Badge, ErrorNote, Skeleton } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { describePayment, formatMoney, parsePrice, startOfDay } from '@/lib/billing';
import { formatDateTime } from '@/lib/format';

const NO_PLAN = 'none';
const today = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * What one viewer paid, in the sheet of the Viewers page, and writing down
 * money that was received by hand.
 */
export function ViewerPayments({ viewerId, viewerName }: { viewerId: string; viewerName: string }) {
  const { can } = useSession();
  const mayRead = can('billing:read');
  const mayWrite = can('billing:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [recording, setRecording] = useState(false);

  const payments = useQuery({
    queryKey: ['billing', 'viewer-payments', viewerId],
    queryFn: ({ signal }) => paymentsApi.ofViewer(viewerId, signal),
    enabled: mayRead,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['billing'] });
  const remove = useMutation({
    mutationFn: (payment: Payment) => paymentsApi.remove(payment.id),
    onSuccess: () => {
      toast.success('Payment taken out of the books');
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!mayRead) {
    return null;
  }

  const items = payments.data?.items ?? [];
  const currency = items[0]?.currency;
  const total = items
    .filter((payment) => payment.currency === currency)
    .reduce((sum, payment) => sum + payment.netAmount, 0);

  const askRemove = async (payment: Payment) => {
    const confirmed = await confirm({
      title: 'Take this payment out of the books?',
      description: `${formatMoney(payment.amount, payment.currency)} from ${formatDateTime(payment.paidAt)}. Use this for a payment that was entered by mistake. The access of ${viewerName} does not change.`,
      confirmLabel: 'Delete payment',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(payment);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-medium">
          Payments
          {items.length > 0 && currency ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {formatMoney(total, currency)} in {items.length}
            </span>
          ) : null}
        </h3>
        {mayWrite ? (
          <Button size="sm" variant="ghost" onClick={() => setRecording(true)}>
            <Banknote />
            Record a payment
          </Button>
        ) : null}
      </div>
      <ErrorNote error={payments.error} />
      {payments.isPending ? <Skeleton className="h-14 rounded-lg" /> : null}
      {payments.data && items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Nothing paid yet.
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {items.map((payment) => {
            const state = describePayment(payment);
            return (
              <li key={payment.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium tabular-nums">
                      {formatMoney(payment.amount, payment.currency)}
                    </span>
                    {payment.status === 'PAID' ? null : (
                      <Badge tone={state.tone}>{state.label}</Badge>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {payment.source === 'STRIPE' ? (
                        <CreditCard className="size-3" aria-hidden="true" />
                      ) : (
                        <Gift className="size-3" aria-hidden="true" />
                      )}
                      {payment.source === 'STRIPE' ? 'Online' : 'By hand'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateTime(payment.paidAt)}
                    {payment.kind === 'SUBSCRIPTION'
                      ? payment.planName
                        ? `, ${payment.planName}`
                        : ''
                      : `, ${payment.kind === 'RENTAL' ? 'rented' : 'bought'} ${payment.titleName ?? 'a title'}`}
                    {payment.refundedAmount > 0
                      ? `, ${formatMoney(payment.refundedAmount, payment.currency)} returned`
                      : ''}
                    {payment.recordedBy ? `, by ${payment.recordedBy.displayName}` : ''}
                  </p>
                  {payment.note ? <p className="mt-1 text-xs">{payment.note}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {payment.invoiceUrl ? (
                    <Button size="icon-sm" variant="ghost" asChild>
                      <a
                        href={payment.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Invoice ${payment.invoiceNumber ?? ''}`}
                      >
                        <FileText />
                      </a>
                    </Button>
                  ) : null}
                  {payment.externalUrl ? (
                    <Button size="icon-sm" variant="ghost" asChild>
                      <a
                        href={payment.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open in Stripe"
                      >
                        <ExternalLink />
                      </a>
                    </Button>
                  ) : null}
                  {mayWrite && payment.source === 'MANUAL' ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete payment"
                      onClick={() => void askRemove(payment)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <RecordDialog
        open={recording}
        viewerId={viewerId}
        viewerName={viewerName}
        onOpenChange={setRecording}
        onSaved={() => {
          setRecording(false);
          refresh();
        }}
      />
    </div>
  );
}

interface RecordDialogProps {
  open: boolean;
  viewerId: string;
  viewerName: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function RecordDialog({ open, viewerId, viewerName, onOpenChange, onSaved }: RecordDialogProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [planId, setPlanId] = useState('');
  const [note, setNote] = useState('');

  const overview = useQuery({
    queryKey: ['billing', 'overview'],
    queryFn: ({ signal }) => billingApi.overview(signal),
    enabled: open,
    staleTime: 60_000,
  });
  const plans = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: ({ signal }) => billingApi.plans(signal),
    enabled: open,
  });
  const subscriptions = useQuery({
    queryKey: ['billing', 'viewer', viewerId],
    queryFn: ({ signal }) => billingApi.subscriptionsOf(viewerId, signal),
    enabled: open,
  });
  const currency = overview.data?.currency ?? 'EUR';
  const currentPlan = subscriptions.data?.current?.plan.id;

  useEffect(() => {
    if (open) {
      setAmount('');
      setDate(today());
      setNote('');
      setPlanId('');
    }
  }, [open]);

  const chosenPlan = planId || currentPlan || NO_PLAN;
  const parsed = parsePrice(amount, currency);
  const amountBad = amount.trim() !== '' && parsed === 'invalid';
  const dateFuture = date > today();

  const save = useMutation({
    mutationFn: () =>
      paymentsApi.record(viewerId, {
        amount: parsed as number,
        // Today means now. An earlier day is noted at noon.
        paidAt: date === today() ? undefined : (startOfDay(date) ?? undefined),
        planId: chosenPlan === NO_PLAN ? undefined : chosenPlan,
        note: note.trim() || null,
      }),
    onSuccess: (payment) => {
      toast.success(
        `${formatMoney(payment.amount, payment.currency)} from ${viewerName} written down`,
      );
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
        title={`Record a payment of ${viewerName}`}
        description="For money you received yourself: cash, a bank transfer, a reseller. It goes into the revenue figures. Nothing is charged, and the access of the viewer does not change."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={`Amount (${currency})`}
                hint={amountBad ? 'Write the amount as a number, such as 7.99.' : undefined}
              >
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    autoFocus
                    required
                    aria-invalid={amountBad}
                    placeholder="0.00"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Received on"
                hint={dateFuture ? 'Choose today or a day in the past.' : undefined}
              >
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    required
                    aria-invalid={dateFuture}
                    max={today()}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label="For the plan" hint="Shows in the revenue by plan.">
              {(id) => (
                <Select
                  id={id}
                  value={chosenPlan}
                  onValueChange={setPlanId}
                  options={[
                    { value: NO_PLAN, label: 'No plan' },
                    ...(plans.data ?? []).map((plan) => ({
                      value: plan.id,
                      label: plan.id === currentPlan ? `${plan.name} (their plan)` : plan.name,
                    })),
                  ]}
                />
              )}
            </Field>
            <Field label="Note" hint="Only admins see it. For example a receipt number.">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={500}
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
              disabled={typeof parsed !== 'number' || dateFuture || !date}
            >
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
