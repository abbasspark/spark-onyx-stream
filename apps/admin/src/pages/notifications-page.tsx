// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Film,
  FlaskConical,
  Globe,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Smartphone,
  Trash2,
  Tv,
  Undo2,
  X,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { billingApi, brandingApi, notificationsApi, titlesApi } from '@/api/endpoints';
import type { Campaign, CampaignAudience, CampaignStatus, PushOverview } from '@/api/types';
import { useConfirm } from '@/components/confirm';
import { CopyField } from '@/components/copy-field';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/display';
import { Field, Input, Select, Textarea, ToggleRow } from '@/components/ui/form';
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
  Tooltip,
} from '@/components/ui/overlay';
import { useAddressParams } from '@/lib/address-params';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import {
  AUDIENCE_LABELS,
  audienceLabel,
  type CampaignForm,
  emptyForm,
  formOf,
  formProblem,
  type LinkKind,
  MAX_HEADLINE,
  MAX_TEXT,
  platformLabel,
  reachSentence,
  shareOf,
  STATUS_LOOKS,
  toInput,
  TOPIC_LABELS,
} from '@/lib/notifications';
import { useSession } from '@/auth/session';

const PAGE_SIZE = 10;
const STATUSES: CampaignStatus[] = ['DRAFT', 'SCHEDULED', 'SENT'];

type Editing = { mode: 'new' } | { mode: 'edit'; campaign: Campaign } | null;

