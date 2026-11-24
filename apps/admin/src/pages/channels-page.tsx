// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert,
  Check,
  CircleCheck,
  Globe,
  KeyRound,
  Eye,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCw,
  Search,
  Square,
  Trash2,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { channelsApi, packagesApi } from '@/api/endpoints';
import type { Channel, ChannelIngest, ChannelInput, ChannelMode, SourceProbe } from '@/api/types';
import { useSession } from '@/auth/session';
import { AgeField } from '@/components/age-field';
import { useConfirm } from '@/components/confirm';
import { CopyField } from '@/components/copy-field';
import { LivePlayer } from '@/components/live-player';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  Facts,
  PageHeader,
  Skeleton,
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
import {
  type ChannelFilter,
  codecName,
  describeAudience,
  describeDvr,
  DVR_OPTIONS,
  dvrDiskBytes,
  describeAudio,
  DEFAULT_QUALITIES,
  describeProbePlan,
  describeQualities,
  exceedsSource,
  describeStreams,
  encoderAddresses,
  formatUptime,
  isChannelFilter,
  isFallingBehind,
  matchesFilter,
  matchesSearch,
  parseChannelNumber,
  protocolOf,
  QUALITY_OPTIONS,
  sourceText,
  statusLook,
  toggleQuality,
  totalsOf,
} from '@/lib/channels';
import { describeAge } from '@/lib/age-rating';
import { cn } from '@/lib/cn';
import { formatBitrate, formatBytes, formatDateTime, formatResolution } from '@/lib/format';
import { FALLBACK_POLL_MS, useLiveState } from '@/live/live';

/** Bitrate and running time change without an event, so lists with running channels ask again. */
const FIGURES_POLL_MS = 4000;
const DETAILS_POLL_MS = 2000;

const FILTERS: { value: ChannelFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'on-air', label: 'On air' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'stopped', label: 'Stopped' },
];

