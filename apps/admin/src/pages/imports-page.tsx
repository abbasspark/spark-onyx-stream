// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Cloud,
  FolderOpen,
  FolderSearch,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Replace,
  RotateCcw,
  Search,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { metadataApi, profilesApi, storageApi, watchApi } from '@/api/endpoints';
import type {
  TitleType,
  WatchAfterImport,
  WatchedFile,
  WatchedFileState,
  WatchLocation,
  WatchPlaceInput,
  WatchPlaceTest,
  WatchProcessingMode,
  WatchS3Config,
} from '@/api/types';
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
  Pagination,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Field, Input, Select, Switch, ToggleRow } from '@/components/ui/form';
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
import { titlePath } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatBytes, formatRelative } from '@/lib/format';
import {
  ATTENTION_STATES,
  countIn,
  intervalText,
  parseTmdbReference,
  placeOf,
  recognisedAs,
  WATCH_STATE_LOOKS,
} from '@/lib/watch';

const PAGE_SIZE = 50;
const STATES = Object.keys(WATCH_STATE_LOOKS) as WatchedFileState[];

/** How a file has to be named, with examples. The one thing an operator must know. */
function NamingGuide() {
  const example = (name: string, means: string) => (
    <li className="grid gap-0.5 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] sm:gap-4">
      <code className="truncate font-mono text-[13px] text-foreground">{name}</code>
      <span className="text-muted-foreground">{means}</span>
    </li>
  );
  return (
    <Card>
      <CardHeader
        title="How to name the files"
        description="The name starts with the id of the movie or series at TMDB. The rest of the name is yours."
      />
      <CardContent className="grid gap-3 text-sm">
        <ul className="grid gap-2">
          {example('603_the-matrix.mkv', 'The movie with the id 603')}
          {example('1399_S01E05_the-pointy-end.mp4', 'Season 1, episode 5 of the series 1399')}
          {example(
            '603_the-matrix.en.srt',
            'English subtitles of that video. Added to it, and moved with it',
          )}
          {example('603_the-matrix.de.forced.srt', 'The forced German track')}
        </ul>
        <p className="text-muted-foreground">
          You find the id in the address of the title at themoviedb.org. Dashes, dots and spaces
          work like the underscore. Files named otherwise are listed below as “Not recognised”, for
          you to say what they are.
        </p>
      </CardContent>
    </Card>
  );
}

