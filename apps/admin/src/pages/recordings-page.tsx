// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Disc, Film, MoreHorizontal, Plus, Square, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { channelsApi, recordingsApi } from '@/api/endpoints';
import type { Recording, RecordingStatus } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import {
  Badge,
  type BadgeTone,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
} from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { useAddressParams } from '@/lib/address-params';
import { cn } from '@/lib/cn';
import { formatBytes, humanize } from '@/lib/format';
import { formatClock, formatLength, fromLocalInput, timesProblem, toLocalInput } from '@/lib/guide';
import { FALLBACK_POLL_MS, useLiveState } from '@/live/live';

type Show = 'all' | 'open' | 'finished';
const SHOWS: { value: Show; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Planned and running' },
  { value: 'finished', label: 'Finished' },
];

const STATUS_LOOKS: Record<RecordingStatus, { label: string; tone: BadgeTone; live: boolean }> = {
  SCHEDULED: { label: 'Planned', tone: 'info', live: false },
  RECORDING: { label: 'Recording', tone: 'danger', live: true },
  FINISHING: { label: 'Finishing', tone: 'info', live: true },
  DONE: { label: 'In the library', tone: 'success', live: false },
  FAILED: { label: 'Failed', tone: 'danger', live: false },
  CANCELLED: { label: 'Called off', tone: 'neutral', live: false },
};

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const isOpen = (recording: Recording) =>
  recording.status === 'SCHEDULED' ||
  recording.status === 'RECORDING' ||
  recording.status === 'FINISHING';