/** The time, refreshed every second, for figures that count up. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** Live channels: sources the platform pulls and sends on to viewers. */
export function ChannelsPage() {
  const { can } = useSession();
  const mayWrite = can('live:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const live = useLiveState();
  const [params, setParams] = useAddressParams();
  const [editing, setEditing] = useState<Channel | 'new' | null>(null);

  const filterParam = params.get('show');
  const filter: ChannelFilter = isChannelFilter(filterParam) ? filterParam : 'all';
  // The field keeps its own text: the address follows a moment behind the keys.
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  const openId = params.get('channel');

  const channels = useQuery({
    queryKey: ['channels'],
    queryFn: ({ signal }) => channelsApi.list(signal),
    refetchInterval: (query) =>
      live !== 'live'
        ? FALLBACK_POLL_MS
        : query.state.data?.some((channel) => channel.enabled)
          ? FIGURES_POLL_MS
          : false,
  });
  const items = channels.data ?? [];
  const totals = totalsOf(items);
  const shown = items.filter(
    (channel) => matchesFilter(channel, filter) && matchesSearch(channel, search),
  );
  const now = useNow(totals.onAir > 0);

  const refresh = (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['channels'] });
    if (id) {
      void queryClient.invalidateQueries({ queryKey: ['channel', id] });
    }
  };
  /** Shows the answer of the server at once, before the list is read again. */
  const put = (channel: Channel) => {
    queryClient.setQueryData<Channel[]>(['channels'], (list) =>
      list?.map((item) => (item.id === channel.id ? channel : item)),
    );
    refresh(channel.id);
  };
  const onError = (error: Error) => toast.error(error.message);

  const start = useMutation({
    mutationFn: (channel: Channel) => channelsApi.start(channel.id),
    onSuccess: put,
    onError,
  });
  const stop = useMutation({
    mutationFn: (channel: Channel) => channelsApi.stop(channel.id),
    onSuccess: (channel) => {
      toast.success(`${channel.name} stopped`);
      put(channel);
    },
    onError,
  });
  const restart = useMutation({
    mutationFn: (channel: Channel) => channelsApi.restart(channel.id),
    onSuccess: (channel) => {
      toast.success(`${channel.name} is restarting`);
      put(channel);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (channel: Channel) => channelsApi.remove(channel.id),
    onSuccess: (_result, channel) => {
      toast.success(`${channel.name} deleted`);
      if (openId === channel.id) {
        setParams({ channel: null });
      }
      refresh();
    },
    onError,
  });

  const actions: ChannelActions = {
    mayWrite,
    busyId:
      (start.isPending && start.variables?.id) ||
      (stop.isPending && stop.variables?.id) ||
      (restart.isPending && restart.variables?.id) ||
      null,
    open: (channel) => setParams({ channel: channel.id }),
    start: (channel) => start.mutate(channel),
    restart: (channel) => restart.mutate(channel),
    edit: (channel) => setEditing(channel),
    stop: async (channel) => {
      const confirmed = await confirm({
        title: `Stop ${channel.name}?`,
        description:
          channel.status === 'RUNNING'
            ? 'Everyone watching loses the picture at once. The channel stays stopped until you start it again.'
            : 'The channel stays stopped until you start it again.',
        confirmLabel: 'Stop channel',
        destructive: true,
      });
      if (confirmed) {
        stop.mutate(channel);
      }
    },
    remove: async (channel) => {
      const confirmed = await confirm({
        title: `Delete ${channel.name}?`,
        description: channel.enabled
          ? 'The channel is stopped and removed. Everyone watching loses the picture at once.'
          : 'The channel and its settings are removed.',
        confirmLabel: 'Delete channel',
        destructive: true,
      });
      if (confirmed) {
        remove.mutate(channel);
      }
    },
  };

  const newButton = mayWrite ? (
    <Button variant="primary" onClick={() => setEditing('new')}>
      <Plus />
      New channel
    </Button>
  ) : null;
  const countOf: Record<ChannelFilter, number> = {
    all: totals.total,
    'on-air': totals.onAir,
    attention: totals.attention,
    stopped: totals.stopped,
  };

  return (
    <>
      <PageHeader
        title="Channels"
        description="Live sources the server pulls, keeps running and sends on to players. The picture is passed on as it arrives, without re-encoding."
        actions={newButton}
      />
      <ErrorNote error={channels.error} className="mb-4" />

      {channels.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Radio} title="No channels yet" action={newButton}>
          Add the address of a live source, such as an HLS playlist, an RTMP or SRT stream or a
          broadcast feed over UDP. The server connects to it and keeps the channel on air.
        </EmptyState>
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
            <Figure
              label="On air"
              value={`${totals.onAir}`}
              note={`of ${totals.total} ${totals.total === 1 ? 'channel' : 'channels'}`}
              tone={totals.onAir > 0 ? 'success' : undefined}
            />
            <Figure
              label="Need attention"
              value={`${totals.attention}`}
              note={
                totals.attention === 0 ? 'Everything that should run does' : 'Should run and do not'
              }
              tone={totals.attention > 0 ? 'danger' : undefined}
            />
            <Figure label="Stopped" value={`${totals.stopped}`} note="Switched off by an admin" />
            <Figure
              label="Going out"
              value={totals.bitrate > 0 ? formatBitrate(totals.bitrate) : '–'}
              note="All running channels together, per viewer"
            />
          </dl>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div
              className="flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-card p-1"
              role="group"
              aria-label="Show channels"
            >
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filter === option.value}
                  onClick={() => setParams({ show: option.value === 'all' ? null : option.value })}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                    filter === option.value
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option.label}
                  <span className="text-xs tabular-nums opacity-70">{countOf[option.value]}</span>
                </button>
              ))}
            </div>
            <div className="relative min-w-48 flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="Search by name, number or source"
                aria-label="Search channels by name, number or source"
                className="pl-9"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setParams({ q: event.target.value.trim() });
                }}
              />
            </div>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No channel matches"
              action={
                <Button
                  onClick={() => {
                    setSearch('');
                    setParams({ show: null, q: null });
                  }}
                >
                  Show all channels
                </Button>
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y">
                {shown.map((channel) => (
                  <ChannelRow key={channel.id} channel={channel} now={now} actions={actions} />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <ChannelDialog
        item={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(channel, created) => {
          toast.success(
            created
              ? channel.enabled
                ? `${channel.name} created and starting`
                : `${channel.name} created`
              : `${channel.name} saved`,
          );
          setEditing(null);
          refresh(channel.id);
          // A new pushed channel is opened as well: its stream key is the next thing needed.
          if (created && (channel.enabled || channel.ingest === 'PUSH')) {
            setParams({ channel: channel.id });
          }
        }}
      />
      <ChannelSheet
        id={openId}
        fallback={items.find((channel) => channel.id === openId) ?? null}
        actions={actions}
        onClose={() => setParams({ channel: null })}
      />
    </>
  );
}

interface ChannelActions {
  mayWrite: boolean;
  /** The channel a start, stop or restart is on its way for. */
  busyId: string | null;
  open: (channel: Channel) => void;
  start: (channel: Channel) => void;
  stop: (channel: Channel) => void;
  restart: (channel: Channel) => void;
  edit: (channel: Channel) => void;
  remove: (channel: Channel) => void;
}

function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="grid content-start gap-1 bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'text-2xl leading-none font-semibold tracking-tight tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-destructive',
        )}
      >
        {value}
      </dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

