// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Check,
  Clapperboard,
  Film,
  ListVideo,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Tv,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { billingApi, packagesApi, titlesApi } from '@/api/endpoints';
import type { Package, TitleSummary } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
} from '@/components/ui/display';
import { Field, Input, Textarea } from '@/components/ui/form';
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
} from '@/components/ui/overlay';
import { cn } from '@/lib/cn';

const SEARCH_DELAY_MS = 250;

/** Packages: groups of paid titles that plans open together. */
export function PackagesPage() {
  const { can } = useSession();
  const mayWrite = can('billing:write');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Package | 'new' | null>(null);
  const [managing, setManaging] = useState<Package | null>(null);

  const packages = useQuery({
    queryKey: ['billing', 'packages'],
    queryFn: ({ signal }) => packagesApi.list(signal),
  });
  const overview = useQuery({
    queryKey: ['billing', 'overview'],
    queryFn: ({ signal }) => billingApi.overview(signal),
    enabled: can('billing:read'),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['billing'] });
    void queryClient.invalidateQueries({ queryKey: ['titles'] });
  };
  const onError = (error: Error) => toast.error(error.message);
  const reorder = useMutation({
    mutationFn: (ids: string[]) => packagesApi.order(ids),
    onSuccess: (ordered) => queryClient.setQueryData(['billing', 'packages'], ordered),
    onError,
  });
  const remove = useMutation({
    mutationFn: (item: Package) => packagesApi.remove(item.id),
    onSuccess: (_result, item) => {
      toast.success(`${item.name} deleted`);
      refresh();
    },
    onError,
  });

  const items = packages.data ?? [];
  const move = (index: number, by: -1 | 1) => {
    const ids = items.map((item) => item.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) {
      return;
    }
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    reorder.mutate(ids);
  };

  const askDelete = async (item: Package) => {
    const confirmed = await confirm({
      title: `Delete ${item.name}?`,
      description:
        item.titles > 0
          ? `Its ${item.titles} ${item.titles === 1 ? 'title stays' : 'titles stay'} in the catalog and ${item.titles === 1 ? 'loses' : 'lose'} only this package. A title left in no package is opened only by plans that open everything.`
          : 'The package is empty. Nothing else changes.',
      confirmLabel: 'Delete package',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(item);
    }
  };

  const newButton = mayWrite ? (
    <Button variant="primary" onClick={() => setEditing('new')}>
      <Plus />
      New package
    </Button>
  ) : null;
  const loose = overview.data?.unpackagedPaidTitles ?? 0;

  return (
    <>
      <PageHeader
        title="Packages"
        description="Groups of paid titles, such as Kids or Sports. A plan opens every paid title, or the packages you choose for it."
        actions={newButton}
      />
      <ErrorNote error={packages.error} className="mb-4" />

      {items.length > 0 && loose > 0 ? (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <span className="font-medium">
              {loose === 1
                ? '1 paid title is in no package.'
                : `${loose} paid titles are in no package.`}
            </span>{' '}
            <span className="text-muted-foreground">
              Only plans that open everything show {loose === 1 ? 'it' : 'them'}.
            </span>{' '}
            <Link to="/titles?packaged=none" className="underline underline-offset-4">
              Show {loose === 1 ? 'it' : 'them'}
            </Link>
          </p>
        </div>
      ) : null}

      {packages.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Boxes} title="No packages yet" action={newButton}>
          Without packages every plan opens every paid title. Create packages when plans should
          differ in what they open: put titles into them, then choose the packages of each plan on
          the Plans page.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <Card key={item.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold">{item.name}</h2>
                    <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                      {item.description ?? 'No description.'}
                    </p>
                  </div>
                  {mayWrite ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Actions for ${item.name}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(item)}>
                          <Pencil />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={index === 0} onSelect={() => move(index, -1)}>
                          <ArrowUp />
                          Move up
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={index === items.length - 1}
                          onSelect={() => move(index, 1)}
                        >
                          <ArrowDown />
                          Move down
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => void askDelete(item)}>
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Titles</dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums">{item.titles}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Published and paid</dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                      {item.sellableTitles}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Channels</dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums">{item.channels}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex min-h-6 flex-wrap items-center gap-1.5">
                  {item.plans.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      In no plan of its own. Plans that open everything include it.
                    </span>
                  ) : (
                    item.plans.map((plan) => <Badge key={plan.id}>{plan.name}</Badge>)
                  )}
                </div>

                <div className="mt-auto pt-4">
                  <div className="flex items-center justify-between gap-2 border-t pt-4">
                    <Button size="sm" onClick={() => setManaging(item)}>
                      <ListVideo />
                      {mayWrite ? 'Choose titles' : 'See titles'}
                    </Button>
                    <Link
                      to={`/titles?package=${item.id}`}
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Open in Titles
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PackageDialog
        item={editing === 'new' ? null : editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
          }
        }}
        onSaved={(saved, created) => {
          toast.success(created ? `${saved.name} created` : 'Saved');
          setEditing(null);
          refresh();
          if (created) {
            setManaging(saved);
          }
        }}
      />
      <TitlesDialog
        item={managing}
        mayWrite={mayWrite}
        onOpenChange={(open) => {
          if (!open) {
            setManaging(null);
          }
        }}
        onChanged={refresh}
      />
    </>
  );
}

