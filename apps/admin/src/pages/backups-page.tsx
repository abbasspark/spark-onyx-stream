// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CircleAlert,
  Database,
  DatabaseBackup,
  Download,
  Film,
  Fingerprint,
  KeyRound,
  LifeBuoy,
  MoreHorizontal,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Trash2,
  X,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { backupsApi } from '@/api/endpoints';
import type { Backup, BackupOverview, BackupSettings } from '@/api/types';
import { useSession } from '@/auth/session';
import { CodeBlock } from '@/components/code-block';
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
  Table,
  Td,
  Th,
  Tr,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/overlay';
import {
  BACKUP_STATUS_LOOKS,
  dayLook,
  describeDay,
  describeSchedule,
  formatTook,
  fromOtherVersion,
  hourOptions,
  type ProtectionLook,
  protectionLook,
  restoreSteps,
  tookMs,
  triggerOf,
  weekdayOptions,
} from '@/lib/backups';
import { cn } from '@/lib/cn';
import { formatBytes, formatDateTime, formatRelative } from '@/lib/format';

const QUERY_KEY = ['backups'];

/** Backups of the database: how safe the data is, the schedule, and every backup there is. */
export function BackupsPage() {
  const { can } = useSession();
  const mayWrite = can('settings:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  /** The backup the restore guide is open for. "any" opens it without a file. */
  const [restoring, setRestoring] = useState<Backup | 'any' | null>(null);

  const overview = useQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) => backupsApi.overview(signal),
    // Live events bring changes at once. This is the net under them.
    refetchInterval: (query) =>
      query.state.data?.backups.some(
        (backup) => backup.status === 'PENDING' || backup.status === 'RUNNING',
      )
        ? 3000
        : 60_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const create = useMutation({
    mutationFn: () => backupsApi.create(),
    onSuccess: () => toast.success('The backup starts within a few seconds'),
    onError: (error) => toast.error(error.message),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (backup: Backup) => backupsApi.remove(backup.id),
    onSuccess: () => toast.success('Backup deleted'),
    onError: (error) => toast.error(error.message),
    onSettled: refresh,
  });
  const download = useMutation({
    mutationFn: (backup: Backup) => backupsApi.downloadLink(backup.id),
    // The browser follows the link as a download and stays on this page.
    onSuccess: ({ path }) => window.location.assign(apiUrl(path)),
    onError: (error) => toast.error(error.message),
  });

  const askRemove = async (backup: Backup) => {
    const data = overview.data;
    const isLastGood =
      backup.status === 'COMPLETED' &&
      data?.backups.filter((other) => other.status === 'COMPLETED').length === 1;
    const confirmed = await confirm({
      title:
        backup.status === 'COMPLETED'
          ? `Delete the backup of ${formatDateTime(backup.createdAt)}?`
          : 'Remove this entry?',
      description:
        backup.status !== 'COMPLETED'
          ? 'It holds no file. Only the line in this list goes.'
          : isLastGood
            ? 'This is the only backup there is. Without it, nothing can bring the database back.'
            : 'Its file is deleted from the storage pool. The database cannot be brought back to this moment afterwards.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(backup);
    }
  };

  const data = overview.data;
  const busy = data?.backups.some(
    (backup) => backup.status === 'PENDING' || backup.status === 'RUNNING',
  );

  return (
    <>
      <PageHeader
        title="Backups"
        description="Copies of the database, encrypted and kept in a storage pool. They bring every title, viewer, payment and setting back after a lost server or a mistake."
        actions={
          <>
            <Button variant="secondary" onClick={() => setRestoring('any')}>
              <LifeBuoy />
              How to restore
            </Button>
            {mayWrite ? (
              <Button onClick={() => create.mutate()} disabled={create.isPending || busy || !data}>
                <DatabaseBackup />
                Back up now
              </Button>
            ) : null}
          </>
        }
      />
      <ErrorNote error={overview.error} className="mb-4" />
      {overview.isPending ? (
        <div className="grid gap-6">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : null}
      {data ? (
        <div className="grid grid-cols-1 gap-6">
          <RunnerNote overview={data} />
          <ProtectionCard overview={data} />
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <HistoryCard
              overview={data}
              mayWrite={mayWrite}
              onDownload={(backup) => download.mutate(backup)}
              onRestore={setRestoring}
              onRemove={(backup) => void askRemove(backup)}
            />
            <div className="grid grid-cols-1 gap-6">
              <ScheduleCard overview={data} mayWrite={mayWrite} />
              <HoldsCard />
            </div>
          </div>
        </div>
      ) : null}
      <RestoreDialog backup={restoring} onClose={() => setRestoring(null)} />
    </>
  );
}

/** Says what stands in the way of backups, when something does. */
function RunnerNote({ overview }: { overview: BackupOverview }) {
  const problem =
    overview.runner === null
      ? {
          title: 'No process is making backups',
          text: 'Backups are made by a process with the scheduler role, and none has reported in for over a minute. In an installation with Docker Compose that is the "api" service: check that it runs with APP_ROLE=api,scheduler.',
        }
      : overview.runner.problem
        ? { title: 'Backups cannot be made', text: overview.runner.problem }
        : null;
  if (!problem) {
    return null;
  }
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="grid gap-1">
        <p className="font-medium">{problem.title}</p>
        <p className="text-muted-foreground">{problem.text}</p>
      </div>
    </div>
  );
}

const PROTECTION_STYLES: Record<
  ProtectionLook['tone'],
  { icon: typeof ShieldCheck; ring: string; text: string }
> = {
  success: { icon: ShieldCheck, ring: 'bg-success/10 text-success', text: 'text-success' },
  warning: { icon: ShieldAlert, ring: 'bg-warning/10 text-warning', text: 'text-warning' },
  danger: { icon: ShieldX, ring: 'bg-destructive/10 text-destructive', text: 'text-destructive' },
  neutral: { icon: ShieldOff, ring: 'bg-muted text-muted-foreground', text: '' },
};

function ProtectionCard({ overview }: { overview: BackupOverview }) {
  const look = protectionLook(overview);
  const style = PROTECTION_STYLES[look.tone];
  const Icon = style.icon;
  const kept = overview.backups.filter((backup) => backup.status === 'COMPLETED').length;
  const destination =
    overview.pools.find((pool) => pool.id === overview.settings.storagePoolId) ??
    overview.pools.find((pool) => pool.isDefault);

  return (
    <Card>
      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-full',
              style.ring,
            )}
          >
            <Icon className="size-6" aria-hidden="true" />
          </div>
          <div className="grid gap-1">
            <h2 className="text-lg leading-tight font-semibold">{look.title}</h2>
            <p className="max-w-xl text-sm text-muted-foreground">{look.text}</p>
          </div>
        </div>
        <DayStrip days={overview.days} />
      </div>
      <dl className="grid divide-y border-t sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        <Figure
          label="Newest backup"
          value={overview.lastGoodAt ? formatRelative(overview.lastGoodAt) : 'None'}
          note={
            overview.lastGoodAt ? formatDateTime(overview.lastGoodAt) : 'Nothing to restore from'
          }
        />
        <Figure
          label="Next backup"
          value={overview.nextRunAt ? formatRelative(overview.nextRunAt) : 'Not scheduled'}
          note={describeSchedule(overview.settings)}
        />
        <Figure
          label="Kept"
          value={`${kept} ${kept === 1 ? 'backup' : 'backups'}`}
          note={`${formatBytes(overview.totalBytes)} in all, the newest ${overview.settings.keep} stay`}
        />
        <Figure
          label="Written to"
          value={destination?.name ?? '–'}
          note={
            destination?.driver === 'S3'
              ? 'A bucket, away from this server'
              : 'On this server, with the database'
          }
        />
      </dl>
    </Card>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="grid min-w-0 content-start gap-1 p-4 sm:px-6">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-xl font-semibold tabular-nums">{value}</dd>
      <dd className="truncate text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

/** The last thirty days, one mark per day: was there a backup, did one fail. */
function DayStrip({ days }: { days: BackupOverview['days'] }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Last 30 days</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-success" aria-hidden="true" />
            Backup
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="flex size-2.5 items-center justify-center rounded-[3px] bg-destructive"
              aria-hidden="true"
            >
              <X className="size-2 text-white" strokeWidth={4} />
            </span>
            Failed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] border bg-muted" aria-hidden="true" />
            None
          </span>
        </span>
      </div>
      <ol
        className="flex justify-between gap-[2px] sm:justify-start sm:gap-[3px]"
        aria-label="Backups of the last 30 days"
      >
        {days.map((day) => {
          const look = dayLook(day);
          return (
            <li key={day.date} className="min-w-0 flex-1 lg:flex-none">
              <Tooltip content={describeDay(day)}>
                <span
                  tabIndex={0}
                  role="img"
                  aria-label={describeDay(day)}
                  className={cn(
                    'flex h-7 w-full items-center justify-center rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-3',
                    look === 'good' && 'bg-success',
                    look === 'failed' && 'bg-destructive',
                    look === 'mixed' &&
                      'bg-gradient-to-b from-success from-50% to-destructive to-50%',
                    look === 'none' && 'border bg-muted',
                  )}
                >
                  {look === 'failed' || look === 'mixed' ? (
                    <X
                      className={cn('size-2.5 text-white', look === 'mixed' && 'mt-3.5')}
                      strokeWidth={4}
                      aria-hidden="true"
                    />
                  ) : null}
                </span>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function HistoryCard({
  overview,
  mayWrite,
  onDownload,
  onRestore,
  onRemove,
}: {
  overview: BackupOverview;
  mayWrite: boolean;
  onDownload: (backup: Backup) => void;
  onRestore: (backup: Backup) => void;
  onRemove: (backup: Backup) => void;
}) {
  const copyChecksum = async (backup: Backup) => {
    try {
      await navigator.clipboard.writeText(backup.sha256 ?? '');
      toast.success('SHA-256 of the file copied');
    } catch {
      toast.error('Copying is blocked by the browser');
    }
  };

  return (
    <Card>
      <CardHeader
        title="Backups"
        description="Each one was read back and opened after it was written. What is listed as ready can be restored."
      />
      {overview.backups.length === 0 ? (
        <CardContent>
          <EmptyState icon={DatabaseBackup} title="No backup yet">
            {overview.settings.schedule === 'off'
              ? 'Make one with "Back up now", or turn the schedule on.'
              : 'The first one is made on schedule. You can also make one now.'}
          </EmptyState>
        </CardContent>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Made</Th>
              <Th>Status</Th>
              <Th className="text-right">Size</Th>
              <Th className="text-right">Took</Th>
              <Th>Holds</Th>
              <Th className="w-0" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {overview.backups.map((backup) => {
              const look = BACKUP_STATUS_LOOKS[backup.status];
              const ready = backup.status === 'COMPLETED';
              return (
                <Tr key={backup.id}>
                  <Td>
                    <p className="font-medium whitespace-nowrap">
                      {formatDateTime(backup.createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">{triggerOf(backup)}</p>
                  </Td>
                  <Td>
                    <Badge tone={look.tone} dot={look.live ? 'live' : true}>
                      {look.label}
                    </Badge>
                    {backup.status === 'PENDING' ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Starts within 20 seconds
                      </p>
                    ) : null}
                  </Td>
                  {backup.error ? (
                    <Td colSpan={3} className="min-w-64 text-xs break-words text-destructive">
                      {backup.error}
                    </Td>
                  ) : (
                    <>
                      <Td className="text-right whitespace-nowrap tabular-nums">
                        {ready ? formatBytes(backup.sizeBytes) : '–'}
                      </Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">
                        {formatTook(tookMs(backup))}
                      </Td>
                      <Td>
                        {ready ? (
                          <>
                            <p className="whitespace-nowrap tabular-nums">
                              {backup.entries?.toLocaleString()} objects
                            </p>
                            <p className="text-xs whitespace-nowrap text-muted-foreground">
                              Version {backup.appVersion}
                              {fromOtherVersion(backup, overview.appVersion)
                                ? ', not the one running'
                                : ''}
                            </p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </Td>
                    </>
                  )}
                  <Td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`More for the backup of ${formatDateTime(backup.createdAt)}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {mayWrite ? (
                          <DropdownMenuItem disabled={!ready} onSelect={() => onDownload(backup)}>
                            <Download />
                            Download
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem disabled={!ready} onSelect={() => onRestore(backup)}>
                          <LifeBuoy />
                          How to restore this one
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!backup.sha256}
                          onSelect={() => void copyChecksum(backup)}
                        >
                          <Fingerprint />
                          Copy checksum
                        </DropdownMenuItem>
                        {mayWrite ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              destructive
                              disabled={backup.status === 'RUNNING'}
                              onSelect={() => onRemove(backup)}
                            >
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

const SCHEDULE_OPTIONS = [
  { value: 'daily', label: 'Every day', description: 'At most a day of changes can be lost' },
  { value: 'weekly', label: 'Every week', description: 'For installations that change little' },
  { value: 'off', label: 'Off', description: 'Only when someone asks for one here' },
];

function sameSettings(a: BackupSettings, b: BackupSettings): boolean {
  return (
    a.schedule === b.schedule &&
    a.hour === b.hour &&
    a.weekday === b.weekday &&
    a.keep === b.keep &&
    a.storagePoolId === b.storagePoolId
  );
}

function ScheduleCard({ overview, mayWrite }: { overview: BackupOverview; mayWrite: boolean }) {
  const queryClient = useQueryClient();
  const saved = overview.settings;
  const [draft, setDraft] = useState(saved);
  const [keepText, setKeepText] = useState(String(saved.keep));
  // What another admin saved meanwhile replaces a draft nobody has touched.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) {
      setDraft(saved);
      setKeepText(String(saved.keep));
    }
  }, [saved, touched]);

  const change = (part: Partial<BackupSettings>) => {
    setTouched(true);
    setDraft((current) => ({ ...current, ...part }));
  };
  const keep = Number(keepText);
  const keepValid = /^\d+$/.test(keepText.trim()) && keep >= 1 && keep <= 365;
  const next: BackupSettings = { ...draft, keep: keepValid ? keep : draft.keep };
  const dirty = !sameSettings(next, saved) || !keepValid;

  const save = useMutation({
    mutationFn: () => backupsApi.saveSettings(next),
    onSuccess: () => {
      toast.success('Schedule saved');
      setTouched(false);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (keepValid) {
      save.mutate();
    }
  };

  const off = draft.schedule === 'off';
  const defaultPool = overview.pools.find((pool) => pool.isDefault);
  const poolOptions = [
    {
      value: 'default',
      label: `Default pool${defaultPool ? ` (${defaultPool.name})` : ''}`,
      description: 'Follows the default when it changes',
    },
    ...overview.pools
      .filter((pool) => pool.isActive || pool.id === draft.storagePoolId)
      .map((pool) => ({
        value: pool.id,
        label: pool.name,
        description:
          pool.driver === 'S3' ? 'A bucket, away from this server' : 'A folder on this server',
      })),
  ];
  const chosen =
    overview.pools.find((pool) => pool.id === draft.storagePoolId) ?? defaultPool ?? null;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Card>
      <CardHeader
        title="Schedule"
        description="When backups are made on their own, how many are kept, and where they go."
      />
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Make a backup">
            {(id) => (
              <Select
                id={id}
                value={draft.schedule}
                onValueChange={(schedule) =>
                  change({ schedule: schedule as BackupSettings['schedule'] })
                }
                options={SCHEDULE_OPTIONS}
                disabled={!mayWrite}
              />
            )}
          </Field>
          {off ? null : (
            <div className={cn('grid gap-4', draft.schedule === 'weekly' && 'sm:grid-cols-2')}>
              {draft.schedule === 'weekly' ? (
                <Field label="On">
                  {(id) => (
                    <Select
                      id={id}
                      value={String(draft.weekday)}
                      onValueChange={(weekday) => change({ weekday: Number(weekday) })}
                      options={weekdayOptions(draft.hour)}
                      disabled={!mayWrite}
                    />
                  )}
                </Field>
              ) : null}
              <Field label="At" hint={`Your time (${zone}). Choose an hour when few people watch.`}>
                {(id) => (
                  <Select
                    id={id}
                    value={String(draft.hour)}
                    onValueChange={(hour) => change({ hour: Number(hour) })}
                    options={hourOptions()}
                    disabled={!mayWrite}
                  />
                )}
              </Field>
            </div>
          )}
          <Field
            label="Keep the newest"
            hint={
              keepValid
                ? off
                  ? 'Older backups are deleted when a new one is ready.'
                  : `Reaches back about ${keep} ${draft.schedule === 'weekly' ? 'week' : 'day'}${keep === 1 ? '' : 's'}. Older backups are deleted when a new one is ready.`
                : 'A number from 1 to 365.'
            }
          >
            {(id) => (
              <div className="flex items-center gap-2">
                <Input
                  id={id}
                  inputMode="numeric"
                  className="w-24"
                  value={keepText}
                  aria-invalid={!keepValid}
                  onChange={(event) => {
                    setTouched(true);
                    setKeepText(event.target.value);
                  }}
                  disabled={!mayWrite}
                />
                <span className="text-sm text-muted-foreground">backups</span>
              </div>
            )}
          </Field>
          <Field
            label="Write them to"
            hint={
              chosen?.driver === 'S3'
                ? 'Away from this server: these backups survive when the server is lost.'
                : 'On the same server as the database. When its disk is lost, these backups go with it: use a bucket, or download a backup now and then.'
            }
          >
            {(id) => (
              <Select
                id={id}
                value={draft.storagePoolId ?? 'default'}
                onValueChange={(pool) =>
                  change({ storagePoolId: pool === 'default' ? null : pool })
                }
                options={poolOptions}
                disabled={!mayWrite}
              />
            )}
          </Field>
          {mayWrite ? (
            <div className="flex items-center justify-end gap-2">
              {dirty && touched ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setTouched(false);
                    setDraft(saved);
                    setKeepText(String(saved.keep));
                  }}
                >
                  Discard
                </Button>
              ) : null}
              <Button type="submit" disabled={!dirty || !keepValid || save.isPending}>
                Save schedule
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

/** What a backup holds and what it does not. The second half is what people learn too late. */
function HoldsCard() {
  const rows: { icon: typeof Database; held: boolean; title: string; text: ReactNode }[] = [
    {
      icon: Database,
      held: true,
      title: 'The database',
      text: 'Titles, channels, viewers, subscriptions, payments, admins and every setting made in this panel.',
    },
    {
      icon: Film,
      held: false,
      title: 'Video and image files',
      text: 'They stay in the storage pools and are far too large for this. Copy the storage volume as well, or keep the files in a bucket.',
    },
    {
      icon: KeyRound,
      held: false,
      title: 'The .env file',
      text: (
        <>
          It holds <code className="font-mono">MASTER_KEY</code>. Backups are encrypted under it,
          and none opens without it. Keep a copy of the file somewhere other than the server.
        </>
      ),
    },
  ];
  return (
    <Card>
      <CardHeader title="What a backup holds" />
      <CardContent>
        <ul className="grid gap-4">
          {rows.map((row) => (
            <li key={row.title} className="flex items-start gap-3">
              <div className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <row.icon className="size-4" aria-hidden="true" />
                <span
                  className={cn(
                    'absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full text-white ring-2 ring-card',
                    row.held ? 'bg-success' : 'bg-muted-foreground',
                  )}
                >
                  {row.held ? (
                    <Check className="size-2.5" strokeWidth={4} aria-hidden="true" />
                  ) : (
                    <X className="size-2.5" strokeWidth={4} aria-hidden="true" />
                  )}
                </span>
              </div>
              <div className="grid gap-0.5">
                <p className="text-sm font-medium">
                  {row.title}
                  <span className="font-normal text-muted-foreground">
                    {row.held ? ' is in every backup' : ' is not in a backup'}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">{row.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function RestoreDialog({
  backup,
  onClose,
}: {
  backup: Backup | 'any' | null;
  onClose: () => void;
}) {
  const chosen = backup && backup !== 'any' ? backup : null;
  const steps = restoreSteps(chosen?.fileName ?? null);
  return (
    <Dialog open={backup !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        size="lg"
        title={
          chosen ? `Restore the backup of ${formatDateTime(chosen.createdAt)}` : 'Restore a backup'
        }
        description="Done on the server, in a terminal, because the panel is part of what is being replaced. These are the commands for an installation run with Docker Compose."
      >
        <DialogBody className="grid gap-6">
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <p>
              A restore replaces the whole database. Everything that changed after the backup was
              made is gone afterwards: new viewers, payments, titles. Video files are not touched.
            </p>
          </div>
          <ol className="grid gap-6">
            {steps.map((step, index) => (
              <li key={step.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
                <span
                  className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h3 className="text-sm leading-6 font-semibold">{step.title}</h3>
                <div className="col-start-2 grid min-w-0 gap-2">
                  {step.code ? (
                    <CodeBlock label={step.title} code={step.code} note={step.text} />
                  ) : (
                    <p className="text-xs text-muted-foreground">{step.text}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