/** Notifications: the messages an admin writes, what viewers are told by itself, and the setup. */
export function NotificationsPage() {
  const { can } = useSession();
  const mayWrite = can('viewers:write');
  const maySetUp = can('settings:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [params, change] = useAddressParams();
  const tab = ['messages', 'automatic', 'setup'].includes(params.get('tab') ?? '')
    ? (params.get('tab') as string)
    : 'messages';
  const status = (
    STATUSES.includes(params.get('status') as CampaignStatus) ? params.get('status') : ''
  ) as CampaignStatus | '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [editing, setEditing] = useState<Editing>(null);
  const [testing, setTesting] = useState<Campaign | null>(null);

  const overview = useQuery({
    queryKey: ['notifications', 'overview'],
    queryFn: ({ signal }) => notificationsApi.overview(signal),
  });
  const campaigns = useQuery({
    queryKey: ['notifications', 'campaigns', status, page],
    queryFn: ({ signal }) =>
      notificationsApi.campaigns(
        { page, pageSize: PAGE_SIZE, status: status || undefined },
        signal,
      ),
    placeholderData: keepPreviousData,
    // A message that is on its way shows how far it is.
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (campaign) => campaign.status === 'SENDING' || campaign.waiting > 0,
      )
        ? 3000
        : false,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const act = useMutation({
    mutationFn: async (action: { kind: 'send' | 'cancel' | 'remove'; campaign: Campaign }) => {
      if (action.kind === 'send') {
        return notificationsApi.send(action.campaign.id);
      }
      if (action.kind === 'cancel') {
        return notificationsApi.cancel(action.campaign.id);
      }
      return notificationsApi.remove(action.campaign.id);
    },
    onSuccess: (_result, action) => {
      toast.success(
        action.kind === 'send'
          ? 'The message is on its way'
          : action.kind === 'cancel'
            ? 'The message is a draft again'
            : 'Message deleted',
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const askSend = async (campaign: Campaign) => {
    const later = campaign.scheduledAt !== null && Date.parse(campaign.scheduledAt) > Date.now();
    const reach = await notificationsApi
      .reach(campaign.audience, campaign.plan?.id ?? null)
      .catch(() => null);
    const confirmed = await confirm({
      title: later
        ? `Schedule "${campaign.title}" for ${formatDateTime(campaign.scheduledAt)}?`
        : `Send "${campaign.title}" now?`,
      description: (
        <>
          It goes to: {audienceLabel(campaign).toLowerCase()}. {reach ? reachSentence(reach) : ''} A
          message that was sent cannot be taken back.
        </>
      ),
      confirmLabel: later ? 'Schedule' : 'Send now',
    });
    if (confirmed) {
      act.mutate({ kind: 'send', campaign });
    }
  };
  const askRemove = async (campaign: Campaign) => {
    const confirmed = await confirm({
      title: `Delete "${campaign.title}"?`,
      description:
        campaign.status === 'SENT'
          ? 'The message and its figures go. What viewers got of it stays in their lists.'
          : 'The draft goes. Nothing was sent.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      act.mutate({ kind: 'remove', campaign });
    }
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="What your viewers are told: messages you write, and news about episodes and titles that goes out by itself. Everything lands in the bell on the website, and on the devices viewers allowed."
        actions={
          mayWrite ? (
            <Button variant="primary" onClick={() => setEditing({ mode: 'new' })}>
              <Plus />
              Write a message
            </Button>
          ) : null
        }
      />

      <ErrorNote error={overview.error} className="mb-4" />
      {overview.data ? (
        <Reach overview={overview.data} onSetUp={() => change({ tab: 'setup' })} />
      ) : (
        <Skeleton className="mb-6 h-28 rounded-xl" />
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => change({ tab: value === 'messages' ? null : value })}
      >
        <TabsList>
          <TabsTrigger value="messages">
            Messages
            {campaigns.data && !status ? <Badge>{campaigns.data.total}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="automatic">Automatic</TabsTrigger>
          <TabsTrigger value="setup">
            Setup
            {overview.data && !overview.data.fcm ? (
              <Tooltip content="Apps cannot be reached yet">
                <CircleAlert
                  className="size-3.5 text-warning"
                  aria-label="Apps cannot be reached yet"
                />
              </Tooltip>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Show"
              className="flex rounded-lg border bg-muted/40 p-0.5"
            >
              {(['', ...STATUSES] as const).map((value) => (
                <button
                  key={value || 'all'}
                  type="button"
                  role="radio"
                  aria-checked={status === value}
                  onClick={() => change({ status: value || null, page: null })}
                  className={cn(
                    'h-7 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                    status === value && 'bg-background text-foreground shadow-sm',
                  )}
                >
                  {value ? `${STATUS_LOOKS[value].label}${value === 'DRAFT' ? 's' : ''}` : 'All'}
                </button>
              ))}
            </div>
          </div>
          <ErrorNote error={campaigns.error} className="mb-4" />
          {campaigns.isPending ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : campaigns.data && campaigns.data.items.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title={status ? 'No message like that' : 'No message yet'}
              action={
                mayWrite && !status ? (
                  <Button variant="primary" onClick={() => setEditing({ mode: 'new' })}>
                    <Plus />
                    Write a message
                  </Button>
                ) : undefined
              }
            >
              {status
                ? 'Choose "All" to see every message.'
                : 'Tell your viewers about a premiere, an offer or a live event. You see how it looks before it goes out, and can try it on your own account first.'}
            </EmptyState>
          ) : (
            <ul className="grid gap-3">
              {campaigns.data?.items.map((campaign) => (
                <li key={campaign.id}>
                  <CampaignCard
                    campaign={campaign}
                    mayWrite={mayWrite}
                    busy={act.isPending && act.variables?.campaign.id === campaign.id}
                    onEdit={() => setEditing({ mode: 'edit', campaign })}
                    onSend={() => void askSend(campaign)}
                    onCancel={() => act.mutate({ kind: 'cancel', campaign })}
                    onTest={() => setTesting(campaign)}
                    onRemove={() => void askRemove(campaign)}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={campaigns.data?.total ?? 0}
              onChange={(next) => change({ page: next === 1 ? null : String(next) })}
            />
          </div>
        </TabsContent>

        <TabsContent value="automatic">
          {overview.data ? (
            <Automatic overview={overview.data} disabled={!mayWrite} onChanged={refresh} />
          ) : null}
        </TabsContent>

        <TabsContent value="setup">
          {overview.data ? (
            <Setup overview={overview.data} disabled={!maySetUp} onChanged={refresh} />
          ) : null}
        </TabsContent>
      </Tabs>

      {editing ? (
        <Composer
          key={editing.mode === 'edit' ? editing.campaign.id : 'new'}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
      {testing ? <TestDialog campaign={testing} onClose={() => setTesting(null)} /> : null}
    </>
  );
}

/** Who can be reached, and on what. */
function Reach({ overview, onSetUp }: { overview: PushOverview; onSetUp: () => void }) {
  const total = overview.devices.reduce((sum, entry) => sum + entry.count, 0);
  const share = overview.viewers > 0 ? overview.reachable / overview.viewers : 0;
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <p className="text-[13px] text-muted-foreground">Viewers on a device</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
          {overview.reachable.toLocaleString('en')}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            of {overview.viewers.toLocaleString('en')}
          </span>
        </p>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${Math.round(share * 100)} % of viewers have a device that takes notifications`}
        >
          <div
            className="h-full rounded-full bg-(--series-1)"
            style={{ width: `${share * 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Everybody else finds notifications in the bell on the website.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <p className="text-[13px] text-muted-foreground">Devices that take notifications</p>
        {total === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            None yet. A viewer allows them under "Notifications" in their account on the website, or
            in an app.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {overview.devices.map((entry) => (
              <li
                key={`${entry.provider}:${entry.platform}`}
                className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm"
              >
                <span className="truncate">{platformLabel(entry.platform)}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-(--series-1)"
                    style={{ width: `${(entry.count / total) * 100}%` }}
                  />
                </span>
                <span className="tabular-nums">{entry.count.toLocaleString('en')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <p className="text-[13px] text-muted-foreground">Ways to reach viewers</p>
        <ul className="mt-3 grid gap-2.5 text-sm">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              Browsers <span className="text-muted-foreground">· ready</span>
            </span>
          </li>
          <li className="flex items-center gap-2">
            {overview.fcm ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
            )}
            <span className="min-w-0 truncate">
              Apps{' '}
              <span className="text-muted-foreground">
                · {overview.fcm ? `Firebase project ${overview.fcm.projectId}` : 'not set up'}
              </span>
            </span>
            {overview.fcm ? null : (
              <button
                type="button"
                className="ml-auto shrink-0 text-primary hover:underline"
                onClick={onSetUp}
              >
                Set up
              </button>
            )}
          </li>
        </ul>
      </div>
    </div>
  );
}

function CampaignCard({
  campaign,
  mayWrite,
  busy,
  onEdit,
  onSend,
  onCancel,
  onTest,
  onRemove,
}: {
  campaign: Campaign;
  mayWrite: boolean;
  busy: boolean;
  onEdit: () => void;
  onSend: () => void;
  onCancel: () => void;
  onTest: () => void;
  onRemove: () => void;
}) {
  const look = STATUS_LOOKS[campaign.status];
  const open = campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED';
  const sent = campaign.status === 'SENT';
  return (
    <article className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-[15px] font-semibold">{campaign.title}</h3>
          <Badge tone={look.tone} dot={campaign.status === 'SENDING' ? 'live' : undefined}>
            {look.label}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{campaign.body}</p>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>To: {audienceLabel(campaign)}</span>
          {campaign.linked ? (
            <span className="flex items-center gap-1">
              <Film className="size-3" aria-hidden="true" />
              {campaign.linked.name}
              {campaign.linked.status !== 'PUBLISHED' ? (
                <Tooltip content="The title is not published: the message would lead to a page that is not there">
                  <Badge tone="warning">Not published</Badge>
                </Tooltip>
              ) : null}
            </span>
          ) : campaign.link ? (
            <span className="font-mono">{campaign.link}</span>
          ) : null}
          <span>
            {sent
              ? `Sent ${formatRelative(campaign.sentAt)}`
              : campaign.status === 'SCHEDULED'
                ? `Goes out ${formatDateTime(campaign.scheduledAt)}`
                : `Changed ${formatRelative(campaign.updatedAt)}`}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-4">
        {sent ? (
          <dl className="grid grid-cols-3 gap-x-5 text-right">
            {(
              [
                [
                  'Viewers',
                  campaign.recipients.toLocaleString('en'),
                  'Viewers the message was made for',
                ],
                [
                  'On a device',
                  campaign.waiting > 0 ? '…' : shareOf(campaign.pushed, campaign.recipients),
                  'Viewers with at least one device that took it',
                ],
                [
                  'Opened',
                  shareOf(campaign.opened, campaign.recipients),
                  'Viewers who opened it, from a device or from their list',
                ],
              ] as const
            ).map(([label, value, about]) => (
              <Tooltip key={label} content={about}>
                <div>
                  <dt className="text-[11px] whitespace-nowrap text-muted-foreground">{label}</dt>
                  <dd className="text-base font-semibold tabular-nums">{value}</dd>
                </div>
              </Tooltip>
            ))}
          </dl>
        ) : null}
        {mayWrite ? (
          <div className="flex items-center gap-1">
            {campaign.status === 'DRAFT' ? (
              <Button size="sm" variant="primary" loading={busy} onClick={onSend}>
                {campaign.scheduledAt && Date.parse(campaign.scheduledAt) > Date.now() ? (
                  <CalendarClock />
                ) : (
                  <Send />
                )}
                {campaign.scheduledAt && Date.parse(campaign.scheduledAt) > Date.now()
                  ? 'Schedule'
                  : 'Send'}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Actions for "${campaign.title}"`}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {open ? (
                  <DropdownMenuItem onSelect={onEdit}>
                    <Pencil />
                    Change
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={onTest}>
                  <FlaskConical />
                  Send a test
                </DropdownMenuItem>
                {campaign.status === 'SCHEDULED' ? (
                  <DropdownMenuItem onSelect={onCancel}>
                    <Undo2 />
                    Hold back
                  </DropdownMenuItem>
                ) : null}
                {campaign.status !== 'SENDING' ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={onRemove}>
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
    </article>
  );
}

type PreviewOn = 'phone' | 'tv' | 'browser';

/** How a message looks where it arrives. A sketch: every device draws it its own way. */
function Preview({
  title,
  body,
  hasPicture,
}: {
  title: string;
  body: string;
  hasPicture: boolean;
}) {
  const [on, setOn] = useState<PreviewOn>('phone');
  // The name notifications arrive under: the name of the website.
  const branding = useQuery({
    queryKey: ['branding'],
    queryFn: ({ signal }) => brandingApi.get(signal),
    staleTime: 60_000,
  });
  const siteName = branding.data
    ? (branding.data.settings.name ?? branding.data.defaults.name)
    : 'Your site';
  const headline = title.trim() || 'Your headline';
  const text = body.trim() || 'What the message says.';
  const picture = hasPicture ? (
    <span
      aria-hidden="true"
      className="block shrink-0 rounded-md bg-linear-to-br from-(--series-1) to-(--series-7)"
    />
  ) : null;

  return (
    <div className="grid content-start gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">How it arrives</p>
        <div
          role="radiogroup"
          aria-label="Preview on"
          className="flex rounded-lg border bg-muted/40 p-0.5"
        >
          {(
            [
              ['phone', Smartphone, 'Phone'],
              ['tv', Tv, 'TV'],
              ['browser', Globe, 'Browser'],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on === value}
              aria-label={label}
              title={label}
              onClick={() => setOn(value)}
              className={cn(
                'flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground',
                on === value && 'bg-background text-foreground shadow-sm',
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {on === 'phone' ? (
        <div className="mx-auto w-full max-w-[17rem] rounded-[2rem] border-4 border-foreground/15 bg-linear-to-b from-slate-700 to-slate-900 px-3 pt-8 pb-16">
          <p className="mb-5 text-center text-3xl font-light text-white/90 tabular-nums">20:00</p>
          <div className="rounded-2xl bg-white/90 p-3 text-slate-900 shadow-lg">
            <p className="mb-1 flex items-center justify-between text-[10px] tracking-wide text-slate-500">
              <span className="font-medium uppercase">{siteName}</span>
              <span>now</span>
            </p>
            <div className="flex gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug font-semibold break-words">{headline}</p>
                <p className="line-clamp-3 text-[12px] leading-snug break-words text-slate-700">
                  {text}
                </p>
              </div>
              {picture ? <div className="[&>span]:size-10">{picture}</div> : null}
            </div>
          </div>
        </div>
      ) : on === 'tv' ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border-4 border-foreground/15 bg-linear-to-br from-slate-800 to-slate-950">
          <div className="absolute top-3 right-3 flex w-[62%] gap-2.5 rounded-lg bg-slate-900/95 p-2.5 text-white shadow-xl ring-1 ring-white/10">
            {picture ? <div className="[&>span]:h-9 [&>span]:w-14">{picture}</div> : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold">{headline}</p>
              <p className="line-clamp-2 text-[10px] leading-snug text-white/70">{text}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="ml-auto max-w-[19rem] rounded-lg border bg-popover p-3 shadow-lg">
            <div className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"
              >
                <BellRing className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug font-semibold break-words">{headline}</p>
                <p className="line-clamp-3 text-[12px] leading-snug break-words text-muted-foreground">
                  {text}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">{siteName} · now</p>
              </div>
            </div>
            {picture ? <div className="mt-2.5 [&>span]:h-24 [&>span]:w-full">{picture}</div> : null}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        A sketch. Each device draws notifications its own way and cuts long texts differently, so
        the first words matter most.
        {hasPicture ? ' The picture is the backdrop of the title.' : ''}
      </p>
    </div>
  );
}

const SEARCH_DELAY_MS = 250;

/** Writes or changes a message, with a view of how it arrives. */
function Composer({
  editing,
  onClose,
  onSaved,
}: {
  editing: NonNullable<Editing>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CampaignForm>(() =>
    editing.mode === 'edit' ? formOf(editing.campaign) : emptyForm(),
  );
  const set = <Key extends keyof CampaignForm>(key: Key, value: CampaignForm[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const [tried, setTried] = useState(false);
  const problem = formProblem(form);

  const plans = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: ({ signal }) => billingApi.plans(signal),
    enabled: form.audience === 'PLAN',
  });
  const reach = useQuery({
    queryKey: ['notifications', 'reach', form.audience, form.planId],
    queryFn: ({ signal }) => notificationsApi.reach(form.audience, form.planId || null, signal),
    enabled: form.audience !== 'PLAN' || form.planId !== '',
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: () =>
      editing.mode === 'edit'
        ? notificationsApi.update(editing.campaign.id, toInput(form))
        : notificationsApi.create(toInput(form)),
    onSuccess: () => {
      toast.success(
        editing.mode === 'edit' ? 'Message saved' : 'Saved as a draft. Send it when you are ready.',
      );
      onSaved();
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!problem) {
      save.mutate();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        size="lg"
        title={editing.mode === 'edit' ? 'Change the message' : 'Write a message'}
        description="It is saved as a draft. Nothing goes out until you press Send."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
            <div className="grid content-start gap-4">
              <Field
                label="Headline"
                hint={<Counter length={form.title.trim().length} most={MAX_HEADLINE} />}
              >
                {(id) => (
                  <Input
                    id={id}
                    autoFocus
                    maxLength={MAX_HEADLINE + 20}
                    placeholder="Glass Tide is here"
                    value={form.title}
                    onChange={(event) => set('title', event.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Text"
                hint={<Counter length={form.body.trim().length} most={MAX_TEXT} />}
              >
                {(id) => (
                  <Textarea
                    id={id}
                    rows={3}
                    maxLength={MAX_TEXT + 40}
                    placeholder="The film of the winter, from tonight."
                    value={form.body}
                    onChange={(event) => set('body', event.target.value)}
                  />
                )}
              </Field>

              <Field label="Leads to">
                {(id) => (
                  <Select
                    id={id}
                    value={form.linkKind}
                    onValueChange={(value) => set('linkKind', value as LinkKind)}
                    options={[
                      { value: 'none', label: 'Nothing: it is only read' },
                      { value: 'title', label: 'A movie or series' },
                      { value: 'page', label: 'A page of the website' },
                    ]}
                  />
                )}
              </Field>
              {form.linkKind === 'title' ? (
                <TitleChoice linked={form.linked} onChange={(linked) => set('linked', linked)} />
              ) : null}
              {form.linkKind === 'page' ? (
                <Field label="Page" hint='A path on your website, such as "/plans" or "/live".'>
                  {(id) => (
                    <Input
                      id={id}
                      className="font-mono"
                      placeholder="/plans"
                      value={form.link}
                      onChange={(event) => set('link', event.target.value)}
                    />
                  )}
                </Field>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Goes to">
                  {(id) => (
                    <Select
                      id={id}
                      value={form.audience}
                      onValueChange={(value) => set('audience', value as CampaignAudience)}
                      options={(Object.keys(AUDIENCE_LABELS) as CampaignAudience[]).map(
                        (value) => ({
                          value,
                          label: AUDIENCE_LABELS[value],
                        }),
                      )}
                    />
                  )}
                </Field>
                {form.audience === 'PLAN' ? (
                  <Field label="Plan">
                    {(id) => (
                      <Select
                        id={id}
                        value={form.planId}
                        placeholder="Choose a plan"
                        onValueChange={(value) => set('planId', value)}
                        options={(plans.data ?? []).map((plan) => ({
                          value: plan.id,
                          label: plan.name,
                        }))}
                      />
                    )}
                  </Field>
                ) : null}
              </div>
              <p className="-mt-2 text-xs text-muted-foreground" aria-live="polite">
                {reach.data ? reachSentence(reach.data) : ' '} Viewers who turned "News from us" off
                are left out.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="When">
                  {(id) => (
                    <Select
                      id={id}
                      value={form.when}
                      onValueChange={(value) => set('when', value as 'now' | 'later')}
                      options={[
                        { value: 'now', label: 'When I press Send' },
                        { value: 'later', label: 'At a set time' },
                      ]}
                    />
                  )}
                </Field>
                {form.when === 'later' ? (
                  <Field label="Date and time" hint="In your own time zone.">
                    {(id) => (
                      <Input
                        id={id}
                        type="datetime-local"
                        value={form.at}
                        onChange={(event) => set('at', event.target.value)}
                      />
                    )}
                  </Field>
                ) : null}
              </div>
            </div>

            <Preview
              title={form.title}
              body={form.body}
              hasPicture={form.linkKind === 'title' && form.linked !== null}
            />
          </DialogBody>
          <DialogFooter>
            <p role="alert" className="mr-auto min-w-0 text-sm text-destructive">
              {(tried && problem) || save.error?.message || ''}
            </p>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {editing.mode === 'edit' ? 'Save' : 'Save as a draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Counter({ length, most }: { length: number; most: number }) {
  return (
    <span className={cn('tabular-nums', length > most && 'font-medium text-destructive')}>
      {length} of {most}
    </span>
  );
}

/** Picks the title a message leads to. */
function TitleChoice({
  linked,
  onChange,
}: {
  linked: CampaignForm['linked'];
  onChange: (linked: CampaignForm['linked']) => void;
}) {
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(typed.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [typed]);
  const found = useQuery({
    queryKey: ['titles', 'pick', q],
    queryFn: ({ signal }) =>
      titlesApi.list({ page: 1, pageSize: 6, q, sort: 'name', order: 'asc' }, signal),
    enabled: q.length > 0 && linked === null,
  });

  if (linked) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 py-1.5 pr-1.5 pl-3 text-sm">
        <Film className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium">{linked.name}</span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Choose another title"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          className="pl-9"
          placeholder="Search a movie or series"
          aria-label="Search the title the message leads to"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      {q && found.data ? (
        <ul className="rounded-lg border">
          {found.data.items.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">
              Nothing is called like that.
            </li>
          ) : null}
          {found.data.items.map((title) => (
            <li key={title.id} className="border-b last:border-b-0">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onChange({ id: title.id, name: title.name });
                  setTyped('');
                }}
              >
                {title.type === 'SERIES' ? (
                  <Tv className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Film className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate">{title.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {title.status !== 'PUBLISHED' ? 'Not published' : (title.releaseYear ?? '')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Sends a message to one viewer, to see how it arrives before everybody gets it. */
function TestDialog({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const send = useMutation({
    mutationFn: () => notificationsApi.test(campaign.id, email.trim()),
    onSuccess: ({ devices }) => {
      toast.success(
        devices > 0
          ? `Sent to ${devices} ${devices === 1 ? 'device' : 'devices'} of this viewer, and to their list`
          : 'This viewer has no device that takes notifications. It is in their list on the website.',
      );
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        size="sm"
        title="Send a test"
        description={`"${campaign.title}" goes to one viewer only, marked as a test. It is not counted for the message.`}
      >
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            send.mutate();
          }}
        >
          <DialogBody>
            <Field
              label="Email address of the viewer"
              hint="Your own account on the website. Allow notifications there first to see it on a device."
            >
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </Field>
            <ErrorNote error={send.error} className="mt-3" />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={send.isPending}>
              <FlaskConical />
              Send the test
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** What viewers are told by itself, and what went out lately. */
function Automatic({
  overview,
  disabled,
  onChanged,
}: {
  overview: PushOverview;
  disabled: boolean;
  onChanged: () => void;
}) {
  const set = useMutation({
    mutationFn: (automatic: Partial<PushOverview['automatic']>) =>
      notificationsApi.setAutomatic(automatic),
    onSuccess: () => {
      toast.success('Saved');
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const example = (title: string, body: string): ReactNode => (
    <div className="mt-2 rounded-lg border bg-muted/40 px-3 py-2">
      <p className="text-[13px] font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
  );
  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Told by itself"
          description="Nobody writes these. They go out a couple of minutes after something is published, so a season published in one go is one notification and not ten."
        />
        <CardContent className="grid gap-4">
          <div>
            <ToggleRow
              label="New episodes"
              description="Viewers who have a series on their list, or watched it in the last six months, are told when it has new episodes."
              checked={overview.automatic.newEpisodes}
              disabled={disabled || set.isPending}
              onCheckedChange={(checked) => set.mutate({ newEpisodes: checked })}
            />
            {example('3 new episodes of Signal Fires', 'Season 2, episodes 4 to 6.')}
          </div>
          <div>
            <ToggleRow
              label="New titles"
              description="Every viewer is told when a movie or series arrives. Three or more at once are one notification that names a few. Leave this off while you fill the catalog."
              checked={overview.automatic.newTitles}
              disabled={disabled || set.isPending}
              onCheckedChange={(checked) => set.mutate({ newTitles: checked })}
            />
            {example('New: Glass Tide', 'The tagline of the title, when it has one.')}
          </div>
          <p className="text-xs text-muted-foreground">
            Each viewer can turn either kind off in their account. What was published while a kind
            was off is not told later.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Went out lately"
          description="What was told by itself in the last two weeks."
        />
        <CardContent>
          {overview.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in the last two weeks.</p>
          ) : (
            <ul className="divide-y">
              {overview.recent.map((entry) => (
                <li
                  key={`${entry.at}:${entry.title}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{entry.body}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm tabular-nums">
                      {entry.viewers.toLocaleString('en')}{' '}
                      <span className="text-muted-foreground">
                        {entry.viewers === 1 ? 'viewer' : 'viewers'}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TOPIC_LABELS[entry.topic] ?? entry.topic} · {formatRelative(entry.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** How notifications are sent: the key for browsers, and the Firebase project for apps. */
function Setup({
  overview,
  disabled,
  onChanged,
}: {
  overview: PushOverview;
  disabled: boolean;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [key, setKey] = useState('');
  const browsers = useMemo(
    () =>
      overview.devices
        .filter((entry) => entry.provider === 'WEB')
        .reduce((sum, entry) => sum + entry.count, 0),
    [overview.devices],
  );
  const apps = overview.devices
    .filter((entry) => entry.provider === 'FCM')
    .reduce((sum, entry) => sum + entry.count, 0);

  const done = (message: string) => () => {
    toast.success(message);
    onChanged();
  };
  const setFirebase = useMutation({
    mutationFn: () => notificationsApi.setFirebase(key),
    onSuccess: () => {
      setKey('');
      done('Firebase accepted the key. Apps can be reached now.')();
    },
  });
  const removeFirebase = useMutation({
    mutationFn: () => notificationsApi.removeFirebase(),
    onSuccess: done('The Firebase key is forgotten'),
    onError: (error: Error) => toast.error(error.message),
  });
  const renew = useMutation({
    mutationFn: () => notificationsApi.renewWebKey(),
    onSuccess: done('A new key is in use'),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Browsers"
          description="Works by itself. The website asks a viewer for permission when they turn notifications on in their account, and the browser's own push service delivers them."
          actions={
            <Badge tone="success">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              Ready
            </Badge>
          }
        />
        <CardContent className="grid gap-4">
          <CopyField
            label="Public key"
            value={overview.web.publicKey}
            hint={`Made ${formatRelative(overview.web.createdAt)}. Browsers subscribe with it. An app of your own that uses web push needs it too.`}
          />
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Contact sent along</dt>
            <dd className="truncate text-right font-mono text-[13px]">{overview.web.contact}</dd>
            <dt className="text-muted-foreground">Browsers subscribed</dt>
            <dd className="text-right tabular-nums">{browsers.toLocaleString('en')}</dd>
          </dl>
          {overview.web.contact.endsWith('@localhost') ? (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              Push services want to know how to reach you, and some refuse a sender without a real
              address. Set <code>PUSH_CONTACT</code> to "mailto:you@your-domain", or{' '}
              <code>SITE_URL</code> to the https address of your website.
            </p>
          ) : null}
          {disabled ? null : (
            <div className="border-t pt-4">
              <Button
                size="sm"
                loading={renew.isPending}
                onClick={async () => {
                  const confirmed = await confirm({
                    title: 'Make a new key for browsers?',
                    description: `Only needed when the key leaked. ${browsers === 0 ? 'No browser is subscribed yet.' : `All ${browsers.toLocaleString('en')} subscribed browsers stop getting notifications until their viewer next visits the website while signed in.`}`,
                    confirmLabel: 'Make a new key',
                    destructive: true,
                  });
                  if (confirmed) {
                    renew.mutate();
                  }
                }}
              >
                Make a new key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Apps on Android and iOS"
          description="Apps are reached through Firebase Cloud Messaging, with a Firebase project of your own. It is free of charge at Google."
          actions={
            overview.fcm ? (
              <Badge tone="success">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Connected
              </Badge>
            ) : (
              <Badge tone="warning">
                <CircleAlert className="size-3" aria-hidden="true" />
                Not set up
              </Badge>
            )
          }
        />
        <CardContent className="grid gap-4">
          {overview.fcm ? (
            <>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Project</dt>
                <dd className="truncate text-right font-mono text-[13px]">
                  {overview.fcm.projectId}
                </dd>
                <dt className="text-muted-foreground">Service account</dt>
                <dd className="truncate text-right font-mono text-[13px]">
                  {overview.fcm.clientEmail}
                </dd>
                <dt className="text-muted-foreground">Key stored</dt>
                <dd className="text-right">{formatRelative(overview.fcm.savedAt)}</dd>
                <dt className="text-muted-foreground">Apps registered</dt>
                <dd className="text-right tabular-nums">{apps.toLocaleString('en')}</dd>
              </dl>
              <p className="text-xs text-muted-foreground">
                The key is kept encrypted and is never shown again. To change it, paste a new one
                below.
              </p>
            </>
          ) : (
            <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted-foreground">
              <li>Open the Firebase console and make a project, or take the one of your apps.</li>
              <li>Project settings → Service accounts → "Generate new private key".</li>
              <li>Paste the content of the file you get here. It is tried at once.</li>
            </ol>
          )}
          {disabled ? null : (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setFirebase.mutate();
              }}
            >
              <Field label={overview.fcm ? 'A new key' : 'Key of the service account'}>
                {(id) => (
                  <Textarea
                    id={id}
                    rows={5}
                    spellCheck={false}
                    className="font-mono text-xs"
                    placeholder={'{\n  "type": "service_account",\n  "project_id": "…",\n  …\n}'}
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                  />
                )}
              </Field>
              <ErrorNote error={setFirebase.error} />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={key.trim().length < 2}
                  loading={setFirebase.isPending}
                >
                  Try and store the key
                </Button>
                {overview.fcm ? (
                  <Button
                    type="button"
                    size="sm"
                    loading={removeFirebase.isPending}
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: 'Forget the Firebase key?',
                        description: `Apps are no longer reached${apps > 0 ? `, and the ${apps.toLocaleString('en')} registered apps are forgotten. Each registers again at its next start once a key is stored` : ''}. Browsers are not affected.`,
                        confirmLabel: 'Forget the key',
                        destructive: true,
                      });
                      if (confirmed) {
                        removeFirebase.mutate();
                      }
                    }}
                  >
                    Forget the key
                  </Button>
                ) : null}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
