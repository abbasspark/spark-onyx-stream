// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  DownloadCloud,
  Film,
  LayoutGrid,
  Library,
  List,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Tv,
  UserRound,
  X,
} from 'lucide-react';
import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { DuplicateTitleDialog } from '@/components/duplicate-title-dialog';
import { apiUrl } from '@/api/client';
import {
  categoriesApi,
  collectionsApi,
  genresApi,
  packagesApi,
  peopleApi,
  type TitleFilters,
  titlesApi,
} from '@/api/endpoints';
import {
  PUBLISH_STATUSES,
  SERIES_STATUSES,
  TITLE_SORT_FIELDS,
  type Availability,
  type BulkResult,
  type PublishStatus,
  type SeriesStatus,
  type SortOrder,
  type TitleAccess,
  type TitleSortField,
  type TitleSummary,
  type TitleType,
} from '@/api/types';
import { useSession } from '@/auth/session';
import { BulkBar, type BulkTarget } from '@/components/bulk-actions';
import { useConfirm } from '@/components/confirm';
import { TranslationJobs } from '@/components/translation-jobs';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Pagination,
  Skeleton,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
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
  describeContent,
  availabilityOf,
  formatRating,
  sectionPath,
  SERIES_STATUS_LOOKS,
  sharedSearch,
  titlePath,
  videoProgress,
} from '@/lib/catalog';
import { MetadataDialog } from '@/components/metadata-dialog';
import { useAddressParams } from '@/lib/address-params';
import { announceImport } from '@/lib/metadata-toast';
import { MAX_CHOSEN, rangeOf } from '@/lib/bulk';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative, humanize } from '@/lib/format';

const PAGE_SIZE = 24;
const SEARCH_DELAY_MS = 300;
const VIEW_KEY = 'onyx.admin.titles-view';

type View = 'grid' | 'list';

const SORT_LABELS: Record<TitleSortField, string> = {
  createdAt: 'Date added',
  updatedAt: 'Last changed',
  name: 'Name',
  releaseYear: 'Release year',
  publishedAt: 'Date published',
  releaseDate: 'Premiere',
  rating: 'Rating',
  runtimeMinutes: 'Length',
};

/** What each section calls its things, and says about itself. */
const SECTIONS = {
  MOVIE: {
    title: 'Movies',
    one: 'movie',
    many: 'movies',
    description:
      'Films, documentaries and recordings: one video each, with everything viewers read and see about it.',
    empty:
      'Create your first movie, or import one with its details, then attach its video from the library.',
    create: 'New movie',
    icon: Film,
  },
  SERIES: {
    title: 'Series',
    one: 'series',
    many: 'series',
    description:
      'Shows in seasons and episodes. Each episode has its own video, and a series can be published while episodes are still missing.',
    empty:
      'Create your first series, or import one with its seasons and episodes, then attach the videos.',
    create: 'New series',
    icon: Tv,
  },
} as const;

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

