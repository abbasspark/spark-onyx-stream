// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, Search, Trash2, UsersRound } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { peopleApi, type PeopleQuery } from '@/api/endpoints';
import type { CatalogImage, Person } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { ImageField } from '@/components/image-field';
import { Portrait } from '@/components/title-credits';
import { Button } from '@/components/ui/button';
import {
  Badge,
  EmptyState,
  ErrorNote,
  PageHeader,
  Pagination,
  Skeleton,
  StatusBadge,
} from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { useAddressParams } from '@/lib/address-params';
import { titlePath } from '@/lib/catalog';

const PAGE_SIZE = 36;
const SORTS = {
  name: { label: 'Name, A to Z', sort: 'name', order: 'asc' },
  credits: { label: 'Most titles first', sort: 'credits', order: 'desc' },
  newest: { label: 'Newest first', sort: 'createdAt', order: 'desc' },
} as const satisfies Record<string, { label: string } & Pick<PeopleQuery, 'sort' | 'order'>>;
type SortKey = keyof typeof SORTS;

const titles = (count: number) => `${count} ${count === 1 ? 'title' : 'titles'}`;

/** Everybody who plays in the titles of the catalog or made them. */
export function PeoplePage() {
  const { can } = useSession();
  const mayWrite = can('catalog:write');
  const [params, change] = useAddressParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sortKey =
    (params.get('sort') ?? 'name') in SORTS ? (params.get('sort') as SortKey) : 'name';
  const openId = params.get('person');
  const [search, setSearch] = useState(q);
  const [creating, setCreating] = useState(false);

  // The address follows the search box a moment after typing stops.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() !== q) {
        change({ q: search.trim() || null, page: null });
      }
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { sort, order } = SORTS[sortKey ?? 'name'];
  const people = useQuery({
    queryKey: ['people', 'list', { page, q, sort, order }],
    queryFn: ({ signal }) =>
      peopleApi.list({ page, pageSize: PAGE_SIZE, q: q || undefined, sort, order }, signal),
    placeholderData: keepPreviousData,
  });
  const items = people.data?.items ?? [];

  const newButton = mayWrite ? (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus />
      New person
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title="People"
        description="Everybody who plays in your titles or made them. A person is one entry, however many titles they are in."
        actions={newButton}
      />

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
          aria-label="Order"
          className="w-48"
          value={sortKey ?? 'name'}
          onValueChange={(value) => change({ sort: value === 'name' ? null : value, page: null })}
          options={Object.entries(SORTS).map(([value, { label }]) => ({ value, label }))}
        />
        {people.data ? (
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {people.data.total} {people.data.total === 1 ? 'person' : 'people'}
          </span>
        ) : null}
      </div>

      <ErrorNote error={people.error} className="mb-4" />
      {people.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-4">
          {Array.from({ length: 12 }, (_, index) => (
            <Skeleton key={index} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : null}
      {people.data && items.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={q ? 'Nobody by that name' : 'No people yet'}
          action={q ? null : newButton}
        >
          {q
            ? 'Check the spelling, or add the person.'
            : 'People come with an import from TMDB, or are added from the cast and crew of a title.'}
        </EmptyState>
      ) : null}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-4">
        {items.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => change({ person: person.id })}
              className="group flex w-full flex-col items-center gap-3 rounded-xl border bg-card px-3 py-5 text-center transition-colors hover:border-primary/50 hover:bg-accent/40"
            >
              <Portrait
                person={person}
                className="size-24 ring-1 ring-border transition-transform group-hover:scale-105"
              />
              <span className="grid w-full gap-0.5">
                <span className="truncate text-sm font-medium">{person.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {person.knownFor ?? '\u00a0'}
                </span>
              </span>
              <Badge tone={person.creditCount > 0 ? 'neutral' : 'warning'}>
                {person.creditCount > 0 ? titles(person.creditCount) : 'In no title'}
              </Badge>
            </button>
          </li>
        ))}
      </ul>

      {people.data ? (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={people.data.total}
          onChange={(next) => change({ page: next === 1 ? null : String(next) })}
        />
      ) : null}

      <PersonSheet
        personId={creating ? 'new' : openId}
        mayWrite={mayWrite}
        onClose={() => {
          setCreating(false);
          change({ person: null });
        }}
        onCreated={(person) => {
          setCreating(false);
          change({ person: person.id });
        }}
      />
    </>
  );
}

interface PersonSheetProps {
  /** An id, "new" for an empty form, or null when closed. */
  personId: string | null;
  mayWrite: boolean;
  onClose: () => void;
  onCreated: (person: Person) => void;
}

