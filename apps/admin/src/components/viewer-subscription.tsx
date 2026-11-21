// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CreditCard,
  ExternalLink,
  Gift,
  Pencil,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { billingApi } from '@/api/endpoints';
import type { Subscription } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import { Badge, ErrorNote, Skeleton } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlay';
import {
  describePrices,
  describeSubscription,
  endOfDay,
  GRANT_PRESETS,
  presetEnd,
} from '@/lib/billing';
import { formatDateTime, formatRelative } from '@/lib/format';

/** "until 21 Dec 2026, 12:00", "no end", or when a subscription paid online is charged next. */
function describeEnd(
  subscription: Pick<Subscription, 'endsAt' | 'running' | 'renewsAt' | 'status'>,
): string {
  if (subscription.running && subscription.status === 'PAST_DUE') {
    return 'Payment overdue, Stripe is trying again';
  }
  if (subscription.running && subscription.renewsAt) {
    return `${subscription.status === 'TRIALING' ? 'First payment' : 'Next payment'} ${formatDateTime(subscription.renewsAt)}`;
  }
  if (!subscription.endsAt) {
    return 'No end';
  }
  return `${subscription.running ? 'Until' : 'Ended'} ${formatDateTime(subscription.endsAt)}`;
}

/**
 * The subscription of one viewer, in the sheet of the Viewers page: what is
 * running, the history, and giving, changing and ending access by hand.
 */