function ChannelStatusBadge({ channel }: { channel: Channel }) {
  const look = statusLook(channel.status);
  return (
    <Badge tone={look.tone} dot={look.live ? 'live' : true}>
      {look.label}
    </Badge>
  );
}

/** The number of a channel as on a remote control, or a sign for channels without one. */
function NumberTile({ channel, className }: { channel: Channel; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted/60 font-mono text-sm font-semibold tabular-nums',
        channel.status === 'RUNNING' && 'border-success/30 bg-success/10 text-success',
        className,
      )}
      aria-hidden="true"
    >
      {channel.number ?? <Radio className="size-4 text-muted-foreground" />}
    </span>
  );
}

function StartStopButton({
  channel,
  actions,
  size = 'sm',
}: {
  channel: Channel;
  actions: ChannelActions;
  size?: 'sm' | 'md';
}) {
  if (!actions.mayWrite) {
    return null;
  }
  const busy = actions.busyId === channel.id;
  return channel.enabled ? (
    <Button size={size} loading={busy} onClick={() => actions.stop(channel)}>
      <Square />
      Stop
    </Button>
  ) : (
    <Button size={size} variant="primary" loading={busy} onClick={() => actions.start(channel)}>
      <Play />
      Start
    </Button>
  );
}

function ChannelRow({
  channel,
  now,
  actions,
}: {
  channel: Channel;
  now: number;
  actions: ChannelActions;
}) {
  const running = channel.status === 'RUNNING';
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <NumberTile channel={channel} />
        <div className="grid min-w-0 gap-0.5">
          <button
            type="button"
            onClick={() => actions.open(channel)}
            className="truncate rounded-sm text-left text-sm font-semibold hover:underline"
          >
            {channel.name}
            {channel.published ? (
              <Globe
                className="ml-1.5 inline size-3.5 align-[-2px] text-muted-foreground"
                aria-label="On the website"
              />
            ) : null}
          </button>
          <p
            className={cn(
              'truncate text-xs text-muted-foreground',
              channel.ingest === 'PULL' && 'font-mono',
            )}
            title={sourceText(channel)}
          >
            {sourceText(channel)}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ChannelStatusBadge channel={channel} />
          {running ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              for {formatUptime(channel.startedAt, now)}
              {channel.health?.bitrate ? ` · ${formatBitrate(channel.health.bitrate)}` : ''}
            </span>
          ) : null}
        </div>
        {channel.statusMessage ? (
          <p
            className={cn(
              'line-clamp-2 text-xs',
              channel.status === 'FAILED' ? 'text-destructive' : 'text-warning',
            )}
          >
            {channel.statusMessage}
          </p>
        ) : channel.streams ? (
          <p className="truncate text-xs text-muted-foreground">
            {describeStreams(channel.streams)}
            {channel.mode === 'TRANSCODE' ? ` → ${describeQualities(channel)}` : ''}
          </p>
        ) : channel.mode === 'TRANSCODE' ? (
          <p className="truncate text-xs text-muted-foreground">
            Transcoded to {describeQualities(channel)}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 md:justify-end">
        <StartStopButton channel={channel} actions={actions} />
        <Tooltip content={channel.enabled ? 'Watch and details' : 'Details'}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Details of ${channel.name}`}
            onClick={() => actions.open(channel)}
          >
            <Eye />
          </Button>
        </Tooltip>
        {actions.mayWrite ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={`More for ${channel.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {channel.enabled ? (
                <DropdownMenuItem onSelect={() => actions.restart(channel)}>
                  <RotateCw />
                  Restart
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => actions.edit(channel)}>
                <Pencil />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => actions.remove(channel)}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
}

interface ChannelSheetProps {
  id: string | null;
  /** The channel as the list has it, shown until its details arrive. */
  fallback: Channel | null;
  actions: ChannelActions;
  onClose: () => void;
}

/** One channel up close: the live picture, its figures and what the live process wrote. */
function ChannelSheet({ id, fallback, actions, onClose }: ChannelSheetProps) {
  const details = useQuery({
    queryKey: ['channel', id],
    queryFn: ({ signal }) => channelsApi.get(id as string, signal),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data?.enabled === false ? false : DETAILS_POLL_MS),
    retry: false,
  });
  const channel = details.data ?? fallback;
  const enabled = channel?.enabled ?? false;
  const playback = useQuery({
    queryKey: ['channel-playback', id],
    queryFn: ({ signal }) => channelsApi.playback(id as string, signal),
    enabled: id !== null && enabled,
    staleTime: 30 * 60_000,
  });
  const now = useNow(channel?.status === 'RUNNING');

  const logRef = useRef<HTMLOListElement>(null);
  const log = details.data?.log ?? [];
  const lastLine = log.at(-1);
  useEffect(() => {
    // New lines are followed, as in a terminal.
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lastLine, log.length]);

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        variant="sheet"
        size="md"
        title={channel?.name ?? 'Channel'}
        description={channel?.description ?? undefined}
      >
        {channel ? (
          <DialogBody className="content-start">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <NumberTile channel={channel} />
                <div className="grid gap-1">
                  <ChannelStatusBadge channel={channel} />
                  {channel.status === 'RUNNING' ? (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      On air for {formatUptime(channel.startedAt, now)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {actions.mayWrite && channel.enabled ? (
                  <Button
                    size="sm"
                    loading={actions.busyId === channel.id}
                    onClick={() => actions.restart(channel)}
                  >
                    <RotateCw />
                    Restart
                  </Button>
                ) : null}
                <StartStopButton channel={channel} actions={actions} />
                {actions.mayWrite ? (
                  <Button size="sm" onClick={() => actions.edit(channel)}>
                    <Pencil />
                    Edit
                  </Button>
                ) : null}
              </div>
            </div>

            {channel.statusMessage ? (
              <p
                role="status"
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-3 text-sm',
                  channel.status === 'FAILED'
                    ? 'border-destructive/30 bg-destructive/5 text-destructive'
                    : 'border-warning/30 bg-warning/5 text-warning',
                )}
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{channel.statusMessage}</span>
              </p>
            ) : null}

            {isFallingBehind(channel) ? (
              <p
                role="status"
                className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  The server encodes this channel slower than it arrives. Viewers will see pauses.
                  Choose fewer or smaller qualities, or run fewer transcoded channels on this
                  server.
                </span>
              </p>
            ) : null}

            {enabled && playback.data ? (
              <LivePlayer url={playback.data.url} title={channel.name} />
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/40 px-6 text-center">
                <Radio className="size-5 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  {enabled
                    ? 'Loading the picture'
                    : 'The channel is stopped. Start it to see the picture.'}
                </p>
              </div>
            )}
            <ErrorNote error={playback.error} />

            {channel.ingest === 'PUSH' && actions.mayWrite ? (
              <EncoderPanel channel={channel} />
            ) : null}

            <Facts
              items={[
                [
                  'Source',
                  <span key="source" className="flex min-w-0 flex-wrap items-center gap-2">
                    {channel.ingest === 'PUSH' ? (
                      'Pushed by an encoder, over RTMP or SRT'
                    ) : (
                      <>
                        <Badge>{protocolOf(channel.source)}</Badge>
                        <span className="min-w-0 font-mono text-xs break-all">
                          {channel.source}
                        </span>
                      </>
                    )}
                  </span>,
                ],
                [
                  'Picture',
                  channel.streams
                    ? `${formatResolution(channel.streams.width, channel.streams.height, channel.streams.frameRate)}, ${codecName(channel.streams.videoCodec)}`
                    : 'Known once the channel has run',
                ],
                ['Sound', channel.streams ? describeAudio(channel.streams) : '–'],
                [
                  'Processing',
                  channel.mode === 'COPY' ? (
                    'Passed through, without encoding'
                  ) : (
                    <span key="processing" className="flex flex-wrap items-center gap-1.5">
                      Transcoded to
                      {channel.outputs
                        ? channel.outputs.map((output) => (
                            <Tooltip
                              key={output.name}
                              content={`Video at ${formatBitrate(output.videoKbps * 1000)}`}
                            >
                              <span>
                                <Badge>{output.name}</Badge>
                              </span>
                            </Tooltip>
                          ))
                        : channel.qualities.map((height) => <Badge key={height}>{height}p</Badge>)}
                    </span>
                  ),
                ],
                ['Bitrate', channel.health?.bitrate ? formatBitrate(channel.health.bitrate) : '–'],
                [
                  'Pace',
                  channel.health?.speed ? (
                    <Tooltip
                      key="pace"
                      content="1× means the source delivers in real time. Lasting less means viewers will see pauses."
                    >
                      <span className="cursor-help underline decoration-dotted underline-offset-4">
                        {Number(channel.health.speed.toFixed(2))}×
                      </span>
                    </Tooltip>
                  ) : (
                    '–'
                  ),
                ],
                [
                  'Restarts',
                  channel.enabled
                    ? channel.restartCount === 0
                      ? 'None since it was started'
                      : `${channel.restartCount} since it was started`
                    : '–',
                ],
                [
                  'Going back',
                  channel.dvrMinutes > 0
                    ? `${describeDvr(channel.dvrMinutes)}${
                        dvrDiskBytes(channel.dvrMinutes, channel.health?.bitrate ?? null)
                          ? `, about ${formatBytes(
                              dvrDiskBytes(channel.dvrMinutes, channel.health?.bitrate ?? null),
                            )} on disk per quality at this bitrate`
                          : ''
                      }`
                    : 'Off',
                ],
                ['Viewers', describeAudience(channel)],
                [
                  'Suitable from',
                  channel.minAge === null
                    ? 'Not rated. Profiles with an age limit do not see it.'
                    : describeAge(channel.minAge),
                ],
                ['Live process', channel.health?.node ?? '–'],
                [
                  'Address name',
                  <span key="slug" className="font-mono text-xs">
                    {channel.slug}
                  </span>,
                ],
                ['Created', formatDateTime(channel.createdAt)],
              ]}
            />

            <section className="grid gap-2" aria-label="Log of the live process">
              <h3 className="text-sm font-semibold">Log</h3>
              {log.length > 0 ? (
                <ol
                  ref={logRef}
                  className="max-h-56 overflow-y-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
                >
                  {log.map((line, index) => (
                    // Lines repeat and the list only ever grows at its end.
                    // oxlint-disable-next-line react/no-array-index-key
                    <li key={index} className="break-words whitespace-pre-wrap">
                      {line}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  {channel.enabled
                    ? 'Nothing yet. Lines appear once a live process runs the channel.'
                    : 'The log shows what the live process writes while the channel runs.'}
                </p>
              )}
            </section>
            <ErrorNote error={details.error} />
          </DialogBody>
        ) : (
          <DialogBody>
            {details.error ? <ErrorNote error={details.error} /> : <Skeleton className="h-64" />}
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ChannelDialogProps {
  item: Channel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (channel: Channel, created: boolean) => void;
}

function ChannelDialog({ item, open, onOpenChange, onSaved }: ChannelDialogProps) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [startNow, setStartNow] = useState(true);
  const [published, setPublished] = useState(false);
  const [paid, setPaid] = useState(false);
  const [packageIds, setPackageIds] = useState<string[]>([]);
  const packages = useQuery({
    queryKey: ['packages'],
    queryFn: ({ signal }) => packagesApi.list(signal),
    enabled: open,
  });
  const [ingest, setIngest] = useState<ChannelIngest>('PULL');
  const [mode, setMode] = useState<ChannelMode>('COPY');
  const [dvr, setDvr] = useState('0');
  const [minAge, setMinAge] = useState<number | null>(null);
  const [qualities, setQualities] = useState<number[]>([...DEFAULT_QUALITIES]);

  // The stored address may carry a password, so it is asked for only when the form opens.
  const stored = useQuery({
    queryKey: ['channel-source', item?.id],
    queryFn: ({ signal }) => channelsApi.source(item?.id as string, signal),
    enabled: open && item !== null,
    gcTime: 0,
    staleTime: 0,
  });
  const storedSource = item ? stored.data?.source : '';

  useEffect(() => {
    if (open) {
      setName(item?.name ?? '');
      setNumber(item?.number ? String(item.number) : '');
      setSlug(item?.slug ?? '');
      setDescription(item?.description ?? '');
      setSource('');
      setStartNow(true);
      setPublished(item?.published ?? false);
      setPaid(item?.access === 'PAID');
      setPackageIds(item?.packages.map((entry) => entry.id) ?? []);
      setIngest(item?.ingest ?? 'PULL');
      setMode(item?.mode ?? 'COPY');
      setDvr(String(item?.dvrMinutes ?? 0));
      setMinAge(item?.minAge ?? null);
      setQualities(item && item.qualities.length > 0 ? item.qualities : [...DEFAULT_QUALITIES]);
    }
  }, [open, item]);
  useEffect(() => {
    if (open && storedSource) {
      setSource(storedSource);
    }
  }, [open, storedSource]);

  const probe = useMutation({
    mutationFn: () => channelsApi.probe(source.trim()),
    onSuccess: (result) => {
      // A source that cannot be passed through leaves one way to run the channel.
      if (result.ok && result.copyObstacle) {
        setMode('TRANSCODE');
      }
    },
  });
  const resetProbe = probe.reset;
  useEffect(() => {
    // A result belongs to the address it was made for.
    resetProbe();
  }, [source, open, resetProbe]);

  const parsedNumber = parseChannelNumber(number);
  const pulled = ingest === 'PULL';
  const sourceChanged =
    item !== null && pulled && (item.ingest !== 'PULL' || source.trim() !== storedSource);
  const save = useMutation({
    mutationFn: () => {
      const body: ChannelInput = {
        name: name.trim(),
        number: parsedNumber ?? null,
        description: description.trim() || null,
        ingest,
        ...(pulled ? { source: source.trim() } : {}),
        mode,
        ...(mode === 'TRANSCODE' ? { qualities } : {}),
        dvrMinutes: Number(dvr),
        minAge,
        published,
        access: paid ? 'PAID' : 'FREE',
        packageIds: paid ? packageIds : [],
      };
      if (!item) {
        return channelsApi.create({ ...body, start: startNow });
      }
      // The source is sent only when it changed: a new one restarts the channel.
      const { source: newSource, ...rest } = body;
      return channelsApi.update(item.id, {
        ...rest,
        slug: slug.trim(),
        ...(sourceChanged ? { source: newSource } : {}),
      });
    },
    onSuccess: (saved) => onSaved(saved, item === null),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.reset();
    save.mutate();
  };

  const loadingSource = item !== null && stored.isPending;
  const probedStreams = probe.data?.ok ? probe.data.streams : (item?.streams ?? null);
  const processingChanged =
    item !== null &&
    (mode !== item.mode ||
      (mode === 'TRANSCODE' && qualities.join() !== item.qualities.join()) ||
      Number(dvr) !== item.dvrMinutes);
  const ready =
    name.trim() !== '' &&
    (!pulled || source.trim() !== '') &&
    parsedNumber !== undefined &&
    !loadingSource &&
    (mode === 'COPY' || qualities.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={item ? `Edit ${item.name}` : 'New channel'}
        description="The server connects to the source and sends it on to players as HLS."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
              <Field label="Name">
                {(id) => (
                  <Input
                    id={id}
                    required
                    autoFocus={!item}
                    maxLength={80}
                    placeholder="News 24"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Number">
                {(id) => (
                  <Input
                    id={id}
                    inputMode="numeric"
                    placeholder="None"
                    aria-invalid={parsedNumber === undefined}
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                  />
                )}
              </Field>
            </div>
            {parsedNumber === undefined ? (
              <p className="-mt-2 text-xs text-destructive">
                Use a number from 1 to 9999, or leave it empty.
              </p>
            ) : null}

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Where the video comes from</legend>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
                <ChoiceOption
                  name="channel-ingest"
                  value="PULL"
                  current={ingest}
                  onSelect={setIngest}
                  title="The server pulls it"
                  description="From an address that is already streaming: another server, a provider, a camera or a broadcast feed."
                />
                <ChoiceOption
                  name="channel-ingest"
                  value="PUSH"
                  current={ingest}
                  onSelect={setIngest}
                  title="An encoder pushes it"
                  description="OBS, vMix or a hardware encoder connects to this server with a stream key, over RTMP or SRT."
                />
              </div>
              {item && ingest !== item.ingest ? (
                <p className="text-xs text-muted-foreground">
                  {item.ingest === 'PUSH'
                    ? 'The stream key of this channel stops working when you save.'
                    : 'The channel gets a stream key when you save.'}
                </p>
              ) : null}
            </fieldset>

            {pulled ? (
              <>
                <Field
                  label="Source"
                  hint={
                    sourceChanged && item?.enabled
                      ? 'The channel restarts with the new source when you save.'
                      : 'An HLS playlist or stream over HTTP, or an RTMP, SRT, RTSP, UDP or RTP address.'
                  }
                >
                  {(id) => (
                    <div className="flex flex-wrap gap-2">
                      <Input
                        id={id}
                        required
                        className="min-w-0 flex-1 font-mono text-[13px]"
                        spellCheck={false}
                        autoComplete="off"
                        maxLength={2000}
                        disabled={loadingSource}
                        placeholder={
                          loadingSource ? 'Loading' : 'https://example.com/live/index.m3u8'
                        }
                        value={source}
                        onChange={(event) => setSource(event.target.value)}
                      />
                      <Button
                        type="button"
                        loading={probe.isPending}
                        disabled={source.trim() === ''}
                        onClick={() => probe.mutate()}
                      >
                        Test source
                      </Button>
                    </div>
                  )}
                </Field>
                {probe.isPending ? (
                  <p className="text-xs text-muted-foreground" role="status">
                    Connecting to the source. This takes up to 15 seconds.
                  </p>
                ) : null}
                {probe.data ? <ProbeResult probe={probe.data} mode={mode} /> : null}
                <ErrorNote error={probe.error} />
                <ErrorNote error={stored.error} />
              </>
            ) : (
              <p className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  {item?.ingest === 'PUSH'
                    ? 'The server address and the stream key are in the details of the channel.'
                    : 'After saving you get a server address and a stream key to enter in the encoder. The channel goes on air when the encoder connects.'}
                </span>
              </p>
            )}

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Processing</legend>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
                <ChoiceOption
                  name="channel-mode"
                  value="COPY"
                  current={mode}
                  onSelect={setMode}
                  title="Pass through"
                  description="The picture goes out as it arrives, in the one quality the source sends. Uses hardly any CPU."
                />
                <ChoiceOption
                  name="channel-mode"
                  value="TRANSCODE"
                  current={mode}
                  onSelect={setMode}
                  title="Transcode"
                  description="The picture is encoded again in several qualities, and players pick what the connection carries. Uses a lot of CPU."
                />
              </div>
              {mode === 'TRANSCODE' ? (
                <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Qualities">
                    {QUALITY_OPTIONS.map((option) => {
                      const chosen = qualities.includes(option.height);
                      const tooLarge = exceedsSource(option.height, probedStreams);
                      return (
                        <button
                          key={option.height}
                          type="button"
                          aria-pressed={chosen}
                          onClick={() => setQualities(toggleQuality(qualities, option.height))}
                          className={cn(
                            'grid min-w-20 gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                            chosen
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'bg-card text-muted-foreground hover:text-foreground',
                            chosen && tooLarge && 'border-dashed opacity-60',
                          )}
                        >
                          <span className="text-sm font-semibold tabular-nums">
                            {option.height}p
                          </span>
                          <span className="text-xs tabular-nums">
                            {formatBitrate(option.videoKbps * 1000)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {qualities.length === 0
                      ? 'Choose at least one quality.'
                      : probedStreams &&
                          qualities.some((height) => exceedsSource(height, probedStreams))
                        ? `The source has ${probedStreams.height} lines. Larger qualities are left out, and the picture is never made bigger than it arrives.`
                        : 'Each quality is encoded all the time the channel runs. Qualities larger than the source are left out.'}
                  </p>
                </div>
              ) : null}
            </fieldset>

            <Field
              label="Going back in time"
              hint={
                dvr === '0'
                  ? 'Viewers see the channel as it is sent. Nothing is kept.'
                  : 'Viewers can pause, rewind and start the running programme over. Everything sent in this time is kept on disk: about 2 GB per hour at 5 Mbit/s, for each quality. A restart of the stream empties it.'
              }
            >
              {(id) => (
                <Select
                  id={id}
                  className="sm:max-w-xs"
                  value={dvr}
                  onValueChange={setDvr}
                  options={[...DVR_OPTIONS]}
                />
              )}
            </Field>
            {item?.enabled && processingChanged ? (
              <p className="-mt-2 text-xs text-muted-foreground">
                The channel restarts when you save, because how it is processed changed.
              </p>
            ) : null}

            {item ? (
              <Field
                label="Address name"
                hint="Used in addresses of the channel. Lowercase letters, digits and dashes."
              >
                {(id) => (
                  <Input
                    id={id}
                    required
                    className="font-mono text-[13px]"
                    maxLength={80}
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                  />
                )}
              </Field>
            ) : null}
            <Field label="Description" hint="Viewers see it under the name of the channel.">
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
            <AgeField what="channel" value={minAge} onChange={setMinAge} />
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Viewers</legend>
              <ToggleRow
                label="Show on the website"
                description="Viewers find the channel under Live and can watch it while it is on air."
                checked={published}
                onCheckedChange={setPublished}
              />
              {published ? (
                <>
                  <ToggleRow
                    label="Only for subscribers"
                    description="Off, the channel is as open as the rest of the site. On, it needs a plan that opens it."
                    checked={paid}
                    onCheckedChange={setPaid}
                  />
                  {paid && packages.data && packages.data.length > 0 ? (
                    <div className="rounded-lg border p-3">
                      <p className="text-sm font-medium">Packages</p>
                      <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
                        Plans with chosen packages open the channel through them.{' '}
                        {packageIds.length === 0
                          ? 'In no package, only plans that open everything show it.'
                          : 'Plans that open everything show it either way.'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {packages.data.map((entry) => {
                          const chosen = packageIds.includes(entry.id);
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              role="checkbox"
                              aria-checked={chosen}
                              onClick={() =>
                                setPackageIds(
                                  chosen
                                    ? packageIds.filter((id) => id !== entry.id)
                                    : [...packageIds, entry.id],
                                )
                              }
                              className={cn(
                                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors hover:bg-accent',
                                chosen &&
                                  'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                              )}
                            >
                              {chosen ? <Check className="size-3.5" aria-hidden="true" /> : null}
                              {entry.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </fieldset>
            {item ? null : (
              <ToggleRow
                label="Start right away"
                description="The server connects to the source as soon as the channel is created."
                checked={startNow}
                onCheckedChange={setStartNow}
              />
            )}
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!ready}>
              {item ? 'Save' : startNow ? 'Create and start' : 'Create channel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** What a test of a source found, in words an admin can act on. */
function ProbeResult({ probe, mode }: { probe: SourceProbe; mode: ChannelMode }) {
  // A source that works but not the way the channel is set up is a warning, not a success.
  const blocked = probe.ok && mode === 'COPY' && probe.copyObstacle !== null;
  const good = probe.ok && !blocked;
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-lg border p-3 text-sm',
        good ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5',
      )}
    >
      {good ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      )}
      <div className="grid min-w-0 gap-0.5">
        <p className="font-medium">
          {!probe.ok
            ? 'The source cannot be used'
            : blocked
              ? 'The source needs transcoding'
              : 'The source works'}
          {probe.ok ? (
            <span className="font-normal text-muted-foreground">
              {' · '}
              {describeStreams(probe.streams)}
            </span>
          ) : null}
        </p>
        <p className="text-xs break-words text-muted-foreground">
          {probe.ok ? describeProbePlan(probe, mode) : probe.reason}
        </p>
      </div>
    </div>
  );
}

/** One of a few ways to set a channel up, as a large radio button. */
function ChoiceOption<Value extends string>({
  name,
  value,
  current,
  onSelect,
  title,
  description,
}: {
  /** Groups the options that exclude each other. */
  name: string;
  value: Value;
  current: Value;
  onSelect: (value: Value) => void;
  title: string;
  description: string;
}) {
  const selected = value === current;
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring',
        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
      )}
    >
      <input
        type="radio"
        name={name}
        className="mt-1 accent-primary"
        checked={selected}
        onChange={() => onSelect(value)}
      />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

/** What to enter in an encoder for a pushed channel, and a way to replace its stream key. */
function EncoderPanel({ channel }: { channel: Channel }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const settings = useQuery({
    queryKey: ['channel-encoder', channel.id],
    queryFn: ({ signal }) => channelsApi.encoder(channel.id, signal),
    // The stream key is a secret: it is not kept once the details are closed.
    gcTime: 0,
  });
  const replace = useMutation({
    mutationFn: () => channelsApi.replaceStreamKey(channel.id),
    onSuccess: (next) => {
      queryClient.setQueryData(['channel-encoder', channel.id], next);
      toast.success('New stream key made. Enter it in the encoder.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const askReplace = async () => {
    const confirmed = await confirm({
      title: 'Make a new stream key?',
      description:
        'The current key stops working at once and an encoder that is connected is disconnected. The channel is off air until the encoder connects with the new key.',
      confirmLabel: 'Make new key',
      destructive: true,
    });
    if (confirmed) {
      replace.mutate();
    }
  };

  const addresses = settings.data
    ? encoderAddresses(settings.data, window.location.hostname)
    : null;
  return (
    <section className="grid gap-3 rounded-lg border p-4" aria-label="Encoder settings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Encoder settings</h3>
          <p className="text-xs text-muted-foreground">
            {channel.enabled
              ? 'Enter these in OBS or another encoder and start streaming.'
              : 'Start the channel first: a stopped channel refuses its encoder.'}
          </p>
        </div>
        <Button size="sm" loading={replace.isPending} onClick={() => void askReplace()}>
          <KeyRound />
          New stream key
        </Button>
      </div>
      {addresses ? (
        <>
          <CopyField label="Server (RTMP)" value={addresses.rtmpServer} />
          <CopyField
            label="Stream key"
            value={addresses.streamKey}
            secret
            hint="Anyone with this key can send to the channel. Treat it like a password."
          />
          <CopyField
            label="SRT address, for encoders that use SRT"
            value={addresses.srtUrl}
            secret
          />
        </>
      ) : settings.error ? (
        <ErrorNote error={settings.error} />
      ) : (
        <Skeleton className="h-28" />
      )}
    </section>
  );
}
