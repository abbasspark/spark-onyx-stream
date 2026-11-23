// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Copy,
  ArchiveRestore,
  ArrowLeft,
  Check,
  CircleAlert,
  CircleDashed,
  DownloadCloud,
  ExternalLink,
  EyeOff,
  Film,
  Lock,
  Plus,
  MoreHorizontal,
  Rocket,
  Star,
  Trash2,
  TriangleAlert,
  Tv,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { DuplicateTitleDialog } from '@/components/duplicate-title-dialog';
import { TitleHistory } from '@/components/title-history';
import { ApiError, apiUrl } from '@/api/client';
import {
  categoriesApi,
  collectionsApi,
  genresApi,
  packagesApi,
  purchasesApi,
  titlesApi,
} from '@/api/endpoints';
import type {
  Credit,
  PublishStatus,
  SeriesStatus,
  TitleDetail,
  UpdateTitleInput,
} from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { MetadataDialog } from '@/components/metadata-dialog';
import { TitleAvailability } from '@/components/title-availability';
import { TitleCredits } from '@/components/title-credits';
import { TitleExtras } from '@/components/title-extras';
import { TitleEpisodes } from '@/components/title-episodes';
import { TitleTranslations } from '@/components/title-translations';
import { TitleMedia } from '@/components/title-media';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorNote,
  Facts,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/display';
import { Field, Input, Select, Textarea, ToggleRow } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/overlay';
import {
  availabilityOf,
  changedFields,
  countryName,
  describeContent,
  type DetailsForm,
  factsProblem,
  formatRating,
  formatRuntime,
  parseList,
  priceProblem,
  sectionPath,
  SERIES_STATUS_LOOKS,
  titlePath,
  toForm,
  yearsOf,
} from '@/lib/catalog';
import { parsePrice } from '@/lib/billing';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { announceImport } from '@/lib/metadata-toast';
import { SITE_URL } from '@/lib/site';
import { usePollInterval } from '@/live/live';

const isBusy = (status: string | undefined) =>
  status !== undefined && ['UPLOADING', 'UPLOADED', 'PROCESSING'].includes(status);