export function ViewerSubscription({
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
  const [dialog, setDialog] = useState<'grant' | 'change' | null>(null);

  const subscriptions = useQuery({
    queryKey: ['billing', 'viewer', viewerId],
    queryFn: ({ signal }) => billingApi.subscriptionsOf(viewerId, signal),
    enabled: mayRead,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['billing'] });
    void queryClient.invalidateQueries({ queryKey: ['viewers'] });
  };

  const end = useMutation({
    mutationFn: (subscription: Subscription) => billingApi.end(subscription.id),
    onSuccess: () => {
      toast.success(`${viewerName} can no longer watch paid titles`);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const refreshFromStripe = useMutation({
    mutationFn: (subscription: Subscription) => billingApi.refresh(subscription.id),
    onSuccess: () => {
      toast.success('Read from Stripe again');
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!mayRead) {
    return null;
  }

  const current = subscriptions.data?.current ?? null;
  const earlier = (subscriptions.data?.history ?? []).filter((item) => item.id !== current?.id);

  const askEnd = async (subscription: Subscription) => {
    const confirmed = await confirm(
      subscription.online
        ? {
            title: `Cancel the subscription of ${viewerName}?`,
            description:
              'It is cancelled at Stripe now: nothing more is charged, and titles that need a subscription lock at once. Money already paid is not returned by this. To give some back, refund the payment in Stripe.',
            confirmLabel: 'Cancel subscription now',
            destructive: true,
          }
        : {
            title: `End the access of ${viewerName}?`,
            description:
              'They can no longer watch titles that need a subscription, starting now. Free titles stay open. You can grant access again at any time.',
            confirmLabel: 'End access now',
            destructive: true,
          },
    );
    if (confirmed) {
      end.mutate(subscription);
    }
  };

  return (
    <div>
      <h3 className="mb-2 text-[13px] font-medium">Subscription</h3>
      <ErrorNote error={subscriptions.error} />
      {subscriptions.isPending ? <Skeleton className="h-20 rounded-lg" /> : null}

      {subscriptions.data && !current ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
          <p className="text-sm text-muted-foreground">
            No subscription. Titles that need one stay locked for this viewer.
          </p>
          {mayWrite ? (
            <Button size="sm" onClick={() => setDialog('grant')}>
              <Gift />
              Grant access
            </Button>
          ) : null}
        </div>
      ) : null}

      {current ? (
        <div className="rounded-lg border p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {current.plan.name}
                <Badge tone={describeSubscription(current).tone} dot>
                  {describeSubscription(current).label}
                </Badge>
                <Badge>
                  {current.source === 'MANUAL' ? (
                    <Gift className="size-3" aria-hidden="true" />
                  ) : (
                    <CreditCard className="size-3" aria-hidden="true" />
                  )}
                  {current.source === 'MANUAL' ? 'Granted by hand' : 'Paid online'}
                </Badge>
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarClock className="size-3.5" aria-hidden="true" />
                {describeEnd(current)}
                {current.status === 'PAST_DUE' && current.online
                  ? ''
                  : current.renewsAt
                    ? ` (${formatRelative(current.renewsAt)})`
                    : current.endsAt
                      ? ` (${formatRelative(current.endsAt)})`
                      : ''}
              </p>
              {current.online ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {current.status === 'PAST_DUE'
                    ? 'The last payment failed. Stripe tries again, and the viewer keeps watching until it gives up.'
                    : current.cancelAtPeriodEnd
                      ? 'The viewer cancelled. Nothing more is charged.'
                      : `Paid ${current.interval === 'YEAR' ? 'yearly' : 'monthly'} through Stripe, which renews it by itself.`}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                Since {formatDateTime(current.startedAt)}
                {current.grantedBy ? `, by ${current.grantedBy.displayName}` : ''}
              </p>
              {current.note ? <p className="mt-2 border-l-2 pl-2 text-sm">{current.note}</p> : null}
            </div>
            {current.online ? (
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {current.externalUrl ? (
                  <Button size="sm" asChild>
                    <a href={current.externalUrl} target="_blank" rel="noreferrer">
                      Open in Stripe
                      <ExternalLink />
                    </a>
                  </Button>
                ) : null}
                {mayWrite ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={refreshFromStripe.isPending}
                      onClick={() => refreshFromStripe.mutate(current)}
                    >
                      <RefreshCw />
                      Refresh
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={end.isPending}
                      onClick={() => void askEnd(current)}
                    >
                      <XCircle />
                      Cancel now
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
            {mayWrite && current.source === 'MANUAL' ? (
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" onClick={() => setDialog('change')}>
                  <Pencil />
                  Change
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={end.isPending}
                  onClick={() => void askEnd(current)}
                >
                  <XCircle />
                  End now
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {earlier.length > 0 ? (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            {earlier.length === 1
              ? '1 earlier subscription'
              : `${earlier.length} earlier subscriptions`}
          </summary>
          <ul className="mt-2 divide-y rounded-lg border">
            {earlier.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
                <span className="flex items-center gap-2">
                  {item.online ? (
                    <CreditCard
                      className="size-3.5 text-muted-foreground"
                      aria-label="Paid online"
                    />
                  ) : null}
                  {item.plan.name}
                  <Badge tone={describeSubscription(item).tone}>
                    {describeSubscription(item).label}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(item.startedAt)} to{' '}
                  {item.endsAt ? formatDateTime(item.endsAt) : 'no end'}
                </span>
                {item.note ? (
                  <span className="basis-full text-xs text-muted-foreground">{item.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <GrantDialog
        open={dialog !== null}
        viewerId={viewerId}
        viewerName={viewerName}
        current={dialog === 'change' ? current : null}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
          }
        }}
        onSaved={() => {
          setDialog(null);
          refresh();
        }}
      />
    </div>
  );
}

interface GrantDialogProps {
  open: boolean;
  viewerId: string;
  viewerName: string;
  /** The subscription to change. Null to grant a new one. */
  current: Subscription | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function GrantDialog({
  open,
  viewerId,
  viewerName,
  current,
  onOpenChange,
  onSaved,
}: GrantDialogProps) {
  const [planId, setPlanId] = useState('');
  const [length, setLength] = useState('30');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');

  const plans = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: ({ signal }) => billingApi.plans(signal),
    enabled: open,
  });
  const overview = useQuery({
    queryKey: ['billing', 'overview'],
    queryFn: ({ signal }) => billingApi.overview(signal),
    enabled: open,
  });
  const currency = overview.data?.currency ?? 'EUR';
  // The plan on offer comes first. One that is no longer offered can still be granted.
  const firstPlan = (plans.data?.find((plan) => plan.isOffered) ?? plans.data?.[0])?.id ?? '';

  useEffect(() => {
    if (open) {
      setPlanId(current?.plan.id ?? '');
      // A change starts on what is set now: a date, or no end.
      setLength(current ? (current.endsAt ? 'custom' : 'open') : '30');
      setDate(current?.endsAt ? current.endsAt.slice(0, 10) : '');
      setNote(current?.note ?? '');
    }
  }, [open, current]);

  const chosenPlan = planId || firstPlan;
  const preset = GRANT_PRESETS.find((option) => option.value === length);
  const endsAt = length === 'custom' ? endOfDay(date) : presetEnd(preset?.days ?? null);
  const dateMissing = length === 'custom' && endsAt === null;
  const datePast = length === 'custom' && endsAt !== null && new Date(endsAt) <= new Date();

  const save = useMutation({
    mutationFn: () => {
      const body = { planId: chosenPlan, endsAt, note: note.trim() || null };
      return current ? billingApi.change(current.id, body) : billingApi.grant(viewerId, body);
    },
    onSuccess: (subscription) => {
      toast.success(
        current
          ? `Access of ${viewerName} changed`
          : `${viewerName} can watch with ${subscription.plan.name}`,
      );
      onSaved();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  const noPlans = plans.data !== undefined && plans.data.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={current ? `Change the access of ${viewerName}` : `Grant access to ${viewerName}`}
        description="For a viewer who paid you directly, in cash or by bank transfer, or who gets access as a gift. Nothing is charged."
      >
        {noPlans ? (
          <>
            <DialogBody>
              <p className="text-sm">
                There is no plan yet. Access is always through a plan, so create one first.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
              <Button asChild variant="primary">
                <Link to="/plans">Go to Plans</Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="contents">
            <DialogBody>
              <Field label="Plan">
                {(id) => (
                  <Select
                    id={id}
                    value={chosenPlan}
                    onValueChange={setPlanId}
                    options={(plans.data ?? []).map((plan) => ({
                      value: plan.id,
                      label: `${plan.name} (${describePrices(plan, currency)})${plan.isOffered ? '' : ', not offered'}`,
                    }))}
                  />
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="For how long" hint="Counted from now.">
                  {(id) => (
                    <Select
                      id={id}
                      value={length}
                      onValueChange={setLength}
                      options={GRANT_PRESETS.map(({ value, label }) => ({ value, label }))}
                    />
                  )}
                </Field>
                {length === 'custom' ? (
                  <Field
                    label="Last day"
                    hint={
                      datePast
                        ? 'Choose a day that is still to come.'
                        : 'Access lasts until the end of this day.'
                    }
                  >
                    {(id) => (
                      <Input
                        id={id}
                        type="date"
                        required
                        aria-invalid={datePast}
                        min={new Date().toISOString().slice(0, 10)}
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                      />
                    )}
                  </Field>
                ) : (
                  <div className="self-end pb-2 text-sm text-muted-foreground">
                    {endsAt ? `Until ${formatDateTime(endsAt)}` : 'Until you end it'}
                  </div>
                )}
              </div>
              <Field label="Note" hint="Only admins see it. For example how the viewer paid.">
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
                disabled={!chosenPlan || dateMissing || datePast}
              >
                {current ? 'Save' : 'Grant access'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
