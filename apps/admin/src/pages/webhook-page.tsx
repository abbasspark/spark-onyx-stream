// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  FileQuestion,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Power,
  Send,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { webhooksApi } from '@/api/endpoints';
import type {
  Webhook,
  WebhookDeliveryDetail,
  WebhookReference,
  WebhookWithSecret,
} from '@/api/types';
import { useSession } from '@/auth/session';
import { CodeBlock } from '@/components/code-block';
import { useConfirm } from '@/components/confirm';
import { JsonView } from '@/components/json-view';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Facts,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/display';
import { Select, Switch } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { DeliveryLog, DeliverySheet, WebhookActivity } from '@/components/webhook-deliveries';
import { WebhookDialog, WebhookSecretDialog } from '@/components/webhook-dialog';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import {
  eventLabel,
  formatDelay,
  listensToEverything,
  REQUEST_HEADERS,
  retryWindow,
  SAMPLE_LANGUAGES,
  type SampleLanguage,
  verificationSample,
  webhookHealth,
} from '@/lib/webhooks';

/** One webhook: how it is doing, every delivery, and what the receiver needs to know. */
export function WebhookPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const mayWrite = can('settings:write');
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [secret, setSecret] = useState<WebhookWithSecret | null>(null);
  const [opened, setOpened] = useState<{ id: string; loaded?: WebhookDeliveryDetail } | null>(null);

  const webhook = useQuery({
    queryKey: ['webhooks', id],
    queryFn: ({ signal }) => webhooksApi.get(id, signal),
    // Faster while something waits to be sent.
    refetchInterval: (query) => ((query.state.data?.recent.pending ?? 0) > 0 ? 3000 : 15_000),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
  const reference = useQuery({
    queryKey: ['webhooks', 'reference'],
    queryFn: ({ signal }) => webhooksApi.reference(signal),
    staleTime: Infinity,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] });

  const switchIt = useMutation({
    mutationFn: (isActive: boolean) => webhooksApi.update(id, { isActive }),
    onSuccess: (changed) =>
      toast.success(changed.isActive ? 'Switched on' : 'Switched off. Nothing is sent.'),
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });
  const test = useMutation({
    mutationFn: () => webhooksApi.test(id),
    // The answer opens by itself: it says more than a toast could.
    onSuccess: (delivery) => setOpened({ id: delivery.id, loaded: delivery }),
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });
  const roll = useMutation({
    mutationFn: () => webhooksApi.rollSecret(id),
    onSuccess: setSecret,
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => webhooksApi.remove(id),
    onSuccess: () => {
      toast.success('Webhook deleted');
      void navigate('/webhooks');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (webhook.isPending || reference.isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-96 max-w-full" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  if (webhook.error || reference.error || !webhook.data || !reference.data) {
    const missing = webhook.error instanceof ApiError && webhook.error.status === 404;
    return (
      <EmptyState
        icon={FileQuestion}
        title={missing ? 'This webhook does not exist' : 'The webhook could not be loaded'}
        action={
          <Button asChild>
            <Link to="/webhooks">
              <ArrowLeft />
              Back to webhooks
            </Link>
          </Button>
        }
      >
        {missing
          ? 'It may have been deleted.'
          : ((webhook.error ?? reference.error)?.message ?? '')}
      </EmptyState>
    );
  }

  const data = webhook.data;
  const health = webhookHealth(data);
  const poll = data.recent.pending > 0 ? 3000 : 15_000;

  const askRoll = async () => {
    const confirmed = await confirm({
      title: 'Replace the signing secret?',
      description:
        'The old secret stops working at once. Until the receiver has the new one, it will refuse every request as wrongly signed.',
      confirmLabel: 'Replace',
      destructive: true,
    });
    if (confirmed) {
      roll.mutate();
    }
  };
  const askRemove = async () => {
    const confirmed = await confirm({
      title: `Delete "${data.name}"?`,
      description:
        'Nothing more is sent to this address, and the record of its deliveries goes with it. To pause it, switch it off instead.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate();
    }
  };

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/webhooks"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Webhooks
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight break-words">
            {data.name}
            <Badge tone={health.tone} dot={health.state === 'failing' ? 'live' : true}>
              {health.label}
            </Badge>
          </h1>
          <p className="mt-1 font-mono text-[13px] break-all text-muted-foreground">{data.url}</p>
        </div>
        {mayWrite ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <label className="mr-1 flex items-center gap-2 text-sm">
              <Switch
                checked={data.isActive}
                disabled={switchIt.isPending}
                onCheckedChange={(isActive) => switchIt.mutate(isActive)}
              />
              {data.isActive ? 'On' : 'Off'}
            </label>
            <Button
              loading={test.isPending}
              disabled={!data.isActive}
              onClick={() => test.mutate()}
            >
              <Send />
              Send a test
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" aria-label="More">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil />
                  Change
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void askRoll()}>
                  <KeyRound />
                  Replace the signing secret
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => void askRemove()}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </header>

      {health.state === 'failing' || health.state === 'stopped' || health.state === 'off' ? (
        <div
          className={cn(
            'mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border px-4 py-3',
            health.state === 'failing' && 'border-warning/30 bg-warning/10',
            health.state === 'stopped' && 'border-destructive/25 bg-destructive/10',
            health.state === 'off' && 'bg-muted/60',
          )}
          role={health.state === 'off' ? undefined : 'alert'}
        >
          {health.state === 'off' ? (
            <Power className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <TriangleAlert
              className={cn(
                'size-5 shrink-0',
                health.state === 'failing' ? 'text-warning' : 'text-destructive',
              )}
              aria-hidden="true"
            />
          )}
          <p className="min-w-[min(100%,16rem)] flex-1 text-sm">{health.detail}</p>
          {mayWrite && !data.isActive ? (
            <Button size="sm" loading={switchIt.isPending} onClick={() => switchIt.mutate(true)}>
              Switch on again
            </Button>
          ) : null}
        </div>
      ) : null}

      <Tabs defaultValue="deliveries">
        <TabsList>
          <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>
        <TabsContent value="deliveries" className="grid grid-cols-1 gap-5">
          <WebhookActivity webhookId={data.id} poll={poll} />
          <DeliveryLog
            webhook={data}
            events={reference.data.events}
            mayWrite={mayWrite}
            poll={poll}
            onOpen={(delivery) => setOpened({ id: delivery.id })}
          />
        </TabsContent>
        <TabsContent value="setup">
          <Setup webhook={data} reference={reference.data} />
        </TabsContent>
      </Tabs>

      <DeliverySheet
        webhook={data}
        target={opened}
        events={reference.data.events}
        mayWrite={mayWrite}
        onClose={() => setOpened(null)}
      />
      <WebhookDialog
        open={editing}
        onOpenChange={setEditing}
        webhook={data}
        reference={reference.data}
        onCreated={() => undefined}
        onSaved={() => {
          setEditing(false);
          toast.success('Changes saved');
          void refresh();
        }}
      />
      <WebhookSecretDialog webhook={secret} replaced onClose={() => setSecret(null)} />
    </>
  );
}

/** What the person who builds the receiver needs: the events, the signature, the retries. */
function Setup({ webhook, reference }: { webhook: Webhook; reference: WebhookReference }) {
  const [language, setLanguage] = useState<SampleLanguage>('node');
  const everything = listensToEverything(webhook.events);
  const heard = everything
    ? reference.events
    : reference.events.filter((event) => webhook.events.includes(event.name));
  const unknown = webhook.events.filter(
    (name) => name !== '*' && !reference.events.some((event) => event.name === name),
  );
  const [example, setExample] = useState(heard[0]?.name ?? reference.events[0]?.name ?? '');
  const shown = reference.events.find((event) => event.name === example) ?? heard[0];
  const delays = reference.retryDelaysSeconds;

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="grid grid-cols-1 gap-5">
        <Card>
          <CardHeader
            title="Checking that a request is from here"
            description="The receiver works out the signature itself and compares. If it differs, the request is not from this installation or was changed on the way."
            actions={
              <Select
                className="w-32"
                aria-label="Language"
                value={language}
                onValueChange={(value) => setLanguage(value as SampleLanguage)}
                options={SAMPLE_LANGUAGES.map(({ id, label }) => ({ value: id, label }))}
              />
            }
          />
          <CardContent className="grid gap-5">
            <CodeBlock
              label="Signature check"
              code={verificationSample(language, reference.signatureToleranceSeconds)}
              note="Pass the body exactly as it arrived. Parsing it and writing it out again changes it, and the signature no longer fits."
            />
            <dl className="grid gap-2.5 border-t pt-4 text-sm">
              {REQUEST_HEADERS.map(([name, meaning]) => (
                <div
                  key={name}
                  className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-[11rem_minmax(0,1fr)]"
                >
                  <dt>
                    <code className="font-mono text-[13px]">{name}</code>
                  </dt>
                  <dd className="text-muted-foreground">{meaning}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="What a request looks like"
            description="Every event has the same four fields. What happened is in data."
            actions={
              heard.length > 1 ? (
                <Select
                  className="w-56"
                  aria-label="Example event"
                  value={shown?.name ?? ''}
                  onValueChange={setExample}
                  options={heard.map((event) => ({ value: event.name, label: event.label }))}
                />
              ) : null
            }
          />
          <CardContent>
            {shown ? (
              <JsonView
                label={`Example of ${shown.name}`}
                value={{
                  id: '0193a5d3-1f20-7a55-8c1b-6d2e9f0a4b17',
                  event: shown.name,
                  createdAt: '2026-01-15T09:30:00.000Z',
                  data: shown.sample,
                }}
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <Card>
          <CardHeader title="This webhook" />
          <CardContent>
            <Facts
              items={[
                [
                  'Address',
                  <span key="url" className="font-mono text-[13px] break-all">
                    {webhook.url}
                  </span>,
                ],
                ['Method', 'POST, with a JSON body'],
                ['Created', formatDateTime(webhook.createdAt)],
                ['Changed', formatDateTime(webhook.updatedAt)],
                ['Signing secret', 'Shown once when made. Replace it from the menu if it is lost.'],
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Told about"
            description={
              everything
                ? 'Everything, also events that later versions add.'
                : `${webhook.events.length} of ${reference.events.length} events`
            }
          />
          <CardContent>
            <ul className="grid gap-2.5 text-sm">
              {heard.map((event) => (
                <li key={event.name} className="grid gap-0.5">
                  <span>{event.label}</span>
                  <code className="font-mono text-[11px] text-muted-foreground">{event.name}</code>
                </li>
              ))}
              {unknown.map((name) => (
                <li key={name}>
                  <code className="font-mono text-[13px]">
                    {eventLabel(name, reference.events)}
                  </code>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="When the address does not answer"
            description={`Anything but a 2xx answer within 10 seconds counts as failed. The request is then sent again, for ${retryWindow(delays)} in all.`}
          />
          <CardContent>
            <ol
              className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs"
              aria-label="Waits between tries"
            >
              <li>
                <Badge tone="primary">At once</Badge>
              </li>
              {delays.map((delay, index) => (
                <li key={index} className="flex items-center gap-1.5">
                  <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />
                  <Badge>{formatDelay(delay)}</Badge>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-muted-foreground">
              A retry carries the same delivery id, so the receiver can skip what it has handled
              already. Answer fast and do the work afterwards: a slow answer counts as none.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
