// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Clapperboard,
  Plus,
  Search,
  UserRound,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { peopleApi, titlesApi } from '@/api/endpoints';
import type { Credit, CreditKind, PersonRef, TitleDetail } from '@/api/types';
import { creditsProblem, toCreditInputs } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, ErrorNote, Spinner } from './ui/display';
import { Input } from './ui/form';

/** A credit while it is edited: saved ones keep their id, new ones get a local key. */
interface Row {
  key: string;
  kind: CreditKind;
  role: string;
  person: PersonRef;
}

const toRows = (credits: readonly Credit[]): Row[] =>
  credits.map((credit) => ({
    key: credit.id,
    kind: credit.kind,
    role: credit.role ?? '',
    person: credit.person,
  }));

const signature = (rows: readonly Row[]) =>
  rows.map((row) => `${row.person.id}|${row.kind}|${row.role.trim()}`).join('\n');

const SECTIONS: readonly {
  kind: CreditKind;
  title: string;
  description: string;
  roleLabel: string;
  rolePlaceholder: string;
  empty: string;
}[] = [
  {
    kind: 'CAST',
    title: 'Cast',
    description: 'Who plays in it, in the order viewers see them.',
    roleLabel: 'Character',
    rolePlaceholder: 'Character played',
    empty: 'No actors yet.',
  },
  {
    kind: 'CREW',
    title: 'Crew',
    description: 'Who made it: direction, writing, music and more.',
    roleLabel: 'Job',
    rolePlaceholder: 'Director, Writer, …',
    empty: 'No crew yet.',
  },
];

let localKey = 0;

interface TitleCreditsProps {
  title: TitleDetail;
  disabled: boolean;
  /** Receives the saved credits, to put them into the title that is shown. */
  onSaved: (credits: Credit[]) => void;
}

