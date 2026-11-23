// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  FileSignature,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCw,
  Send,
  Trash2,
  Webhook as WebhookIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { webhooksApi } from '@/api/endpoints';
import type { Webhook, WebhookReference, WebhookWithSecret } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, ErrorNote, PageHeader, Skeleton } from '@/components/ui/display';
import { Switch } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/overlay';
import { WebhookDialog, WebhookSecretDialog } from '@/components/webhook-dialog';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import {
  eventLabel,
  formatDelay,
  listensToEverything,
  retryWindow,
  successRate,
  webhookHealth,
} from '@/lib/webhooks';

/** How many events a row names before it counts the rest. */
const EVENTS_SHOWN = 3;

/** Webhooks: other systems that are told when something happens here. */
export function WebhooksPage() {
  const { can } = useSession();
  const mayWrite = can('settings:write');
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Webhook | 'new' | null>(null);
  const [created, setCreated] = useState<WebhookWithSecret | null>(null);

  const webhooks = useQuery({
    queryKey: ['webhooks', 'list'],
    queryFn: ({ signal }) => webhooksApi.list(signal),
    refetchInterval: 15_000,
  });
  const reference = useQuery({
    queryKey: ['webhooks', 'reference'],
    queryFn: ({ signal }) => webhooksApi.reference(signal),
    staleTime: Infinity,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] });

  const switchIt = useMutation({
    mutationFn: ({ webhook, isActive }: { webhook: Webhook; isActive: boolean }) =>
      webhooksApi.update(webhook.id, { isActive }),
    onSuccess: (webhook) =>
      toast.success(webhook.isActive ? `"${webhook.name}" is on` : `"${webhook.name}" is off`),
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });
  const test = useMutation({
    mutationFn: (webhook: Webhook) => webhooksApi.test(webhook.id),
    onSuccess: (delivery, webhook) => {
      if (delivery.status === 'DELIVERED') {
        toast.success(`"${webhook.name}" answered with ${delivery.responseStatus}`);
      } else {
        toast.error(`The test did not get through: ${delivery.error ?? 'no answer'}`, {
          action: { label: 'Look', onClick: () => void navigate(`/webhooks/${webhook.id}`) },
        });
      }
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (webhook: Webhook) => webhooksApi.remove(webhook.id),
    onSuccess: () => toast.success('Webhook deleted'),
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });

  const askRemove = async (webhook: Webhook) => {
    const confirmed = await confirm({
      title: `Delete "${webhook.name}"?`,
      description:
        'Nothing more is sent to this address, and the record of its deliveries goes with it. To pause it, switch it off instead.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(webhook);
    }
  };

  const list = webhooks.data;
  const full = reference.data && list ? list.length >= reference.data.maxWebhooks : false;
  const newButton =
    mayWrite && reference.data ? (
      <Tooltip
        content={
          full
            ? `There are ${reference.data.maxWebhooks} already. Delete one you no longer use.`
            : 'Tell another system when something happens'
        }
      >
        <span>
          <Button variant="primary" disabled={full} onClick={() => setEditing('new')}>
            <Plus />
            New webhook
          </Button>
        </span>
      </Tooltip>
    ) : null;

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Tell your own systems when something happens here: a title goes live, a viewer signs up, a payment arrives. Each event is sent to an address of yours as a signed request."
        actions={newButton}
      />

      <ErrorNote error={webhooks.error ?? reference.error} className="mb-4" />
      {webhooks.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : null}

      {list?.length === 0 ? (
        <EmptyState icon={WebhookIcon} title="No webhooks yet" action={newButton}>
          {mayWrite
            ? 'Add the address of a system that should hear about events, such as a newsletter tool, a chat channel or your own script.'
            : 'No other system is told about events.'}
        </EmptyState>
      ) : null}

      {list && list.length > 0 ? (
        <ul className="grid gap-3">
          {list.map((webhook) => (
            <li key={webhook.id}>
              <WebhookRow
                webhook={webhook}
                reference={reference.data}
                mayWrite={mayWrite}
                busy={switchIt.isPending}
                testing={test.isPending && test.variables?.id === webhook.id}
                onSwitch={(isActive) => switchIt.mutate({ webhook, isActive })}
                onTest={() => test.mutate(webhook)}
                onEdit={() => setEditing(webhook)}
                onRemove={() => void askRemove(webhook)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {reference.data ? <HowItWorks reference={reference.data} /> : null}

      {reference.data ? (
        <WebhookDialog
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          webhook={editing === 'new' ? null : editing}
          reference={reference.data}
          onCreated={(webhook) => {
            setEditing(null);
            setCreated(webhook);
            void refresh();
          }}
          onSaved={() => {
            setEditing(null);
            toast.success('Changes saved');
            void refresh();
          }}
        />
      ) : null}
      <WebhookSecretDialog
        webhook={created}
        replaced={false}
        onClose={() => {
          const id = created?.id;
          setCreated(null);
          // On to the new webhook, where a test can be sent.
          if (id) {
            void navigate(`/webhooks/${id}`);
          }
        }}
      />
    </>
  );
}

interface WebhookRowProps {
  webhook: Webhook;
  reference: WebhookReference | undefined;
  mayWrite: boolean;
  busy: boolean;
  testing: boolean;
  onSwitch: (isActive: boolean) => void;
  onTest: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

function WebhookRow({
  webhook,
  reference,
  mayWrite,
  busy,
  testing,
  onSwitch,
  onTest,
  onEdit,
  onRemove,
}: WebhookRowProps) {
  const health = webhookHealth(webhook);
  const rate = successRate(webhook.recent);
  const known = reference?.events ?? [];
  const everything = listensToEverything(webhook.events);
  const sent = webhook.recent.delivered + webhook.recent.failed + webhook.recent.pending;

  return (
    <Card
      className={cn(
        'relative grid grid-cols-1 gap-x-6 gap-y-4 p-5 transition-colors hover:border-foreground/20 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center',
        !webhook.isActive && 'bg-muted/40',
      )}
    >
      <div className="grid min-w-0 gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="text-[15px] leading-tight font-semibold">
            {/* The whole card opens the webhook. Controls on it sit above this link. */}
            <Link
              to={`/webhooks/${webhook.id}`}
              className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              {webhook.name}
            </Link>
          </h2>
          <Tooltip content={health.detail}>
            <span className="relative z-10">
              <Badge tone={health.tone} dot={health.state === 'failing' ? 'live' : true}>
                {health.label}
              </Badge>
            </span>
          </Tooltip>
        </div>
        <p className="truncate font-mono text-[13px] text-muted-foreground">{webhook.url}</p>
        <div className="flex flex-wrap gap-1.5">
          {everything ? (
            <Badge tone="primary">Everything</Badge>
          ) : (
            <>
              {webhook.events.slice(0, EVENTS_SHOWN).map((name) => (
                <Badge key={name}>{eventLabel(name, known)}</Badge>
              ))}
              {webhook.events.length > EVENTS_SHOWN ? (
                <Tooltip
                  content={webhook.events
                    .slice(EVENTS_SHOWN)
                    .map((name) => eventLabel(name, known))
                    .join(', ')}
                >
                  <span className="relative z-10">
                    <Badge>+{webhook.events.length - EVENTS_SHOWN} more</Badge>
                  </span>
                </Tooltip>
              ) : null}
            </>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-8 text-sm lg:w-[25rem] lg:grid-cols-[6rem_6rem_minmax(0,1fr)] lg:gap-x-6">
        <Figure label="Sent in 24 h" value={String(sent)} />
        <Figure
          label="Got through"
          value={rate === null ? '—' : `${rate}%`}
          tone={rate !== null && rate < 100 ? (rate < 50 ? 'danger' : 'warning') : undefined}
        />
        <Figure
          label="Last try"
          value={webhook.lastDelivery ? formatRelative(webhook.lastDelivery.at) : 'Never'}
          small
        />
      </dl>

      <div className="relative z-10 flex items-center gap-1 justify-self-start lg:justify-self-end">
        {mayWrite ? (
          <>
            <Tooltip content={webhook.isActive ? 'Switch off' : 'Switch on'}>
              <span className="flex items-center px-1.5">
                <Switch
                  checked={webhook.isActive}
                  disabled={busy}
                  onCheckedChange={onSwitch}
                  aria-label={`${webhook.name} is switched on`}
                />
              </span>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More for ${webhook.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={!webhook.isActive || testing} onSelect={onTest}>
                  <Send />
                  Send a test
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil />
                  Change
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={onRemove}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
    </Card>
  );
}

function Figure({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone?: 'warning' | 'danger';
  small?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-xs whitespace-nowrap text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-semibold whitespace-nowrap tabular-nums',
          small ? 'text-sm leading-7 font-medium' : 'text-lg leading-7',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-destructive',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** What a receiver can count on, in three short parts. */
function HowItWorks({ reference }: { reference: WebhookReference }) {
  const delays = reference.retryDelaysSeconds;
  const facts = [
    {
      icon: FileSignature,
      title: 'Signed',
      text: 'Every request carries a signature made with a secret only you and the receiver know, so the receiver can tell it is from here and was not changed on the way.',
    },
    {
      icon: RotateCw,
      title: 'Tried again',
      text: `When the address does not answer with success, the request is sent again after ${delays
        .slice(0, 3)
        .map(formatDelay)
        .join(
          ', ',
        )} and so on, for ${retryWindow(delays)}. After three days without success the webhook is switched off.`,
    },
    {
      icon: ListChecks,
      title: 'On record',
      text: 'Each delivery is kept for 30 days with what was sent and what the address answered, and can be sent again with one click.',
    },
  ];
  return (
    <section className="mt-8 grid grid-cols-1 gap-x-8 gap-y-5 border-t pt-6 md:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.title} className="grid content-start gap-1.5">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <fact.icon className="size-4 text-muted-foreground" aria-hidden="true" />
            {fact.title}
          </h2>
          <p className="text-sm text-muted-foreground">{fact.text}</p>
        </div>
      ))}
    </section>
  );
}
