// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { billingApi } from '@/api/endpoints';
import type { BillingOverview, Plan, PlanInput } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { StripePanel } from '@/components/stripe-panel';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
} from '@/components/ui/display';
import { Field, Input, Textarea, ToggleRow } from '@/components/ui/form';
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
import { formatMoney, parsePrice, toPriceText, yearlySaving } from '@/lib/billing';
import { cn } from '@/lib/cn';

/** The plans viewers can subscribe to, and how billing is doing. */
export function PlansPage() {
  const { can } = useSession();
  const mayWrite = can('billing:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);

  const overview = useQuery({
    queryKey: ['billing', 'overview'],
    queryFn: ({ signal }) => billingApi.overview(signal),
  });
  const plans = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: ({ signal }) => billingApi.plans(signal),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['billing'] });
  const onError = (error: Error) => toast.error(error.message);

  const update = useMutation({
    mutationFn: ({ plan, change }: { plan: Plan; change: Partial<PlanInput> }) =>
      billingApi.updatePlan(plan.id, change),
    onSuccess: refresh,
    onError,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => billingApi.orderPlans(ids),
    onSuccess: (ordered) => queryClient.setQueryData(['billing', 'plans'], ordered),
    onError,
  });
  const remove = useMutation({
    mutationFn: (plan: Plan) => billingApi.deletePlan(plan.id),
    onSuccess: (_result, plan) => {
      toast.success(`${plan.name} deleted`);
      refresh();
    },
    onError,
  });

  const items = plans.data ?? [];
  const currency = overview.data?.currency ?? 'EUR';

  const move = (index: number, by: -1 | 1) => {
    const ids = items.map((plan) => plan.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) {
      return;
    }
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    reorder.mutate(ids);
  };

  const askDelete = async (plan: Plan) => {
    const confirmed = await confirm({
      title: `Delete ${plan.name}?`,
      description:
        'A plan can be deleted while nobody ever had it. One that viewers have or had is kept as part of their history: stop offering it instead.',
      confirmLabel: 'Delete plan',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(plan);
    }
  };

  const newButton = mayWrite ? (
    <Button variant="primary" onClick={() => setEditing('new')}>
      <Plus />
      New plan
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Plans"
        description="What viewers subscribe to. A viewer with a running subscription can watch the titles you marked as needing one."
        actions={newButton}
      />

      <ErrorNote error={overview.error ?? plans.error} className="mb-4" />
      {overview.data ? (
        <Overview overview={overview.data} />
      ) : (
        <Skeleton className="mb-6 h-24 rounded-xl" />
      )}

      {plans.isPending ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={CreditCard} title="No plans yet" action={newButton}>
          Create the first plan to offer subscriptions. Then mark the titles that need one, in each
          title under Presentation.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((plan, index) => (
            <li key={plan.id}>
              <PlanCard
                plan={plan}
                currency={currency}
                mayWrite={mayWrite}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                busy={reorder.isPending || update.isPending}
                onEdit={() => setEditing(plan)}
                onMove={(by) => move(index, by)}
                onOffer={(isOffered) => update.mutate({ plan, change: { isOffered } })}
                onRecommend={(isRecommended) => update.mutate({ plan, change: { isRecommended } })}
                onDelete={() => void askDelete(plan)}
              />
            </li>
          ))}
        </ul>
      )}

      <PlanDialog
        plan={editing === 'new' ? null : editing}
        open={editing !== null}
        currency={currency}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        onSaved={(plan, created) => {
          setEditing(null);
          toast.success(created ? `${plan.name} created` : `${plan.name} saved`);
          refresh();
        }}
      />
    </>
  );
}

