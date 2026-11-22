// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Disc,
  Download,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { channelsApi, guideApi, recordingsApi } from '@/api/endpoints';
import type { Channel, GuideSource, Programme, ProgrammeInput } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorNote,
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
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import {
  canRecord,
  dayBounds,
  dayKey,
  dayLabel,
  formatClock,
  formatLength,
  fromLocalInput,
  isOnNow,
  parseDayKey,
  shiftDay,
  timesProblem,
  toLocalInput,
} from '@/lib/guide';

/** The programme guide: what each channel shows and when, and where that is imported from. */
export function GuidePage() {
  const { can } = useSession();
  const mayWrite = can('live:write');
  const [params, setParams] = useAddressParams();

  const channels = useQuery({
    queryKey: ['channels'],
    queryFn: ({ signal }) => channelsApi.list(signal),
  });
  const list = channels.data ?? [];
  const channel = list.find((item) => item.id === params.get('channel')) ?? list[0] ?? null;
  const day = parseDayKey(params.get('day')) ?? new Date();

  return (
    <>
      <PageHeader
        title="Guide"
        description="What each channel shows and when. Viewers see it as “now” and “next” in the lineup and as the guide of the day."
      />
      <ErrorNote error={channels.error} className="mb-4" />

      {channels.isPending ? (
        <Skeleton className="h-72" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No channels yet"
          action={
            <Button asChild variant="primary">
              <Link to="/channels">Go to channels</Link>
            </Button>
          }
        >
          The guide belongs to channels. Create a channel first.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          {channel ? (
            <Schedule
              channels={list}
              channel={channel}
              day={day}
              mayWrite={mayWrite}
              onChannel={(id) => setParams({ channel: id })}
              onDay={(next) =>
                setParams({ day: dayKey(next) === dayKey(new Date()) ? null : dayKey(next) })
              }
            />
          ) : null}
          <Sources mayWrite={mayWrite} />
        </div>
      )}
    </>
  );
}

// --- The schedule of one channel ------------------------------------------------

interface ScheduleProps {
  channels: Channel[];
  channel: Channel;
  day: Date;
  mayWrite: boolean;
  onChannel: (id: string) => void;
  onDay: (day: Date) => void;
}

