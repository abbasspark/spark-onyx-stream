// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
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
  MoreHorizontal,
  Rocket,
  Star,
  Trash2,
  TriangleAlert,
  Tv,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError, apiUrl } from '@/api/client';
import { categoriesApi, packagesApi, titlesApi } from '@/api/endpoints';
import type { PublishStatus, TitleDetail, UpdateTitleInput } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { MetadataDialog } from '@/components/metadata-dialog';
import { TitleEpisodes } from '@/components/title-episodes';
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
import { Field, Input, Textarea, ToggleRow } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/overlay';
import { changedFields, describeContent, type DetailsForm, toForm } from '@/lib/catalog';
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

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['titles'] });
    void queryClient.invalidateQueries({ queryKey: ['categories'] });
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
      void navigate('/titles');
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
        title="Title not found"
        action={
          <Button asChild>
            <Link to="/titles">Back to the titles</Link>
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
        to="/titles"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Titles
      </Link>

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
            {title.releaseYear ? <span>· {title.releaseYear}</span> : null}
            <span>· {describeContent(title)}</span>
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
              {title.type === 'SERIES'
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
          <TabsList>
            {title.type === 'SERIES' ? (
              <TabsTrigger value="episodes">
                Episodes
                <Badge>{title.episodeCount}</Badge>
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="media">Media and artwork</TabsTrigger>
          </TabsList>
          {title.type === 'SERIES' ? (
            <TabsContent value="episodes">
              <TitleEpisodes title={title} disabled={!mayWrite} refresh={refresh} />
            </TabsContent>
          ) : null}
          <TabsContent value="details">
            <DetailsTab key={title.id} title={title} disabled={!mayWrite} save={save} />
          </TabsContent>
          <TabsContent value="media">
            <TitleMedia title={title} disabled={!mayWrite} save={save} />
          </TabsContent>
        </Tabs>

        <aside className="grid gap-6 lg:sticky lg:top-20">
          <Card>
            <CardHeader
              title="Publishing"
              description={
                hidden
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

          <Card className="overflow-hidden">
            {title.backdrop ? (
              <img
                src={apiUrl(title.backdrop.url)}
                alt=""
                className="aspect-video w-full object-cover"
              />
            ) : null}
            <CardContent className="flex gap-4">
              <div className="aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md bg-muted">
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
  const saved = useMemo(() => toForm(title), [title]);
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

  const changes = changedFields(saved, form);
  const dirty = Object.keys(changes).length > 0;

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
    submit.mutate();
  };

  const togglePackage = (packageId: string) =>
    set(
      'packageIds',
      form.packageIds.includes(packageId)
        ? form.packageIds.filter((value) => value !== packageId)
        : [...form.packageIds, packageId],
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
        <CardHeader title="About" description="What viewers read about this title." />
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
          title="Categories"
          description="Where viewers find this title when they browse."
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
            label="Needs a subscription"
            description="On, only viewers with a running subscription can watch. The trailer stays open to everyone. Off, the title is as open as the installation is."
            checked={form.isPaid}
            disabled={disabled}
            onCheckedChange={(checked) => set('isPaid', checked)}
          />
          {form.isPaid && packages.data && packages.data.length > 0 ? (
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
