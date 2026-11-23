// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, Clock, RotateCw, Send } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { webhooksApi } from '@/api/endpoints';
import type {
  Webhook,
  WebhookActivityHour,
  WebhookDelivery,
  WebhookDeliveryDetail,
  WebhookDeliveryStatus,
  WebhookEventInfo,
} from '@/api/types';
import { JsonView } from '@/components/json-view';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorNote,
  Facts,
  Pagination,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Select } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter, Tooltip } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import {
  answerOf,
  deliveryOutcome,
  eventLabel,
  summarizeActivity,
  TEST_EVENT,
  triesOf,
} from '@/lib/webhooks';

const PAGE_SIZE = 20;
const PLOT_HEIGHT = 88;

const hourFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const hourOf = (iso: string) => hourFormat.format(new Date(iso));

/** "now" reads oddly at the end of a sentence. */
const justNow = (relative: string) => (relative === 'now' ? 'just now' : relative);

/** The deliveries of the last 24 hours, an hour to a bar. */
export function WebhookActivity({ webhookId, poll }: { webhookId: string; poll: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const activity = useQuery({
    queryKey: ['webhooks', webhookId, 'activity'],
    queryFn: ({ signal }) => webhooksApi.activity(webhookId, signal),
    refetchInterval: poll,
  });
  const hours = activity.data ?? [];
  const summary = summarizeActivity(hours);
  const active = hovered === null ? null : (hours[hovered] ?? null);

  return (
    <Card>
      <CardHeader
        title="Last 24 hours"
        description={
          summary.total === 0
            ? 'Nothing was sent.'
            : `${summary.total} ${summary.total === 1 ? 'delivery' : 'deliveries'}`
        }
        actions={
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Legend className="bg-success" label="Delivered" value={summary.delivered} />
            <Legend className="bg-destructive" label="Failed" value={summary.failed} />
            <Legend className="bg-muted-foreground/40" label="Waiting" value={summary.pending} />
          </ul>
        }
      />
      <CardContent>
        <ErrorNote error={activity.error} className="mb-3" />
        {activity.isPending ? (
          <Skeleton style={{ height: PLOT_HEIGHT + 24 }} />
        ) : (
          <div
            role="img"
            aria-label={`Deliveries per hour over the last 24 hours: ${summary.delivered} delivered, ${summary.failed} failed, ${summary.pending} waiting.`}
          >
            <div
              className="relative flex items-end gap-0.5 border-b"
              style={{ height: PLOT_HEIGHT }}
              onMouseLeave={() => setHovered(null)}
            >
              {hours.map((hour, index) => (
                <HourBar
                  key={hour.start}
                  hour={hour}
                  peak={summary.peak}
                  active={hovered === index}
                  onEnter={() => setHovered(index)}
                />
              ))}
              {active && hovered !== null ? (
                <div
                  className={cn(
                    'pointer-events-none absolute top-0 z-10 grid gap-1 rounded-md border bg-popover px-2.5 py-2 text-xs whitespace-nowrap shadow-md',
                    hovered > hours.length / 2 ? '-translate-x-full' : '',
                  )}
                  style={{
                    left: `${((hovered + (hovered > hours.length / 2 ? 0 : 1)) / hours.length) * 100}%`,
                  }}
                >
                  <p className="font-medium">
                    {hourOf(active.start)} to{' '}
                    {hourOf(new Date(new Date(active.start).getTime() + 3_600_000).toISOString())}
                  </p>
                  <p className="text-muted-foreground tabular-nums">
                    {active.delivered} delivered, {active.failed} failed, {active.pending} waiting
                  </p>
                </div>
              ) : null}
            </div>
            <div
              className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums"
              aria-hidden="true"
            >
              {[0, 6, 12, 18].map((index) => (
                <span key={index}>{hours[index] ? hourOf(hours[index].start) : ''}</span>
              ))}
              <span>Now</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Legend({ className, label, value }: { className: string; label: string; value: number }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn('size-2 rounded-xs', className)} aria-hidden="true" />
      {label}
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </li>
  );
}

function HourBar({
  hour,
  peak,
  active,
  onEnter,
}: {
  hour: WebhookActivityHour;
  peak: number;
  active: boolean;
  onEnter: () => void;
}) {
  const share = (count: number) => `${(count / peak) * 100}%`;
  const empty = hour.delivered + hour.failed + hour.pending === 0;
  return (
    // The whole column answers to the pointer, not only the bar in it.
    <div
      className={cn(
        'flex h-full min-w-0 flex-1 flex-col justify-end gap-0.5 rounded-t-sm px-px transition-colors',
        active && 'bg-accent',
      )}
      onMouseEnter={onEnter}
    >
      {empty ? <span className="h-px rounded-full bg-border" /> : null}
      {hour.pending > 0 ? (
        <span
          className="min-h-0.5 rounded-t-[3px] bg-muted-foreground/40"
          style={{ height: share(hour.pending) }}
        />
      ) : null}
      {hour.failed > 0 ? (
        <span
          className={cn('min-h-0.5 bg-destructive', hour.pending === 0 && 'rounded-t-[3px]')}
          style={{ height: share(hour.failed) }}
        />
      ) : null}
      {hour.delivered > 0 ? (
        <span
          className={cn(
            'min-h-0.5 bg-success',
            hour.pending + hour.failed === 0 && 'rounded-t-[3px]',
          )}
          style={{ height: share(hour.delivered) }}
        />
      ) : null}
    </div>
  );
}

const STATUS_FILTERS: { value: WebhookDeliveryStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'PENDING', label: 'In progress' },
  { value: 'FAILED', label: 'Failed' },
];

interface DeliveryLogProps {
  webhook: Webhook;
  events: readonly WebhookEventInfo[];
  mayWrite: boolean;
  poll: number;
  onOpen: (delivery: WebhookDelivery) => void;
}

/** Every request of a webhook, newest first, with what the address answered. */
export function DeliveryLog({ webhook, events, mayWrite, poll, onOpen }: DeliveryLogProps) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<WebhookDeliveryStatus | 'ALL'>('ALL');
  const [event, setEvent] = useState('ALL');

  const deliveries = useQuery({
    queryKey: ['webhooks', webhook.id, 'deliveries', { page, status, event }],
    queryFn: ({ signal }) =>
      webhooksApi.deliveries(
        webhook.id,
        {
          page,
          pageSize: PAGE_SIZE,
          status: status === 'ALL' ? undefined : status,
          event: event === 'ALL' ? undefined : event,
        },
        signal,
      ),
    placeholderData: (previous) => previous,
    refetchInterval: poll,
  });
  const filtered = status !== 'ALL' || event !== 'ALL';
  const heard = webhook.events.includes('*')
    ? events
    : events.filter((known) => webhook.events.includes(known.name));

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="pb-4"
        title="Deliveries"
        description="Kept for 30 days. Open one to see what was sent and what came back."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex rounded-md border p-0.5"
              role="radiogroup"
              aria-label="Show deliveries"
            >
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  role="radio"
                  aria-checked={status === filter.value}
                  className={cn(
                    'rounded-[5px] px-2.5 py-1 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                    status === filter.value && 'bg-accent text-foreground',
                  )}
                  onClick={() => {
                    setStatus(filter.value);
                    setPage(1);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <Select
              className="w-48"
              aria-label="Event"
              value={event}
              onValueChange={(value) => {
                setEvent(value);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: 'Every event' },
                ...heard.map((known) => ({ value: known.name, label: known.label })),
                { value: TEST_EVENT, label: 'Test' },
              ]}
            />
          </div>
        }
      />
      <ErrorNote error={deliveries.error} className="mx-5 mb-4" />
      {deliveries.isPending ? <Skeleton className="mx-5 mb-5 h-40" /> : null}
      {deliveries.data?.total === 0 ? (
        <EmptyState
          className="mx-5 mb-5 py-10"
          icon={Send}
          title={filtered ? 'Nothing matches' : 'Nothing was sent yet'}
        >
          {filtered
            ? 'No delivery fits what is chosen above.'
            : mayWrite
              ? 'Deliveries show up here when one of the chosen events happens. "Send a test" makes one now.'
              : 'Deliveries show up here when one of the chosen events happens.'}
        </EmptyState>
      ) : null}
      {deliveries.data && deliveries.data.total > 0 ? (
        <>
          <div className="overflow-x-auto border-t">
            <Table>
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>Result</Th>
                  <Th>Answer</Th>
                  <Th>Tries</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {deliveries.data.items.map((delivery) => {
                  const outcome = deliveryOutcome(delivery);
                  return (
                    <Tr
                      key={delivery.id}
                      className="cursor-pointer"
                      onClick={() => onOpen(delivery)}
                    >
                      <Td>
                        <button
                          type="button"
                          className="grid gap-0.5 text-left"
                          onClick={(click) => {
                            click.stopPropagation();
                            onOpen(delivery);
                          }}
                        >
                          <span className="font-medium">{eventLabel(delivery.event, events)}</span>
                          <code className="font-mono text-[11px] text-muted-foreground">
                            {delivery.event}
                          </code>
                        </button>
                      </Td>
                      <Td>
                        <Badge tone={outcome.tone} dot={outcome.live ? 'live' : true}>
                          {outcome.label}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="font-mono text-[13px]">{answerOf(delivery)}</span>
                        {delivery.durationMs !== null ? (
                          <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                            {delivery.durationMs} ms
                          </span>
                        ) : null}
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">
                        {triesOf(delivery)}
                      </Td>
                      <Td className="whitespace-nowrap text-muted-foreground">
                        <Tooltip content={formatDateTime(delivery.createdAt)}>
                          <span>{formatRelative(delivery.createdAt)}</span>
                        </Tooltip>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
          <div className="px-5 pb-4 empty:hidden">
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={deliveries.data.total}
              onChange={setPage}
            />
          </div>
        </>
      ) : null}
    </Card>
  );
}

interface DeliverySheetProps {
  webhook: Webhook;
  /** The delivery to show: an id to load, or one that is at hand already. */
  target: { id: string; loaded?: WebhookDeliveryDetail } | null;
  events: readonly WebhookEventInfo[];
  mayWrite: boolean;
  onClose: () => void;
}

/** One delivery in full: what was sent, what came back, and how often it was tried. */
export function DeliverySheet({ webhook, target, events, mayWrite, onClose }: DeliverySheetProps) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['webhooks', webhook.id, 'delivery', target?.id],
    queryFn: ({ signal }) => webhooksApi.delivery(webhook.id, target?.id ?? '', signal),
    enabled: target !== null,
    initialData: target?.loaded,
    // A delivery that is still tried changes by itself.
    refetchInterval: (query) => (query.state.data?.status === 'PENDING' ? 3000 : false),
  });
  const redeliver = useMutation({
    mutationFn: () => webhooksApi.redeliver(webhook.id, target?.id ?? ''),
    onSuccess: () => {
      toast.success('Queued again. It is sent within a few seconds.');
      void queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const delivery = detail.data;
  const outcome = delivery ? deliveryOutcome(delivery) : null;
  const OutcomeIcon =
    delivery?.status === 'DELIVERED'
      ? CircleCheck
      : delivery?.status === 'FAILED'
        ? CircleX
        : Clock;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        variant="sheet"
        size="md"
        title={delivery ? eventLabel(delivery.event, events) : 'Delivery'}
        description={
          delivery ? <code className="font-mono text-[13px]">{delivery.event}</code> : undefined
        }
      >
        <DialogBody className="gap-6">
          <ErrorNote error={detail.error} />
          {detail.isPending && target ? <Skeleton className="h-64" /> : null}
          {delivery && outcome ? (
            <>
              <div
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-3.5 py-3',
                  delivery.status === 'DELIVERED' && 'border-success/25 bg-success/10',
                  delivery.status === 'FAILED' && 'border-destructive/25 bg-destructive/10',
                  delivery.status === 'PENDING' && 'bg-muted/60',
                )}
              >
                <OutcomeIcon
                  className={cn(
                    'mt-0.5 size-5 shrink-0',
                    delivery.status === 'DELIVERED' && 'text-success',
                    delivery.status === 'FAILED' && 'text-destructive',
                    delivery.status === 'PENDING' && 'text-muted-foreground',
                  )}
                  aria-hidden="true"
                />
                <div className="grid min-w-0 gap-0.5">
                  <p className="text-sm font-medium">
                    {outcome.label}
                    {delivery.responseStatus !== null ? (
                      <span className="ml-2 font-mono text-[13px] font-normal">
                        HTTP {delivery.responseStatus}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm break-words text-muted-foreground">
                    {delivery.error ??
                      (delivery.status === 'DELIVERED'
                        ? `The address accepted it ${justNow(formatRelative(delivery.deliveredAt))}.`
                        : delivery.attempts === 0
                          ? 'It is sent within a few seconds.'
                          : 'The address did not accept it.')}
                  </p>
                </div>
              </div>

              <Facts
                items={[
                  ['Tries', triesOf(delivery)],
                  ['Happened', formatDateTime(delivery.createdAt)],
                  [
                    'Last try',
                    delivery.attemptedAt
                      ? `${formatDateTime(delivery.attemptedAt)}${
                          delivery.durationMs !== null ? `, took ${delivery.durationMs} ms` : ''
                        }`
                      : 'Not yet',
                  ],
                  ...(delivery.status === 'PENDING' && delivery.nextAttemptAt && delivery.attempts
                    ? ([['Next try', formatDateTime(delivery.nextAttemptAt)]] as [string, string][])
                    : []),
                  [
                    'Delivery id',
                    <code key="id" className="font-mono text-[13px] break-all">
                      {delivery.id}
                    </code>,
                  ],
                ]}
              />

              <section className="grid gap-2">
                <h3 className="text-sm font-medium">What was sent</h3>
                <JsonView label="Request body" value={delivery.payload} />
              </section>

              <section className="grid gap-2">
                <h3 className="text-sm font-medium">What the address answered</h3>
                {delivery.responseBody ? (
                  <pre
                    className="max-h-56 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap"
                    aria-label="Response body"
                    tabIndex={0}
                  >
                    {delivery.responseBody}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {delivery.attempts === 0
                      ? 'Nothing yet.'
                      : delivery.responseStatus === null
                        ? 'No answer came back.'
                        : 'An empty answer.'}
                  </p>
                )}
              </section>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
          {mayWrite &&
          delivery &&
          delivery.status !== 'PENDING' &&
          delivery.event !== TEST_EVENT ? (
            <Tooltip
              content={
                webhook.isActive
                  ? 'Sends the same content as a new delivery'
                  : 'Switch the webhook on first'
              }
            >
              <span>
                <Button
                  variant="primary"
                  loading={redeliver.isPending}
                  disabled={!webhook.isActive}
                  onClick={() => redeliver.mutate()}
                >
                  <RotateCw />
                  Send again
                </Button>
              </span>
            </Tooltip>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