/** The editor of one title: its texts, its videos and artwork, its episodes and its publishing. */
export function TitleEditorPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const mayWrite = can('catalog:write');
  const confirm = useConfirm();
  const navigate = useNavigate();
  // The address tells the section before the title is loaded: /series/… or /movies/….
  const inSeries = useLocation().pathname.startsWith('/series');
  const queryClient = useQueryClient();
  const pollInterval = usePollInterval();

  const query = useQuery({
    queryKey: ['titles', 'detail', id],
    queryFn: ({ signal }) => titlesApi.get(id, signal),
    // While an attached video is still being processed, its status is followed.
    refetchInterval: (state) => {
      const title = state.state.data;
      const videos = [
        title?.asset?.status,
        title?.trailerAsset?.status,
        ...(title?.seasons ?? []).flatMap((season) =>
          season.episodes.map((episode) => episode.asset?.status),
        ),
      ];
      return pollInterval(videos.some(isBusy));
    },
  });
  const title = query.data;
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['titles'] });
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
    void queryClient.invalidateQueries({ queryKey: ['collections'] });
  };
  const store = (next: TitleDetail) => {
    queryClient.setQueryData(['titles', 'detail', id], next);
    void queryClient.invalidateQueries({ queryKey: ['titles', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
  };

  /** Saves a change of the title. Rejects with the server's reason. */
  const save = async (changes: UpdateTitleInput) => {
    store(await titlesApi.update(id, changes));
  };

  const setStatus = useMutation({
    mutationFn: (status: PublishStatus) => titlesApi.setStatus(id, status),
    onSuccess: (next) => {
      store(next);
      toast.success(
        next.status === 'PUBLISHED'
          ? `"${next.name}" is published`
          : next.status === 'ARCHIVED'
            ? `"${next.name}" is archived`
            : `"${next.name}" is a draft`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => titlesApi.remove(id),
    onSuccess: () => {
      toast.success('Title deleted');
      queryClient.removeQueries({ queryKey: ['titles', 'detail', id] });
      refresh();
      void navigate(sectionPath(query.data?.type ?? (inSeries ? 'SERIES' : 'MOVIE')));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isPending) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-[32rem] rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }
  if (!title) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return missing ? (
      <EmptyState
        icon={Film}
        title={inSeries ? 'Series not found' : 'Movie not found'}
        action={
          <Button asChild>
            <Link to={inSeries ? '/series' : '/movies'}>
              {inSeries ? 'Back to the series' : 'Back to the movies'}
            </Link>
          </Button>
        }
      >
        It may have been deleted.
      </EmptyState>
    ) : (
      <ErrorNote error={query.error} />
    );
  }

  const open = title.checklist.filter((item) => item.required && !item.done);
  const canPublish = open.length === 0;
  const TypeIcon = title.type === 'SERIES' ? Tv : Film;
  const hidden = title.status === 'PUBLISHED' && !title.isVisible;
  const availability = availabilityOf(title);

  const askUnpublish = async () => {
    const confirmed = await confirm({
      title: `Unpublish "${title.name}"?`,
      description: 'Viewers no longer see it. Nothing is deleted, and you can publish it again.',
      confirmLabel: 'Unpublish',
    });
    if (confirmed) {
      setStatus.mutate('DRAFT');
    }
  };
  const askArchive = async () => {
    const confirmed = await confirm({
      title: `Archive "${title.name}"?`,
      description:
        'An archived title is hidden from viewers and kept out of your way, with everything it has. You can restore it at any time.',
      confirmLabel: 'Archive',
    });
    if (confirmed) {
      setStatus.mutate('ARCHIVED');
    }
  };
  const askDelete = async () => {
    const confirmed = await confirm({
      title: `Delete "${title.name}"?`,
      description:
        title.type === 'SERIES'
          ? 'The series with all its seasons and episodes is removed from the catalog. The videos stay in the library. This cannot be undone.'
          : 'The title is removed from the catalog. Its video stays in the library. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate();
    }
  };

  const publishButton = (
    <Button
      variant="primary"
      disabled={!canPublish}
      loading={setStatus.isPending}
      onClick={() => setStatus.mutate('PUBLISHED')}
    >
      <Rocket />
      Publish
    </Button>
  );

  return (
    <>
      <Link
        to={sectionPath(title.type)}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {title.type === 'SERIES' ? 'Series' : 'Movies'}
      </Link>

      {mayWrite ? (
        <DuplicateTitleDialog
          titleId={duplicating ? title.id : null}
          onClose={() => setDuplicating(false)}
          onDone={(copy) => {
            setDuplicating(false);
            toast.success(`${copy.name} is ready as a draft`, {
              description: 'It shares its pictures and videos with the original.',
            });
            void queryClient.invalidateQueries({ queryKey: ['titles', 'list'] });
            void navigate(titlePath(copy));
          }}
        />
      ) : null}
      {mayWrite ? (
        <MetadataDialog
          open={metadataOpen}
          onOpenChange={setMetadataOpen}
          title={title}
          onDone={(result) => {
            setMetadataOpen(false);
            store(result.title);
            announceImport(result, 'updated');
          }}
        />
      ) : null}

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1.5">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl leading-tight font-semibold tracking-tight break-words">
            {title.name}
            <StatusBadge status={title.status} />
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <TypeIcon className="size-4" aria-hidden="true" />
            {title.type === 'SERIES' ? 'Series' : 'Movie'}
            {title.releaseYear ? (
              <span>· {title.type === 'SERIES' ? yearsOf(title) : title.releaseYear}</span>
            ) : null}
            <span>· {describeContent(title)}</span>
            {title.type === 'MOVIE' && title.runtimeMinutes && title.asset?.status !== 'READY' ? (
              <span>· {formatRuntime(title.runtimeMinutes)}</span>
            ) : null}
            {title.rating !== null ? (
              <span className="inline-flex items-center gap-1">
                ·
                <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
                <span className="tabular-nums">{formatRating(title.rating)}</span>
                <span className="sr-only">out of 10</span>
              </span>
            ) : null}
            {title.seriesStatus ? (
              <Badge tone={SERIES_STATUS_LOOKS[title.seriesStatus].tone} dot>
                {SERIES_STATUS_LOOKS[title.seriesStatus].label}
              </Badge>
            ) : null}
            {title.isFeatured ? (
              <Badge tone="primary">
                <Star className="size-3 fill-current" aria-hidden="true" />
                Featured
              </Badge>
            ) : null}
            {title.access === 'PAID' ? (
              <Badge tone="info">
                <Lock className="size-3" aria-hidden="true" />
                Subscribers
              </Badge>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {title.isVisible && SITE_URL !== null ? (
            <Button asChild variant="ghost">
              <a href={`${SITE_URL}/title/${title.slug}`} target="_blank" rel="noreferrer">
                View on site
                <ExternalLink />
              </a>
            </Button>
          ) : null}
          {mayWrite ? (
            <>
              {title.status === 'PUBLISHED' ? (
                <Button loading={setStatus.isPending} onClick={() => void askUnpublish()}>
                  <EyeOff />
                  Unpublish
                </Button>
              ) : null}
              {title.status === 'ARCHIVED' ? (
                <Button loading={setStatus.isPending} onClick={() => setStatus.mutate('DRAFT')}>
                  <ArchiveRestore />
                  Restore as draft
                </Button>
              ) : null}
              {title.status === 'DRAFT' ? (
                canPublish ? (
                  publishButton
                ) : (
                  <Tooltip content={`Still open: ${open.map((item) => item.label).join(', ')}`}>
                    <span className="inline-flex">{publishButton}</span>
                  </Tooltip>
                )
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setMetadataOpen(true)}>
                    <DownloadCloud />
                    {title.metadata ? 'Update details from TMDB' : 'Get details from TMDB'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDuplicating(true)}>
                    <Copy />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {title.status !== 'ARCHIVED' ? (
                    <DropdownMenuItem onSelect={() => void askArchive()}>
                      <Archive />
                      Archive
                    </DropdownMenuItem>
                  ) : null}
                  {title.status !== 'ARCHIVED' ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    destructive
                    disabled={title.status === 'PUBLISHED'}
                    onSelect={() => void askDelete()}
                  >
                    <Trash2 />
                    {title.status === 'PUBLISHED' ? 'Delete (unpublish first)' : 'Delete'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </div>
      </header>

      {hidden ? (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3"
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium">Viewers cannot see this title right now</p>
            <p className="text-muted-foreground">
              {availability === 'scheduled'
                ? `It is published and waits for its start: ${formatDateTime(title.availableFrom)}. It appears by itself then.`
                : availability === 'ended'
                  ? `It is published, but its availability ended on ${formatDateTime(title.availableUntil)}. Change the dates to show it again.`
                  : title.type === 'SERIES'
                    ? 'It is published, but none of its published episodes has a video that can be played. It appears again by itself once one does.'
                    : 'It is published, but its video was deleted or is being processed. It appears again by itself once the video can be played.'}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Tabs
          key={title.id}
          defaultValue={title.type === 'SERIES' ? 'episodes' : 'details'}
          className="min-w-0"
        >
          <TabsList className="overflow-x-auto overflow-y-hidden pb-px [scrollbar-width:none]">
            {title.type === 'SERIES' ? (
              <TabsTrigger value="episodes">
                Episodes
                <Badge>{title.episodeCount}</Badge>
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="people">
              Cast and crew
              {title.credits.length > 0 ? <Badge>{title.credits.length}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="media">Media and artwork</TabsTrigger>
            <TabsTrigger value="translations">
              Translations
              {title.translations.length > 0 ? <Badge>{title.translations.length}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          {title.type === 'SERIES' ? (
            <TabsContent value="episodes">
              <TitleEpisodes title={title} disabled={!mayWrite} refresh={refresh} />
            </TabsContent>
          ) : null}
          <TabsContent value="details">
            <DetailsTab key={title.id} title={title} disabled={!mayWrite} save={save} />
          </TabsContent>
          <TabsContent value="people">
            <TitleCredits
              key={title.id}
              title={title}
              disabled={!mayWrite}
              onSaved={(credits: Credit[]) => {
                queryClient.setQueryData(['titles', 'detail', id], { ...title, credits });
                void queryClient.invalidateQueries({ queryKey: ['people'] });
              }}
            />
          </TabsContent>
          <TabsContent value="translations">
            <TitleTranslations
              key={title.id}
              title={title}
              disabled={!mayWrite}
              onLanguagesChange={() =>
                void queryClient.invalidateQueries({ queryKey: ['titles', 'detail', id] })
              }
            />
          </TabsContent>
          <TabsContent value="history">
            <TitleHistory
              key={title.id}
              title={title}
              disabled={!mayWrite}
              onRestored={() =>
                void queryClient.invalidateQueries({ queryKey: ['titles', 'detail', id] })
              }
            />
          </TabsContent>
          <TabsContent value="media">
            <div className="grid gap-6">
              <TitleMedia title={title} disabled={!mayWrite} save={save} />
              <TitleExtras
                title={title}
                disabled={!mayWrite}
                onChange={(extras) =>
                  queryClient.setQueryData(['titles', 'detail', id], { ...title, extras })
                }
              />
            </div>
          </TabsContent>
        </Tabs>

        <aside className="grid gap-6 lg:sticky lg:top-20">
          <Card>
            <CardHeader
              title="Publishing"
              description={
                hidden && availability === 'scheduled'
                  ? 'Published. It waits for its start.'
                  : hidden && availability === 'ended'
                    ? 'Published, but its availability has ended.'
                    : hidden
                      ? 'Published, but hidden from viewers.'
                      : title.status === 'PUBLISHED'
                        ? 'Viewers can see this title.'
                        : title.status === 'ARCHIVED'
                          ? 'Archived. Hidden from viewers.'
                          : canPublish
                            ? 'Ready to publish.'
                            : 'A draft. Finish the required points to publish.'
              }
            />
            <CardContent>
              <ul className="grid gap-2.5">
                {title.checklist.map((item) => (
                  <li key={item.key} className="flex items-start gap-2.5 text-sm">
                    {item.done ? (
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-success text-white">
                        <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                      </span>
                    ) : item.required ? (
                      <CircleAlert
                        className="mt-0.5 size-4 shrink-0 text-warning"
                        aria-hidden="true"
                      />
                    ) : (
                      <CircleDashed
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <span className={cn(item.done && 'text-muted-foreground')}>
                      {item.label}
                      <span className="sr-only">{item.done ? ' (done)' : ' (open)'}</span>
                      {!item.done ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {item.required ? 'required' : 'recommended'}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <TitleAvailability title={title} disabled={!mayWrite} save={save} />

          <Card className="overflow-hidden">
            {title.backdrop ? (
              <img
                src={apiUrl(title.backdrop.url)}
                alt=""
                className="aspect-video w-full object-cover"
              />
            ) : null}
            <CardContent className="flex gap-4">
              <div className="aspect-[2/3] w-20 shrink-0 self-start overflow-hidden rounded-md bg-muted">
                {title.poster ? (
                  <img src={apiUrl(title.poster.url)} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground/50">
                    <TypeIcon className="size-6" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Facts
                  items={[
                    ['Slug', <span className="font-mono text-xs break-all">{title.slug}</span>],
                    ['Created', formatDateTime(title.createdAt)],
                    ['Changed', formatDateTime(title.updatedAt)],
                    ['Published', title.publishedAt ? formatDateTime(title.publishedAt) : '–'],
                    [
                      'Details from',
                      title.metadata
                        ? `TMDB, ${title.metadata.syncedAt ? formatRelative(title.metadata.syncedAt) : 'imported'}`
                        : 'Typed by hand',
                    ],
                    ...(title.imdbId
                      ? [
                          [
                            'IMDb',
                            <a
                              href={`https://www.imdb.com/title/${title.imdbId}/`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              {title.imdbId}
                              <ExternalLink className="size-3.5" aria-hidden="true" />
                            </a>,
                          ] as [string, ReactNode],
                        ]
                      : []),
                    [
                      'Public data',
                      title.isVisible ? (
                        <a
                          href={apiUrl(`/v1/catalog/titles/${title.slug}`)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Open
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      ) : (
                        '–'
                      ),
                    ],
                  ]}
                />
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

interface DetailsTabProps {
  title: TitleDetail;
  disabled: boolean;
  save: (changes: UpdateTitleInput) => Promise<unknown>;
}

/** The texts and categories of a title, saved together with one button. */
function DetailsTab({ title, disabled, save }: DetailsTabProps) {
  // The currency of all prices. It is public, so editors without billing rights learn it too.
  const currencyQuery = useQuery({
    queryKey: ['billing', 'currency'],
    queryFn: ({ signal }) => purchasesApi.currency(signal),
    staleTime: 300_000,
  });
  const currency = currencyQuery.data ?? 'EUR';
  const saved = useMemo(() => toForm(title, currency), [title, currency]);
  const [form, setForm] = useState(saved);
  const set = <Key extends keyof DetailsForm>(key: Key, value: DetailsForm[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const packages = useQuery({
    queryKey: ['billing', 'packages'],
    queryFn: ({ signal }) => packagesApi.list(signal),
    staleTime: 60_000,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => categoriesApi.list(signal),
  });

  const changes = changedFields(saved, form, currency);
  const dirty = Object.keys(changes).length > 0;
  const pricesWrong = priceProblem(form, currency);
  const factsWrong = factsProblem(form);
  const collections = useQuery({
    queryKey: ['collections'],
    queryFn: ({ signal }) => collectionsApi.list(signal),
  });
  const genres = useQuery({
    queryKey: ['genres'],
    queryFn: ({ signal }) => genresApi.list(signal),
  });
  const queryClient = useQueryClient();
  const [newGenre, setNewGenre] = useState('');
  const addGenre = useMutation({
    mutationFn: () => genresApi.create({ name: newGenre.trim() }),
    onSuccess: (genre) => {
      void queryClient.invalidateQueries({ queryKey: ['genres'] });
      setForm((current) => ({ ...current, genreIds: [...current.genreIds, genre.id] }));
      setNewGenre('');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const isSeries = title.type === 'SERIES';
  const countries = parseList(form.countries);

  // What was saved elsewhere (another admin, another tab) shows up unless there are unsaved edits.
  useEffect(() => {
    if (!dirty) {
      setForm(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  // Leaving the panel with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const submit = useMutation({
    mutationFn: () => save(changes),
    onSuccess: () => toast.success('Changes saved'),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const wrong = factsWrong ?? pricesWrong;
    if (wrong) {
      toast.error(wrong);
      return;
    }
    submit.mutate();
  };

  const togglePackage = (packageId: string) =>
    set(
      'packageIds',
      form.packageIds.includes(packageId)
        ? form.packageIds.filter((value) => value !== packageId)
        : [...form.packageIds, packageId],
    );

  const toggleGenre = (genreId: string) =>
    set(
      'genreIds',
      form.genreIds.includes(genreId)
        ? form.genreIds.filter((value) => value !== genreId)
        : [...form.genreIds, genreId],
    );

  const toggleCategory = (categoryId: string) =>
    set(
      'categoryIds',
      form.categoryIds.includes(categoryId)
        ? form.categoryIds.filter((value) => value !== categoryId)
        : [...form.categoryIds, categoryId],
    );

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <Card>
        <CardHeader
          title="About"
          description={`What viewers read about this ${isSeries ? 'series' : 'movie'}.`}
        />
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  required
                  maxLength={200}
                  disabled={disabled}
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                />
              )}
            </Field>
            <Field label="Original name" hint="Optional. The name in its original language.">
              {(id) => (
                <Input
                  id={id}
                  maxLength={200}
                  disabled={disabled}
                  value={form.originalName}
                  onChange={(event) => set('originalName', event.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label="Tagline" hint="Optional. One short line under the name.">
            {(id) => (
              <Input
                id={id}
                maxLength={200}
                disabled={disabled}
                value={form.tagline}
                onChange={(event) => set('tagline', event.target.value)}
              />
            )}
          </Field>
          <Field
            label="Synopsis"
            hint={
              <span className="flex justify-between gap-4">
                <span>What it is about, in a few sentences.</span>
                <span className="tabular-nums">{form.synopsis.length} / 5000</span>
              </span>
            }
          >
            {(id) => (
              <Textarea
                id={id}
                rows={6}
                maxLength={5000}
                disabled={disabled}
                value={form.synopsis}
                onChange={(event) => set('synopsis', event.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Release year">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={1888}
                  max={new Date().getFullYear() + 10}
                  placeholder="2026"
                  disabled={disabled}
                  value={form.releaseYear}
                  onChange={(event) => set('releaseYear', event.target.value)}
                />
              )}
            </Field>
            <Field label="Age rating" hint='As used where you publish, such as "PG-13" or "16".'>
              {(id) => (
                <Input
                  id={id}
                  maxLength={16}
                  disabled={disabled}
                  value={form.ageRating}
                  onChange={(event) => set('ageRating', event.target.value)}
                />
              )}
            </Field>
            <Field label="Original language" hint='A language code, such as "en" or "pt-BR".'>
              {(id) => (
                <Input
                  id={id}
                  maxLength={20}
                  pattern="[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*"
                  placeholder="en"
                  disabled={disabled}
                  value={form.originalLanguage}
                  onChange={(event) => set('originalLanguage', event.target.value)}
                />
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Facts"
          description={
            title.metadata
              ? 'Filled in from TMDB. What you change here stays until you choose to overwrite it.'
              : 'The details people search and filter by.'
          }
        />
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={isSeries ? 'First shown' : 'Release date'}
              hint={isSeries ? 'The day the first episode was shown.' : undefined}
            >
              {(id) => (
                <Input
                  id={id}
                  type="date"
                  disabled={disabled}
                  value={form.releaseDate}
                  onChange={(event) => {
                    const day = event.target.value;
                    // The year follows the date, so the two cannot disagree.
                    setForm((current) => ({
                      ...current,
                      releaseDate: day,
                      releaseYear: day ? day.slice(0, 4) : current.releaseYear,
                    }));
                  }}
                />
              )}
            </Field>
            <Field
              label={isSeries ? 'Episode length (minutes)' : 'Length (minutes)'}
              hint={
                form.runtimeMinutes.trim() && !factsWrong
                  ? formatRuntime(Number(form.runtimeMinutes))
                  : isSeries
                    ? 'What an episode usually runs.'
                    : 'Shown until the video tells its exact length.'
              }
            >
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  placeholder={isSeries ? '48' : '112'}
                  disabled={disabled}
                  value={form.runtimeMinutes}
                  onChange={(event) => set('runtimeMinutes', event.target.value)}
                />
              )}
            </Field>
            {isSeries ? (
              <Field label="State of the series">
                {(id) => (
                  <Select
                    id={id}
                    disabled={disabled}
                    value={form.seriesStatus || 'none'}
                    onValueChange={(value) =>
                      set('seriesStatus', value === 'none' ? '' : (value as SeriesStatus))
                    }
                    options={[
                      { value: 'none', label: 'Not known' },
                      ...Object.entries(SERIES_STATUS_LOOKS).map(([value, look]) => ({
                        value,
                        label: look.label,
                        description: look.about,
                      })),
                    ]}
                  />
                )}
              </Field>
            ) : (
              <Field label="IMDb id" hint="Optional. Links the movie to its IMDb page.">
                {(id) => (
                  <Input
                    id={id}
                    maxLength={12}
                    placeholder="tt0133093"
                    className="font-mono"
                    disabled={disabled}
                    value={form.imdbId}
                    onChange={(event) => set('imdbId', event.target.value)}
                  />
                )}
              </Field>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Countries"
              hint={
                countries.length > 0 && !factsWrong
                  ? countries.map((code) => countryName(code.toUpperCase())).join(', ')
                  : 'Where it was made, as codes of two letters: US, DE.'
              }
            >
              {(id) => (
                <Input
                  id={id}
                  placeholder="US, DE"
                  disabled={disabled}
                  value={form.countries}
                  onChange={(event) => set('countries', event.target.value)}
                />
              )}
            </Field>
            <Field
              label={isSeries ? 'Networks and studios' : 'Studios'}
              hint="Separated by commas."
            >
              {(id) => (
                <Input
                  id={id}
                  disabled={disabled}
                  value={form.studios}
                  onChange={(event) => set('studios', event.target.value)}
                />
              )}
            </Field>
          </div>
          {isSeries ? (
            <Field
              label="IMDb id"
              hint="Optional. Links the series to its IMDb page."
              className="max-w-xs"
            >
              {(id) => (
                <Input
                  id={id}
                  maxLength={12}
                  placeholder="tt0903747"
                  className="font-mono"
                  disabled={disabled}
                  value={form.imdbId}
                  onChange={(event) => set('imdbId', event.target.value)}
                />
              )}
            </Field>
          ) : null}
          <Field
            label="Keywords"
            hint="Separated by commas. They help the search find this title by what it is about."
          >
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                disabled={disabled}
                value={form.keywords}
                onChange={(event) => set('keywords', event.target.value)}
              />
            )}
          </Field>
          {title.rating !== null ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
              <span className="font-medium text-foreground tabular-nums">
                {formatRating(title.rating)}
              </span>
              out of 10 on TMDB
              {title.ratingCount ? `, from ${title.ratingCount.toLocaleString()} votes` : ''}. It is
              refreshed with every import.
            </p>
          ) : null}
          {factsWrong ? (
            <p role="alert" className="text-sm text-destructive">
              {factsWrong}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Genres"
          description="What kind of story it is. Genres come with an import and are shared by all titles."
        />
        <CardContent className="grid gap-4">
          <ErrorNote error={genres.error} />
          {genres.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              There are no genres yet. Add the first one below, or import a title from TMDB.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {genres.data?.map((genre) => {
              const chosen = form.genreIds.includes(genre.id);
              return (
                <button
                  key={genre.id}
                  type="button"
                  role="checkbox"
                  aria-checked={chosen}
                  disabled={disabled}
                  onClick={() => toggleGenre(genre.id)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60',
                    chosen &&
                      'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  {chosen ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  {genre.name}
                </button>
              );
            })}
          </div>
          {disabled ? null : (
            <div className="flex max-w-sm gap-2">
              <Input
                aria-label="Name of a new genre"
                placeholder="New genre"
                maxLength={60}
                value={newGenre}
                onChange={(event) => setNewGenre(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    // Enter adds the genre and does not save the form around it.
                    event.preventDefault();
                    if (newGenre.trim()) {
                      addGenre.mutate();
                    }
                  }
                }}
              />
              <Button
                type="button"
                loading={addGenre.isPending}
                disabled={!newGenre.trim()}
                onClick={() => addGenre.mutate()}
              >
                <Plus />
                Add
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Collections"
          description="Titles that belong together in an order, such as the films of a series of films."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/collections">Manage</Link>
            </Button>
          }
        />
        <CardContent className="grid gap-3">
          <ErrorNote error={collections.error} />
          {collections.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              There are no collections yet. Create one on the Collections page.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {collections.data?.map((collection) => {
              const chosen = form.collectionIds.includes(collection.id);
              return (
                <button
                  key={collection.id}
                  type="button"
                  role="checkbox"
                  aria-checked={chosen}
                  disabled={disabled}
                  onClick={() =>
                    set(
                      'collectionIds',
                      chosen
                        ? form.collectionIds.filter((value) => value !== collection.id)
                        : [...form.collectionIds, collection.id],
                    )
                  }
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60',
                    chosen &&
                      'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  {chosen ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  {collection.name}
                  {collection.visible ? null : <EyeOff className="size-3.5" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Categories"
          description="Shelves of your own making, such as “Staff picks”. Where viewers find this title when they browse."
          actions={
            <Button asChild variant="link" size="sm">
              <Link to="/categories">Manage categories</Link>
            </Button>
          }
        />
        <CardContent>
          <ErrorNote error={categories.error} />
          {categories.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">There are no categories yet.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {categories.data?.map((category) => {
              const chosen = form.categoryIds.includes(category.id);
              return (
                <button
                  key={category.id}
                  type="button"
                  role="checkbox"
                  aria-checked={chosen}
                  disabled={disabled}
                  onClick={() => toggleCategory(category.id)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60',
                    chosen &&
                      'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  {chosen ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  {category.name}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Presentation" />
        <CardContent className="grid gap-4">
          <ToggleRow
            label="Featured"
            description="Marks the title for the prominent places of the viewer site, such as the top of the home page."
            checked={form.isFeatured}
            disabled={disabled}
            onCheckedChange={(checked) => set('isFeatured', checked)}
          />
          <ToggleRow
            label="Paid title"
            description="On, watching needs a subscription that includes the title, or renting or buying it. The trailer stays open to everyone. Off, the title is as open as the installation is."
            checked={form.isPaid}
            disabled={disabled}
            onCheckedChange={(checked) => set('isPaid', checked)}
          />
          {form.isPaid ? (
            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium">Rent or buy</p>
              <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
                Lets a viewer pay for this title alone, with or without a subscription. Leave a
                price empty to not offer it that way.
              </p>
              <div className="grid max-w-md gap-4 sm:grid-cols-2">
                <Field label={`Rent (${currency})`}>
                  {(id) => (
                    <Input
                      id={id}
                      inputMode="decimal"
                      placeholder="Not for rent"
                      disabled={disabled}
                      aria-invalid={parsePrice(form.rentPrice, currency) === 'invalid'}
                      value={form.rentPrice}
                      onChange={(event) => set('rentPrice', event.target.value)}
                    />
                  )}
                </Field>
                <Field label={`Buy (${currency})`}>
                  {(id) => (
                    <Input
                      id={id}
                      inputMode="decimal"
                      placeholder="Not for sale"
                      disabled={disabled}
                      aria-invalid={parsePrice(form.buyPrice, currency) === 'invalid'}
                      value={form.buyPrice}
                      onChange={(event) => set('buyPrice', event.target.value)}
                    />
                  )}
                </Field>
              </div>
              <div className="mt-4">
                <ToggleRow
                  label="Not part of any subscription"
                  description="On, no plan opens this title: it is watched by renting or buying only. For a premiere, for example."
                  checked={form.purchaseOnly}
                  disabled={disabled}
                  onCheckedChange={(checked) => set('purchaseOnly', checked)}
                />
              </div>
              {pricesWrong ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {pricesWrong}
                </p>
              ) : null}
            </div>
          ) : null}
          {form.isPaid && !form.purchaseOnly && packages.data && packages.data.length > 0 ? (
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">Packages</p>
                <Button asChild variant="link" size="sm">
                  <Link to="/packages">Manage packages</Link>
                </Button>
              </div>
              <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
                Plans with chosen packages open the title through them.{' '}
                {form.packageIds.length === 0
                  ? 'In no package, only plans that open everything show it.'
                  : 'Plans that open everything show it either way.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {packages.data.map((item) => {
                  const chosen = form.packageIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="checkbox"
                      aria-checked={chosen}
                      disabled={disabled}
                      onClick={() => togglePackage(item.id)}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60',
                        chosen &&
                          'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                      )}
                    >
                      {chosen ? <Check className="size-3.5" aria-hidden="true" /> : null}
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <Field
            label="Slug"
            hint="Part of the title's web address. Changing it breaks links that people saved."
            className="max-w-md"
          >
            {(id) => (
              <Input
                id={id}
                required
                maxLength={80}
                className="font-mono"
                disabled={disabled}
                value={form.slug}
                onChange={(event) => set('slug', event.target.value)}
              />
            )}
          </Field>
        </CardContent>
      </Card>

      {dirty || submit.error ? (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-popover/95 px-4 py-3 shadow-lg backdrop-blur-md">
          <div className="mr-auto min-w-0">
            <p className="text-sm font-medium">You have unsaved changes</p>
            {submit.error ? (
              <p className="text-sm text-destructive">{submit.error.message}</p>
            ) : null}
          </div>
          <Button
            disabled={submit.isPending}
            onClick={() => {
              submit.reset();
              setForm(saved);
            }}
          >
            Discard
          </Button>
          <Button type="submit" variant="primary" loading={submit.isPending} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      ) : null}
    </form>
  );
}