function Overview({ overview }: { overview: BillingOverview }) {
  const figures: { label: string; value: string; note: string }[] = [
    {
      label: 'Subscribers',
      value: String(overview.subscribers),
      note: overview.stripe
        ? `${overview.paidOnline} paying online, ${overview.grantedByHand} granted by hand`
        : overview.subscribers === overview.grantedByHand
          ? 'All granted by hand'
          : `${overview.grantedByHand} granted by hand`,
    },
    overview.stripe
      ? {
          label: 'Payment failed',
          value: String(overview.pastDue),
          note: 'Still watching while Stripe tries again',
        }
      : { label: 'Currency', value: overview.currency, note: 'Of all prices' },
    {
      label: 'Ending within 7 days',
      value: String(overview.endingSoon),
      note: 'Running, and not renewed',
    },
    {
      label: 'Titles for subscribers',
      value: `${overview.paidTitles} of ${overview.publishedTitles}`,
      note: 'Of the published titles',
    },
  ];
  return (
    <div className="mb-6 grid gap-4">
      <Card>
        <CardContent className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {figures.map((figure) => (
            <div key={figure.label}>
              <p className="text-xs text-muted-foreground">{figure.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{figure.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{figure.note}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <StripePanel overview={overview} />
    </div>
  );
}

interface PlanCardProps {
  plan: Plan;
  currency: string;
  mayWrite: boolean;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onEdit: () => void;
  onMove: (by: -1 | 1) => void;
  onOffer: (offered: boolean) => void;
  onRecommend: (recommended: boolean) => void;
  onDelete: () => void;
}

function PlanCard({
  plan,
  currency,
  mayWrite,
  isFirst,
  isLast,
  busy,
  onEdit,
  onMove,
  onOffer,
  onRecommend,
  onDelete,
}: PlanCardProps) {
  const saving = yearlySaving(plan);
  return (
    <Card
      className={cn(
        'flex h-full flex-col',
        plan.isRecommended && 'border-primary/60',
        !plan.isOffered && 'opacity-75',
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{plan.name}</h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {plan.isRecommended ? (
                <Badge tone="primary">
                  <Star className="size-3 fill-current" aria-hidden="true" />
                  Recommended
                </Badge>
              ) : null}
              {plan.isOffered ? null : (
                <Badge tone="neutral">
                  <EyeOff className="size-3" aria-hidden="true" />
                  Not offered
                </Badge>
              )}
              {plan.trialDays > 0 ? <Badge>{plan.trialDays} days free</Badge> : null}
            </div>
          </div>
          {mayWrite ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Actions for ${plan.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onRecommend(!plan.isRecommended)}>
                  <Star />
                  {plan.isRecommended ? 'Do not recommend' : 'Recommend this plan'}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOffer(!plan.isOffered)}>
                  {plan.isOffered ? <EyeOff /> : <Eye />}
                  {plan.isOffered ? 'Stop offering' : 'Offer to viewers'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={isFirst || busy} onSelect={() => onMove(-1)}>
                  <ArrowUp />
                  Move earlier
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isLast || busy} onSelect={() => onMove(1)}>
                  <ArrowDown />
                  Move later
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={onDelete}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <div className="grid gap-1">
          {plan.monthlyAmount !== null ? (
            <p>
              <span className="text-2xl font-semibold tabular-nums">
                {formatMoney(plan.monthlyAmount, currency)}
              </span>{' '}
              <span className="text-sm text-muted-foreground">a month</span>
            </p>
          ) : null}
          {plan.yearlyAmount !== null ? (
            <p className={plan.monthlyAmount === null ? '' : 'text-sm'}>
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  plan.monthlyAmount === null && 'text-2xl',
                )}
              >
                {formatMoney(plan.yearlyAmount, currency)}
              </span>{' '}
              <span className="text-muted-foreground">
                a year{saving ? `, ${saving}% less than monthly` : ''}
              </span>
            </p>
          ) : null}
        </div>

        {plan.description ? (
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        ) : null}

        {plan.features.length > 0 ? (
          <ul className="grid gap-1.5 text-sm">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <UsersRound className="size-4" aria-hidden="true" />
            {plan.subscribers === 1 ? '1 subscriber' : `${plan.subscribers} subscribers`}
          </span>
          {plan.subscribers > 0 ? (
            <Link
              to="/viewers?subscribed=yes"
              className="text-xs underline underline-offset-4 hover:text-foreground"
            >
              See subscribers
            </Link>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" />
              Opens all paid titles
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface PlanDialogProps {
  /** Null to create a plan. */
  plan: Plan | null;
  open: boolean;
  currency: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (plan: Plan, created: boolean) => void;
}

function PlanDialog({ plan, open, currency, onOpenChange, onSaved }: PlanDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [monthly, setMonthly] = useState('');
  const [yearly, setYearly] = useState('');
  const [trialDays, setTrialDays] = useState('0');
  const [features, setFeatures] = useState('');
  const [isOffered, setOffered] = useState(true);
  const [isRecommended, setRecommended] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(plan?.name ?? '');
      setDescription(plan?.description ?? '');
      setMonthly(toPriceText(plan?.monthlyAmount ?? null, currency));
      setYearly(toPriceText(plan?.yearlyAmount ?? null, currency));
      setTrialDays(String(plan?.trialDays ?? 0));
      setFeatures((plan?.features ?? []).join('\n'));
      setOffered(plan?.isOffered ?? true);
      setRecommended(plan?.isRecommended ?? false);
      setProblem(null);
    }
  }, [open, plan, currency]);

  const monthlyAmount = parsePrice(monthly, currency);
  const yearlyAmount = parsePrice(yearly, currency);
  const preview =
    monthlyAmount !== 'invalid' && yearlyAmount !== 'invalid'
      ? yearlySaving({ monthlyAmount, yearlyAmount })
      : null;

  const save = useMutation({
    mutationFn: (input: PlanInput) =>
      plan ? billingApi.updatePlan(plan.id, input) : billingApi.createPlan(input),
    onSuccess: (saved) => onSaved(saved, plan === null),
    onError: (error) =>
      setProblem(
        error instanceof ApiError && error.issues.length > 0
          ? error.issues.map((issue) => issue.message).join('. ')
          : error.message,
      ),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (monthlyAmount === 'invalid' || yearlyAmount === 'invalid') {
      setProblem(`Write prices as numbers, such as ${toPriceText(799, currency)}.`);
      return;
    }
    if (monthlyAmount === null && yearlyAmount === null) {
      setProblem('Set a price per month, per year, or both.');
      return;
    }
    setProblem(null);
    save.mutate({
      name: name.trim(),
      description: description.trim() || null,
      features: features
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      monthlyAmount,
      yearlyAmount,
      trialDays: Number(trialDays) || 0,
      isOffered,
      isRecommended,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={plan ? `Edit ${plan.name}` : 'New plan'}
        description="In this version every plan opens all titles that need a subscription. Plans differ in price and in how they are paid."
        size="lg"
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus
                  maxLength={80}
                  placeholder="Standard"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={`Price a month (${currency})`} hint="Empty: not sold monthly.">
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    placeholder={toPriceText(799, currency)}
                    aria-invalid={monthlyAmount === 'invalid'}
                    value={monthly}
                    onChange={(event) => setMonthly(event.target.value)}
                  />
                )}
              </Field>
              <Field
                label={`Price a year (${currency})`}
                hint={preview ? `${preview}% less than twelve months.` : 'Empty: not sold yearly.'}
              >
                {(id) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    placeholder={toPriceText(7990, currency)}
                    aria-invalid={yearlyAmount === 'invalid'}
                    value={yearly}
                    onChange={(event) => setYearly(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Free trial (days)" hint="0 for none. Used once online payment is on.">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={90}
                    value={trialDays}
                    onChange={(event) => setTrialDays(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label="Description" hint="One or two sentences under the name.">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={500}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              )}
            </Field>
            <Field label="What is included" hint="One point per line, up to twelve.">
              {(id) => (
                <Textarea
                  id={id}
                  rows={4}
                  placeholder={'All movies and series\nWatch on any device\nCancel any time'}
                  value={features}
                  onChange={(event) => setFeatures(event.target.value)}
                />
              )}
            </Field>
            <ToggleRow
              label="Offer to viewers"
              description="Off, the plan is not shown on the page of plans. Viewers who have it keep it."
              checked={isOffered}
              onCheckedChange={setOffered}
            />
            <ToggleRow
              label="Recommend this plan"
              description="Marks it on the page of plans. One plan at a time can be the recommended one."
              checked={isRecommended}
              onCheckedChange={setRecommended}
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
              {plan ? 'Save' : 'Create plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
