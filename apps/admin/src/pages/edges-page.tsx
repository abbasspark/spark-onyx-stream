// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CircleAlert,
  Copy,
  Eraser,
  KeyRound,
  LoaderCircle,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { edgesApi } from '@/api/endpoints';
import type { EdgeInput, EdgeSample, EdgeServer, EdgeWithToken, PurgeScope } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { CopyField } from '@/components/copy-field';
import { EdgeTrafficHistory } from '@/components/edge-traffic-history';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  Facts,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/display';
import { Field, Input, Switch, ToggleRow } from '@/components/ui/form';
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
import { cn } from '@/lib/cn';
import {
  agentDockerCommand,
  agentEnvironment,
  cachePercent,
  chartOf,
  concernOf,
  EDGE_STATUS_LOOKS,
  formatRatio,
  loadPercent,
  publicUrlProblem,
  PURGE_CHOICES,
  summarize,
} from '@/lib/edges';
import { formatBitrate, formatBytes, formatDateTime, formatRelative } from '@/lib/format';

/** Edges report every ten seconds. The page reads at half that, so no report waits long. */
const REFRESH_MS = 5000;

/** Edge servers: what delivers video to viewers in place of the main server. */
export function EdgesPage() {
  const { can } = useSession();
  const mayWrite = can('delivery:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<EdgeServer | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [setup, setSetup] = useState<EdgeWithToken | null>(null);
  const [emptying, setEmptying] = useState<EdgeServer | null>(null);

  const edges = useQuery({
    queryKey: ['edges'],
    queryFn: ({ signal }) => edgesApi.list(signal),
    refetchInterval: REFRESH_MS,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['edges'] });
  const onError = (error: Error) => toast.error(error.message);

  const toggle = useMutation({
    mutationFn: (edge: EdgeServer) => edgesApi.update(edge.id, { enabled: !edge.enabled }),
    onSuccess: (edge) => {
      toast.success(
        edge.enabled ? `${edge.name} takes viewers again` : `${edge.name} gets no new viewers`,
      );
      refresh();
    },
    onError,
  });
  const replaceToken = useMutation({
    mutationFn: (edge: EdgeServer) => edgesApi.replaceToken(edge.id),
    onSuccess: (replaced) => {
      setOpenId(null);
      setSetup(replaced);
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (edge: EdgeServer) => edgesApi.remove(edge.id),
    onSuccess: (_result, edge) => {
      toast.success(`${edge.name} removed`);
      setOpenId(null);
      refresh();
    },
    onError,
  });

  const askReplaceToken = async (edge: EdgeServer) => {
    const confirmed = await confirm({
      title: `Replace the token of ${edge.name}?`,
      description:
        'The agent that runs now is locked out at once and must be started again with the new token. Viewers watching through this edge have to start their video again.',
      confirmLabel: 'Replace token',
      destructive: true,
    });
    if (confirmed) {
      replaceToken.mutate(edge);
    }
  };
  const askRemove = async (edge: EdgeServer) => {
    const confirmed = await confirm({
      title: `Remove ${edge.name}?`,
      description:
        edge.status === 'ONLINE'
          ? 'Its agent is locked out and viewers watching through it have to start their video again. New viewers are sent to the other edges or the main server.'
          : 'Its agent is locked out. Nothing else changes for viewers.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(edge);
    }
  };

  const items = edges.data ?? [];
  const summary = summarize(items);
  const onlineWeight = items
    .filter((edge) => edge.status === 'ONLINE')
    .reduce((sum, edge) => sum + edge.weight, 0);
  const open = items.find((edge) => edge.id === openId) ?? null;
  const addButton = mayWrite ? (
    <Button variant="primary" onClick={() => setEditing('new')}>
      <Plus />
      Add edge server
    </Button>
  ) : null;

  const menuOf = (edge: EdgeServer): ReactNode =>
    mayWrite ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`More for ${edge.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(edge)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem disabled={edge.now === null} onSelect={() => setEmptying(edge)}>
            <Eraser />
            Empty the copies
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void askReplaceToken(edge)}>
            <KeyRound />
            Replace token
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => void askRemove(edge)}>
            <Trash2 />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <>
      <PageHeader
        title="Edge servers"
        description="Servers close to your viewers that deliver video in place of the main server. Each keeps copies of what is watched through it, so the main server sends every file once per edge instead of once per viewer."
        actions={addButton}
      />
      <ErrorNote error={edges.error} className="mb-4" />

      {edges.isPending ? (
        <Skeleton className="h-72" />
      ) : items.length === 0 ? (
        <EmptyState icon={Network} title="No edge servers yet" action={addButton}>
          Viewers get all video from the main server. Add an edge, start its agent on a server with
          a good connection, and viewers are sent there as soon as it reports in.
        </EmptyState>
      ) : (
        <>
          <Card className="mb-4 grid grid-cols-2 divide-x divide-y lg:grid-cols-4 lg:divide-y-0">
            <Figure
              label="Online"
              value={`${summary.online} of ${summary.total}`}
              note={
                summary.online === 0
                  ? 'Viewers get video from the main server.'
                  : 'New viewers are sent to these.'
              }
              alert={summary.online === 0}
            />
            <Figure
              label="Traffic now"
              value={formatBitrate(summary.bitsPerSecond)}
              note={`${summary.requestsPerSecond} requests a second`}
            />
            <Figure
              label="Served from copies"
              value={formatRatio(summary.hitRatio)}
              note="The rest was fetched from the main server first."
            />
            <Figure
              label="Delivered in total"
              value={formatBytes(summary.bytesServed)}
              note="By all edges since they were added."
            />
          </Card>

          <EdgeTrafficHistory />

          <Card className="overflow-hidden">
            <ul className="divide-y">
              {items.map((edge) => {
                const look = EDGE_STATUS_LOOKS[edge.status];
                const concern = concernOf(edge);
                return (
                  <li
                    key={edge.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-3 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <div className="grid min-w-0 gap-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <button
                          type="button"
                          onClick={() => setOpenId(edge.id)}
                          className="min-w-0 truncate rounded-sm text-left text-sm font-semibold underline-offset-4 hover:underline"
                        >
                          {edge.name}
                        </button>
                        <Badge tone={look.tone} dot={look.live ? 'live' : true}>
                          {look.label}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {[edge.location, edge.publicUrl.replace(/^https?:\/\//, '')]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {edge.purging.length > 0 ? (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                          Emptying its copies
                        </p>
                      ) : null}
                      {concern ? (
                        <p className="flex items-start gap-1.5 text-xs text-warning">
                          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                          {concern}
                        </p>
                      ) : null}
                    </div>

                    <div className="order-3 col-span-2 min-w-0 lg:order-none lg:col-span-1">
                      {edge.now ? (
                        <>
                          <p className="mb-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                            <span className="text-sm font-medium text-foreground tabular-nums">
                              {formatBitrate(edge.now.bitsPerSecond)}
                            </span>
                            <span className="tabular-nums">{edge.now.requestsPerSecond} req/s</span>
                          </p>
                          <TrafficChart samples={edge.samples} height={32} />
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {edge.lastSeenAt
                            ? `Last report ${formatRelative(edge.lastSeenAt)}`
                            : look.explain}
                        </p>
                      )}
                    </div>

                    <div className="order-4 col-span-2 min-w-0 lg:order-none lg:col-span-1">
                      {edge.now ? (
                        <>
                          <p className="mb-1.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                              Copies{' '}
                              <span className="text-foreground tabular-nums">
                                {formatBytes(edge.now.cache.bytes)}
                              </span>{' '}
                              of {formatBytes(edge.now.cache.limitBytes)}
                            </span>
                            <span className="tabular-nums">
                              {formatRatio(edge.now.hitRatio)} from copies
                            </span>
                          </p>
                          <Meter value={cachePercent(edge.now)} label={`Cache of ${edge.name}`} />
                        </>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      {mayWrite ? (
                        <Tooltip
                          content={edge.enabled ? 'Takes viewers. Switch off to pause.' : 'Paused'}
                        >
                          <span className="inline-flex">
                            <Switch
                              checked={edge.enabled}
                              disabled={toggle.isPending && toggle.variables?.id === edge.id}
                              onCheckedChange={() => toggle.mutate(edge)}
                              aria-label={`${edge.name} takes viewers`}
                            />
                          </span>
                        </Tooltip>
                      ) : null}
                      {menuOf(edge)}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}

      <EdgeSheet
        edge={open}
        share={
          open && open.status === 'ONLINE' && onlineWeight > 0 ? open.weight / onlineWeight : null
        }
        onClose={() => setOpenId(null)}
        actions={
          open && mayWrite ? (
            <>
              <Button onClick={() => setEditing(open)}>
                <Pencil />
                Edit
              </Button>
              <Button disabled={open.now === null} onClick={() => setEmptying(open)}>
                <Eraser />
                Empty the copies
              </Button>
              <Button onClick={() => void askReplaceToken(open)}>
                <KeyRound />
                Replace token
              </Button>
              <Button variant="destructive-outline" onClick={() => void askRemove(open)}>
                <Trash2 />
                Remove
              </Button>
            </>
          ) : null
        }
      />

      <EdgeDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onCreated={(created) => {
          setEditing(null);
          setSetup(created);
          refresh();
        }}
        onSaved={(edge) => {
          toast.success(`${edge.name} saved`);
          setEditing(null);
          refresh();
        }}
      />

      <EmptyDialog
        edge={emptying}
        onClose={() => setEmptying(null)}
        onAsked={(edge) => {
          toast.success(`${edge.name} empties its copies with its next report`);
          setEmptying(null);
          refresh();
        }}
      />

      <SetupDialog
        setup={setup}
        current={setup ? (items.find((edge) => edge.id === setup.edge.id) ?? setup.edge) : null}
        onClose={() => setSetup(null)}
      />
    </>
  );
}

function Figure({
  label,
  value,
  note,
  alert = false,
}: {
  label: string;
  value: string;
  note: string;
  alert?: boolean;
}) {
  return (
    <div className="grid content-start gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-xl font-semibold tabular-nums', alert && 'text-warning')}>{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/** A thin bar for how full something is. Turns to a warning colour near the top. */
function Meter({ value, label }: { value: number; label: string }) {
  const percent = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

const CHART_WIDTH = 360;

/** Traffic of the last hour as a filled line. */
function TrafficChart({ samples, height }: { samples: EdgeSample[]; height: number }) {
  const chart = chartOf(samples, CHART_WIDTH, height, Math.round(Date.now() / 1000));
  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${height}`}
      preserveAspectRatio="none"
      className="block w-full text-primary"
      style={{ height }}
      role="img"
      aria-label={
        chart
          ? `Traffic of the last hour, at most ${formatBitrate(chart.peak)}`
          : 'Traffic of the last hour: not enough reports yet'
      }
    >
      <line
        x1="0"
        x2={CHART_WIDTH}
        y1={height - 0.5}
        y2={height - 0.5}
        className="stroke-border"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {chart ? (
        <>
          <path d={chart.area} fill="currentColor" opacity="0.14" />
          <path
            d={chart.line}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
    </svg>
  );
}

interface EdgeSheetProps {
  edge: EdgeServer | null;
  /** Its share of new viewers among the edges that are online, 0 to 1. */
  share: number | null;
  onClose: () => void;
  actions: ReactNode;
}

function EdgeSheet({ edge, share, onClose, actions }: EdgeSheetProps) {
  const look = edge ? EDGE_STATUS_LOOKS[edge.status] : null;
  const now = edge?.now ?? null;
  const load = loadPercent(now);
  const carries = edge
    ? [edge.serveVideo && 'Video on demand', edge.serveLive && 'Live channels'].filter(Boolean)
    : [];
  const peak = edge
    ? chartOf(edge.samples, CHART_WIDTH, 96, Math.round(Date.now() / 1000))?.peak
    : undefined;

  return (
    <Dialog open={edge !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        variant="sheet"
        size="md"
        title={edge?.name ?? 'Edge server'}
        description={edge?.location ?? undefined}
      >
        {edge && look ? (
          <>
            <DialogBody className="content-start">
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Badge tone={look.tone} dot={look.live ? 'live' : true}>
                  {look.label}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {look.explain}
                  {edge.status === 'OFFLINE' && edge.lastSeenAt
                    ? ` Last report ${formatRelative(edge.lastSeenAt)}.`
                    : ''}
                </p>
              </div>

              <section>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium">Traffic of the last hour</h3>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {peak ? `Peak ${formatBitrate(peak)}` : 'No reports yet'}
                  </p>
                </div>
                <TrafficChart samples={edge.samples} height={96} />
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>1 hour ago</span>
                  <span>30 min</span>
                  <span>Now</span>
                </div>
              </section>

              {now ? (
                <section>
                  <h3 className="mb-3 text-sm font-medium">Right now</h3>
                  <Facts
                    items={[
                      ['Traffic', formatBitrate(now.bitsPerSecond)],
                      [
                        'Requests',
                        `${now.requestsPerSecond} a second, ${now.activeRequests} being answered`,
                      ],
                      ['Served from copies', formatRatio(now.hitRatio)],
                      [
                        'Copies kept',
                        `${formatBytes(now.cache.bytes)} of ${formatBytes(now.cache.limitBytes)} in ${now.cache.files.toLocaleString()} files`,
                      ],
                      [
                        'Disk',
                        now.system.diskFreeBytes !== null && now.system.diskTotalBytes !== null
                          ? `${formatBytes(now.system.diskFreeBytes)} free of ${formatBytes(now.system.diskTotalBytes)}`
                          : 'Not reported',
                      ],
                      [
                        'Load',
                        load === null
                          ? 'Not reported'
                          : `${load}% of ${now.system.cpus} ${now.system.cpus === 1 ? 'processor' : 'processors'}`,
                      ],
                      ['Refused requests', now.refused.toLocaleString()],
                      ['Failed fetches', now.originErrors.toLocaleString()],
                      ['Running since', formatDateTime(now.startedAt)],
                    ]}
                  />
                </section>
              ) : null}

              <section>
                <h3 className="mb-3 text-sm font-medium">About this edge</h3>
                <Facts
                  items={[
                    ['Address', edge.publicUrl],
                    ['Carries', carries.length > 0 ? carries.join(' and ') : 'Nothing'],
                    [
                      'Share of viewers',
                      share === null
                        ? `Weight ${edge.weight}`
                        : `About ${Math.round(share * 100)}% of live viewers (weight ${edge.weight})`,
                    ],
                    ['Agent', edge.version ? `Version ${edge.version}` : 'Never connected'],
                    ['Host name', edge.hostname || '–'],
                    ['Connects from', edge.remoteIp ?? '–'],
                    ['Last report', edge.lastSeenAt ? formatRelative(edge.lastSeenAt) : 'Never'],
                    [
                      'Delivered in total',
                      `${formatBytes(edge.bytesServed)} in ${Number(edge.requestsServed).toLocaleString()} requests`,
                    ],
                    ['Added', formatDateTime(edge.createdAt)],
                  ]}
                />
              </section>
            </DialogBody>
            {actions ? <DialogFooter className="justify-start">{actions}</DialogFooter> : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface EdgeDialogProps {
  editing: EdgeServer | 'new' | null;
  onClose: () => void;
  onCreated: (created: EdgeWithToken) => void;
  onSaved: (edge: EdgeServer) => void;
}

const EMPTY: EdgeInput = {
  name: '',
  publicUrl: '',
  location: null,
  weight: 10,
  serveVideo: true,
  serveLive: true,
  enabled: true,
};

function EdgeDialog({ editing, onClose, onCreated, onSaved }: EdgeDialogProps) {
  const existing = editing !== null && editing !== 'new' ? editing : null;
  const [form, setForm] = useState<EdgeInput>(EMPTY);
  const [weightText, setWeightText] = useState('10');
  const set = (change: Partial<EdgeInput>) => setForm((current) => ({ ...current, ...change }));

  useEffect(() => {
    if (editing === null) {
      return;
    }
    const start: EdgeInput =
      editing === 'new'
        ? EMPTY
        : {
            name: editing.name,
            publicUrl: editing.publicUrl,
            location: editing.location,
            weight: editing.weight,
            serveVideo: editing.serveVideo,
            serveLive: editing.serveLive,
            enabled: editing.enabled,
          };
    setForm(start);
    setWeightText(String(start.weight));
  }, [editing]);

  const urlProblem = publicUrlProblem(form.publicUrl);
  const weight = Number(weightText);
  const weightProblem =
    Number.isInteger(weight) && weight >= 1 && weight <= 100
      ? null
      : 'A whole number from 1 to 100.';

  const save = useMutation({
    mutationFn: async () => {
      const body: EdgeInput = {
        ...form,
        name: form.name.trim(),
        publicUrl: form.publicUrl.trim(),
        location: form.location?.trim() || null,
        weight,
      };
      if (existing) {
        onSaved(await edgesApi.update(existing.id, body));
      } else {
        onCreated(await edgesApi.create(body));
      }
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.reset();
    save.mutate();
  };

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={existing ? `Edit ${existing.name}` : 'Add edge server'}
        description={
          existing
            ? undefined
            : 'Describe the server here first. You get the token for its agent in the next step.'
        }
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Name" hint="For you to tell the servers apart, such as Frankfurt 1.">
              {(id) => (
                <Input
                  id={id}
                  required
                  maxLength={80}
                  value={form.name}
                  onChange={(event) => set({ name: event.target.value })}
                />
              )}
            </Field>
            <Field
              label="Address for viewers"
              hint={
                urlProblem ??
                'Where browsers and apps reach this server. Use HTTPS: a site on HTTPS cannot play video from an address without it.'
              }
            >
              {(id) => (
                <Input
                  id={id}
                  required
                  inputMode="url"
                  placeholder="https://edge1.example.com"
                  aria-invalid={urlProblem !== null}
                  value={form.publicUrl}
                  onChange={(event) => set({ publicUrl: event.target.value })}
                />
              )}
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <Field label="Location" hint="Optional. A note, such as the city or the provider.">
                {(id) => (
                  <Input
                    id={id}
                    maxLength={80}
                    value={form.location ?? ''}
                    onChange={(event) => set({ location: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Weight" hint={weightProblem ?? 'Its share of viewers.'}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    max={100}
                    required
                    aria-invalid={weightProblem !== null}
                    value={weightText}
                    onChange={(event) => setWeightText(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              An edge with weight 20 gets twice the viewers of one with weight 10. Give a server
              with more bandwidth more weight.
            </p>

            <ToggleRow
              label="Video on demand"
              description="Films and episodes. Each video is kept on a few edges, so copies are reused."
              checked={form.serveVideo}
              onCheckedChange={(serveVideo) => set({ serveVideo })}
            />
            <ToggleRow
              label="Live channels"
              description="Live viewers are spread over all edges that carry live."
              checked={form.serveLive}
              onCheckedChange={(serveLive) => set({ serveLive })}
            />
            <ToggleRow
              label="Takes viewers"
              description="Switch off to pause the edge, for maintenance. Viewers who are watching finish their video."
              checked={form.enabled}
              onCheckedChange={(enabled) => set({ enabled })}
            />
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={
                form.name.trim() === '' ||
                form.publicUrl.trim() === '' ||
                urlProblem !== null ||
                weightProblem !== null
              }
            >
              {existing ? 'Save' : 'Add and get the token'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SetupDialogProps {
  setup: EdgeWithToken | null;
  /** The edge as the list knows it now, which tells when the agent connected. */
  current: EdgeServer | null;
  onClose: () => void;
}

/** Shows the token of an agent this once, with what to start the agent with. */
function SetupDialog({ setup, current, onClose }: SetupDialogProps) {
  const origin = window.location.origin;
  const connected =
    current !== null && (current.status === 'ONLINE' || current.status === 'DISABLED');

  return (
    <Dialog open={setup !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        title={setup ? `Start the agent of ${setup.edge.name}` : 'Start the agent'}
        description="The token is shown this once. Whoever has it can fetch every video, so keep it like a password."
      >
        {setup ? (
          <>
            <DialogBody className="[&>*]:min-w-0">
              <CopyField label="Token of the agent" value={setup.token} secret />

              <Tabs defaultValue="env" className="min-w-0">
                <TabsList>
                  <TabsTrigger value="env">Settings</TabsTrigger>
                  <TabsTrigger value="docker">Docker</TabsTrigger>
                </TabsList>
                <TabsContent value="env">
                  <CodeBlock
                    label="Settings of the agent"
                    code={agentEnvironment(origin, setup.token)}
                    note="Put these in the environment of the agent, for example in /etc/onyx-edge.env for a systemd service."
                  />
                </TabsContent>
                <TabsContent value="docker">
                  <CodeBlock
                    label="Docker command"
                    code={agentDockerCommand(origin, setup.token)}
                    note="For an image built from services/edge-agent of the repository. The agent listens on port 8080."
                  />
                </TabsContent>
              </Tabs>

              <p className="text-xs text-muted-foreground">
                The address of the main server above is the one this panel is open at. Change it if
                the edge reaches the main server at another address. The agent connects to the main
                server, so the edge needs no open port except the one for viewers at{' '}
                <span className="text-foreground">{setup.edge.publicUrl}</span>.
              </p>

              <div
                className={cn(
                  'flex items-center gap-3 rounded-lg border p-3 text-sm',
                  connected && 'border-success/30 bg-success/5',
                )}
                role="status"
              >
                {connected ? (
                  <>
                    <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                    <span>
                      The agent is connected
                      {current?.version ? `, version ${current.version}` : ''}.{' '}
                      {current?.status === 'ONLINE'
                        ? 'New viewers are sent to this edge.'
                        : 'The edge is paused and gets no viewers yet.'}
                    </span>
                  </>
                ) : (
                  <>
                    <LoaderCircle
                      className="size-4 shrink-0 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="text-muted-foreground">
                      Waiting for the agent to connect. This turns green by itself.
                    </span>
                  </>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant={connected ? 'primary' : 'secondary'} onClick={onClose}>
                {connected ? 'Done' : 'Close, I have the token'}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Several lines to carry to a terminal, with a button that copies them. */
function CodeBlock({ label, code, note }: { label: string; code: string; note: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Copying is blocked by the browser. Select the text and copy it by hand.');
    }
  };
  return (
    <div className="grid min-w-0 gap-2">
      <div className="relative min-w-0">
        <pre
          className="overflow-x-auto rounded-md border bg-muted p-3 pr-12 font-mono text-xs leading-relaxed"
          aria-label={label}
        >
          {code}
        </pre>
        <Button
          size="icon-sm"
          variant="ghost"
          className="absolute top-1.5 right-1.5"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => void copy()}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

interface EmptyDialogProps {
  edge: EdgeServer | null;
  onClose: () => void;
  onAsked: (edge: EdgeServer) => void;
}

/** Asks which copies of an edge to drop, and says what that costs. */
function EmptyDialog({ edge, onClose, onAsked }: EmptyDialogProps) {
  const [scope, setScope] = useState<PurgeScope>('all');
  useEffect(() => {
    if (edge) {
      setScope('all');
    }
  }, [edge]);

  const ask = useMutation({
    mutationFn: () => edgesApi.purge((edge as EdgeServer).id, scope),
    onSuccess: onAsked,
  });

  return (
    <Dialog open={edge !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="sm"
        title={edge ? `Empty the copies of ${edge.name}` : 'Empty the copies'}
        description="For when an edge serves something it should not, or to free its disk. Viewers keep watching: what they ask for is fetched from the main server again."
      >
        <DialogBody>
          <div className="grid gap-2" role="radiogroup" aria-label="What to empty">
            {PURGE_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                role="radio"
                aria-checked={scope === choice.value}
                onClick={() => setScope(choice.value)}
                className={cn(
                  'grid gap-0.5 rounded-lg border p-3 text-left transition-colors',
                  scope === choice.value ? 'border-primary bg-primary/5' : 'hover:bg-accent/50',
                )}
              >
                <span className="text-sm font-medium">{choice.label}</span>
                <span className="text-xs text-muted-foreground">{choice.explain}</span>
              </button>
            ))}
          </div>
          {edge?.now ? (
            <p className="text-xs text-muted-foreground">
              It keeps {formatBytes(edge.now.cache.bytes)} in{' '}
              {edge.now.cache.files.toLocaleString()} files now. Until the copies are back, this
              edge takes more from the main server.
            </p>
          ) : null}
          <ErrorNote error={ask.error} />
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={ask.isPending}
            onClick={() => {
              ask.reset();
              ask.mutate();
            }}
          >
            Empty
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