function Schedule({ channels, channel, day, mayWrite, onChannel, onDay }: ScheduleProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Programme | 'new' | null>(null);
  const { from, to } = dayBounds(day);

  const programmes = useQuery({
    queryKey: ['programmes', channel.id, from],
    queryFn: ({ signal }) => guideApi.programmes(channel.id, from, to, signal),
  });
  // What is planned or being recorded, to mark those programmes.
  const planned = useQuery({
    queryKey: ['recordings', 'open', 1],
    queryFn: ({ signal }) => recordingsApi.list('open', 1, signal),
  });
  const recordingOf = (programme: Programme) =>
    planned.data?.items.find(
      (item) =>
        item.channel.id === channel.id &&
        item.startsAt === programme.startsAt &&
        item.title === programme.title,
    );
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['programmes'] });
  const remove = useMutation({
    mutationFn: (programme: Programme) => guideApi.removeProgramme(programme.id),
    onSuccess: (_result, programme) => {
      toast.success(`${programme.title} deleted`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const record = useMutation({
    mutationFn: (programme: Programme) => recordingsApi.recordProgramme(programme.id),
    onSuccess: (recording) => {
      toast.success(`${recording.title} will be recorded. It appears under Recordings.`);
      void queryClient.invalidateQueries({ queryKey: ['recordings'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const askRemove = async (programme: Programme) => {
    const confirmed = await confirm({
      title: `Delete ${programme.title}?`,
      description: 'The programme is taken out of the guide of this channel.',
      confirmLabel: 'Delete programme',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(programme);
    }
  };

  // The line under "on now" moves on by itself.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const items = programmes.data ?? [];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 px-5 pt-5">
        <Select
          aria-label="Channel"
          className="min-w-48 flex-1 sm:max-w-xs"
          value={channel.id}
          onValueChange={onChannel}
          options={channels.map((item) => ({
            value: item.id,
            label: item.number ? `${item.number}  ${item.name}` : item.name,
          }))}
        />
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="The day before"
            onClick={() => onDay(shiftDay(day, -1))}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-32 text-center text-sm font-medium" aria-live="polite">
            {dayLabel(day)}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="The day after"
            onClick={() => onDay(shiftDay(day, 1))}
          >
            <ChevronRight />
          </Button>
          {dayKey(day) === dayKey(new Date()) ? null : (
            <Button size="sm" variant="ghost" onClick={() => onDay(new Date())}>
              Today
            </Button>
          )}
        </div>
        {mayWrite ? (
          <Button size="sm" className="ml-auto" onClick={() => setEditing('new')}>
            <Plus />
            Add programme
          </Button>
        ) : null}
      </div>
      <CardContent className="grid gap-4">
        <GuideLink channel={channel} mayWrite={mayWrite} />
        <ErrorNote error={programmes.error} />

        {programmes.isPending ? (
          <Skeleton className="h-48" />
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing in the guide of {channel.name} for {dayLabel(day).toLowerCase()}.
            {channel.guideId
              ? ' The next import fills it, if the source has this day.'
              : ' Link the channel to a guide source, or add programmes by hand.'}
          </p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {items.map((programme) => {
              const current = isOnNow(programme, now);
              const recording = recordingOf(programme);
              return (
                <li
                  key={programme.id}
                  className={cn(
                    'grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-start gap-x-4 px-4 py-3',
                    current && 'bg-primary/5',
                  )}
                >
                  <div className="grid gap-0.5 text-sm tabular-nums">
                    <span className="font-medium">{formatClock(programme.startsAt)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatLength(programme.startsAt, programme.endsAt)}
                    </span>
                  </div>
                  <div className="grid min-w-0 gap-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                      <span className="min-w-0 break-words">{programme.title}</span>
                      {current ? (
                        <Badge tone="success" dot="live">
                          On now
                        </Badge>
                      ) : null}
                      {recording ? (
                        <Badge
                          tone={recording.status === 'SCHEDULED' ? 'info' : 'danger'}
                          dot={recording.status === 'SCHEDULED' ? true : 'live'}
                        >
                          {recording.status === 'SCHEDULED' ? 'Will be recorded' : 'Recording'}
                        </Badge>
                      ) : null}
                    </p>
                    {programme.subtitle ? (
                      <p className="text-sm text-muted-foreground">{programme.subtitle}</p>
                    ) : null}
                    {programme.description ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {programme.description}
                      </p>
                    ) : null}
                    <p className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <Badge>{programme.source ? programme.source.name : 'By hand'}</Badge>
                      {programme.category ? <Badge>{programme.category}</Badge> : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {mayWrite && !recording && canRecord(programme, now) ? (
                      <Tooltip content="Record this programme into the library">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Record ${programme.title}`}
                          disabled={record.isPending && record.variables?.id === programme.id}
                          onClick={() => record.mutate(programme)}
                        >
                          <Disc />
                        </Button>
                      </Tooltip>
                    ) : null}
                    {mayWrite && programme.source === null ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`More for ${programme.title}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(programme)}>
                            <Pencil />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => void askRemove(programme)}>
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>

      <ProgrammeDialog
        channel={channel}
        day={day}
        item={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(programme) => {
          toast.success(`${programme.title} saved`);
          setEditing(null);
          refresh();
        }}
      />
    </Card>
  );
}

/** Says which entry of the guide sources a channel is, and lets an admin choose it. */
function GuideLink({ channel, mayWrite }: { channel: Channel; mayWrite: boolean }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(channel.guideId ?? '');
  useEffect(() => setText(channel.guideId ?? ''), [channel.id, channel.guideId]);

  const known = useQuery({
    queryKey: ['guide-known', text],
    queryFn: ({ signal }) => guideApi.known(text.trim(), signal),
    enabled: mayWrite,
    staleTime: 30_000,
  });
  const save = useMutation({
    mutationFn: () => channelsApi.update(channel.id, { guideId: text.trim() || null }),
    onSuccess: (saved) => {
      toast.success(
        saved.guideId
          ? `${saved.name} linked. The next import brings its programmes.`
          : `${saved.name} is no longer linked to the guide`,
      );
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const changed = text.trim() !== (channel.guideId ?? '');
  const match = known.data?.find((entry) => entry.guideId === text.trim());
  const listId = `guide-known-${channel.id}`;

  if (!mayWrite) {
    return channel.guideId ? (
      <p className="text-xs text-muted-foreground">
        Linked to <span className="font-mono">{channel.guideId}</span> in the guide sources.
      </p>
    ) : null;
  }
  return (
    <form
      className="grid gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label htmlFor={`${listId}-input`} className="flex items-center gap-1.5 text-sm font-medium">
        <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
        Id of this channel in the guide sources
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={`${listId}-input`}
          list={listId}
          className="min-w-0 flex-1 font-mono text-[13px]"
          placeholder="Not linked. Type to search the sources"
          spellCheck={false}
          autoComplete="off"
          maxLength={200}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <datalist id={listId}>
          {known.data?.map((entry) => (
            <option key={`${entry.source}:${entry.guideId}`} value={entry.guideId}>
              {entry.name} ({entry.source})
            </option>
          ))}
        </datalist>
        <Button type="submit" loading={save.isPending} disabled={!changed}>
          {text.trim() === '' && channel.guideId ? 'Remove link' : 'Save link'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {match
          ? `“${match.name}” in ${match.source}.`
          : 'Imported programmes are filed under the channel with this id. Sources list their ids after their first import.'}
      </p>
    </form>
  );
}

interface ProgrammeDialogProps {
  channel: Channel;
  day: Date;
  item: Programme | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (programme: Programme) => void;
}

function ProgrammeDialog({
  channel,
  day,
  item,
  open,
  onOpenChange,
  onSaved,
}: ProgrammeDialogProps) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }
    // A new programme starts at eight in the evening of the day that is shown, for an hour.
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 20);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 21);
    setTitle(item?.title ?? '');
    setSubtitle(item?.subtitle ?? '');
    setDescription(item?.description ?? '');
    setCategory(item?.category ?? '');
    setStartsAt(toLocalInput(item?.startsAt ?? start.toISOString()));
    setEndsAt(toLocalInput(item?.endsAt ?? end.toISOString()));
    // The day only gives the first values of a new programme.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  const start = fromLocalInput(startsAt);
  const end = fromLocalInput(endsAt);
  const problem = timesProblem(start, end);
  const save = useMutation({
    mutationFn: () => {
      const body: ProgrammeInput = {
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        description: description.trim() || null,
        category: category.trim() || null,
        startsAt: start as string,
        endsAt: end as string,
      };
      return item
        ? guideApi.updateProgramme(item.id, body)
        : guideApi.createProgramme(channel.id, body);
    },
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
        title={item ? `Edit ${item.title}` : `New programme on ${channel.name}`}
        description="Times are in the time zone of this computer."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Title">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus={!item}
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
            <Field label="Subtitle" hint="An episode name, or a line that says more.">
              {(id) => (
                <Input
                  id={id}
                  maxLength={200}
                  value={subtitle}
                  onChange={(event) => setSubtitle(event.target.value)}
                />
              )}
            </Field>
            <Field label="Description">
              {(id) => (
                <Textarea
                  id={id}
                  rows={3}
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              )}
            </Field>
            <Field label="Category" hint="Such as News, Sport or Film.">
              {(id) => (
                <Input
                  id={id}
                  maxLength={80}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
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
              disabled={title.trim() === '' || problem !== null}
            >
              {item ? 'Save' : 'Add programme'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Where the guide is imported from --------------------------------------------

function Sources({ mayWrite }: { mayWrite: boolean }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<GuideSource | 'new' | null>(null);

  const sources = useQuery({
    queryKey: ['guide-sources'],
    queryFn: ({ signal }) => guideApi.sources(signal),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['guide-sources'] });
    void queryClient.invalidateQueries({ queryKey: ['programmes'] });
    void queryClient.invalidateQueries({ queryKey: ['guide-known'] });
  };
  const run = useMutation({
    mutationFn: (source: GuideSource) => guideApi.importSource(source.id),
    onSuccess: (result, source) => {
      if (result.ok) {
        toast.success(`${source.name}: ${result.message}`);
      } else {
        toast.error(`${source.name}: ${result.message}`);
      }
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (source: GuideSource) => guideApi.removeSource(source.id),
    onSuccess: (_result, source) => {
      toast.success(`${source.name} deleted`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const askRemove = async (source: GuideSource) => {
    const confirmed = await confirm({
      title: `Delete ${source.name}?`,
      description:
        source.programmes > 0
          ? `Its ${source.programmes} programmes leave the guide with it. Programmes entered by hand stay.`
          : 'The source is no longer imported.',
      confirmLabel: 'Delete source',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(source);
    }
  };

  const items = sources.data ?? [];
  return (
    <Card>
      <CardHeader
        title="Sources"
        description="XMLTV files the guide is imported from."
        actions={
          mayWrite ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus />
              Add source
            </Button>
          ) : null
        }
      />
      <CardContent className="grid gap-3">
        <ErrorNote error={sources.error} />
        {sources.isPending ? (
          <Skeleton className="h-24" />
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No source yet. Guide providers offer a file in the XMLTV format at an address, often
            packed as .xml.gz. Add that address here and the guide is imported every few hours.
          </p>
        ) : (
          items.map((source) => {
            const importing = run.isPending && run.variables?.id === source.id;
            return (
              <div key={source.id} className="grid gap-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid min-w-0 gap-0.5">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span className="min-w-0 break-words">{source.name}</span>
                      {source.enabled ? null : <Badge>Paused</Badge>}
                    </p>
                    <p className="font-mono text-xs break-all text-muted-foreground">
                      {source.url}
                    </p>
                  </div>
                  {mayWrite ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`More for ${source.name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(source)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => void askRemove(source)}>
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>

                {source.lastRun ? (
                  <p
                    className={cn(
                      'flex items-start gap-2 text-xs',
                      source.lastRun.ok ? 'text-muted-foreground' : 'text-destructive',
                    )}
                  >
                    {source.lastRun.ok ? (
                      <CircleCheck
                        className="mt-px size-3.5 shrink-0 text-success"
                        aria-hidden="true"
                      />
                    ) : (
                      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="min-w-0 break-words">
                      {source.lastRun.message}. Imported {formatRelative(source.lastRun.at)}.
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not imported yet.</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {source.channels} channels in the file · {source.programmes} programmes here
                  </p>
                  {mayWrite ? (
                    <Button size="sm" loading={importing} onClick={() => run.mutate(source)}>
                      <Download />
                      {importing ? 'Importing' : 'Import now'}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <SourceDialog
        item={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(source, created) => {
          setEditing(null);
          refresh();
          if (created) {
            // A new source is read at once: its channels are needed to link to.
            toast.success(`${source.name} added. Importing it now.`);
            run.mutate(source);
          } else {
            toast.success(`${source.name} saved`);
          }
        }}
      />
    </Card>
  );
}

interface SourceDialogProps {
  item: GuideSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (source: GuideSource, created: boolean) => void;
}

function SourceDialog({ item, open, onOpenChange, onSaved }: SourceDialogProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);

  // The stored address may carry a token, so it is asked for only when the form opens.
  const stored = useQuery({
    queryKey: ['guide-source-url', item?.id],
    queryFn: ({ signal }) => guideApi.sourceUrl(item?.id as string, signal),
    enabled: open && item !== null,
    gcTime: 0,
    staleTime: 0,
  });
  const storedUrl = item ? stored.data?.url : '';

  useEffect(() => {
    if (open) {
      setName(item?.name ?? '');
      setUrl('');
      setEnabled(item?.enabled ?? true);
    }
  }, [open, item]);
  useEffect(() => {
    if (open && storedUrl) {
      setUrl(storedUrl);
    }
  }, [open, storedUrl]);

  const save = useMutation({
    mutationFn: () =>
      item
        ? guideApi.updateSource(item.id, {
            name: name.trim(),
            enabled,
            ...(url.trim() !== storedUrl ? { url: url.trim() } : {}),
          })
        : guideApi.createSource({ name: name.trim(), url: url.trim(), enabled }),
    onSuccess: (saved) => onSaved(saved, item === null),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.reset();
    save.mutate();
  };
  const loading = item !== null && stored.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={item ? `Edit ${item.name}` : 'New guide source'}
        description="A file in the XMLTV format, fetched from an address."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus={!item}
                  maxLength={80}
                  placeholder="Main guide"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Address of the file"
              hint="Starts with https:// or http://. Packed files (.gz) are unpacked. The server fetches it, so it must be reachable from there."
            >
              {(id) => (
                <Input
                  id={id}
                  required
                  type="url"
                  className="font-mono text-[13px]"
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={2000}
                  disabled={loading}
                  placeholder={loading ? 'Loading' : 'https://example.com/guide.xml.gz'}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              )}
            </Field>
            <ToggleRow
              label="Import by itself"
              description="The file is fetched again every few hours. Off, it is only imported when you ask."
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <ErrorNote error={stored.error} />
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
              disabled={name.trim() === '' || url.trim() === '' || loading}
            >
              {item ? 'Save' : 'Add and import'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