/** The poster of a title, or a placeholder while there is none. */
function PosterArt({ title, className }: { title: TitleSummary; className?: string }) {
  const Icon = title.type === 'SERIES' ? Tv : Film;
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {title.poster ? (
        <img
          src={apiUrl(title.poster.url)}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 bg-linear-to-br from-muted to-accent p-3 text-center text-muted-foreground/60">
          <Icon className="size-8" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/**
 * The publishing state of a title. A published title that viewers cannot see,
 * because its video is gone or being processed, is marked as hidden.
 */
function TitleStatus({ title }: { title: TitleSummary }) {
  const availability = availabilityOf(title);
  if (title.status === 'PUBLISHED' && availability === 'scheduled') {
    return (
      <Tooltip content={`Published. Viewers see it from ${formatDateTime(title.availableFrom)}`}>
        <Badge tone="info" dot className="pointer-events-auto">
          Scheduled
        </Badge>
      </Tooltip>
    );
  }
  if (title.status === 'PUBLISHED' && availability === 'ended') {
    return (
      <Tooltip content={`Its availability ended on ${formatDateTime(title.availableUntil)}`}>
        <Badge tone="warning" dot className="pointer-events-auto">
          Ended
        </Badge>
      </Tooltip>
    );
  }
  if (title.status === 'PUBLISHED' && !title.isVisible) {
    return (
      <Tooltip content="Published, but viewers cannot see it: nothing in it can be played right now">
        <Badge tone="warning" dot className="pointer-events-auto">
          Hidden
        </Badge>
      </Tooltip>
    );
  }
  return <StatusBadge status={title.status} />;
}

/** The movies of the catalog. */
export function MoviesPage() {
  return <TitlesList key="MOVIE" kind="MOVIE" />;
}

/** The series of the catalog. */
export function SeriesPage() {
  return <TitlesList key="SERIES" kind="SERIES" />;
}

/** One kind of title, as a wall of posters or a table. */
function TitlesList({ kind }: { kind: TitleType }) {
  const section = SECTIONS[kind];
  const isSeries = kind === 'SERIES';
  const { can } = useSession();
  const mayWrite = can('catalog:write');
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, change] = useAddressParams();

  const page = Math.max(1, Number(params.get('page')) || 1);
  const type = kind;
  const status = (
    (PUBLISH_STATUSES as readonly string[]).includes(params.get('status') ?? '')
      ? params.get('status')
      : ''
  ) as PublishStatus | '';
  const categoryId = params.get('category') ?? '';
  const genreId = params.get('genre') ?? '';
  const personId = params.get('person') ?? '';
  const collectionId = params.get('collection') ?? '';
  const availability = (
    ['scheduled', 'current', 'ended'].includes(params.get('shown') ?? '') ? params.get('shown') : ''
  ) as Availability | '';
  const video = (
    ['ready', 'missing'].includes(params.get('video') ?? '') ? params.get('video') : ''
  ) as 'ready' | 'missing' | '';
  const seriesStatus = (
    isSeries && (SERIES_STATUSES as readonly string[]).includes(params.get('running') ?? '')
      ? params.get('running')
      : ''
  ) as SeriesStatus | '';
  const access = (
    ['FREE', 'PAID'].includes(params.get('access') ?? '') ? params.get('access') : ''
  ) as TitleAccess | '';
  // A package by its id, or "none" for paid titles that are in no package.
  const packageFilter = params.get('package') ?? (params.get('packaged') === 'none' ? 'none' : '');
  const q = params.get('q') ?? '';
  const sort = (TITLE_SORT_FIELDS as readonly string[]).includes(params.get('sort') ?? '')
    ? (params.get('sort') as TitleSortField)
    : 'createdAt';
  const order: SortOrder = params.get('order') === 'asc' ? 'asc' : 'desc';

  const [view, setView] = useState<View>(readView);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  // A link such as /titles?new=1 opens the dialog for a new title.
  useEffect(() => {
    if (params.get('new') === '1' && mayWrite) {
      setCreateOpen(true);
      change({ new: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, mayWrite]);

  // The search box is local while typing and reaches the address a moment later.
  const [search, setSearch] = useState(q);
  useEffect(() => {
    if (search === q) {
      return;
    }
    const timer = window.setTimeout(() => change({ q: search, page: null }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // What narrows the list. The same object tells an action what "all that match" means.
  const filters = useMemo<TitleFilters>(
    () => ({
      type,
      status: status || undefined,
      categoryId: categoryId || undefined,
      genreId: genreId || undefined,
      personId: personId || undefined,
      collectionId: collectionId || undefined,
      availability: availability || undefined,
      video: video || undefined,
      seriesStatus: seriesStatus || undefined,
      access: access || undefined,
      packageId: packageFilter && packageFilter !== 'none' ? packageFilter : undefined,
      packaged: packageFilter === 'none' ? 'none' : undefined,
      q: q || undefined,
    }),
    [
      type,
      status,
      categoryId,
      genreId,
      personId,
      collectionId,
      availability,
      video,
      seriesStatus,
      access,
      packageFilter,
      q,
    ],
  );
  const titles = useQuery({
    queryKey: ['titles', 'list', { page, ...filters, sort, order }],
    queryFn: ({ signal }) =>
      titlesApi.list({ page, pageSize: PAGE_SIZE, ...filters, sort, order }, signal),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => categoriesApi.list(signal),
  });
  const packages = useQuery({
    queryKey: ['billing', 'packages'],
    queryFn: ({ signal }) => packagesApi.list(signal),
    staleTime: 60_000,
  });
  const genres = useQuery({
    queryKey: ['genres'],
    queryFn: ({ signal }) => genresApi.list(signal),
    staleTime: 60_000,
  });
  // The person the list is narrowed to, to say who it is.
  const person = useQuery({
    queryKey: ['people', personId],
    queryFn: ({ signal }) => peopleApi.get(personId, signal),
    enabled: personId !== '',
  });
  const collection = useQuery({
    queryKey: ['collections', 'detail', collectionId],
    queryFn: ({ signal }) => collectionsApi.get(collectionId, signal),
    enabled: collectionId !== '',
  });
  const items = titles.data?.items ?? [];
  const filtered = Boolean(
    q ||
    status ||
    categoryId ||
    genreId ||
    personId ||
    collectionId ||
    availability ||
    video ||
    seriesStatus ||
    access ||
    packageFilter,
  );

  // --- Selection ------------------------------------------------------------------
  // Chosen titles are kept over the pages. "All" means everything the filters match.
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [all, setAll] = useState(false);
  const lastPicked = useRef<string | null>(null);
  const clearSelection = () => {
    setChosen(new Set());
    setAll(false);
    lastPicked.current = null;
  };
  // Other filters mean other titles: what was chosen under the old ones is let go.
  useEffect(clearSelection, [filters]);

  const total = titles.data?.total ?? 0;
  const pageIds = items.map((title) => title.id);
  const isSelected = (id: string) => all || chosen.has(id);
  const selecting = mayWrite && (all || chosen.size > 0);
  const pageState: boolean | 'indeterminate' =
    all || (pageIds.length > 0 && pageIds.every((id) => chosen.has(id)))
      ? true
      : pageIds.some((id) => chosen.has(id))
        ? 'indeterminate'
        : false;

  const choose = (ids: readonly string[], on: boolean) => {
    // Out of "all", the titles of this page stay chosen, without the one unticked.
    const next = new Set(all ? pageIds : chosen);
    for (const id of ids) {
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    if (next.size > MAX_CHOSEN) {
      toast.message(
        `${MAX_CHOSEN} can be chosen one by one. For more, filter the list and select all that match.`,
      );
      return;
    }
    setAll(false);
    setChosen(next);
  };
  /** A click on a tick box. With Shift, everything from the last one to this one. */
  const pick = (id: string, event: MouseEvent) => {
    const on = !isSelected(id);
    choose(event.shiftKey ? rangeOf(pageIds, lastPicked.current, id) : [id], on);
    lastPicked.current = id;
  };
  const target: BulkTarget = all ? { filter: filters } : { ids: [...chosen] };
  const afterBulk = (result: BulkResult) => {
    // What could not be changed stays selected, to be dealt with and tried again.
    const failed = result.failures.map((failure) => failure.titleId);
    setAll(false);
    setChosen(new Set(result.action === 'translate' ? [] : failed));
  };
  const tick = (title: TitleSummary, className?: string) => (
    <Checkbox
      checked={isSelected(title.id)}
      aria-label={`Select ${title.name}`}
      onClick={(event) => pick(title.id, event)}
      className={cn('size-[18px]', className)}
    />
  );

  const remove = useMutation({
    mutationFn: (title: TitleSummary) => titlesApi.remove(title.id),
    onSuccess: () => {
      toast.success(isSeries ? 'Series deleted' : 'Movie deleted');
      void queryClient.invalidateQueries({ queryKey: ['titles'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const askDelete = async (title: TitleSummary) => {
    const confirmed = await confirm({
      title: `Delete "${title.name}"?`,
      description:
        title.type === 'SERIES'
          ? 'The series with all its seasons and episodes is removed from the catalog. The videos stay in the library.'
          : 'The movie is removed from the catalog. Its video stays in the library.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(title);
    }
  };

  const chooseView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage can be blocked. The choice then lasts until the page is reloaded.
    }
  };

  const sortBy = (field: TitleSortField) =>
    change({
      sort: field === 'createdAt' ? null : field,
      // A second click on the same column turns the order around.
      order: sort === field ? (order === 'asc' ? null : 'asc') : field === 'name' ? 'asc' : null,
      page: null,
    });

  const rowMenu = (title: TitleSummary): ReactNode => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void navigate(titlePath(title))}>
          <Pencil />
          {mayWrite ? 'Edit' : 'Open'}
        </DropdownMenuItem>
        {mayWrite ? (
          <>
            <DropdownMenuItem onSelect={() => setDuplicating(title.id)}>
              <Copy />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => void askDelete(title)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const newButton = mayWrite ? (
    <>
      <Button onClick={() => setImportOpen(true)}>
        <DownloadCloud />
        Import
      </Button>
      <Button variant="primary" onClick={() => setCreateOpen(true)}>
        <Plus />
        {section.create}
      </Button>
    </>
  ) : null;

  return (
    <>
      <PageHeader
        title={
          <>
            {section.title}
            {titles.data ? (
              <span className="text-base font-normal text-muted-foreground tabular-nums">
                {titles.data.total}
              </span>
            ) : null}
          </>
        }
        description={section.description}
        actions={newButton}
      />

      <nav
        aria-label="Kind of title"
        className="mb-4 inline-flex rounded-lg border bg-muted/40 p-0.5"
      >
        {(['MOVIE', 'SERIES'] as const).map((other) => {
          const Icon = SECTIONS[other].icon;
          const current = other === kind;
          return (
            <Link
              key={other}
              to={current ? '#' : `${sectionPath(other)}${sharedSearch(window.location.search)}`}
              aria-current={current ? 'page' : undefined}
              onClick={current ? (event) => event.preventDefault() : undefined}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground',
                current && 'bg-background text-foreground shadow-sm',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {SECTIONS[other].title}
            </Link>
          );
        })}
      </nav>

      {personId ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
          <span>
            {section.title} with <strong>{person.data?.name ?? 'this person'}</strong>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => change({ person: null, page: null })}
          >
            <X />
            Show all
          </Button>
        </div>
      ) : null}

      {collectionId ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <Library className="size-4 text-muted-foreground" aria-hidden="true" />
          <span>
            {section.title} of the collection{' '}
            <Link to={`/collections/${collectionId}`} className="font-semibold hover:underline">
              {collection.data?.name ?? '…'}
            </Link>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => change({ collection: null, page: null })}
          >
            <X />
            Show all
          </Button>
        </div>
      ) : null}

      <TranslationJobs className="mb-4" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search by name"
            aria-label="Search by name"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          aria-label="Filter by status"
          className="w-40"
          value={status || 'ALL'}
          onValueChange={(value) => change({ status: value === 'ALL' ? null : value, page: null })}
          options={[
            { value: 'ALL', label: 'All statuses' },
            ...PUBLISH_STATUSES.map((value) => ({ value, label: humanize(value) })),
          ]}
        />
        <Select
          aria-label="Filter by availability"
          className="w-44"
          value={availability || 'ALL'}
          onValueChange={(value) => change({ shown: value === 'ALL' ? null : value, page: null })}
          options={[
            { value: 'ALL', label: 'Any availability' },
            { value: 'scheduled', label: 'Scheduled', description: 'The start is still to come' },
            { value: 'current', label: 'Showing now', description: 'Inside its dates, or without' },
            { value: 'ended', label: 'Ended', description: 'The end has passed' },
          ]}
        />
        <Select
          aria-label="Filter by video"
          className="w-44"
          value={video || 'ALL'}
          onValueChange={(value) => change({ video: value === 'ALL' ? null : value, page: null })}
          options={[
            { value: 'ALL', label: 'With and without video' },
            {
              value: 'missing',
              label: 'Video missing',
              description: isSeries
                ? 'An episode has no video that plays'
                : 'No video that plays yet',
            },
            {
              value: 'ready',
              label: 'Video ready',
              description: isSeries ? 'Every episode has its video' : 'Its video plays',
            },
          ]}
        />
        {isSeries ? (
          <Select
            aria-label="Filter by whether the series runs"
            className="w-40"
            value={seriesStatus || 'ALL'}
            onValueChange={(value) =>
              change({ running: value === 'ALL' ? null : value, page: null })
            }
            options={[
              { value: 'ALL', label: 'Running or not' },
              ...SERIES_STATUSES.map((value) => ({
                value,
                label: SERIES_STATUS_LOOKS[value].label,
                description: SERIES_STATUS_LOOKS[value].about,
              })),
            ]}
          />
        ) : null}
        {genres.data && genres.data.length > 0 ? (
          <Select
            aria-label="Filter by genre"
            className="w-44"
            value={genreId || 'ALL'}
            onValueChange={(value) => change({ genre: value === 'ALL' ? null : value, page: null })}
            options={[
              { value: 'ALL', label: 'All genres' },
              ...genres.data.map((genre) => ({ value: genre.id, label: genre.name })),
            ]}
          />
        ) : null}
        {categories.data && categories.data.length > 0 ? (
          <Select
            aria-label="Filter by category"
            className="w-44"
            value={categoryId || 'ALL'}
            onValueChange={(value) =>
              change({ category: value === 'ALL' ? null : value, page: null })
            }
            options={[
              { value: 'ALL', label: 'All categories' },
              ...categories.data.map((category) => ({ value: category.id, label: category.name })),
            ]}
          />
        ) : null}
        <Select
          aria-label="Filter by access"
          className="w-40"
          value={access || 'ALL'}
          onValueChange={(value) => change({ access: value === 'ALL' ? null : value, page: null })}
          options={[
            { value: 'ALL', label: 'Free and paid' },
            { value: 'FREE', label: 'Free' },
            { value: 'PAID', label: 'Paid' },
          ]}
        />
        {packages.data && packages.data.length > 0 ? (
          <Select
            aria-label="Filter by package"
            className="w-44"
            value={packageFilter || 'ALL'}
            onValueChange={(value) =>
              change({ package: value === 'ALL' ? null : value, packaged: null, page: null })
            }
            options={[
              { value: 'ALL', label: 'Any package' },
              ...packages.data.map((item) => ({ value: item.id, label: item.name })),
              { value: 'none', label: 'Paid, in no package' },
            ]}
          />
        ) : null}
        <Select
          aria-label="Sort by"
          className="w-40"
          value={sort}
          onValueChange={(value) => sortBy(value as TitleSortField)}
          options={TITLE_SORT_FIELDS.map((value) => ({ value, label: SORT_LABELS[value] }))}
        />
        <Tooltip content={order === 'asc' ? 'Ascending' : 'Descending'}>
          <Button
            size="icon"
            aria-label={`Order: ${order === 'asc' ? 'ascending' : 'descending'}. Click to turn around`}
            onClick={() => change({ order: order === 'asc' ? null : 'asc', page: null })}
          >
            {order === 'asc' ? <ArrowUp /> : <ArrowDown />}
          </Button>
        </Tooltip>
        {filtered ? (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('');
              change({
                q: null,
                status: null,
                category: null,
                genre: null,
                person: null,
                collection: null,
                shown: null,
                video: null,
                running: null,
                access: null,
                package: null,
                packaged: null,
                page: null,
              });
            }}
          >
            <X />
            Clear filters
          </Button>
        ) : null}

        {mayWrite && items.length > 0 ? (
          <label className="ml-auto flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-[13px] font-medium shadow-xs select-none hover:bg-accent">
            <Checkbox
              checked={pageState}
              aria-label="Select everything on this page"
              onCheckedChange={(checked) => choose(pageIds, checked === true)}
            />
            Select page
          </label>
        ) : null}
        <div
          className={cn(
            'flex rounded-md border bg-card p-0.5 shadow-xs',
            !(mayWrite && items.length > 0) && 'ml-auto',
          )}
          role="group"
          aria-label="View"
        >
          {(
            [
              ['grid', LayoutGrid, 'Posters'],
              ['list', List, 'List'],
            ] as const
          ).map(([value, Icon, label]) => (
            <Tooltip key={value} content={label}>
              <button
                type="button"
                aria-label={`${label} view`}
                aria-pressed={view === value}
                onClick={() => chooseView(value)}
                className={cn(
                  'flex size-8 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:text-foreground',
                  view === value && 'bg-accent text-foreground',
                )}
              >
                <Icon className="size-4" />
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      <ErrorNote error={titles.error} className="mb-4" />

      {titles.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton key={index} className="aspect-[2/3.6] rounded-xl" />
          ))}
        </div>
      ) : null}

      {titles.data && items.length === 0 ? (
        <EmptyState
          icon={filtered ? Search : section.icon}
          title={filtered ? 'Nothing matches' : `No ${section.many} yet`}
          action={!filtered ? newButton : null}
        >
          {filtered ? 'Try another search or clear the filters.' : section.empty}
        </EmptyState>
      ) : null}

      {items.length > 0 && view === 'grid' ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
          {items.map((title) => (
            <li
              key={title.id}
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-md',
                selecting && isSelected(title.id) && 'border-primary ring-2 ring-primary/40',
              )}
            >
              <Link
                to={titlePath(title)}
                tabIndex={-1}
                aria-hidden="true"
                className="block"
                // While titles are being selected, a click on a poster selects as well.
                onClick={
                  selecting
                    ? (event) => {
                        event.preventDefault();
                        pick(title.id, event);
                      }
                    : undefined
                }
              >
                <PosterArt title={title} className="aspect-[2/3]" />
              </Link>
              <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  {mayWrite ? (
                    // Shown on hover, and always on touch screens and while selecting.
                    <span
                      className={cn(
                        'pointer-events-auto flex size-6 items-center justify-center rounded-md bg-card shadow-sm transition-opacity focus-within:opacity-100 pointer-coarse:opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
                        selecting && 'sm:opacity-100',
                      )}
                    >
                      {tick(title)}
                    </span>
                  ) : null}
                  {/* A solid backing keeps the labels readable on any artwork. */}
                  <span className="rounded-full bg-card shadow-sm">
                    <TitleStatus title={title} />
                  </span>
                </span>
                {title.isFeatured ? (
                  <span
                    className="flex size-6 items-center justify-center rounded-full bg-card text-primary shadow-sm"
                    title="Featured"
                  >
                    <Star className="size-3.5 fill-current" aria-hidden="true" />
                    <span className="sr-only">Featured</span>
                  </span>
                ) : null}
                {title.access === 'PAID' ? (
                  <span
                    className="flex size-6 items-center justify-center rounded-full bg-card text-info shadow-sm"
                    title="Paid title"
                  >
                    <Lock className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Paid title</span>
                  </span>
                ) : null}
              </div>
              <div className="flex items-start gap-1 p-3">
                <div className="min-w-0 flex-1">
                  <Link
                    to={titlePath(title)}
                    className="block truncate text-sm font-medium hover:underline"
                    title={title.name}
                  >
                    {title.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span className="tabular-nums">{title.releaseYear ?? 'No year'}</span>
                    {title.rating !== null ? (
                      <span className="inline-flex items-center gap-0.5 tabular-nums">
                        <Star className="size-3 fill-current text-warning" aria-hidden="true" />
                        {formatRating(title.rating)}
                      </span>
                    ) : null}
                    {isSeries && title.seriesStatus ? (
                      <span>{SERIES_STATUS_LOOKS[title.seriesStatus].label}</span>
                    ) : null}
                  </p>
                  {isSeries ? (
                    <EpisodeProgress title={title} className="mt-1.5" />
                  ) : (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {describeContent(title)}
                    </p>
                  )}
                </div>
                {rowMenu(title)}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 && view === 'list' ? (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                {mayWrite ? (
                  <Th className="w-10 pr-0">
                    <Checkbox
                      checked={pageState}
                      aria-label="Select everything on this page"
                      onCheckedChange={(checked) => choose(pageIds, checked === true)}
                      className="size-[18px]"
                    />
                  </Th>
                ) : null}
                {(
                  [
                    ['name', isSeries ? 'Series' : 'Movie'],
                    [null, 'Status'],
                    ['releaseYear', 'Year'],
                    [isSeries ? null : 'runtimeMinutes', isSeries ? 'Episodes' : 'Video'],
                    ['rating', 'Rating'],
                    [null, 'Genres'],
                    ['updatedAt', 'Changed'],
                  ] as const
                ).map(([field, label]) => (
                  <Th
                    key={label}
                    aria-sort={
                      field && sort === field
                        ? order === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {field ? (
                      <button
                        type="button"
                        onClick={() => sortBy(field)}
                        className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
                      >
                        {label}
                        {sort === field ? (
                          order === 'asc' ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          )
                        ) : null}
                      </button>
                    ) : (
                      label
                    )}
                  </Th>
                ))}
                <Th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {items.map((title) => (
                <Tr
                  key={title.id}
                  className={cn('group', selecting && isSelected(title.id) && 'bg-primary/5')}
                >
                  {mayWrite ? <Td className="w-10 pr-0">{tick(title)}</Td> : null}
                  <Td>
                    <div className="flex items-center gap-3">
                      <PosterArt title={title} className="aspect-[2/3] w-9 shrink-0 rounded" />
                      <div className="min-w-0">
                        <Link
                          to={titlePath(title)}
                          className="block max-w-xs truncate font-medium hover:underline"
                        >
                          {title.name}
                        </Link>
                        {title.isFeatured ? (
                          <span className="inline-flex items-center gap-1 text-xs text-primary">
                            <Star className="size-3 fill-current" aria-hidden="true" />
                            Featured
                          </span>
                        ) : null}
                        {title.access === 'PAID' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-info">
                            <Lock className="size-3" aria-hidden="true" />
                            Subscribers
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <TitleStatus title={title} />
                  </Td>
                  <Td className="tabular-nums">
                    {title.releaseYear ?? '–'}
                    {isSeries && title.seriesStatus ? (
                      <p className="text-xs text-muted-foreground">
                        {SERIES_STATUS_LOOKS[title.seriesStatus].label}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="min-w-44 text-muted-foreground">
                    {isSeries ? (
                      <>
                        <p className="text-xs">
                          {title.seasonCount} {title.seasonCount === 1 ? 'season' : 'seasons'}
                        </p>
                        <EpisodeProgress title={title} className="mt-1" />
                      </>
                    ) : (
                      describeContent(title)
                    )}
                  </Td>
                  <Td className="tabular-nums">
                    {title.rating !== null ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3 fill-current text-warning" aria-hidden="true" />
                        {formatRating(title.rating)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex max-w-56 flex-wrap gap-1">
                      {title.genres.length === 0 ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        title.genres
                          .slice(0, 3)
                          .map((genre) => <Badge key={genre.id}>{genre.name}</Badge>)
                      )}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {formatRelative(title.updatedAt)}
                  </Td>
                  <Td>{rowMenu(title)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {titles.data ? (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={titles.data.total}
          onChange={(next) => change({ page: next === 1 ? null : String(next) })}
        />
      ) : null}

      {selecting ? (
        <BulkBar
          kind={kind}
          nouns={section}
          chosen={chosen.size}
          all={all}
          total={total}
          target={target}
          onSelectAll={
            !all && total > chosen.size
              ? () => {
                  setAll(true);
                  setChosen(new Set());
                }
              : null
          }
          onClear={clearSelection}
          onDone={afterBulk}
        />
      ) : null}

      <DuplicateTitleDialog
        titleId={duplicating}
        onClose={() => setDuplicating(null)}
        onDone={(copy) => {
          setDuplicating(null);
          toast.success(`${copy.name} is ready as a draft`, {
            description: 'It shares its pictures and videos with the original.',
          });
          void queryClient.invalidateQueries({ queryKey: ['titles'] });
          void navigate(titlePath(copy));
        }}
      />
      <NewTitleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        type={kind}
        onCreated={(id) => {
          void queryClient.invalidateQueries({ queryKey: ['titles'] });
          void navigate(titlePath({ id, type: kind }));
        }}
      />
      <MetadataDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind={kind}
        onDone={(result) => {
          setImportOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['titles'] });
          void queryClient.invalidateQueries({ queryKey: ['categories'] });
          void queryClient.invalidateQueries({ queryKey: ['genres'] });
          void queryClient.invalidateQueries({ queryKey: ['people'] });
          announceImport(result);
          void navigate(titlePath(result.title));
        }}
      />
    </>
  );
}

interface NewTitleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: TitleType;
  onCreated: (id: string) => void;
}

/** Asks for the one thing a title cannot exist without, then opens its editor. */
function NewTitleDialog({ open, onOpenChange, type, onCreated }: NewTitleDialogProps) {
  const [name, setName] = useState('');
  const section = SECTIONS[type];

  const create = useMutation({
    mutationFn: () => titlesApi.create({ type, name: name.trim() }),
    onSuccess: (title) => {
      toast.success(`"${title.name}" created as a draft`);
      onOpenChange(false);
      onCreated(title.id);
    },
  });

  useEffect(() => {
    if (open) {
      create.reset();
      setName('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={section.create}
        description={
          type === 'SERIES'
            ? 'It starts as a draft that viewers cannot see. You add seasons, episodes and the rest in the editor.'
            : 'It starts as a draft that viewers cannot see. You add its video and the rest in the editor.'
        }
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field
              label="Name"
              hint="To have the details, the artwork and the people filled in for you, use Import instead."
            >
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus
                  maxLength={200}
                  placeholder={type === 'SERIES' ? 'Name of the series' : 'Name of the movie'}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <ErrorNote error={create.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={create.isPending}
              disabled={!name.trim()}
            >
              Create and open
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** How many episodes of a series have their video, as a bar with the figure beside it. */
function EpisodeProgress({ title, className }: { title: TitleSummary; className?: string }) {
  const progress = videoProgress(title);
  return (
    <Tooltip content={progress.label}>
      <div className={cn('flex items-center gap-2', className)} aria-label={progress.label}>
        <div className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500',
              progress.complete ? 'bg-success' : 'bg-primary',
            )}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {title.readyEpisodeCount}/{title.episodeCount}
        </span>
      </div>
    </Tooltip>
  );
}
