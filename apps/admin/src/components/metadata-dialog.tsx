// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Clapperboard,
  DownloadCloud,
  ExternalLink,
  ImageOff,
  Plus,
  Search,
  Tv,
} from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { metadataApi } from '@/api/endpoints';
import type { ImportResult, MetadataSearchResult, TitleDetail, TitleType } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Badge, ErrorNote, Facts, Skeleton } from '@/components/ui/display';
import { Checkbox, Input, Label, Select, ToggleRow } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { formatRating, formatRuntime, titlePath } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { describeSeasons, languageOptions, sourceUrl } from '@/lib/metadata';

interface MetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set to bring details into this title. Left out, the import creates a new title. */
  title?: TitleDetail;
  /** For a new title: whether a movie or a series is looked for. Left out, the admin chooses. */
  kind?: TitleType;
  onDone: (result: ImportResult) => void;
}

const KINDS: [TitleType, typeof Clapperboard, string][] = [
  ['MOVIE', Clapperboard, 'Movie'],
  ['SERIES', Tv, 'Series'],
];

interface Parts {
  text: boolean;
  genres: boolean;
  people: boolean;
  portraits: boolean;
  collection: boolean;
  categories: boolean;
  createCategories: boolean;
  artwork: boolean;
  episodes: boolean;
  stills: boolean;
  specials: boolean;
}

const ALL_PARTS: Parts = {
  text: true,
  genres: true,
  people: true,
  portraits: true,
  collection: true,
  // Categories are the shelves an admin arranges by hand. Genres come as genres.
  categories: false,
  createCategories: true,
  artwork: true,
  episodes: true,
  stills: true,
  specials: false,
};