interface PackageDialogProps {
  item: Package | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: Package, created: boolean) => void;
}

function PackageDialog({ item, open, onOpenChange, onSaved }: PackageDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (open) {
      setName(item?.name ?? '');
      setDescription(item?.description ?? '');
    }
  }, [open, item]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), description: description.trim() || null };
      return item ? packagesApi.update(item.id, body) : packagesApi.create(body);
    },
    onSuccess: (saved) => onSaved(saved, item === null),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.reset();
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={item ? `Rename ${item.name}` : 'New package'}
        description="Viewers see the name on the page of plans, as part of what a plan includes."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus
                  maxLength={60}
                  placeholder="Kids"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            <Field label="Description" hint="For you and other admins.">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={300}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
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
              disabled={!name.trim()}
            >
              {item ? 'Save' : 'Create package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface TitlesDialogProps {
  item: Package | null;
  mayWrite: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

type Scope = 'in' | 'all';

/** The titles of a package, and putting titles in and taking them out with one click each. */
function TitlesDialog({ item, mayWrite, onOpenChange, onChanged }: TitlesDialogProps) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>('in');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const packageId = item?.id;

  useEffect(() => {
    if (packageId) {
      setSearch('');
      setQ('');
      setPage(1);
      setScope('in');
    }
  }, [packageId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const titles = useQuery({
    queryKey: ['titles', 'package-picker', packageId, scope, q, page],
    queryFn: ({ signal }) =>
      titlesApi.list(
        {
          page,
          pageSize: 12,
          q: q || undefined,
          packageId: scope === 'in' ? packageId : undefined,
          sort: 'name',
          order: 'asc',
        },
        signal,
      ),
    enabled: packageId !== undefined,
    placeholderData: keepPreviousData,
  });

  const change = useMutation({
    mutationFn: ({ title, add }: { title: TitleSummary; add: boolean }) =>
      packagesApi.changeTitles(
        packageId as string,
        add ? { add: [title.id] } : { remove: [title.id] },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['titles', 'package-picker'] });
      onChanged();
    },
    onError: (error) => toast.error(error.message),
  });

  const items = titles.data?.items ?? [];
  const total = titles.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 12));

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title={item ? `Titles in ${item.name}` : 'Titles'}
        description="A change counts at once: subscribers of a plan with this package can watch what is in it."
        size="lg"
      >
        <DialogBody>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Which titles"
              className="inline-flex rounded-md border p-0.5"
            >
              {(
                [
                  ['in', 'In this package'],
                  ['all', 'All titles'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={scope === value}
                  onClick={() => {
                    setScope(value);
                    setPage(1);
                  }}
                  className={cn(
                    'h-8 rounded px-3 text-[13px] font-medium transition-colors',
                    scope === value
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="relative min-w-40 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="Search titles by name"
                aria-label="Search titles by name"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <ErrorNote error={titles.error} />
          {titles.isPending ? (
            <Skeleton className="h-64 rounded-lg" />
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {q ? (
                'No title matches.'
              ) : scope === 'in' ? (
                <>
                  Nothing in this package yet.{' '}
                  {mayWrite ? (
                    <button
                      type="button"
                      className="font-medium text-foreground underline underline-offset-4"
                      onClick={() => setScope('all')}
                    >
                      Add titles
                    </button>
                  ) : null}
                </>
              ) : (
                'There are no titles yet.'
              )}
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {items.map((title) => {
                const inside = title.packages.some((entry) => entry.id === packageId);
                const busy = change.isPending && change.variables?.title.id === title.id;
                const Icon = title.type === 'SERIES' ? Tv : Film;
                return (
                  <li key={title.id} className="flex items-center gap-3 p-2.5">
                    {title.poster ? (
                      <img
                        src={title.poster.url}
                        alt=""
                        className="h-12 w-8 shrink-0 rounded-sm object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-12 w-8 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
                        <Clapperboard className="size-4" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        <Icon
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="truncate">{title.name}</span>
                        {title.releaseYear ? (
                          <span className="font-normal text-muted-foreground">
                            {title.releaseYear}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {title.access === 'PAID' ? (
                          <span className="inline-flex items-center gap-1">
                            <Lock className="size-3" aria-hidden="true" />
                            Paid
                          </span>
                        ) : (
                          <span title="A free title is open without any plan. The package matters once it needs a subscription.">
                            Free, open without a plan
                          </span>
                        )}
                        {title.status === 'PUBLISHED' ? null : <span>Not published</span>}
                        {title.packages
                          .filter((entry) => entry.id !== packageId)
                          .map((entry) => (
                            <span key={entry.id}>also in {entry.name}</span>
                          ))}
                      </p>
                    </div>
                    {mayWrite ? (
                      <Button
                        size="sm"
                        variant={inside ? 'secondary' : 'primary'}
                        loading={busy}
                        aria-label={`${inside ? 'Take out' : 'Put in'} ${title.name}`}
                        onClick={() => change.mutate({ title, add: !inside })}
                      >
                        {inside ? <Check /> : <Plus />}
                        {inside ? 'In package' : 'Add'}
                      </Button>
                    ) : inside ? (
                      <Badge tone="success">In package</Badge>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {pages > 1 ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {total} titles, page {page} of {pages}
              </span>
              <span className="flex gap-2">
                <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Back
                </Button>
                <Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </span>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
