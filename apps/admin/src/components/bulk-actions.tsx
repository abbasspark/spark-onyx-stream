// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CalendarRange,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  EyeOff,
  FolderPlus,
  Languages,
  Library,
  MoreHorizontal,
  Search,
  Star,
  StarOff,
  Tags,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  bulkApi,
  categoriesApi,
  collectionsApi,
  genresApi,
  metadataApi,
  type TitleFilters,
  translationsApi,
} from '@/api/endpoints';
import type { BulkAction, BulkResult, TitleType } from '@/api/types';
import { AgeField } from '@/components/age-field';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import { ErrorNote, Spinner } from '@/components/ui/display';
import { Checkbox, Field, Input, Select, ToggleRow } from '@/components/ui/form';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { describeAge } from '@/lib/age-rating';
import { counted, describeOutcome, MAX_TITLES, type Nouns } from '@/lib/bulk';
import { availabilityProblem, fromLocalInput, titlePath } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { COMMON_LANGUAGES, languageName, normalizeLanguage } from '@/lib/translations';

/** Which titles an action is for: the chosen ones, or everything the filters match. */
export type BulkTarget = { ids: string[] } | { filter: TitleFilters };

type Shelf = 'categories' | 'genres' | 'collections';

const SHELVES: Record<Shelf, { title: string; one: string; icon: typeof Tags; link: string }> = {
  categories: { title: 'Categories', one: 'category', icon: FolderPlus, link: '/categories' },
  genres: { title: 'Genres', one: 'genre', icon: Tags, link: '/genres' },
  collections: { title: 'Collections', one: 'collection', icon: Library, link: '/collections' },
};

interface BulkBarProps {
  kind: TitleType;
  nouns: Nouns;
  /** How many titles are chosen one by one. */
  chosen: number;
  /** True when everything the filters match is meant, not only what was ticked. */
  all: boolean;
  /** How many titles the filters match. */
  total: number;
  target: BulkTarget;
  /** Offers to take everything that matches, when more matches than is chosen. */
  onSelectAll: (() => void) | null;
  onClear: () => void;
  /** After an action: the titles that could not be changed, to keep them selected. */
  onDone: (result: BulkResult) => void;
}

/**
 * The bar that appears while titles are selected: what is selected, and what
 * can be done to all of it at once.
 */
