// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  EyeOff,
  Film,
  Library,
  Plus,
  Search,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { collectionsApi, titlesApi } from '@/api/endpoints';
import type { CatalogImage, Collection, CollectionDetail, CollectionTitle } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { ImageField } from '@/components/image-field';
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
  Spinner,
  StatusBadge,
} from '@/components/ui/display';
import { Field, Input, Textarea, ToggleRow } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter, Tooltip } from '@/components/ui/overlay';
import { moved, titlePath } from '@/lib/catalog';
import { cn } from '@/lib/cn';

const count = (titles: number) => `${titles} ${titles === 1 ? 'title' : 'titles'}`;

/** The picture of a collection: its own poster, or the posters of its first titles. */
function CollectionCover({ collection }: { collection: Collection }) {
  const pictures = collection.poster ? [collection.poster] : collection.covers;
  if (pictures.length === 0) {
    return (
      <span className="flex aspect-[2/3] w-full items-center justify-center bg-muted text-muted-foreground/50">
        <Library className="size-10" aria-hidden="true" />
      </span>
    );
  }
  if (pictures.length < 4) {
    return (
      <img
        src={apiUrl((pictures[0] as CatalogImage).url)}
        alt=""
        loading="lazy"
        className="aspect-[2/3] w-full object-cover"
      />
    );
  }
  return (
    <span className="grid aspect-[2/3] w-full grid-cols-2 grid-rows-2 gap-px bg-border">
      {pictures.slice(0, 4).map((picture) => (
        <img
          key={picture.id}
          src={apiUrl(picture.url)}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ))}
    </span>
  );
}

