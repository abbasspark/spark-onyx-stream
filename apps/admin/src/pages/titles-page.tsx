// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Clapperboard,
  Film,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { categoriesApi, titlesApi } from '@/api/endpoints';
import {
  PUBLISH_STATUSES,
  TITLE_SORT_FIELDS,
  type PublishStatus,
  type SortOrder,
  type TitleSortField,
  type TitleSummary,
  type TitleType,
} from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
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
import { describeContent } from '@/lib/catalog';
import { useAddressParams } from '@/lib/address-params';
import { cn } from '@/lib/cn';
import { formatRelative, humanize } from '@/lib/format';

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
};

const TYPE_TABS: readonly (readonly [value: TitleType | '', label: string])[] = [
  ['', 'All'],
  ['MOVIE', 'Movies'],
  ['SERIES', 'Series'],
];

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

/** The catalog: every movie and series, as a wall of posters or a table. */
export function TitlesPage() {
  const { can } = useSession();
  const mayWrite = can('catalog:write');
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, change] = useAddressParams();

  const page = Math.max(1, Number(params.get('page')) || 1);
  const type = (
    ['MOVIE', 'SERIES'].includes(params.get('type') ?? '') ? params.get('type') : ''
  ) as TitleType | '';
  const status = (
    (PUBLISH_STATUSES as readonly string[]).includes(params.get('status') ?? '')
      ? params.get('status')
      : ''
  ) as PublishStatus | '';
  const categoryId = params.get('category') ?? '';
  const q = params.get('q') ?? '';
  const sort = (TITLE_SORT_FIELDS as readonly string[]).includes(params.get('sort') ?? '')
    ? (params.get('sort') as TitleSortField)
    : 'createdAt';
  const order: SortOrder = params.get('order') === 'asc' ? 'asc' : 'desc';

  const [view, setView] = useState<View>(readView);
  const [createOpen, setCreateOpen] = useState(false);

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

  const titles = useQuery({
    queryKey: ['titles', 'list', { page, type, status, categoryId, q, sort, order }],
    queryFn: ({ signal }) =>
      titlesApi.list(
        {
          page,
          pageSize: PAGE_SIZE,
          type: type || undefined,
          status: status || undefined,
          categoryId: categoryId || undefined,
          q: q || undefined,
          sort,
          order,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => categoriesApi.list(signal),
  });
  const items = titles.data?.items ?? [];
  const filtered = Boolean(q || status || categoryId || type);

  const remove = useMutation({
    mutationFn: (title: TitleSummary) => titlesApi.remove(title.id),
    onSuccess: () => {
      toast.success('Title deleted');
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
          : 'The title is removed from the catalog. Its video stays in the library.',
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
        <DropdownMenuItem onSelect={() => void navigate(`/titles/${title.id}`)}>
          <Pencil />
          {mayWrite ? 'Edit' : 'Open'}
        </DropdownMenuItem>
        {mayWrite ? (
          <>
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
    <Button variant="primary" onClick={() => setCreateOpen(true)}>
      <Plus />
      New title
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Titles"
        description="The movies and series viewers can watch. A title joins a video from the library with its name, artwork and categories."
        actions={newButton}
      />

      <div className="mb-4 flex gap-1 border-b" role="tablist" aria-label="Kind of title">
        {TYPE_TABS.map(([value, label]) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={type === value}
            onClick={() => change({ type: value || null, page: null })}
            className={cn(
              '-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
              type === value && 'border-primary text-foreground',
            )}
          >
            {label}
          </button>
        ))}
        {titles.data ? (
          <span className="ml-auto self-center text-xs text-muted-foreground tabular-nums">
            {titles.data.total} {titles.data.total === 1 ? 'title' : 'titles'}
          </span>
        ) : null}
      </div>

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
              change({ q: null, status: null, category: null, type: null, page: null });
            }}
          >
            <X />
            Clear filters
          </Button>
        ) : null}

        <div
          className="ml-auto flex rounded-md border bg-card p-0.5 shadow-xs"
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
          icon={filtered ? Search : Clapperboard}
          title={filtered ? 'Nothing matches' : 'The catalog is empty'}
          action={!filtered ? newButton : null}
        >
          {filtered
            ? 'Try another search or clear the filters.'
            : 'Create your first movie or series, then attach a video from the library.'}
        </EmptyState>
      ) : null}

      {items.length > 0 && view === 'grid' ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
          {items.map((title) => (
            <li
              key={title.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-md"
            >
              <Link to={`/titles/${title.id}`} tabIndex={-1} aria-hidden="true" className="block">
                <PosterArt title={title} className="aspect-[2/3]" />
              </Link>
              <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
                {/* A solid backing keeps the labels readable on any artwork. */}
                <span className="rounded-full bg-card shadow-sm">
                  <StatusBadge status={title.status} />
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
              </div>
              <div className="flex items-start gap-1 p-3">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/titles/${title.id}`}
                    className="block truncate text-sm font-medium hover:underline"
                    title={title.name}
                  >
                    {title.name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {title.type === 'SERIES' ? 'Series' : 'Movie'}
                    {title.releaseYear ? ` · ${title.releaseYear}` : ''}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {describeContent(title)}
                  </p>
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
                {(
                  [
                    ['name', 'Title'],
                    [null, 'Status'],
                    [null, 'Kind'],
                    ['releaseYear', 'Year'],
                    [null, 'Content'],
                    [null, 'Categories'],
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
                <Tr key={title.id} className="group">
                  <Td>
                    <div className="flex items-center gap-3">
                      <PosterArt title={title} className="aspect-[2/3] w-9 shrink-0 rounded" />
                      <div className="min-w-0">
                        <Link
                          to={`/titles/${title.id}`}
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
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge status={title.status} />
                  </Td>
                  <Td>{title.type === 'SERIES' ? 'Series' : 'Movie'}</Td>
                  <Td className="tabular-nums">{title.releaseYear ?? '–'}</Td>
                  <Td className="text-muted-foreground">{describeContent(title)}</Td>
                  <Td>
                    <div className="flex max-w-56 flex-wrap gap-1">
                      {title.categories.length === 0 ? (
                        <span className="text-muted-foreground">–</span>
                      ) : (
                        title.categories.map((category) => (
                          <Badge key={category.id}>{category.name}</Badge>
                        ))
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

      <NewTitleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialType={type || 'MOVIE'}
        onCreated={(id) => {
          void queryClient.invalidateQueries({ queryKey: ['titles'] });
          void navigate(`/titles/${id}`);
        }}
      />
    </>
  );
}

interface NewTitleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType: TitleType;
  onCreated: (id: string) => void;
}

const KINDS = [
  ['MOVIE', Film, 'Movie', 'One video: a film, a documentary, a recording.'],
  ['SERIES', Tv, 'Series', 'Seasons with episodes, each with its own video.'],
] as const;

/** Asks for the two things a title cannot exist without, then opens its editor. */
function NewTitleDialog({ open, onOpenChange, initialType, onCreated }: NewTitleDialogProps) {
  const [type, setType] = useState<TitleType>(initialType);
  const [name, setName] = useState('');

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
      setType(initialType);
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
        title="New title"
        description="It starts as a draft that viewers cannot see. You add the rest in the editor."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Kind of title">
              {KINDS.map(([value, Icon, label, description]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={type === value}
                  onClick={() => setType(value)}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors hover:bg-accent',
                    type === value && 'border-primary bg-primary/5 ring-1 ring-primary',
                  )}
                >
                  <Icon
                    className={cn('size-5 text-muted-foreground', type === value && 'text-primary')}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{description}</span>
                </button>
              ))}
            </div>
            <Field label="Name">
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