export function BulkBar({
  kind,
  nouns,
  chosen,
  all,
  total,
  target,
  onSelectAll,
  onClear,
  onDone,
}: BulkBarProps) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const count = all ? total : chosen;
  const tooMany = count > MAX_TITLES;
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [datesOpen, setDatesOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [ageOpen, setAgeOpen] = useState(false);
  const [report, setReport] = useState<BulkResult | null>(null);

  const run = useMutation({
    mutationFn: (action: BulkAction) => bulkApi.run({ ...target, action }),
    onSuccess: (result) => {
      for (const key of ['titles', 'categories', 'genres', 'collections', 'translation-jobs']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      const outcome = describeOutcome(result, nouns);
      if (result.failed > 0) {
        // The reasons need more room than a toast has.
        setReport(result);
      } else {
        toast[outcome.tone === 'success' ? 'success' : 'message'](outcome.message);
      }
      setShelf(null);
      setDatesOpen(false);
      setTranslateOpen(false);
      setAgeOpen(false);
      onDone(result);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const busy = run.isPending;
  const these = counted(count, nouns);

  const askDelete = async () => {
    const confirmed = await confirm({
      title: `Delete ${these}?`,
      description:
        kind === 'SERIES'
          ? 'The series are removed from the catalog with all their seasons and episodes. The videos stay in the library. Published series are left alone: unpublish them first.'
          : 'The movies are removed from the catalog. Their videos stay in the library. Published movies are left alone: unpublish them first.',
      confirmLabel: `Delete ${these}`,
      destructive: true,
    });
    if (confirmed) {
      run.mutate({ type: 'delete' });
    }
  };
  const askUnpublish = async () => {
    const confirmed = await confirm({
      title: `Unpublish ${these}?`,
      description: 'Viewers no longer see them. They go back to drafts, with everything they have.',
      confirmLabel: 'Unpublish',
    });
    if (confirmed) {
      run.mutate({ type: 'unpublish' });
    }
  };

  return (
    <>
      <div
        role="region"
        aria-label="Actions for the selected titles"
        className="sticky bottom-4 z-30 mx-auto mt-6 flex w-fit max-w-full animate-in items-center gap-1 rounded-xl border bg-card p-1.5 shadow-2xl ring-1 ring-black/5"
      >
        <div className="flex shrink-0 items-center gap-2 pr-1 pl-2.5">
          <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
            {count.toLocaleString('en')}
          </span>
          <span
            className={cn(
              'text-sm font-medium whitespace-nowrap',
              // A phone has no room for the word beside the offer to select everything.
              onSelectAll && 'max-sm:hidden',
            )}
          >
            {all ? 'All that match' : 'selected'}
          </span>
          {onSelectAll ? (
            <Button variant="link" size="sm" className="h-auto px-1" onClick={onSelectAll}>
              Select all {total.toLocaleString('en')}
            </Button>
          ) : null}
        </div>
        <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden="true" />

        {tooMany ? (
          <p className="flex items-center gap-2 px-2 text-sm text-warning">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            One action changes {MAX_TITLES.toLocaleString('en')} at most. Narrow the filters.
          </p>
        ) : (
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {busy ? <Spinner label="Working" className="mx-2" /> : null}
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => run.mutate({ type: 'publish' })}
            >
              <CheckCircle2 />
              Publish
            </Button>
            {/* On a phone, everything but the first action is in the menu at the end. */}
            <Button
              size="sm"
              variant="ghost"
              className="max-sm:hidden"
              disabled={busy}
              onClick={() => void askUnpublish()}
            >
              <EyeOff />
              Unpublish
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="max-sm:hidden" disabled={busy}>
                  <FolderPlus />
                  Organize
                  <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top">
                <DropdownMenuLabel>Add to, or take out of</DropdownMenuLabel>
                {(Object.keys(SHELVES) as Shelf[]).map((value) => {
                  const Icon = SHELVES[value].icon;
                  return (
                    <DropdownMenuItem key={value} onSelect={() => setShelf(value)}>
                      <Icon />
                      {SHELVES[value].title}…
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              variant="ghost"
              className="max-sm:hidden"
              disabled={busy}
              onClick={() => setDatesOpen(true)}
            >
              <CalendarRange />
              Availability
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="max-sm:hidden"
              disabled={busy}
              onClick={() => setTranslateOpen(true)}
            >
              <Languages />
              Translate
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" disabled={busy} aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <div className="sm:hidden">
                  <DropdownMenuItem onSelect={() => void askUnpublish()}>
                    <EyeOff />
                    Unpublish
                  </DropdownMenuItem>
                  {(Object.keys(SHELVES) as Shelf[]).map((value) => {
                    const Icon = SHELVES[value].icon;
                    return (
                      <DropdownMenuItem key={value} onSelect={() => setShelf(value)}>
                        <Icon />
                        {SHELVES[value].title}…
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuItem onSelect={() => setDatesOpen(true)}>
                    <CalendarRange />
                    Availability…
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTranslateOpen(true)}>
                    <Languages />
                    Translate…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </div>
                <DropdownMenuItem onSelect={() => setAgeOpen(true)}>
                  <ShieldCheck />
                  Suitable from age…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run.mutate({ type: 'feature', value: true })}>
                  <Star />
                  Feature
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run.mutate({ type: 'feature', value: false })}>
                  <StarOff />
                  Stop featuring
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run.mutate({ type: 'archive' })}>
                  <Archive />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => void askDelete()}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden="true" />
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          aria-label="Clear the selection"
          onClick={onClear}
        >
          <X />
        </Button>
      </div>

      {shelf ? (
        <ShelfDialog
          shelf={shelf}
          these={these}
          busy={busy}
          error={run.error}
          onClose={() => setShelf(null)}
          onRun={(action) => run.mutate(action)}
        />
      ) : null}
      <DatesDialog
        open={datesOpen}
        these={these}
        busy={busy}
        onClose={() => setDatesOpen(false)}
        onRun={(action) => run.mutate(action)}
      />
      <TranslateDialog
        open={translateOpen}
        these={these}
        busy={busy}
        onClose={() => setTranslateOpen(false)}
        onRun={(action) => run.mutate(action)}
      />
      <AgeDialog
        open={ageOpen}
        these={these}
        busy={busy}
        onClose={() => setAgeOpen(false)}
        onRun={(action) => run.mutate(action)}
      />
      <ReportDialog report={report} nouns={nouns} kind={kind} onClose={() => setReport(null)} />
    </>
  );
}

interface ActionDialogProps {
  these: string;
  busy: boolean;
  onClose: () => void;
  onRun: (action: BulkAction) => void;
}

/** Puts the selection on shelves, or takes it off them. Other shelves of a title stay. */
function ShelfDialog({
  shelf,
  these,
  busy,
  error,
  onClose,
  onRun,
}: ActionDialogProps & { shelf: Shelf; error: unknown }) {
  const look = SHELVES[shelf];
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState('');
  const list = useQuery({
    queryKey: [shelf],
    queryFn: ({ signal }): Promise<{ id: string; name: string }[]> =>
      shelf === 'categories'
        ? categoriesApi.list(signal)
        : shelf === 'genres'
          ? genresApi.list(signal)
          : collectionsApi.list(signal),
  });
  const shown = useMemo(() => {
    const wanted = search.trim().toLowerCase();
    return (list.data ?? []).filter((item) => item.name.toLowerCase().includes(wanted));
  }, [list.data, search]);

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onRun({ type: shelf, [mode]: [...picked] });
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        size="sm"
        title={`${look.title} of ${these}`}
        description="Only what you tick changes. Everything else a title is in stays as it is."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div
              role="radiogroup"
              aria-label="What to do"
              className="grid grid-cols-2 rounded-lg border bg-muted/40 p-0.5"
            >
              {(
                [
                  ['add', 'Add to'],
                  ['remove', 'Take out of'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    'h-8 rounded-md text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground',
                    mode === value && 'bg-background text-foreground shadow-sm',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {list.data && list.data.length > 7 ? (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  className="pl-9"
                  placeholder={`Find a ${look.one}`}
                  aria-label={`Find a ${look.one}`}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            ) : null}

            <ErrorNote error={list.error} />
            {list.isPending ? <Spinner label={`Loading ${look.title.toLowerCase()}`} /> : null}
            {list.data && list.data.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                There is no {look.one} yet.{' '}
                <Link to={look.link} className="font-medium text-primary hover:underline">
                  Create one
                </Link>
              </p>
            ) : null}
            {shown.length > 0 ? (
              <ul className="-mx-1 max-h-64 overflow-y-auto">
                {shown.map((item) => (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                      <Checkbox
                        checked={picked.has(item.id)}
                        onCheckedChange={() => toggle(item.id)}
                      />
                      <span className="truncate">{item.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
            {list.data && list.data.length > 0 && shown.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is called like that.</p>
            ) : null}
            <ErrorNote error={error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={picked.size === 0}>
              {mode === 'add' ? 'Add to' : 'Take out of'}{' '}
              {picked.size > 0
                ? counted(picked.size, { one: look.one, many: look.title.toLowerCase() })
                : look.title.toLowerCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Says from which age the selection suits, or takes the age off. */
function AgeDialog({ open, these, busy, onClose, onRun }: ActionDialogProps & { open: boolean }) {
  const [minAge, setMinAge] = useState<number | null>(12);
  useEffect(() => {
    if (open) {
      setMinAge(12);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        size="sm"
        title={`Age of ${these}`}
        description="Profiles of viewers can have an age limit. They see what suits up to that age, and nothing that has no age."
      >
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            onRun({ type: 'age', minAge });
          }}
          className="contents"
        >
          <DialogBody>
            <AgeField what="title" value={minAge} onChange={setMinAge} disabled={busy} />
            <p className="text-xs text-muted-foreground">
              The rating as it is written on each title, such as "PG-13", stays as it is.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>
              {minAge === null ? 'Take the age off' : `Set to ${describeAge(minAge)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type DateChoice = 'keep' | 'set' | 'clear';

const DATE_CHOICES = (what: string) => [
  { value: 'keep', label: 'Leave as it is', description: `Each title keeps its own ${what}` },
  { value: 'set', label: 'Set to', description: `The same ${what} for all of them` },
  { value: 'clear', label: 'Remove', description: `No ${what} any more` },
];

/** Sets the dates between which the selection is shown. Each date can also be left alone. */
function DatesDialog({ open, these, busy, onClose, onRun }: ActionDialogProps & { open: boolean }) {
  const [fromChoice, setFromChoice] = useState<DateChoice>('set');
  const [untilChoice, setUntilChoice] = useState<DateChoice>('keep');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  useEffect(() => {
    if (open) {
      setFromChoice('set');
      setUntilChoice('keep');
      setFrom('');
      setUntil('');
    }
  }, [open]);

  const problem =
    fromChoice === 'set' && untilChoice === 'set' ? availabilityProblem(from, until) : null;
  const incomplete =
    (fromChoice === 'set' && !fromLocalInput(from)) ||
    (untilChoice === 'set' && !fromLocalInput(until));
  const nothing = fromChoice === 'keep' && untilChoice === 'keep';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onRun({
      type: 'availability',
      ...(fromChoice === 'keep'
        ? {}
        : { availableFrom: fromChoice === 'set' ? fromLocalInput(from) : null }),
      ...(untilChoice === 'keep'
        ? {}
        : { availableUntil: untilChoice === 'set' ? fromLocalInput(until) : null }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        size="sm"
        title={`Availability of ${these}`}
        description="A published title is shown to viewers from its start until its end. Times are in your time zone."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <Field label="Start">
              {(id) => (
                <div className="grid gap-2">
                  <Select
                    id={id}
                    value={fromChoice}
                    onValueChange={(value) => setFromChoice(value as DateChoice)}
                    options={DATE_CHOICES('start')}
                  />
                  {fromChoice === 'set' ? (
                    <Input
                      type="datetime-local"
                      aria-label="Start"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                    />
                  ) : null}
                </div>
              )}
            </Field>
            <Field label="End">
              {(id) => (
                <div className="grid gap-2">
                  <Select
                    id={id}
                    value={untilChoice}
                    onValueChange={(value) => setUntilChoice(value as DateChoice)}
                    options={DATE_CHOICES('end')}
                  />
                  {untilChoice === 'set' ? (
                    <Input
                      type="datetime-local"
                      aria-label="End"
                      value={until}
                      onChange={(event) => setUntil(event.target.value)}
                    />
                  ) : null}
                </div>
              )}
            </Field>
            {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
            <p className="text-xs text-muted-foreground">
              A title whose own start or end does not fit the new date is left as it is and named
              afterwards.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={nothing || incomplete || problem !== null}
            >
              Save the dates
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const OTHER = 'other';

/** Starts a job that fills in a language for the selection, from the source of its details. */
function TranslateDialog({
  open,
  these,
  busy,
  onClose,
  onRun,
}: ActionDialogProps & { open: boolean }) {
  const [choice, setChoice] = useState('');
  const [typed, setTyped] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const status = useQuery({
    queryKey: ['metadata', 'status'],
    queryFn: ({ signal }) => metadataApi.status(signal),
    enabled: open,
    staleTime: 60_000,
  });
  const inUse = useQuery({
    queryKey: ['translations', 'languages'],
    queryFn: ({ signal }) => translationsApi.languages(signal),
    enabled: open,
  });
  useEffect(() => {
    if (open) {
      setChoice('');
      setTyped('');
      setOverwrite(false);
    }
  }, [open]);

  const options = useMemo(() => {
    const used = (inUse.data ?? []).map((entry) => ({
      value: entry.language,
      label: languageName(entry.language),
      description: `${entry.language} · ${counted(entry.titles, { one: 'title has', many: 'titles have' })} it`,
    }));
    const known = new Set(used.map((option) => option.value));
    return [
      ...used,
      ...COMMON_LANGUAGES.filter((tag) => !known.has(tag)).map((tag) => ({
        value: tag,
        label: languageName(tag),
        description: tag,
      })),
      { value: OTHER, label: 'Another language…', description: 'Type its tag' },
    ];
  }, [inUse.data]);

  const language = choice === OTHER ? normalizeLanguage(typed) : choice || null;
  const disabled = status.data ? !status.data.enabled : false;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (language) {
      onRun({ type: 'translate', language, overwrite });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        size="sm"
        title={`Translate ${these}`}
        description="Names, taglines and synopses, and those of seasons and episodes, are read from TMDB in the language you choose and saved as a translation of each title."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            {disabled ? (
              <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <span>
                  The import from TMDB is not set up on this installation, so there is nothing to
                  read translations from. Set <code>TMDB_API_TOKEN</code> to turn it on.
                </span>
              </p>
            ) : null}
            <Field label="Language">
              {(id) => (
                <Select
                  id={id}
                  value={choice}
                  onValueChange={setChoice}
                  placeholder="Choose a language"
                  options={options}
                  disabled={disabled}
                />
              )}
            </Field>
            {choice === OTHER ? (
              <Field
                label="Language tag"
                hint={
                  typed && !language
                    ? 'Write a tag such as "de" or "pt-BR".'
                    : language
                      ? languageName(language)
                      : 'Such as "de" for German or "pt-BR" for Brazilian Portuguese.'
                }
              >
                {(id) => (
                  <Input
                    id={id}
                    autoFocus
                    maxLength={20}
                    placeholder="de"
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                  />
                )}
              </Field>
            ) : null}
            <ToggleRow
              label="Replace what is translated already"
              description="Off, only empty texts are filled in, and nothing an editor wrote is touched."
              checked={overwrite}
              onCheckedChange={setOverwrite}
              disabled={disabled}
            />
            <ul className="grid gap-1 text-xs text-muted-foreground">
              <li>It runs in the background. You can go on working and watch its progress here.</li>
              <li>Titles that were not imported from TMDB are passed over.</li>
              <li>Where TMDB has no text in the language, the title keeps its own.</li>
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!language || disabled}>
              <Languages />
              {language ? `Translate into ${languageName(language)}` : 'Translate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** What could not be done, title by title, with the reason of each. */
function ReportDialog({
  report,
  nouns,
  kind,
  onClose,
}: {
  report: BulkResult | null;
  nouns: Nouns;
  kind: TitleType;
  onClose: () => void;
}) {
  // The last report stays on screen while the dialog closes.
  const [shown, setShown] = useState<BulkResult | null>(report);
  useEffect(() => {
    if (report) {
      setShown(report);
    }
  }, [report]);
  if (!shown) {
    return null;
  }
  const outcome = describeOutcome(shown, nouns);
  const unnamed = shown.failed - shown.failures.length;

  return (
    <Dialog open={report !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        title={
          shown.changed > 0
            ? `Done, except for ${counted(shown.failed, nouns)}`
            : `Nothing was changed`
        }
        description={outcome.message}
      >
        <DialogBody>
          <ul className="divide-y rounded-lg border">
            {shown.failures.map((failure) => (
              <li key={failure.titleId} className="grid gap-0.5 px-3 py-2.5">
                <Link
                  to={titlePath({ id: failure.titleId, type: kind })}
                  className="truncate text-sm font-medium hover:underline"
                  onClick={onClose}
                >
                  {failure.name}
                </Link>
                <p className="text-xs text-muted-foreground">{failure.reason}</p>
              </li>
            ))}
          </ul>
          {unnamed > 0 ? (
            <p className="text-xs text-muted-foreground">
              And {unnamed.toLocaleString('en')} more that are not listed here.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            These stay selected, so you can deal with them and try again.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