/** Watched folders and buckets, and what became of the files found in them. */
export function ImportsPage() {
  const { can } = useSession();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const mayManage = can('storage:write');
  const mayAct = can('catalog:write');
  const maySeeLocations = can('storage:read');
  const [params, change] = useAddressParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const locationId = params.get('location') ?? '';
  const stateParam = params.get('state') ?? '';
  const state = (STATES as readonly string[]).includes(stateParam)
    ? (stateParam as WatchedFileState)
    : '';
  const [search, setSearch] = useState(q);
  // null: closed, 'new': empty form, a location: editing it.
  const [editing, setEditing] = useState<WatchLocation | 'new' | null>(null);
  const [matching, setMatching] = useState<WatchedFile | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() !== q) {
        change({ q: search.trim() || null, page: null });
      }
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const locations = useQuery({
    queryKey: ['watch', 'locations'],
    queryFn: ({ signal }) => watchApi.locations(signal),
    enabled: maySeeLocations,
    // Counts and the time of the last look move on their own.
    refetchInterval: 20_000,
  });
  const summary = useQuery({
    queryKey: ['watch', 'summary'],
    queryFn: ({ signal }) => watchApi.summary(signal),
    refetchInterval: 20_000,
  });
  const files = useQuery({
    queryKey: ['watch', 'files', { page, q, locationId, state }],
    queryFn: ({ signal }) =>
      watchApi.files(
        {
          page,
          pageSize: PAGE_SIZE,
          q: q || undefined,
          locationId: locationId || undefined,
          state: state || undefined,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['watch'] });
  const onError = (error: Error) => toast.error(error.message);

  const scan = useMutation({
    mutationFn: (location: WatchLocation) => watchApi.scan(location.id),
    onSuccess: (location) => {
      toast.success(`"${location.name}" is looked through within a few seconds`);
      refresh();
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (location: WatchLocation) =>
      watchApi.updateLocation(location.id, { isActive: !location.isActive }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    mutationFn: (location: WatchLocation) => watchApi.removeLocation(location.id),
    onSuccess: () => {
      toast.success('Location removed');
      refresh();
    },
    onError,
  });
  const retry = useMutation({
    mutationFn: ({ file, replace }: { file: WatchedFile; replace: boolean }) =>
      watchApi.retry(file.id, replace),
    onSuccess: () => {
      toast.success('Queued. It is imported with the next look');
      refresh();
    },
    onError,
  });
  const retryAll = useMutation({
    mutationFn: () => watchApi.retryAll(locationId || undefined),
    onSuccess: ({ queued }) => {
      toast.success(`${queued} ${queued === 1 ? 'file' : 'files'} queued again`);
      refresh();
    },
    onError,
  });
  const ignore = useMutation({
    mutationFn: (file: WatchedFile) => watchApi.ignore(file.id),
    onSuccess: refresh,
    onError,
  });

  const askRemove = async (location: WatchLocation) => {
    const confirmed = await confirm({
      title: `Remove the location "${location.name}"?`,
      description:
        'It is no longer looked through, and the list of its files is forgotten. The files themselves, and everything imported from it, stay.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(location);
    }
  };
  const askReplace = async (file: WatchedFile) => {
    const confirmed = await confirm({
      title: 'Replace the video?',
      description:
        'This file takes the place of the video the title or episode has now. A published title keeps its video until the new one plays. The old video stays in the library.',
      confirmLabel: 'Replace the video',
    });
    if (confirmed) {
      retry.mutate({ file, replace: true });
    }
  };

  const counts = summary.data?.counts ?? {};
  const total = STATES.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  const items = files.data?.items ?? [];
  const list = locations.data ?? [];
  const addButton = mayManage ? (
    <Button variant="primary" onClick={() => setEditing('new')}>
      <Plus />
      Add a location
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Imports"
        description="Folders and buckets that are looked through for new videos. A file named by its TMDB id becomes a movie or an episode by itself."
        actions={addButton}
      />

      <div className="grid gap-6">
        <ErrorNote error={locations.error} />
        {locations.isPending && maySeeLocations ? <Skeleton className="h-40 rounded-xl" /> : null}
        {locations.data && list.length === 0 ? (
          <EmptyState icon={FolderSearch} title="No watched location yet" action={addButton}>
            Add a folder on the server or an S3-compatible bucket. Videos you put there are imported
            with their details, artwork and cast from TMDB.
          </EmptyState>
        ) : null}

        {list.length > 0 ? (
          <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {list.map((location) => {
              const attention = countIn(location.counts, ATTENTION_STATES);
              const moving = countIn(location.counts, ['WAITING', 'QUEUED', 'IMPORTING']);
              return (
                <li key={location.id}>
                  <Card className={cn('h-full', !location.isActive && 'opacity-70')}>
                    <CardContent className="grid gap-4">
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          {location.driver === 'S3' ? (
                            <Cloud className="size-5" aria-hidden="true" />
                          ) : (
                            <FolderOpen className="size-5" aria-hidden="true" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{location.name}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {placeOf(location)}
                          </p>
                        </div>
                        {mayManage ? (
                          <Tooltip content={location.isActive ? 'Pause' : 'Turn on'}>
                            <span>
                              <Switch
                                aria-label={`${location.name} is looked through`}
                                checked={location.isActive}
                                disabled={toggle.isPending}
                                onCheckedChange={() => toggle.mutate(location)}
                              />
                            </span>
                          </Tooltip>
                        ) : null}
                        {mayManage ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${location.name}`}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setEditing(location)}>
                                <Pencil />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                destructive
                                onSelect={() => void askRemove(location)}
                              >
                                <Trash2 />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>

                      {location.lastScanError ? (
                        <p
                          role="alert"
                          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                        >
                          Could not be read: {location.lastScanError}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={location.counts.IMPORTED ? 'success' : 'neutral'}>
                          {location.counts.IMPORTED ?? 0} imported
                        </Badge>
                        {moving > 0 ? <Badge tone="info">{moving} on their way</Badge> : null}
                        {attention > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              change({ location: location.id, state: null, page: null })
                            }
                          >
                            <Badge tone="warning">{attention} need you</Badge>
                          </button>
                        ) : null}
                        {location.autoPublish ? (
                          <Badge tone="primary">Publishes itself</Badge>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {location.isActive
                            ? `Looked through ${intervalText(location.scanIntervalMinutes)}`
                            : 'Paused'}
                          {location.lastScanAt
                            ? `, last ${formatRelative(location.lastScanAt)}`
                            : ', not yet'}
                        </span>
                        {mayAct && location.isActive ? (
                          <Button
                            size="sm"
                            loading={
                              location.scanRequested ||
                              (scan.isPending && scan.variables?.id === location.id)
                            }
                            onClick={() => scan.mutate(location)}
                          >
                            <RefreshCw />
                            Look now
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : null}

        <NamingGuide />

        <section aria-label="Files" className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="Search by file name"
                aria-label="Search by file name"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              aria-label="Filter by state"
              className="w-56"
              value={state || 'ALL'}
              onValueChange={(value) =>
                change({ state: value === 'ALL' ? null : value, page: null })
              }
              options={[
                { value: 'ALL', label: `All files (${total})` },
                ...STATES.map((value) => ({
                  value,
                  label: `${WATCH_STATE_LOOKS[value].label} (${counts[value] ?? 0})`,
                  description: WATCH_STATE_LOOKS[value].about,
                })),
              ]}
            />
            {list.length > 1 ? (
              <Select
                aria-label="Filter by location"
                className="w-48"
                value={locationId || 'ALL'}
                onValueChange={(value) =>
                  change({ location: value === 'ALL' ? null : value, page: null })
                }
                options={[
                  { value: 'ALL', label: 'All locations' },
                  ...list.map((location) => ({ value: location.id, label: location.name })),
                ]}
              />
            ) : null}
            {q || state || locationId ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch('');
                  change({ q: null, state: null, location: null, page: null });
                }}
              >
                <X />
                Clear
              </Button>
            ) : null}
            {mayAct && (counts.FAILED ?? 0) > 0 ? (
              <Button
                className="ml-auto"
                loading={retryAll.isPending}
                onClick={() => retryAll.mutate()}
              >
                <RotateCcw />
                Try the failed again
              </Button>
            ) : null}
          </div>

          {(summary.data?.attention ?? 0) > 0 && !state ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Waiting for you:</span>
              {ATTENTION_STATES.filter((key) => counts[key]).map((key) => (
                <button key={key} type="button" onClick={() => change({ state: key, page: null })}>
                  <Badge tone={WATCH_STATE_LOOKS[key].tone}>
                    {counts[key]} {WATCH_STATE_LOOKS[key].label.toLowerCase()}
                  </Badge>
                </button>
              ))}
            </div>
          ) : null}

          <ErrorNote error={files.error} />
          {files.isPending ? <Skeleton className="h-64 rounded-xl" /> : null}
          {files.data && items.length === 0 ? (
            <EmptyState
              icon={FolderSearch}
              title={q || state || locationId ? 'No file matches' : 'No files yet'}
            >
              {q || state || locationId
                ? 'Try another search or filter.'
                : 'Files appear here as soon as a location has been looked through.'}
            </EmptyState>
          ) : null}

          {items.length > 0 ? (
            <Card className="overflow-hidden">
              <Table>
                <thead>
                  <tr>
                    <Th>File</Th>
                    <Th>Became</Th>
                    <Th>State</Th>
                    <Th>Seen</Th>
                    <Th className="w-10" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((file) => {
                    const look = WATCH_STATE_LOOKS[file.state];
                    const guess = recognisedAs(file);
                    return (
                      <Tr key={file.id}>
                        <Td className="max-w-md">
                          <p className="truncate font-mono text-[13px]" title={file.path}>
                            {file.path}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatBytes(file.size)} · {file.location.name}
                          </p>
                        </Td>
                        <Td className="max-w-xs">
                          {file.title ? (
                            <Link
                              to={titlePath(file.title)}
                              className="block truncate font-medium hover:underline"
                            >
                              {file.title.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{guess ?? '–'}</span>
                          )}
                          {file.title && (file.episode || guess) ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {file.episode
                                ? `${guess?.split(' · ')[1] ?? ''} ${file.episode.name}`.trim()
                                : guess}
                              {file.matchedByHand ? ' · matched by hand' : ''}
                            </p>
                          ) : null}
                        </Td>
                        <Td className="max-w-sm">
                          <Badge tone={look.tone} dot={file.state === 'IMPORTING' ? 'live' : true}>
                            {look.label}
                          </Badge>
                          {file.publishPending ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              publishes when the video plays
                            </span>
                          ) : null}
                          {file.note ? (
                            <p className="mt-1 text-xs text-muted-foreground">{file.note}</p>
                          ) : null}
                        </Td>
                        <Td className="whitespace-nowrap text-muted-foreground">
                          {formatRelative(file.importedAt ?? file.firstSeenAt)}
                        </Td>
                        <Td>
                          {mayAct && file.state !== 'IMPORTED' && file.state !== 'IMPORTING' ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Actions for ${file.path}`}
                                >
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setMatching(file)}>
                                  <Wand2 />
                                  {file.metadataId ? 'Say it is something else' : 'Say what it is'}
                                </DropdownMenuItem>
                                {file.state === 'CONFLICT' ? (
                                  <DropdownMenuItem onSelect={() => void askReplace(file)}>
                                    <Replace />
                                    Replace the video
                                  </DropdownMenuItem>
                                ) : null}
                                {file.state === 'FAILED' || file.state === 'IGNORED' ? (
                                  <DropdownMenuItem
                                    onSelect={() => retry.mutate({ file, replace: false })}
                                  >
                                    <RotateCcw />
                                    Try again
                                  </DropdownMenuItem>
                                ) : null}
                                {file.state !== 'IGNORED' ? (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => ignore.mutate(file)}>
                                      <X />
                                      Set aside
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          ) : null}

          {files.data ? (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={files.data.total}
              onChange={(next) => change({ page: next === 1 ? null : String(next) })}
            />
          ) : null}
        </section>
      </div>

      <LocationDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={(location) => {
          toast.success(`Location "${location.name}" saved`);
          setEditing(null);
          refresh();
        }}
      />
      <MatchDialog
        file={matching}
        onClose={() => setMatching(null)}
        onMatched={() => {
          toast.success('Queued. It is imported with the next look');
          setMatching(null);
          refresh();
        }}
      />
    </>
  );
}

const EMPTY_S3 = {
  bucket: '',
  region: 'us-east-1',
  endpoint: '',
  keyPrefix: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: false,
};

const INTERVALS = [1, 5, 15, 30, 60, 180, 360, 720, 1440];

interface LocationDialogProps {
  target: WatchLocation | 'new' | null;
  onClose: () => void;
  onSaved: (location: WatchLocation) => void;
}

/** Adds a watched location or changes one: where it is, and what happens with what is found. */
function LocationDialog({ target, onClose, onSaved }: LocationDialogProps) {
  const location = target === 'new' || target === null ? undefined : target;
  const open = target !== null;
  const [name, setName] = useState('');
  const [driver, setDriver] = useState<'LOCAL' | 'S3'>('LOCAL');
  const [basePath, setBasePath] = useState('');
  const [s3, setS3] = useState(EMPTY_S3);
  const setS3Field = (values: Partial<typeof s3>) =>
    setS3((current) => ({ ...current, ...values }));
  const [interval, setMinutes] = useState(5);
  const [poolId, setPoolId] = useState('');
  const [mode, setMode] = useState<WatchProcessingMode | ''>('');
  const [profileId, setProfileId] = useState('');
  const [autoPublish, setAutoPublish] = useState(false);
  const [afterImport, setAfterImport] = useState<WatchAfterImport>('MOVE');
  const [tested, setTested] = useState<WatchPlaceTest | null>(null);

  const pools = useQuery({
    queryKey: ['storage-pools'],
    queryFn: ({ signal }) => storageApi.list(signal),
    enabled: open,
  });
  const profiles = useQuery({
    queryKey: ['encoding-profiles'],
    queryFn: ({ signal }) => profilesApi.list(signal),
    enabled: open,
  });

  /** The place as typed. For an existing bucket the secret may be left empty. */
  const place = (): WatchPlaceInput =>
    driver === 'LOCAL'
      ? { driver, config: { basePath: basePath.trim() } }
      : {
          driver,
          config: {
            bucket: s3.bucket.trim(),
            region: s3.region.trim() || 'us-east-1',
            ...(s3.endpoint.trim() ? { endpoint: s3.endpoint.trim() } : {}),
            ...(s3.keyPrefix.trim() ? { keyPrefix: s3.keyPrefix.trim() } : {}),
            forcePathStyle: s3.forcePathStyle,
            accessKeyId: s3.accessKeyId.trim(),
            secretAccessKey: s3.secretAccessKey,
          },
        };
  const settings = () => ({
    name: name.trim(),
    scanIntervalMinutes: interval,
    storagePoolId: poolId || null,
    processingMode: mode || null,
    encodingProfileId: mode === 'TRANSCODE' && profileId ? profileId : null,
    autoPublish,
    afterImport,
  });

  const test = useMutation({
    mutationFn: () => watchApi.test(place()),
    onSuccess: setTested,
    onError: () => setTested(null),
  });
  const save = useMutation({
    mutationFn: () => {
      if (!location) {
        return watchApi.createLocation({ ...place(), ...settings() });
      }
      const typed = place();
      const config: Record<string, unknown> =
        typed.driver === 'LOCAL'
          ? typed.config
          : {
              ...typed.config,
              endpoint: s3.endpoint.trim() || null,
              keyPrefix: s3.keyPrefix.trim() || null,
              // An empty secret keeps the stored one.
              secretAccessKey: s3.secretAccessKey || undefined,
            };
      return watchApi.updateLocation(location.id, { ...settings(), config });
    },
    onSuccess: onSaved,
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    save.reset();
    test.reset();
    setTested(null);
    setName(location?.name ?? '');
    setDriver(location?.driver ?? 'LOCAL');
    setBasePath(
      location?.driver === 'LOCAL' ? (location.config as { basePath: string }).basePath : '',
    );
    const bucket = location?.driver === 'S3' ? (location.config as WatchS3Config) : undefined;
    setS3(
      bucket
        ? {
            bucket: bucket.bucket,
            region: bucket.region,
            endpoint: bucket.endpoint ?? '',
            keyPrefix: bucket.keyPrefix ?? '',
            accessKeyId: bucket.accessKeyId,
            secretAccessKey: '',
            forcePathStyle: bucket.forcePathStyle,
          }
        : EMPTY_S3,
    );
    setMinutes(location?.scanIntervalMinutes ?? 5);
    setPoolId(location?.storagePool?.id ?? '');
    setMode(location?.processingMode ?? '');
    setProfileId(location?.encodingProfile?.id ?? '');
    setAutoPublish(location?.autoPublish ?? false);
    setAfterImport(location?.afterImport ?? 'MOVE');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  // A bucket that exists keeps its secret, so it can only be tried once the secret is typed again.
  const canTest =
    driver === 'LOCAL'
      ? basePath.trim() !== ''
      : s3.bucket.trim() !== '' && s3.accessKeyId.trim() !== '' && s3.secretAccessKey !== '';
  const intervals = INTERVALS.includes(interval)
    ? INTERVALS
    : [...INTERVALS, interval].sort((a, b) => a - b);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        variant="sheet"
        title={location ? `Edit "${location.name}"` : 'Add a watched location'}
        description="A place you put videos into. It is looked through again and again, and what is new is imported."
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  required
                  maxLength={64}
                  placeholder="Incoming"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>

            {location ? null : (
              <Field label="Kind">
                {(id) => (
                  <Select
                    id={id}
                    value={driver}
                    onValueChange={(value) => {
                      setDriver(value as 'LOCAL' | 'S3');
                      setTested(null);
                    }}
                    options={[
                      {
                        value: 'LOCAL',
                        label: 'Folder on the server',
                        description: 'A path the API can read and write.',
                      },
                      {
                        value: 'S3',
                        label: 'S3-compatible bucket',
                        description: 'Amazon S3, Cloudflare R2, Wasabi, MinIO and others.',
                      },
                    ]}
                  />
                )}
              </Field>
            )}

            {driver === 'LOCAL' ? (
              <Field
                label="Folder"
                hint="An absolute path on the server. With Docker, the folder /watch of the API container is your folder “watch” beside the Compose file."
              >
                {(id) => (
                  <Input
                    id={id}
                    required
                    className="font-mono"
                    placeholder="/watch"
                    value={basePath}
                    onChange={(event) => setBasePath(event.target.value)}
                  />
                )}
              </Field>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Bucket">
                    {(id) => (
                      <Input
                        id={id}
                        required
                        value={s3.bucket}
                        onChange={(event) => setS3Field({ bucket: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Region">
                    {(id) => (
                      <Input
                        id={id}
                        value={s3.region}
                        onChange={(event) => setS3Field({ region: event.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <Field label="Endpoint" hint="Leave empty for Amazon S3.">
                  {(id) => (
                    <Input
                      id={id}
                      type="url"
                      placeholder="https://s3.example.com"
                      value={s3.endpoint}
                      onChange={(event) => setS3Field({ endpoint: event.target.value })}
                    />
                  )}
                </Field>
                <Field
                  label="Folder in the bucket"
                  hint="Optional. Only this prefix is looked through."
                >
                  {(id) => (
                    <Input
                      id={id}
                      className="font-mono"
                      placeholder="incoming"
                      value={s3.keyPrefix}
                      onChange={(event) => setS3Field({ keyPrefix: event.target.value })}
                    />
                  )}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Access key">
                    {(id) => (
                      <Input
                        id={id}
                        required
                        autoComplete="off"
                        value={s3.accessKeyId}
                        onChange={(event) => setS3Field({ accessKeyId: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field
                    label="Secret key"
                    hint={location ? 'Leave empty to keep the stored one.' : undefined}
                  >
                    {(id) => (
                      <Input
                        id={id}
                        type="password"
                        required={!location}
                        autoComplete="new-password"
                        value={s3.secretAccessKey}
                        onChange={(event) => setS3Field({ secretAccessKey: event.target.value })}
                      />
                    )}
                  </Field>
                </div>
                <ToggleRow
                  label="Path-style addresses"
                  description="Needed by MinIO and some other services."
                  checked={s3.forcePathStyle}
                  onCheckedChange={(checked) => setS3Field({ forcePathStyle: checked })}
                />
                <p className="text-xs text-muted-foreground">
                  The key must be allowed to list, read, write and delete in this place: imported
                  files are moved into its folder “imported”.
                </p>
              </>
            )}

            <div className="grid gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Try it before you save</p>
                <Button
                  type="button"
                  size="sm"
                  loading={test.isPending}
                  disabled={!canTest}
                  onClick={() => test.mutate()}
                >
                  <FolderSearch />
                  Look into it
                </Button>
              </div>
              <ErrorNote error={test.error} />
              {tested ? (
                <div className="grid gap-2 text-sm">
                  <p>
                    <span className="font-medium">
                      {tested.videos} {tested.videos === 1 ? 'video' : 'videos'}
                    </span>{' '}
                    among {tested.files}
                    {tested.capped ? '+' : ''} {tested.files === 1 ? 'file' : 'files'},{' '}
                    <span className={cn(tested.recognised > 0 && 'text-success')}>
                      {tested.recognised} named by their TMDB id
                    </span>
                    .
                  </p>
                  {tested.writable ? null : (
                    <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                      The folder can be read but not written, so imported files cannot be moved or
                      deleted: they stay where they are. To change that, make the folder writable
                      for the user the API runs as (with Docker: sudo chown 1000:1000 on the
                      folder).
                    </p>
                  )}
                  {tested.samples.length > 0 ? (
                    <ul className="grid gap-1 text-xs">
                      {tested.samples.map((sample) => (
                        <li key={sample.path} className="flex items-baseline justify-between gap-3">
                          <code className="truncate font-mono">{sample.path}</code>
                          <span
                            className={cn(
                              'shrink-0',
                              sample.recognisedAs ? 'text-success' : 'text-warning',
                            )}
                          >
                            {sample.recognisedAs ?? 'not recognised'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Shows whether the place can be read and how its files would be understood. Nothing
                  is imported.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Looked through">
                {(id) => (
                  <Select
                    id={id}
                    value={String(interval)}
                    onValueChange={(value) => setMinutes(Number(value))}
                    options={intervals.map((minutes) => ({
                      value: String(minutes),
                      label: intervalText(minutes).replace(/^./, (letter) => letter.toUpperCase()),
                    }))}
                  />
                )}
              </Field>
              <Field label="Videos are stored in">
                {(id) => (
                  <Select
                    id={id}
                    value={poolId || 'default'}
                    onValueChange={(value) => setPoolId(value === 'default' ? '' : value)}
                    options={[
                      { value: 'default', label: 'The default pool' },
                      ...(pools.data ?? [])
                        .filter((pool) => pool.isActive)
                        .map((pool) => ({ value: pool.id, label: pool.name })),
                    ]}
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Processing">
                {(id) => (
                  <Select
                    id={id}
                    value={mode || 'auto'}
                    onValueChange={(value) =>
                      setMode(value === 'auto' ? '' : (value as WatchProcessingMode))
                    }
                    options={[
                      {
                        value: 'auto',
                        label: 'Decided per video',
                        description: 'As for an upload: copied when the file allows it',
                      },
                      {
                        value: 'COPY',
                        label: 'Copy',
                        description: 'Keeps the picture and sound as they are',
                      },
                      {
                        value: 'TRANSCODE',
                        label: 'Transcode',
                        description: 'Encodes the qualities of a profile',
                      },
                    ]}
                  />
                )}
              </Field>
              {mode === 'TRANSCODE' ? (
                <Field label="Encoding profile">
                  {(id) => (
                    <Select
                      id={id}
                      value={profileId || 'default'}
                      onValueChange={(value) => setProfileId(value === 'default' ? '' : value)}
                      options={[
                        { value: 'default', label: 'The default profile' },
                        ...(profiles.data ?? []).map((profile) => ({
                          value: profile.id,
                          label: profile.name,
                        })),
                      ]}
                    />
                  )}
                </Field>
              ) : null}
            </div>
            <Field label="After a file is imported">
              {(id) => (
                <Select
                  id={id}
                  value={afterImport}
                  onValueChange={(value) => setAfterImport(value as WatchAfterImport)}
                  options={[
                    {
                      value: 'MOVE',
                      label: 'Move it to the folder “imported”',
                      description: 'Inside the location. You delete it when you like',
                    },
                    {
                      value: 'KEEP',
                      label: 'Leave it where it is',
                      description: 'It is not imported a second time',
                    },
                    {
                      value: 'DELETE',
                      label: 'Delete it',
                      description: 'Its copy in the library is the only one then',
                    },
                  ]}
                />
              )}
            </Field>
            <ToggleRow
              label="Publish by itself"
              description="On, a movie or episode is published as soon as its video plays. Off, imports stay drafts until you publish them."
              checked={autoPublish}
              onCheckedChange={setAutoPublish}
            />
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {location ? 'Save' : 'Add location'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface MatchDialogProps {
  file: WatchedFile | null;
  onClose: () => void;
  onMatched: () => void;
}

/** Says what a file is: found by name at TMDB, or by its id. */
function MatchDialog({ file, onClose, onMatched }: MatchDialogProps) {
  const [kind, setKind] = useState<TitleType>('MOVIE');
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<{ id: number; name: string } | null>(null);
  const [season, setSeason] = useState('1');
  const [episode, setEpisode] = useState('1');

  useEffect(() => {
    if (file) {
      const [source, id] = (file.metadataId ?? '').split(':');
      setKind(source === 'tv' ? 'SERIES' : 'MOVIE');
      setText(id ?? '');
      setPicked(null);
      setSeason(String(file.seasonNumber ?? 1));
      setEpisode(String(file.episodeNumber ?? 1));
    }
  }, [file]);
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(text.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [text]);

  const reference = parseTmdbReference(text);
  // An address of TMDB says which kind is meant.
  useEffect(() => {
    if (reference?.kind && reference.kind !== kind) {
      setKind(reference.kind);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference?.kind]);

  const status = useQuery({
    queryKey: ['metadata', 'status'],
    queryFn: ({ signal }) => metadataApi.status(signal),
    staleTime: 300_000,
  });
  const searching =
    file !== null && !reference && term.length >= 2 && status.data?.enabled === true;
  const search = useQuery({
    queryKey: ['metadata', 'search', kind, term, undefined, undefined],
    queryFn: ({ signal }) => metadataApi.search({ type: kind, q: term }, signal),
    enabled: searching,
    placeholderData: keepPreviousData,
  });

  const tmdbId = reference?.id ?? picked?.id ?? null;
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);
  const numbersFine =
    kind === 'MOVIE' ||
    (Number.isInteger(seasonNumber) &&
      seasonNumber >= 0 &&
      Number.isInteger(episodeNumber) &&
      episodeNumber >= 1);

  const match = useMutation({
    mutationFn: () =>
      watchApi.match((file as WatchedFile).id, {
        kind,
        tmdbId: tmdbId as number,
        ...(kind === 'SERIES' ? { seasonNumber, episodeNumber } : {}),
      }),
    onSuccess: onMatched,
  });
  useEffect(() => {
    if (file) {
      match.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    match.mutate();
  };

  return (
    <Dialog open={file !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title="What is this file?" description={file ? file.path : undefined}>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            <Field label="It is">
              {(id) => (
                <Select
                  id={id}
                  value={kind}
                  onValueChange={(value) => {
                    setKind(value as TitleType);
                    setPicked(null);
                  }}
                  options={[
                    { value: 'MOVIE', label: 'A movie' },
                    { value: 'SERIES', label: 'An episode of a series' },
                  ]}
                />
              )}
            </Field>
            <Field
              label={kind === 'MOVIE' ? 'Which movie' : 'Which series'}
              hint="Type a name to search TMDB, or paste its id or its address at themoviedb.org."
            >
              {(id) => (
                <Input
                  id={id}
                  autoFocus
                  autoComplete="off"
                  placeholder={kind === 'MOVIE' ? 'The Matrix, or 603' : 'Game of Thrones, or 1399'}
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setPicked(null);
                  }}
                />
              )}
            </Field>

            {picked ? (
              <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">
                Chosen: <span className="font-medium">{picked.name}</span>{' '}
                <span className="text-muted-foreground">(id {picked.id})</span>
              </p>
            ) : reference ? (
              <p className="text-sm text-muted-foreground">
                The {kind === 'MOVIE' ? 'movie' : 'series'} with the id{' '}
                <span className="font-medium text-foreground">{reference.id}</span> at TMDB.
              </p>
            ) : null}

            {searching ? (
              <div className="grid gap-1">
                <ErrorNote error={search.error} />
                {search.isPending ? <Skeleton className="h-24 rounded-lg" /> : null}
                {search.data?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">TMDB knows nothing by that name.</p>
                ) : null}
                <ul className="grid max-h-64 gap-1 overflow-y-auto">
                  {(search.data ?? []).slice(0, 8).map((result) => {
                    const id = Number(result.id.split(':')[1]);
                    return (
                      <li key={result.id}>
                        <button
                          type="button"
                          onClick={() => setPicked({ id, name: result.name })}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                            picked?.id === id && 'border-primary bg-primary/5',
                          )}
                        >
                          <span className="aspect-[2/3] w-8 shrink-0 overflow-hidden rounded bg-muted">
                            {result.posterUrl ? (
                              <img
                                src={result.posterUrl}
                                alt=""
                                loading="lazy"
                                className="size-full object-cover"
                              />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {result.name}
                              {result.releaseYear ? (
                                <span className="ml-1.5 font-normal text-muted-foreground">
                                  {result.releaseYear}
                                </span>
                              ) : null}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              id {id}
                              {result.existingTitleId ? ' · in your catalog' : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            {status.data && !status.data.enabled ? (
              <p className="text-sm text-warning">
                The import from TMDB is not set up (TMDB_API_TOKEN). Files can be matched, but not
                imported until it is.
              </p>
            ) : null}

            {kind === 'SERIES' ? (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Season" hint="0 is for specials.">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min={0}
                      max={999}
                      required
                      value={season}
                      onChange={(event) => setSeason(event.target.value)}
                    />
                  )}
                </Field>
                <Field label="Episode">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      max={9999}
                      required
                      value={episode}
                      onChange={(event) => setEpisode(event.target.value)}
                    />
                  )}
                </Field>
              </div>
            ) : null}
            <ErrorNote error={match.error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={match.isPending}
              disabled={tmdbId === null || !numbersFine}
            >
              Import as this
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