/** Titles that belong together, in the order viewers get them. */
export function CollectionsPage() {
  const { can } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mayWrite = can('catalog:write');
  const [creating, setCreating] = useState(false);

  const collections = useQuery({
    queryKey: ['collections'],
    queryFn: ({ signal }) => collectionsApi.list(signal),
  });
  const items = collections.data ?? [];

  const reorder = useMutation({
    mutationFn: collectionsApi.reorder,
    // The new order is shown at once and corrected if the server refuses it.
    onMutate: (ids: string[]) => {
      const previous = queryClient.getQueryData<Collection[]>(['collections']);
      queryClient.setQueryData<Collection[]>(['collections'], (current) =>
        current ? ids.map((id) => current.find((item) => item.id === id) as Collection) : current,
      );
      return { previous };
    },
    onError: (error: Error, _ids, context) => {
      queryClient.setQueryData(['collections'], context?.previous);
      toast.error(error.message);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['collections'] }),
  });

  const newButton = mayWrite ? (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus />
      New collection
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="Collections"
        description="Titles that belong together in an order: the films of a series of films, or a selection of your own. Viewers get them in this order."
        actions={newButton}
      />

      <ErrorNote error={collections.error} className="mb-4" />
      {collections.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-5">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="aspect-[2/3] rounded-xl" />
          ))}
        </div>
      ) : null}
      {collections.data && items.length === 0 ? (
        <EmptyState icon={Library} title="No collections yet" action={newButton}>
          A movie imported from TMDB brings the collection it is part of. You can also put together
          your own.
        </EmptyState>
      ) : null}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-5">
        {items.map((collection, index) => (
          <li key={collection.id} className="group relative">
            <Link
              to={`/collections/${collection.id}`}
              className="block overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary/50"
            >
              <span className={cn('block', !collection.visible && 'opacity-50')}>
                <CollectionCover collection={collection} />
              </span>
              <span className="grid gap-1 px-3 py-3">
                <span className="truncate text-sm font-medium">{collection.name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {count(collection.titleCount)}
                  {collection.visible ? null : (
                    <Badge tone="warning">
                      <EyeOff className="size-3" aria-hidden="true" />
                      Hidden
                    </Badge>
                  )}
                </span>
              </span>
            </Link>
            {mayWrite && items.length > 1 ? (
              <span className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                <Tooltip content="Move earlier">
                  <Button
                    size="icon-sm"
                    className="bg-background/90 backdrop-blur"
                    aria-label={`Move ${collection.name} earlier`}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => reorder.mutate(moved(items, index, -1).map((item) => item.id))}
                  >
                    <ArrowUp className="-rotate-90" />
                  </Button>
                </Tooltip>
                <Tooltip content="Move later">
                  <Button
                    size="icon-sm"
                    className="bg-background/90 backdrop-blur"
                    aria-label={`Move ${collection.name} later`}
                    disabled={index === items.length - 1 || reorder.isPending}
                    onClick={() => reorder.mutate(moved(items, index, 1).map((item) => item.id))}
                  >
                    <ArrowDown className="-rotate-90" />
                  </Button>
                </Tooltip>
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <NewCollectionDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(collection) => {
          void queryClient.invalidateQueries({ queryKey: ['collections'] });
          void navigate(`/collections/${collection.id}`);
        }}
      />
    </>
  );
}

interface NewCollectionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (collection: CollectionDetail) => void;
}

function NewCollectionDialog({ open, onClose, onCreated }: NewCollectionDialogProps) {
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => collectionsApi.create({ name: name.trim() }),
    onSuccess: onCreated,
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
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title="New collection"
        description="Give it a name. You add its titles on the next page."
        size="sm"
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus
                  maxLength={200}
                  placeholder="The Harbour Trilogy"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <ErrorNote error={create.error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One collection: its titles in their order, and how it is presented. */
export function CollectionEditorPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const mayWrite = can('catalog:write');

  const query = useQuery({
    queryKey: ['collections', 'detail', id],
    queryFn: ({ signal }) => collectionsApi.get(id, signal),
  });
  const collection = query.data;
  const store = (next: CollectionDetail) => {
    queryClient.setQueryData(['collections', 'detail', id], next);
    void queryClient.invalidateQueries({ queryKey: ['collections'], exact: true });
    void queryClient.invalidateQueries({ queryKey: ['titles'] });
  };

  const remove = useMutation({
    mutationFn: () => collectionsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collections'] });
      void queryClient.invalidateQueries({ queryKey: ['titles'] });
      toast.success('Collection deleted');
      void navigate('/collections');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const askDelete = async () => {
    if (!collection) {
      return;
    }
    const confirmed = await confirm({
      title: `Delete the collection "${collection.name}"?`,
      description:
        collection.titleCount > 0
          ? `Its ${count(collection.titleCount)} stay in the catalog. Only the collection goes.`
          : 'It holds no titles.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate();
    }
  };

  if (query.isPending) {
    return <Spinner label="Loading the collection" />;
  }
  if (!collection) {
    return (
      <EmptyState
        icon={Library}
        title="Collection not found"
        action={
          <Button asChild>
            <Link to="/collections">Back to the collections</Link>
          </Button>
        }
      >
        <ErrorNote error={query.error} />
      </EmptyState>
    );
  }

  return (
    <>
      <Link
        to="/collections"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Collections
      </Link>
      <PageHeader
        title={
          <>
            {collection.name}
            {collection.visible ? null : (
              <Badge tone="warning">
                <EyeOff className="size-3" aria-hidden="true" />
                Hidden
              </Badge>
            )}
          </>
        }
        description={`${count(collection.titleCount)}${collection.metadataSource ? `, imported from ${collection.metadataSource.toUpperCase()}` : ''}`}
        actions={
          mayWrite ? (
            <Button
              variant="ghost"
              className="text-destructive"
              loading={remove.isPending}
              onClick={() => void askDelete()}
            >
              <Trash2 />
              Delete
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <CollectionTitles collection={collection} disabled={!mayWrite} onSaved={store} />
        <div className="grid gap-6">
          <CollectionDetails collection={collection} disabled={!mayWrite} onSaved={store} />
          <Card>
            <CardHeader
              title="Artwork"
              description="Optional. Without a poster, the posters of its first titles are shown."
            />
            <CardContent className="grid gap-5">
              <ImageField
                label="Poster"
                hint="Upright, 2:3."
                kind="POSTER"
                aspect="aspect-[2/3] max-w-36"
                image={collection.poster}
                disabled={!mayWrite}
                onChange={async (image) =>
                  store(await collectionsApi.update(id, { posterId: image?.id ?? null }))
                }
              />
              <ImageField
                label="Backdrop"
                hint="Wide, 16:9, without text."
                kind="BACKDROP"
                aspect="aspect-video"
                image={collection.backdrop}
                disabled={!mayWrite}
                onChange={async (image) =>
                  store(await collectionsApi.update(id, { backdropId: image?.id ?? null }))
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

interface PartProps {
  collection: CollectionDetail;
  disabled: boolean;
  onSaved: (collection: CollectionDetail) => void;
}

function CollectionDetails({ collection, disabled, onSaved }: PartProps) {
  const [name, setName] = useState(collection.name);
  const [slug, setSlug] = useState(collection.slug);
  const [synopsis, setSynopsis] = useState(collection.synopsis);
  const [visible, setVisible] = useState(collection.visible);
  useEffect(() => {
    setName(collection.name);
    setSlug(collection.slug);
    setSynopsis(collection.synopsis);
    setVisible(collection.visible);
  }, [collection.name, collection.slug, collection.synopsis, collection.visible]);

  const dirty =
    name.trim() !== collection.name ||
    slug.trim() !== collection.slug ||
    synopsis.trim() !== collection.synopsis ||
    visible !== collection.visible;
  const save = useMutation({
    mutationFn: () =>
      collectionsApi.update(collection.id, {
        name: name.trim(),
        slug: slug.trim(),
        synopsis: synopsis.trim(),
        visible,
      }),
    onSuccess: (next) => {
      onSaved(next);
      toast.success('Collection saved');
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Card>
      <CardHeader title="Details" />
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                required
                maxLength={200}
                disabled={disabled}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Field label="Slug" hint="The readable part of its web address.">
            {(id) => (
              <Input
                id={id}
                required
                className="font-mono"
                disabled={disabled}
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            )}
          </Field>
          <Field label="Synopsis" hint="Optional. What holds these titles together.">
            {(id) => (
              <Textarea
                id={id}
                rows={4}
                maxLength={4000}
                disabled={disabled}
                value={synopsis}
                onChange={(event) => setSynopsis(event.target.value)}
              />
            )}
          </Field>
          <ToggleRow
            label="Shown to viewers"
            description="Off, the collection is kept here and not offered on the site."
            checked={visible}
            disabled={disabled}
            onCheckedChange={setVisible}
          />
          <ErrorNote error={save.error} />
          {disabled ? null : (
            <Button
              type="submit"
              variant="primary"
              className="justify-self-start"
              loading={save.isPending}
              disabled={!dirty || !name.trim()}
            >
              Save details
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/** The titles of the collection: ordered, added by search, saved together. */
function CollectionTitles({ collection, disabled, onSaved }: PartProps) {
  const [rows, setRows] = useState<CollectionTitle[]>(collection.titles);
  const savedIds = useMemo(() => collection.titles.map((title) => title.id).join(), [collection]);
  const dirty = rows.map((title) => title.id).join() !== savedIds;
  useEffect(() => {
    setRows(collection.titles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedIds]);

  const save = useMutation({
    mutationFn: () =>
      collectionsApi.setTitles(
        collection.id,
        rows.map((title) => title.id),
      ),
    onSuccess: (next) => {
      onSaved(next);
      toast.success('Titles of the collection saved');
    },
  });
  /** Oldest first, titles without a year last: the usual order of a series of films. */
  const byYear = () =>
    setRows((current) =>
      [...current].sort(
        (a, b) =>
          (a.releaseYear ?? Number.MAX_SAFE_INTEGER) - (b.releaseYear ?? Number.MAX_SAFE_INTEGER),
      ),
    );

  return (
    <Card>
      <CardHeader
        title={`Titles${rows.length > 0 ? ` (${rows.length})` : ''}`}
        description="In the order viewers get them."
        actions={
          !disabled && rows.length > 1 ? (
            <Button size="sm" onClick={byYear}>
              Order by year
            </Button>
          ) : null
        }
      />
      <CardContent className="grid gap-4">
        {disabled ? null : (
          <TitleSearch
            exclude={rows.map((title) => title.id)}
            onPick={(title) => setRows((current) => [...current, title])}
          />
        )}
        {rows.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground">
            <Library className="size-4" aria-hidden="true" />
            No titles yet. Search above to add the first.
          </p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {rows.map((title, index) => (
              <li key={title.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="aspect-[2/3] w-9 shrink-0 overflow-hidden rounded bg-muted">
                  {title.poster ? (
                    <img
                      src={apiUrl(title.poster.url)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    to={titlePath(title)}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {title.name}
                  </Link>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {title.type === 'SERIES' ? (
                      <Tv className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Film className="size-3.5" aria-hidden="true" />
                    )}
                    {title.type === 'SERIES' ? 'Series' : 'Movie'}
                    {title.releaseYear ? ` · ${title.releaseYear}` : ''}
                  </span>
                </span>
                <StatusBadge status={title.status} />
                {disabled ? null : (
                  <span className="flex shrink-0 items-center">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${title.name} up`}
                      disabled={index === 0}
                      onClick={() => setRows((current) => moved(current, index, -1))}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${title.name} down`}
                      disabled={index === rows.length - 1}
                      onClick={() => setRows((current) => moved(current, index, 1))}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${title.name}`}
                      onClick={() =>
                        setRows((current) => current.filter((item) => item.id !== title.id))
                      }
                    >
                      <X />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}

        {dirty || save.error ? (
          <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-popover/95 px-4 py-3 shadow-lg backdrop-blur-md">
            <div className="mr-auto min-w-0">
              <p className="text-sm font-medium">You have unsaved changes</p>
              {save.error ? <p className="text-sm text-destructive">{save.error.message}</p> : null}
            </div>
            <Button
              disabled={save.isPending}
              onClick={() => {
                save.reset();
                setRows(collection.titles);
              }}
            >
              Discard
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!dirty}
              onClick={() => save.mutate()}
            >
              Save changes
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface TitleSearchProps {
  /** Titles that are in the collection already. */
  exclude: readonly string[];
  onPick: (title: CollectionTitle) => void;
}

/** Finds movies and series by name, to put them into the collection. */
function TitleSearch({ exclude, onPick }: TitleSearchProps) {
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(text.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [text]);

  const search = useQuery({
    queryKey: ['titles', 'list', 'collection-search', term],
    queryFn: ({ signal }) =>
      titlesApi.list({ page: 1, pageSize: 8, q: term, sort: 'name', order: 'asc' }, signal),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
  });
  const found = term ? (search.data?.items ?? []) : [];

  return (
    <div className="grid gap-2">
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Find a title to add"
          placeholder="Find a movie or series to add"
          className="pl-9"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <ErrorNote error={search.error} />
      {term && search.data && found.length === 0 ? (
        <p className="text-sm text-muted-foreground">No title by that name.</p>
      ) : null}
      {found.length > 0 ? (
        <ul className="grid gap-1 rounded-lg border p-1 sm:grid-cols-2">
          {found.map((title) => {
            const inside = exclude.includes(title.id);
            return (
              <li key={title.id}>
                <button
                  type="button"
                  disabled={inside}
                  onClick={() =>
                    onPick({
                      id: title.id,
                      type: title.type,
                      name: title.name,
                      releaseYear: title.releaseYear,
                      status: title.status,
                      poster: title.poster,
                    })
                  }
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="aspect-[2/3] w-7 shrink-0 overflow-hidden rounded bg-muted">
                    {title.poster ? (
                      <img
                        src={apiUrl(title.poster.url)}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{title.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {title.type === 'SERIES' ? 'Series' : 'Movie'}
                      {title.releaseYear ? ` · ${title.releaseYear}` : ''}
                    </span>
                  </span>
                  {inside ? (
                    <span className="text-xs text-muted-foreground">Added</span>
                  ) : (
                    <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