/** Recordings of live channels: planned, being made, and what became of them. */
export function RecordingsPage() {
  const { can } = useSession();
  const mayWrite = can('live:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const live = useLiveState();
  const [params, setParams] = useAddressParams();
  const [creating, setCreating] = useState(false);

  const showParam = params.get('show');
  const show: Show = showParam === 'open' || showParam === 'finished' ? showParam : 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const recordings = useQuery({
    queryKey: ['recordings', show, page],
    queryFn: ({ signal }) => recordingsApi.list(show, page, signal),
    // A running recording changes by itself, and its asset is processed after it.
    refetchInterval: (query) =>
      live !== 'live'
        ? FALLBACK_POLL_MS
        : query.state.data?.items.some(
              (item) => isOpen(item) || item.asset?.status === 'PROCESSING',
            )
          ? 5000
          : false,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['recordings'] });
  const onError = (error: Error) => toast.error(error.message);

  const stop = useMutation({
    mutationFn: (recording: Recording) => recordingsApi.stop(recording.id),
    onSuccess: (recording) => {
      toast.success(
        recording.status === 'CANCELLED'
          ? `${recording.title} called off`
          : `${recording.title} stops now. What was recorded goes to the library.`,
      );
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (recording: Recording) => recordingsApi.remove(recording.id),
    onSuccess: (_result, recording) => {
      toast.success(`${recording.title} removed from the list`);
      refresh();
    },
    onError,
  });
  const askStop = async (recording: Recording) => {
    const running = recording.status === 'RECORDING';
    const confirmed = await confirm({
      title: running ? `Stop recording ${recording.title}?` : `Call ${recording.title} off?`,
      description: running
        ? 'The recording ends now. What was recorded so far goes to the library.'
        : 'The recording will not be made.',
      confirmLabel: running ? 'Stop recording' : 'Call off',
      destructive: true,
    });
    if (confirmed) {
      stop.mutate(recording);
    }
  };
  const askRemove = async (recording: Recording) => {
    const confirmed = await confirm({
      title: `Remove ${recording.title} from the list?`,
      description: recording.asset
        ? 'The recording stays in the library. To delete the video itself, delete it there.'
        : isOpen(recording)
          ? 'The recording is thrown away, with what was recorded so far.'
          : 'The entry is removed.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(recording);
    }
  };

  const newButton = mayWrite ? (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus />
      New recording
    </Button>
  ) : null;
  const items = recordings.data?.items ?? [];
  const total = recordings.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (recordings.data?.pageSize ?? 25)));

  return (
    <>
      <PageHeader
        title="Recordings"
        description="Stretches of live channels kept as video. A finished recording goes to the library, where it is processed like an upload and can be attached to a title."
        actions={newButton}
      />
      <ErrorNote error={recordings.error} className="mb-4" />

      <div
        className="mb-3 flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-card p-1 sm:w-fit"
        role="group"
        aria-label="Show recordings"
      >
        {SHOWS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={show === option.value}
            onClick={() =>
              setParams({ show: option.value === 'all' ? null : option.value, page: null })
            }
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors',
              show === option.value
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {recordings.isPending ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Disc}
          title={show === 'all' ? 'No recordings yet' : 'Nothing here'}
          action={show === 'all' ? newButton : undefined}
        >
          {show === 'all'
            ? 'Record a programme from the guide with the record button beside it, or plan a recording here by channel and time.'
            : 'No recording matches this view.'}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y">
            {items.map((recording) => {
              const look = STATUS_LOOKS[recording.status];
              return (
                <li
                  key={recording.id}
                  className="grid grid-cols-[minmax(0,1fr)] items-center gap-x-4 gap-y-2 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                >
                  <div className="grid min-w-0 gap-0.5">
                    <p className="truncate text-sm font-semibold">{recording.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {recording.channel.name} · {formatDay(recording.startsAt)},{' '}
                      {formatClock(recording.startsAt)} to {formatClock(recording.endsAt)} ·{' '}
                      {formatLength(recording.startsAt, recording.endsAt)}
                    </p>
                  </div>

                  <div className="grid min-w-0 gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={look.tone} dot={look.live ? 'live' : true}>
                        {look.label}
                      </Badge>
                      {recording.asset ? (
                        <Link
                          to={`/assets/${recording.asset.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
                        >
                          <Film className="size-3.5" aria-hidden="true" />
                          Open in the library
                          <span className="font-normal text-muted-foreground">
                            ({humanize(recording.asset.status).toLowerCase()})
                          </span>
                        </Link>
                      ) : null}
                    </div>
                    {recording.statusMessage ? (
                      <p
                        className={cn(
                          'line-clamp-2 text-xs',
                          recording.status === 'FAILED'
                            ? 'text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {recording.statusMessage}
                      </p>
                    ) : recording.recordedSeconds !== null ? (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatLength(
                          new Date(0).toISOString(),
                          new Date(recording.recordedSeconds * 1000).toISOString(),
                        )}{' '}
                        recorded
                        {recording.bytes ? ` · ${formatBytes(recording.bytes)}` : ''}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5 md:justify-end">
                    {mayWrite &&
                    (recording.status === 'SCHEDULED' || recording.status === 'RECORDING') ? (
                      <Button
                        size="sm"
                        loading={stop.isPending && stop.variables?.id === recording.id}
                        onClick={() => void askStop(recording)}
                      >
                        <Square />
                        {recording.status === 'RECORDING' ? 'Stop' : 'Call off'}
                      </Button>
                    ) : null}
                    {mayWrite && recording.status !== 'FINISHING' ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`More for ${recording.title}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem destructive onSelect={() => void askRemove(recording)}>
                            <Trash2 />
                            Remove from the list
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button
            size="sm"
            disabled={page <= 1}
            onClick={() => setParams({ page: page - 1 <= 1 ? null : String(page - 1) })}
          >
            Newer
          </Button>
          <span className="tabular-nums">
            Page {page} of {pages}
          </span>
          <Button
            size="sm"
            disabled={page >= pages}
            onClick={() => setParams({ page: String(page + 1) })}
          >
            Older
          </Button>
        </div>
      ) : null}

      <RecordingDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(recording) => {
          toast.success(`${recording.title} planned`);
          setCreating(false);
          refresh();
        }}
      />
    </>
  );
}

interface RecordingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (recording: Recording) => void;
}

function RecordingDialog({ open, onOpenChange, onSaved }: RecordingDialogProps) {
  const [channelId, setChannelId] = useState('');
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const channels = useQuery({
    queryKey: ['channels'],
    queryFn: ({ signal }) => channelsApi.list(signal),
    enabled: open,
  });
  const first = channels.data?.[0]?.id ?? '';

  useEffect(() => {
    if (open) {
      // From now, for an hour.
      setTitle('');
      setStartsAt(toLocalInput(new Date().toISOString()));
      setEndsAt(toLocalInput(new Date(Date.now() + 60 * 60 * 1000).toISOString()));
    }
  }, [open]);
  useEffect(() => {
    if (open && channelId === '' && first) {
      setChannelId(first);
    }
  }, [open, channelId, first]);

  const start = fromLocalInput(startsAt);
  const end = fromLocalInput(endsAt);
  const problem =
    timesProblem(start, end) ??
    (end && new Date(end).getTime() <= Date.now() ? 'The end must lie in the future.' : null);
  const channel = channels.data?.find((item) => item.id === channelId);

  const save = useMutation({
    mutationFn: () =>
      recordingsApi.create({
        channelId,
        title: title.trim(),
        startsAt: start as string,
        endsAt: end as string,
      }),
    onSuccess: onSaved,
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.reset();
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New recording"
        description="Times are in the time zone of this computer."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Channel">
              {(id) => (
                <Select
                  id={id}
                  value={channelId}
                  onValueChange={setChannelId}
                  placeholder={channels.isPending ? 'Loading' : 'Choose a channel'}
                  options={(channels.data ?? []).map((item) => ({
                    value: item.id,
                    label: item.number ? `${item.number}  ${item.name}` : item.name,
                  }))}
                />
              )}
            </Field>
            <Field label="Title" hint="The name of the video in the library.">
              {(id) => (
                <Input
                  id={id}
                  required
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              )}
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
              <Field label="Starts">
                {(id) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Ends">
                {(id) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    required
                    aria-invalid={problem !== null}
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                  />
                )}
              </Field>
            </div>
            {problem ? <p className="-mt-2 text-xs text-destructive">{problem}</p> : null}
            <p className="text-xs text-muted-foreground">
              {channel && channel.dvrMinutes > 0
                ? `A start in the past works as far back as ${channel.name} keeps, which is ${channel.dvrMinutes} minutes.`
                : 'A start in the past records from now on: this channel keeps nothing to go back to.'}{' '}
              While the channel is off air, nothing is recorded.
            </p>
            <ErrorNote error={channels.error} />
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
              disabled={channelId === '' || title.trim() === '' || problem !== null}
            >
              Plan recording
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