/** Waits until typing pauses before a value is used for a request. */
function useDebounced<Value>(value: Value, delayMs: number): Value {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

/**
 * Finds a title at The Movie Database, shows what an import would bring, and
 * imports it: as a new draft, or into the title that is being edited.
 */
export function MetadataDialog({ open, onOpenChange, title, kind, onDone }: MetadataDialogProps) {
  const [type, setType] = useState<TitleType>(title?.type ?? kind ?? 'MOVIE');
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [language, setLanguage] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['metadata', 'status'],
    queryFn: ({ signal }) => metadataApi.status(signal),
    enabled: open,
    staleTime: 60_000,
  });

  // Each opening starts fresh: a title that was imported before opens on its entry.
  useEffect(() => {
    if (open) {
      setType(title?.type ?? kind ?? 'MOVIE');
      setQuery(title?.name ?? '');
      setYear('');
      setLanguage(title?.metadata?.language ?? null);
      setChosen(title?.metadata?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const effectiveLanguage = language ?? status.data?.language ?? 'en-US';
  const heading = title
    ? `Details for ${title.name}`
    : kind === 'SERIES'
      ? 'Import a series'
      : kind === 'MOVIE'
        ? 'Import a movie'
        : 'Import a title';
  const description = title
    ? 'Fills this title with details, artwork, cast and crew from The Movie Database.'
    : 'Creates a draft from The Movie Database, with details, artwork, cast and crew, and the episodes of a series. You attach the videos afterwards.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={heading} description={description} size="lg">
        {status.isPending ? (
          <DialogBody>
            <Skeleton className="h-56 rounded-lg" />
          </DialogBody>
        ) : status.error ? (
          <DialogBody>
            <ErrorNote error={status.error} />
          </DialogBody>
        ) : !status.data.enabled ? (
          <NotSetUp onClose={() => onOpenChange(false)} />
        ) : chosen ? (
          <Review
            key={chosen}
            metadataId={chosen}
            language={effectiveLanguage}
            title={title}
            onBack={() => setChosen(null)}
            onDone={onDone}
          />
        ) : (
          <SearchStep
            type={type}
            typeFixed={title !== undefined || kind !== undefined}
            onType={setType}
            query={query}
            onQuery={setQuery}
            year={year}
            onYear={setYear}
            language={effectiveLanguage}
            defaultLanguage={status.data.language}
            onLanguage={setLanguage}
            onChoose={setChosen}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Attribution() {
  return (
    <p className="mr-auto max-w-sm text-xs text-muted-foreground">
      This product uses the TMDB API but is not endorsed or certified by TMDB.
    </p>
  );
}

function NotSetUp({ onClose }: { onClose: () => void }) {
  return (
    <>
      <DialogBody>
        <div className="grid justify-items-center gap-3 px-2 py-6 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <DownloadCloud className="size-5" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold">The import is not set up</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            It needs a free account at The Movie Database. Create an API key in the settings of that
            account, add the line below to the <code className="font-mono">.env</code> file of the
            installation, and restart.
          </p>
          <pre className="rounded-lg border bg-muted px-4 py-3 text-left font-mono text-xs">
            TMDB_API_TOKEN=your-api-read-access-token
          </pre>
          <p className="max-w-md text-sm text-muted-foreground">
            TMDB is free for sites that earn no money. A site that sells access needs an agreement
            with them.
          </p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button asChild variant="ghost">
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
            TMDB API settings
            <ExternalLink />
          </a>
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogFooter>
    </>
  );
}

interface SearchStepProps {
  type: TitleType;
  typeFixed: boolean;
  onType: (type: TitleType) => void;
  query: string;
  onQuery: (query: string) => void;
  year: string;
  onYear: (year: string) => void;
  language: string;
  defaultLanguage: string;
  onLanguage: (language: string) => void;
  onChoose: (metadataId: string) => void;
  onClose: () => void;
}

function SearchStep({
  type,
  typeFixed,
  onType,
  query,
  onQuery,
  year,
  onYear,
  language,
  defaultLanguage,
  onLanguage,
  onChoose,
  onClose,
}: SearchStepProps) {
  const queryId = useId();
  const yearId = useId();
  const settledQuery = useDebounced(query.trim(), 350);
  const settledYear = useDebounced(/^\d{4}$/.test(year) ? Number(year) : undefined, 350);

  const results = useQuery({
    queryKey: ['metadata', 'search', type, settledQuery, settledYear, language],
    queryFn: ({ signal }) =>
      metadataApi.search({ type, q: settledQuery, year: settledYear, language }, signal),
    enabled: settledQuery.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const waiting = query.trim() !== settledQuery || results.isFetching;

  return (
    <>
      <DialogBody className="content-start">
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_6rem_11rem] sm:items-end">
          {typeFixed ? null : (
            <div className="flex gap-1 rounded-md border p-0.5" role="radiogroup" aria-label="Kind">
              {KINDS.map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={type === value}
                  onClick={() => onType(value)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded px-3 text-sm font-medium transition-colors',
                    type === value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className={cn('grid gap-1.5', typeFixed && 'sm:col-span-2')}>
            <Label htmlFor={queryId}>Name</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id={queryId}
                autoFocus
                className="pl-9"
                placeholder={type === 'MOVIE' ? 'Name of the movie' : 'Name of the series'}
                value={query}
                onChange={(event) => onQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={yearId}>Year</Label>
            <Input
              id={yearId}
              inputMode="numeric"
              maxLength={4}
              placeholder="Any"
              value={year}
              onChange={(event) => onYear(event.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Language</Label>
            <Select
              aria-label="Language of the details"
              value={language}
              onValueChange={onLanguage}
              options={languageOptions(defaultLanguage)}
            />
          </div>
        </div>

        <ErrorNote error={results.error} />

        <div className="min-h-64" aria-busy={waiting} aria-live="polite">
          {settledQuery.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Type a name to search The Movie Database.
            </p>
          ) : results.isPending ? (
            <div className="grid gap-2">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          ) : results.data && results.data.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Nothing found for "{settledQuery}"{settledYear ? ` in ${settledYear}` : ''}. Check the
              spelling, try the original name, or leave the year out.
            </p>
          ) : (
            <ul className={cn('grid gap-2 transition-opacity', waiting && 'opacity-60')}>
              {(results.data ?? []).map((result) => (
                <li key={result.id}>
                  <ResultRow result={result} onChoose={() => onChoose(result.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Attribution />
        <Button onClick={onClose}>Cancel</Button>
      </DialogFooter>
    </>
  );
}

function Poster({ url, className }: { url: string | null; className?: string }) {
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className={cn('rounded-md bg-muted object-cover', className)}
    />
  ) : (
    <div
      className={cn(
        'flex items-center justify-center rounded-md bg-muted text-muted-foreground',
        className,
      )}
    >
      <ImageOff className="size-5" aria-hidden="true" />
    </div>
  );
}

function ResultRow({ result, onChoose }: { result: MetadataSearchResult; onChoose: () => void }) {
  return (
    <button
      type="button"
      onClick={onChoose}
      className="flex w-full items-start gap-4 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
    >
      <Poster url={result.posterUrl} className="aspect-[2/3] w-14 shrink-0" />
      <span className="grid min-w-0 gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          {result.name}
          {result.releaseYear ? (
            <span className="font-normal text-muted-foreground">{result.releaseYear}</span>
          ) : null}
          {result.existingTitleId ? (
            <Badge tone="info">
              <Check className="size-3" aria-hidden="true" />
              In the catalog
            </Badge>
          ) : null}
        </span>
        {result.originalName ? (
          <span className="text-xs text-muted-foreground">{result.originalName}</span>
        ) : null}
        <span className="line-clamp-2 text-sm text-muted-foreground">
          {result.overview ?? 'No description at the source.'}
        </span>
      </span>
    </button>
  );
}

interface ReviewProps {
  metadataId: string;
  language: string;
  title?: TitleDetail;
  onBack: () => void;
  onDone: (result: ImportResult) => void;
}

/** Shows what the chosen entry would bring and lets the admin choose the parts. */
function Review({ metadataId, language, title, onBack, onDone }: ReviewProps) {
  const [parts, setParts] = useState<Parts>(ALL_PARTS);
  const [overwrite, setOverwrite] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const queryClient = useQueryClient();
  const set = (change: Partial<Parts>) => setParts((current) => ({ ...current, ...change }));

  const preview = useQuery({
    queryKey: ['metadata', 'preview', metadataId, language, parts.specials],
    queryFn: ({ signal }) =>
      metadataApi.preview({ id: metadataId, language, specials: parts.specials }, signal),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const run = useMutation({
    mutationFn: () => {
      const body = { id: metadataId, language, ...parts };
      return title
        ? metadataApi.apply(title.id, { ...body, overwrite })
        : metadataApi.importNew({ ...body, allowDuplicate: duplicate });
    },
    onSuccess: (result) => {
      // What is "in the catalog" has changed, so earlier answers are out of date.
      void queryClient.invalidateQueries({ queryKey: ['metadata', 'search'] });
      void queryClient.invalidateQueries({ queryKey: ['metadata', 'preview'] });
      onDone(result);
    },
  });

  const data = preview.data;
  const isSeries = data?.type === 'SERIES';
  const wrongKind = data !== undefined && title !== undefined && data.type !== title.type;
  // Another title made from this entry. The title being edited is not "another".
  const other =
    data?.existingTitleId && data.existingTitleId !== title?.id ? data.existingTitleId : null;
  const nothingChosen =
    !parts.text &&
    !parts.genres &&
    !parts.people &&
    !parts.categories &&
    !parts.artwork &&
    !(isSeries && parts.episodes);
  const blocked = !data || wrongKind || nothingChosen || (!title && other !== null && !duplicate);
  const link = sourceUrl(metadataId);

  return (
    <>
      <DialogBody className="content-start">
        <ErrorNote error={preview.error} />
        {preview.isPending ? <Skeleton className="h-72 rounded-lg" /> : null}
        {data ? (
          <>
            <div className="grid gap-5 sm:grid-cols-[9rem_minmax(0,1fr)]">
              <div className="grid content-start gap-2">
                <Poster url={data.artwork.poster} className="aspect-[2/3] w-full" />
                {data.artwork.backdrop ? (
                  <Poster url={data.artwork.backdrop} className="aspect-video w-full" />
                ) : null}
              </div>
              <div className="grid min-w-0 content-start gap-4">
                <div>
                  <p className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
                    {data.name}
                    {data.releaseYear ? (
                      <span className="text-base font-normal text-muted-foreground">
                        {data.releaseYear}
                      </span>
                    ) : null}
                  </p>
                  {data.tagline ? (
                    <p className="text-sm text-muted-foreground">{data.tagline}</p>
                  ) : null}
                </div>
                <p className="line-clamp-4 text-sm">
                  {data.synopsis ?? 'No synopsis at the source in this language.'}
                </p>
                <Facts
                  items={[
                    ...(data.originalName
                      ? ([['Original name', data.originalName]] as [string, ReactNode][])
                      : []),
                    ['Age rating', data.ageRating ?? 'None for your country'],
                    [
                      isSeries ? 'An episode runs' : 'Length',
                      data.runtimeMinutes ? formatRuntime(data.runtimeMinutes) : 'Unknown',
                    ],
                    ...(data.rating !== null
                      ? ([['Rating at TMDB', `${formatRating(data.rating)} of 10`]] as [
                          string,
                          ReactNode,
                        ][])
                      : []),
                    [
                      'People',
                      data.cast + data.crew === 0
                        ? 'None listed'
                        : `${data.cast} cast, ${data.crew} crew${data.leads.length > 0 ? `: ${data.leads.join(', ')}` : ''}`,
                    ],
                    ...(data.collection
                      ? ([['Part of', data.collection]] as [string, ReactNode][])
                      : []),
                    ['Original language', data.originalLanguage ?? 'Unknown'],
                    ...(isSeries
                      ? ([['Content', describeSeasons(data.seasons) ?? 'No episodes yet']] as [
                          string,
                          ReactNode,
                        ][])
                      : []),
                    [
                      'Artwork',
                      [
                        data.artwork.poster ? 'poster' : null,
                        data.artwork.backdrop ? 'backdrop' : null,
                        data.artwork.logo ? 'logo' : null,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'None',
                    ],
                  ]}
                />
                {data.genres.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {data.genres.map((genre) => (
                      <Badge key={genre.name} tone={genre.categoryId ? 'neutral' : 'primary'}>
                        {genre.categoryId ? null : <Plus className="size-3" aria-hidden="true" />}
                        {genre.name}
                      </Badge>
                    ))}
                    {data.genres.some((genre) => !genre.categoryId) ? (
                      <span className="text-xs text-muted-foreground">
                        + marks a category you do not have yet
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {wrongKind ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
              >
                This entry is a {data.type === 'MOVIE' ? 'movie' : 'series'} and your title is a{' '}
                {title?.type === 'MOVIE' ? 'movie' : 'series'}. Choose another entry.
              </p>
            ) : null}

            {other ? (
              <div className="grid gap-2 rounded-lg border border-info/30 bg-info/5 p-3 text-sm">
                <p>
                  The catalog already has a title made from this entry.{' '}
                  <Link
                    to={titlePath({ id: other, type: data.type })}
                    className="font-medium underline underline-offset-4"
                  >
                    Open it
                  </Link>
                </p>
                {title ? null : (
                  <label className="flex items-center gap-2.5">
                    <Checkbox
                      checked={duplicate}
                      onCheckedChange={(value) => setDuplicate(value === true)}
                    />
                    Import a second copy anyway
                  </label>
                )}
              </div>
            ) : null}

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-[13px] font-medium">What to bring</legend>
              <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                <Part
                  label="Texts"
                  description="Names, synopsis, age rating, and the facts: premiere, length, countries, studios."
                  checked={parts.text}
                  onChange={(text) => set({ text })}
                />
                <Part
                  label="Genres"
                  description="What kind of story it is. New genres are added."
                  checked={parts.genres}
                  onChange={(genres) => set({ genres })}
                />
                <Part
                  label="Cast and crew"
                  description="The first twenty of the cast, and the crew people look titles up by."
                  checked={parts.people}
                  onChange={(people) => set({ people })}
                />
                <Part
                  label="A picture of each person"
                  description="For those who have none yet. Copied into your storage."
                  checked={parts.people && parts.portraits}
                  disabled={!parts.people}
                  onChange={(portraits) => set({ portraits })}
                />
                {data.collection ? (
                  <Part
                    label="Its collection"
                    description={`Puts the movie into "${data.collection}", and creates the collection when it is new.`}
                    checked={parts.collection}
                    onChange={(collection) => set({ collection })}
                  />
                ) : null}
                <Part
                  label="Artwork"
                  description="Poster, backdrop and logo, copied into your storage."
                  checked={parts.artwork}
                  onChange={(artwork) => set({ artwork })}
                />
                <Part
                  label="Also as categories"
                  description="Puts the title on the shelves named like its genres."
                  checked={parts.categories}
                  onChange={(categories) => set({ categories })}
                />
                <Part
                  label="Create missing categories"
                  description="Off, only categories you already have are used."
                  checked={parts.categories && parts.createCategories}
                  disabled={!parts.categories}
                  onChange={(createCategories) => set({ createCategories })}
                />
                {isSeries ? (
                  <>
                    <Part
                      label="Seasons and episodes"
                      description="As drafts, with name, synopsis, air date and a poster per season."
                      checked={parts.episodes}
                      onChange={(episodes) => set({ episodes })}
                    />
                    <Part
                      label="A still for each episode"
                      description="Takes longer for a long series."
                      checked={parts.episodes && parts.stills}
                      disabled={!parts.episodes}
                      onChange={(stills) => set({ stills })}
                    />
                    <Part
                      label="Specials"
                      description="Extras the source lists as season 0."
                      checked={parts.episodes && parts.specials}
                      disabled={!parts.episodes}
                      onChange={(specials) => set({ specials })}
                    />
                  </>
                ) : null}
              </div>
            </fieldset>

            {title ? (
              <ToggleRow
                label="Replace what this title already has"
                description="Off, only empty fields are filled and missing episodes added, so nothing you typed is lost, and a cast list you edited is kept. On, texts, pictures and the cast and crew are replaced by those of the source. Videos, the address and what is published stay in both cases."
                checked={overwrite}
                onCheckedChange={setOverwrite}
              />
            ) : null}
          </>
        ) : null}
        <ErrorNote error={run.error} />
      </DialogBody>
      <DialogFooter>
        <div className="mr-auto flex items-center gap-1">
          <Button variant="ghost" onClick={onBack} disabled={run.isPending}>
            <ArrowLeft />
            {title?.metadata?.id === metadataId ? 'Choose another entry' : 'Back to results'}
          </Button>
          {link ? (
            <Button asChild variant="ghost">
              <a href={link} target="_blank" rel="noreferrer">
                View on TMDB
                <ExternalLink />
              </a>
            </Button>
          ) : null}
        </div>
        <Button
          variant="primary"
          loading={run.isPending}
          disabled={blocked}
          onClick={() => run.mutate()}
        >
          <DownloadCloud />
          {run.isPending ? 'Importing' : title ? 'Bring into this title' : 'Import as draft'}
        </Button>
      </DialogFooter>
    </>
  );
}

interface PartProps {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function Part({ label, description, checked, disabled, onChange }: PartProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2.5', disabled && 'opacity-60')}>
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