/** One person: who they are, their picture, and every title they have a part in. */
function PersonSheet({ personId, mayWrite, onClose, onCreated }: PersonSheetProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const isNew = personId === 'new';
  const id = personId && !isNew ? personId : '';
  const detail = useQuery({
    queryKey: ['people', id],
    queryFn: ({ signal }) => peopleApi.get(id, signal),
    enabled: id !== '',
  });
  const person = id ? detail.data : undefined;

  const [name, setName] = useState('');
  const [knownFor, setKnownFor] = useState('');
  const [biography, setBiography] = useState('');
  const [portrait, setPortrait] = useState<CatalogImage | null>(null);

  useEffect(() => {
    setName(person?.name ?? '');
    setKnownFor(person?.knownFor ?? '');
    setBiography(person?.biography ?? '');
    setPortrait(person?.portrait ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, person?.id, person?.updatedAt]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['people'] });
    void queryClient.invalidateQueries({ queryKey: ['titles', 'detail'] });
  };
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        knownFor: knownFor.trim() || null,
        biography: biography.trim() || null,
      };
      return id ? peopleApi.update(id, body) : peopleApi.create(body);
    },
    onSuccess: (saved) => {
      refresh();
      toast.success(`"${saved.name}" saved`);
      if (!id) {
        onCreated(saved);
      }
    },
  });
  const remove = useMutation({
    mutationFn: () => peopleApi.remove(id),
    onSuccess: () => {
      refresh();
      toast.success('Person deleted');
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const askDelete = async () => {
    if (!person) {
      return;
    }
    const confirmed = await confirm({
      title: `Delete ${person.name}?`,
      description:
        person.creditCount > 0
          ? `${person.name} is taken out of ${titles(person.creditCount)}. The titles themselves stay.`
          : 'They are in no title.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate();
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const dirty =
    isNew ||
    (person !== undefined &&
      (name.trim() !== person.name ||
        (knownFor.trim() || null) !== person.knownFor ||
        (biography.trim() || null) !== person.biography));

  return (
    <Dialog open={personId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        variant="sheet"
        title={isNew ? 'New person' : (person?.name ?? 'Person')}
        description={
          person?.metadata
            ? `Came with an import from ${person.metadata.source.toUpperCase()}.`
            : undefined
        }
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            <ErrorNote error={detail.error} />
            {id && detail.isPending ? <Skeleton className="h-64 rounded-xl" /> : null}
            {isNew || person ? (
              <>
                <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  {person ? (
                    <ImageField
                      label="Portrait"
                      hint="Upright, 2:3."
                      kind="PORTRAIT"
                      aspect="aspect-[2/3]"
                      image={portrait}
                      disabled={!mayWrite}
                      onChange={async (image) => {
                        await peopleApi.update(person.id, { portraitId: image?.id ?? null });
                        setPortrait(image);
                        refresh();
                      }}
                    />
                  ) : (
                    <p className="self-center text-xs text-muted-foreground">
                      A portrait can be added once the person is saved.
                    </p>
                  )}
                  <div className="grid content-start gap-4">
                    <Field label="Name">
                      {(fieldId) => (
                        <Input
                          id={fieldId}
                          required
                          maxLength={200}
                          autoFocus={isNew}
                          disabled={!mayWrite}
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                        />
                      )}
                    </Field>
                    <Field label="Known for" hint="Optional. Such as Acting, Directing, Writing.">
                      {(fieldId) => (
                        <Input
                          id={fieldId}
                          maxLength={60}
                          disabled={!mayWrite}
                          value={knownFor}
                          onChange={(event) => setKnownFor(event.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                </div>
                <Field label="Biography" hint="Optional. A few sentences for the person's page.">
                  {(fieldId) => (
                    <Textarea
                      id={fieldId}
                      rows={6}
                      maxLength={5000}
                      disabled={!mayWrite}
                      value={biography}
                      onChange={(event) => setBiography(event.target.value)}
                    />
                  )}
                </Field>
              </>
            ) : null}

            {person ? (
              <section className="grid gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium">
                    In{' '}
                    {titles(
                      person.credits.length
                        ? new Set(person.credits.map((credit) => credit.title.id)).size
                        : 0,
                    )}
                  </h3>
                  {person.credits.length > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Show in{' '}
                      <Link
                        to={`/movies?person=${person.id}`}
                        className="underline underline-offset-4"
                      >
                        Movies
                      </Link>{' '}
                      or{' '}
                      <Link
                        to={`/series?person=${person.id}`}
                        className="underline underline-offset-4"
                      >
                        Series
                      </Link>
                    </span>
                  ) : null}
                </div>
                {person.credits.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
                    In no title yet. Add them in the cast and crew of a title.
                  </p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {person.credits.map((credit) => (
                      <li key={credit.id}>
                        <Link
                          to={titlePath(credit.title)}
                          className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-accent/50"
                        >
                          <span className="aspect-[2/3] w-8 shrink-0 overflow-hidden rounded bg-muted">
                            {credit.title.poster ? (
                              <img
                                src={apiUrl(credit.title.poster.url)}
                                alt=""
                                loading="lazy"
                                className="size-full object-cover"
                              />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {credit.title.name}
                              {credit.title.releaseYear ? (
                                <span className="ml-1.5 font-normal text-muted-foreground">
                                  {credit.title.releaseYear}
                                </span>
                              ) : null}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {credit.role ?? (credit.kind === 'CAST' ? 'Cast' : 'Crew')}
                            </span>
                          </span>
                          <StatusBadge status={credit.title.status} />
                          <ExternalLink
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            {person && mayWrite ? (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-destructive"
                loading={remove.isPending}
                onClick={() => void askDelete()}
              >
                <Trash2 />
                Delete
              </Button>
            ) : null}
            <Button type="button" onClick={onClose}>
              Close
            </Button>
            {mayWrite ? (
              <Button
                type="submit"
                variant="primary"
                loading={save.isPending}
                disabled={!dirty || !name.trim()}
              >
                {isNew ? 'Add person' : 'Save'}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