/** The people of a title: its cast and its crew, searched, ordered and saved together. */
export function TitleCredits({ title, disabled, onSaved }: TitleCreditsProps) {
  const saved = useMemo(() => toRows(title.credits), [title.credits]);
  const [rows, setRows] = useState(saved);
  const dirty = signature(rows) !== signature(saved);

  // What an import or another admin saved shows up unless there are unsaved edits.
  useEffect(() => {
    if (!dirty) {
      setRows(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const inputs = toCreditInputs(rows);
  const problem = creditsProblem(inputs);

  const submit = useMutation({
    mutationFn: () => titlesApi.replaceCredits(title.id, inputs),
    onSuccess: (credits) => {
      onSaved(credits);
      setRows(toRows(credits));
      toast.success('Cast and crew saved');
    },
  });

  const add = (kind: CreditKind, person: PersonRef) =>
    setRows((current) => [...current, { key: `new-${++localKey}`, kind, role: '', person }]);
  const change = (key: string, role: string) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, role } : row)));
  const drop = (key: string) => setRows((current) => current.filter((row) => row.key !== key));
  /** Moves a credit one place among those of its kind. */
  const move = (key: string, by: -1 | 1) =>
    setRows((current) => {
      const from = current.findIndex((row) => row.key === key);
      const kind = current[from]?.kind;
      let to = from + by;
      while (current[to] && current[to]?.kind !== kind) {
        to += by;
      }
      const a = current[from];
      const b = current[to];
      if (!a || !b) {
        return current;
      }
      const next = [...current];
      next[from] = b;
      next[to] = a;
      return next;
    });

  return (
    <div className="grid gap-6">
      {SECTIONS.map((section) => {
        const list = rows.filter((row) => row.kind === section.kind);
        return (
          <Card key={section.kind}>
            <CardHeader
              title={`${section.title}${list.length > 0 ? ` (${list.length})` : ''}`}
              description={section.description}
            />
            <CardContent className="grid gap-4">
              {disabled ? null : (
                <PersonSearch
                  label={`Add to the ${section.title.toLowerCase()}`}
                  onPick={(person) => add(section.kind, person)}
                />
              )}
              {list.length === 0 ? (
                <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  {section.kind === 'CAST' ? (
                    <UserRound className="size-4" aria-hidden="true" />
                  ) : (
                    <Clapperboard className="size-4" aria-hidden="true" />
                  )}
                  {section.empty}
                  {title.metadata ? null : ' An import from TMDB fills this in for you.'}
                </p>
              ) : (
                <ol className="divide-y rounded-lg border">
                  {list.map((row, index) => (
                    <li key={row.key} className="flex items-center gap-3 px-3 py-2">
                      <Portrait person={row.person} />
                      <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-3">
                        <p className="truncate text-sm font-medium">{row.person.name}</p>
                        <Input
                          aria-label={`${section.roleLabel} of ${row.person.name}`}
                          placeholder={section.rolePlaceholder}
                          maxLength={200}
                          disabled={disabled}
                          value={row.role}
                          onChange={(event) => change(row.key, event.target.value)}
                        />
                      </div>
                      {disabled ? null : (
                        <div className="flex shrink-0 items-center">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Move ${row.person.name} up`}
                            disabled={index === 0}
                            onClick={() => move(row.key, -1)}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Move ${row.person.name} down`}
                            disabled={index === list.length - 1}
                            onClick={() => move(row.key, 1)}
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove ${row.person.name}`}
                            onClick={() => drop(row.key)}
                          >
                            <X />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        );
      })}

      {dirty || submit.error ? (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-popover/95 px-4 py-3 shadow-lg backdrop-blur-md">
          <div className="mr-auto min-w-0">
            <p className="text-sm font-medium">You have unsaved changes</p>
            {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
            {submit.error ? (
              <p className="text-sm text-destructive">{submit.error.message}</p>
            ) : null}
          </div>
          <Button
            disabled={submit.isPending}
            onClick={() => {
              submit.reset();
              setRows(saved);
            }}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            loading={submit.isPending}
            disabled={!dirty || problem !== null}
            onClick={() => submit.mutate()}
          >
            Save changes
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** A round picture of a person, or a figure where there is none. */
export function Portrait({ person, className }: { person: PersonRef; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground/60',
        className,
      )}
    >
      {person.portrait ? (
        <img
          src={apiUrl(person.portrait.url)}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <UserRound className="size-1/2" aria-hidden="true" />
      )}
    </span>
  );
}

interface PersonSearchProps {
  label: string;
  onPick: (person: PersonRef) => void;
}

/** Finds a person of the catalog by name, or adds one that is not there yet. */
function PersonSearch({ label, onPick }: PersonSearchProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // The search waits until typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);

  const search = useQuery({
    queryKey: ['people', 'search', term],
    queryFn: ({ signal }) => peopleApi.list({ page: 1, pageSize: 8, q: term }, signal),
    enabled: term.length > 0,
    staleTime: 30_000,
  });
  const found = term.length > 0 ? (search.data?.items ?? []) : [];
  const exact = found.some((person) => person.name.toLowerCase() === term.toLowerCase());
  const mayCreate = term.length > 0 && !search.isPending && !exact;
  const count = found.length + (mayCreate ? 1 : 0);

  const pick = (person: PersonRef) => {
    onPick(person);
    setText('');
    setTerm('');
    setOpen(false);
  };
  const create = useMutation({
    mutationFn: () => peopleApi.create({ name: term }),
    onSuccess: (person) => {
      void queryClient.invalidateQueries({ queryKey: ['people'] });
      pick(person);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const choose = (index: number) => {
    const person = found[index];
    if (person) {
      pick(person);
    } else if (mayCreate && index === found.length) {
      create.mutate();
    }
  };

  useEffect(() => setActive(0), [term]);

  // A click elsewhere closes the list.
  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const showList = open && term.length > 0;

  return (
    <div ref={box} className="relative max-w-md">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-autocomplete="list"
        placeholder={`${label}: type a name`}
        className="pl-9"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((current) => (count === 0 ? 0 : (current + 1) % count));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => (count === 0 ? 0 : (current - 1 + count) % count));
          } else if (event.key === 'Enter') {
            // Enter picks a person and never saves the form around it.
            event.preventDefault();
            if (showList && text.trim() === term) {
              choose(active);
            }
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {showList ? (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg">
          <ErrorNote error={search.error} className="m-2" />
          {search.isPending ? <Spinner label="Searching" className="px-3" /> : null}
          <ul role="listbox" aria-label="People found" className="max-h-72 overflow-y-auto p-1">
            {found.map((person, index) => (
              <li key={person.id} role="option" aria-selected={active === index}>
                <button
                  type="button"
                  onPointerEnter={() => setActive(index)}
                  onClick={() => pick(person)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-sm',
                    active === index && 'bg-accent text-accent-foreground',
                  )}
                >
                  <Portrait person={person} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{person.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        person.knownFor,
                        `${person.creditCount} ${person.creditCount === 1 ? 'title' : 'titles'}`,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </span>
                  <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
            {mayCreate ? (
              <li role="option" aria-selected={active === found.length}>
                <button
                  type="button"
                  disabled={create.isPending}
                  onPointerEnter={() => setActive(found.length)}
                  onClick={() => create.mutate()}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm',
                    active === found.length && 'bg-accent text-accent-foreground',
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed">
                    <UserRoundPlus className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 truncate">
                    Add <span className="font-medium">"{term}"</span> as a new person
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
