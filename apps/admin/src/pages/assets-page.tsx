// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Film,
  LayoutGrid,
  List,
  Lock,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { assetsApi } from '@/api/endpoints';
import {
  ASSET_SORT_FIELDS,
  ASSET_STATUSES,
  type Asset,
  type AssetSortField,
  type AssetStatus,
  type SortOrder,
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
import { Checkbox, Input, Select } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/overlay';
import { UploadDialog, videoFilesOf } from '@/components/upload-dialog';
import { cn } from '@/lib/cn';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatRelative,
  formatResolution,
  humanize,
} from '@/lib/format';

const PAGE_SIZE = 24;
/** How often the list is read again while something on it is still changing. */
const REFRESH_MS = 2500;
const SEARCH_DELAY_MS = 300;
const VIEW_KEY = 'onyx.admin.library-view';

type View = 'grid' | 'list';

const SORT_LABELS: Record<AssetSortField, string> = {
  createdAt: 'Date added',
  title: 'Title',
  durationMs: 'Length',
  sourceBytes: 'Source size',
};

const isBusy = (asset: Asset) => ['UPLOADING', 'UPLOADED', 'PROCESSING'].includes(asset.status);

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

/** The poster of an asset, or a placeholder while there is none. */
function Poster({ asset, className }: { asset: Asset; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {asset.posterUrl ? (
        <img
          src={apiUrl(asset.posterUrl)}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground/50">
          <Film className="size-1/4 max-h-10 min-h-4" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/** The library: every video, as a grid of posters or a table, with search, sorting and bulk actions. */
export function AssetsPage() {
  const { can } = useSession();
  const mayWrite = can('assets:write');
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page')) || 1);
  const status = (params.get('status') ?? '') as AssetStatus | '';
  const q = params.get('q') ?? '';
  const sort = (ASSET_SORT_FIELDS as readonly string[]).includes(params.get('sort') ?? '')
    ? (params.get('sort') as AssetSortField)
    : 'createdAt';
  const order: SortOrder = params.get('order') === 'asc' ? 'asc' : 'desc';

  const [view, setView] = useState<View>(readView);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [draggingOver, setDraggingOver] = useState(false);
  const dragDepth = useRef(0);

  function change(values: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(values)) {
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
        }
        return next;
      },
      { replace: true },
    );
  }

  // A link such as /assets?upload=1 opens the upload dialog.
  useEffect(() => {
    if (params.get('upload') === '1' && mayWrite) {
      setDroppedFiles([]);
      setUploadOpen(true);
      change({ upload: null });
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

  const assets = useQuery({
    queryKey: ['assets', { page, status, q, sort, order }],
    queryFn: ({ signal }) =>
      assetsApi.list(
        { page, pageSize: PAGE_SIZE, status: status || undefined, q: q || undefined, sort, order },
        signal,
      ),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.items.some(isBusy) ? REFRESH_MS : false),
  });
  const items = assets.data?.items ?? [];

  // A selection only makes sense for what is on screen.
  useEffect(() => setSelected(new Set()), [page, status, q, sort, order]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
    void queryClient.invalidateQueries({ queryKey: ['jobs'] });
  };

  /** Runs one action for several assets and reports how many succeeded. */
  const runForAll = async (
    ids: string[],
    action: (id: string) => Promise<unknown>,
    done: (count: number) => string,
  ) => {
    const results = await Promise.allSettled(ids.map((id) => action(id)));
    const failed = results.filter((result) => result.status === 'rejected');
    const succeeded = results.length - failed.length;
    if (succeeded > 0) {
      toast.success(done(succeeded));
    }
    if (failed.length > 0) {
      const reason = (failed[0] as PromiseRejectedResult).reason as unknown;
      toast.error(`${failed.length} could not be changed`, {
        description: reason instanceof Error ? reason.message : undefined,
      });
    }
    setSelected(new Set());
    refresh();
  };

  const remove = useMutation({
    mutationFn: (ids: string[]) =>
      runForAll(ids, assetsApi.remove, (count) =>
        count === 1 ? 'Video deleted' : `${count} videos deleted`,
      ),
  });
  const reprocess = useMutation({
    mutationFn: (ids: string[]) =>
      runForAll(
        ids,
        (id) => assetsApi.reprocess(id, {}),
        (count) =>
          count === 1 ? 'Processing started again' : `Processing started again for ${count} videos`,
      ),
  });
  const working = remove.isPending || reprocess.isPending;

  const askDelete = async (targets: Asset[]) => {
    const one = targets.length === 1 ? targets[0] : undefined;
    const confirmed = await confirm({
      title: one ? `Delete "${one.title}"?` : `Delete ${targets.length} videos?`,
      description:
        'The source files and all streams are removed. Viewers can no longer play them. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(targets.map((asset) => asset.id));
    }
  };

  const askReprocess = async (targets: Asset[]) => {
    const usable = targets.filter((asset) => !isBusy(asset) && asset.source.filename);
    if (usable.length === 0) {
      toast.error('These videos are still being processed');
      return;
    }
    const confirmed = await confirm({
      title:
        usable.length === 1
          ? 'Process this video again?'
          : `Process ${usable.length} videos again?`,
      description:
        'The streams are built again from the source files and replace the current ones.',
      confirmLabel: 'Process again',
    });
    if (confirmed) {
      reprocess.mutate(usable.map((asset) => asset.id));
    }
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const allSelected = items.length > 0 && items.every((asset) => selected.has(asset.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((asset) => asset.id)));
  const selectedAssets = items.filter((asset) => selected.has(asset.id));

  const chooseView = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage can be blocked. The choice then lasts until the page is reloaded.
    }
  };

  const sortBy = (field: AssetSortField) =>
    change({
      sort: field === 'createdAt' ? null : field,
      // A second click on the same column turns the order around.
      order: sort === field ? (order === 'asc' ? null : 'asc') : field === 'title' ? 'asc' : null,
      page: null,
    });

  const rowMenu = (asset: Asset): ReactNode => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${asset.title}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void navigate(`/assets/${asset.id}`)}>
          <Film />
          Open
        </DropdownMenuItem>
        {mayWrite ? (
          <>
            <DropdownMenuItem
              disabled={isBusy(asset) || !asset.source.filename}
              onSelect={() => void askReprocess([asset])}
            >
              <RefreshCw />
              Process again
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => void askDelete([asset])}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const filtered = Boolean(q || status);

  return (
    <div
      className="relative"
      onDragEnter={(event) => {
        if (mayWrite && event.dataTransfer.types.includes('Files')) {
          dragDepth.current += 1;
          setDraggingOver(true);
        }
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) {
          setDraggingOver(false);
        }
      }}
      onDragOver={(event) => {
        if (mayWrite && event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (!mayWrite || !event.dataTransfer.types.includes('Files')) {
          return;
        }
        event.preventDefault();
        dragDepth.current = 0;
        setDraggingOver(false);
        const files = videoFilesOf(event.dataTransfer.files);
        if (files.length === 0) {
          toast.error('Those files are not videos');
          return;
        }
        setDroppedFiles(files);
        setUploadOpen(true);
      }}
    >
      <PageHeader
        title="Library"
        description={
          assets.data
            ? `${assets.data.total} ${assets.data.total === 1 ? 'video' : 'videos'}${filtered ? ' match' : ''}`
            : 'All videos of this installation.'
        }
        actions={
          mayWrite ? (
            <Button
              variant="primary"
              onClick={() => {
                setDroppedFiles([]);
                setUploadOpen(true);
              }}
            >
              <Upload />
              Upload videos
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search by title"
            aria-label="Search by title"
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
            ...ASSET_STATUSES.map((value) => ({ value, label: humanize(value) })),
          ]}
        />
        <Select
          aria-label="Sort by"
          className="w-40"
          value={sort}
          onValueChange={(value) => sortBy(value as AssetSortField)}
          options={ASSET_SORT_FIELDS.map((value) => ({ value, label: SORT_LABELS[value] }))}
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
              change({ q: null, status: null, page: null });
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
              ['grid', LayoutGrid, 'Grid'],
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

      {selected.size > 0 ? (
        <div className="sticky top-16 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 backdrop-blur-md">
          <Checkbox
            checked={allSelected ? true : 'indeterminate'}
            onCheckedChange={toggleAll}
            aria-label="Select all on this page"
          />
          <span className="mr-auto text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" disabled={working} onClick={() => void askReprocess(selectedAssets)}>
            <RefreshCw />
            Process again
          </Button>
          <Button
            size="sm"
            variant="destructive-outline"
            disabled={working}
            onClick={() => void askDelete(selectedAssets)}
          >
            <Trash2 />
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      <ErrorNote error={assets.error} className="mb-4" />

      {assets.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="aspect-[16/12] rounded-xl" />
          ))}
        </div>
      ) : null}

      {assets.data && items.length === 0 ? (
        <EmptyState
          icon={filtered ? Search : Film}
          title={filtered ? 'Nothing matches' : 'The library is empty'}
          action={
            !filtered && mayWrite ? (
              <Button variant="primary" onClick={() => setUploadOpen(true)}>
                <Upload />
                Upload videos
              </Button>
            ) : null
          }
        >
          {filtered
            ? 'Change the search or the filter to see more.'
            : 'Upload your first video, or drop files anywhere on this page.'}
        </EmptyState>
      ) : null}

      {items.length > 0 && view === 'grid' ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {items.map((asset) => {
            const isSelected = selected.has(asset.id);
            return (
              <li
                key={asset.id}
                className={cn(
                  'group relative overflow-hidden rounded-xl border bg-card shadow-xs transition-all hover:border-primary/40 hover:shadow-md',
                  isSelected && 'border-primary ring-2 ring-primary/30',
                )}
              >
                <Link to={`/assets/${asset.id}`} className="block" aria-label={asset.title}>
                  <Poster asset={asset} className="aspect-video" />
                </Link>
                {asset.media.durationMs ? (
                  <span className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
                    {formatDuration(asset.media.durationMs)}
                  </span>
                ) : null}
                {mayWrite ? (
                  <div
                    className={cn(
                      'absolute top-2 left-2 rounded-md bg-background/80 p-1 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100',
                      isSelected && 'opacity-100',
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(asset.id)}
                      aria-label={`Select ${asset.title}`}
                    />
                  </div>
                ) : null}
                <div className="flex items-start gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/assets/${asset.id}`}
                      className="block truncate text-sm font-medium hover:underline"
                      title={asset.title}
                    >
                      {asset.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={asset.status} />
                      {asset.media.height ? <Badge>{asset.media.height}p</Badge> : null}
                      {asset.encryption === 'AES_128' ? (
                        <Tooltip content="Encrypted with AES-128">
                          <Badge tone="primary">
                            <Lock className="size-3" aria-hidden="true" />
                            <span className="sr-only">Encrypted</span>
                          </Badge>
                        </Tooltip>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {formatRelative(asset.createdAt)}
                      {asset.source.bytes ? ` · ${formatBytes(asset.source.bytes)}` : ''}
                    </p>
                  </div>
                  {rowMenu(asset)}
                </div>
              </li>
            );
          })}
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
                      checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all on this page"
                    />
                  </Th>
                ) : null}
                {(
                  [
                    ['title', 'Title'],
                    [null, 'Status'],
                    ['durationMs', 'Length'],
                    [null, 'Picture'],
                    ['sourceBytes', 'Source'],
                    ['createdAt', 'Added'],
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
              {items.map((asset) => (
                <Tr key={asset.id} data-selected={selected.has(asset.id)} className="group">
                  {mayWrite ? (
                    <Td className="pr-0">
                      <Checkbox
                        checked={selected.has(asset.id)}
                        onCheckedChange={() => toggle(asset.id)}
                        aria-label={`Select ${asset.title}`}
                      />
                    </Td>
                  ) : null}
                  <Td>
                    <Link to={`/assets/${asset.id}`} className="flex items-center gap-3">
                      <Poster asset={asset} className="aspect-video w-20 shrink-0 rounded-md" />
                      <span className="min-w-0">
                        <span className="block max-w-xs truncate font-medium group-hover:underline">
                          {asset.title}
                        </span>
                        {asset.encryption === 'AES_128' ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="size-3" aria-hidden="true" />
                            Encrypted
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={asset.status} />
                  </Td>
                  <Td className="tabular-nums">{formatDuration(asset.media.durationMs)}</Td>
                  <Td className="whitespace-nowrap">
                    {formatResolution(asset.media.width, asset.media.height)}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {formatBytes(asset.source.bytes)}
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    <Tooltip content={formatDateTime(asset.createdAt)}>
                      <span>{formatRelative(asset.createdAt)}</span>
                    </Tooltip>
                  </Td>
                  <Td>{rowMenu(asset)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {assets.data ? (
        <Pagination
          page={assets.data.page}
          pageSize={assets.data.pageSize}
          total={assets.data.total}
          onChange={(next) => change({ page: next > 1 ? String(next) : null })}
        />
      ) : null}

      {draggingOver ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-card px-12 py-10 shadow-2xl">
            <UploadCloud className="size-10 text-primary" aria-hidden="true" />
            <p className="text-lg font-semibold">Drop to upload</p>
            <p className="text-sm text-muted-foreground">
              You can set the options before the upload starts.
            </p>
          </div>
        </div>
      ) : null}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} initialFiles={droppedFiles} />
    </div>
  );
}
