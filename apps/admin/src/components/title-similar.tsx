// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  Film,
  Pin,
  PinOff,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Tv,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { similarApi, titlesApi } from '@/api/endpoints';
import type { SimilarItem, SimilarSignalKind, SimilarView, TitleDetail } from '@/api/types';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import {
  arrangeDraft,
  barParts,
  describeSignal,
  type DraftItem,
  draftOf,
  listSummary,
  movePinned,
  sameDraft,
  SIGNAL_LOOKS,
  type SimilarDraft,
  STRONG_SIGNALS,
  strongSignals,
  UNSEEN_LABELS,
  WEAK_SIGNALS,
  weakSummary,
} from '@/lib/similar';
import { Button } from './ui/button';
import { Badge, Card, CardContent, CardHeader, ErrorNote, Skeleton } from './ui/display';
import { Input } from './ui/form';
import { Tooltip } from './ui/overlay';

/** The most titles an editor can pin, and hide. The API holds the same limits. */
const MAX_PINNED = 30;
const MAX_HIDDEN = 200;

interface TitleSimilarProps {
  title: TitleDetail;
  disabled: boolean;
}

/**
 * The titles viewers are offered next to a title: what was found and why, in
 * the order viewers get it, with the editor's own picks in front and what the
 * editor took out below.
 */
export function TitleSimilar({ title, disabled }: TitleSimilarProps) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['titles', 'similar', title.id], [title.id]);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => similarApi.get(title.id, signal),
  });
  if (query.isPending) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!query.data) {
    return <ErrorNote error={query.error} />;
  }
  return (
    <Editor
      title={title}
      disabled={disabled}
      view={query.data}
      onSaved={(next) => queryClient.setQueryData(queryKey, next)}
      onCounted={() => void query.refetch()}
    />
  );
}

interface EditorProps extends TitleSimilarProps {
  view: SimilarView;
  onSaved: (view: SimilarView) => void;
  onCounted: () => void;
}

/** The list once it is read: what was saved, and what the editor changed since. */
function Editor({ title, disabled, view, onSaved, onCounted }: EditorProps) {
  const saved = useMemo(() => draftOf(view), [view]);
  const [draft, setDraft] = useState<SimilarDraft>(saved);
  const lastSaved = useRef(saved);
  /** Titles picked in the search, which the server said nothing about yet. */
  const [known, setKnown] = useState<Map<string, SimilarItem['title']>>(new Map());
  const dirty = !sameDraft(draft, saved);

  // What another admin saved shows up unless there are unsaved edits.
  useEffect(() => {
    const before = lastSaved.current;
    lastSaved.current = saved;
    setDraft((current) => (sameDraft(current, before) ? saved : current));
  }, [saved]);

  const submit = useMutation({
    mutationFn: () => similarApi.set(title.id, draft),
    onSuccess: (next) => {
      lastSaved.current = draftOf(next);
      onSaved(next);
      setDraft(draftOf(next));
      setKnown(new Map());
      toast.success('Similar titles saved');
    },
  });

  const { items, hidden } = arrangeDraft(view, draft, known);
  const pinnedCount = draft.pinned.length;
  const lastShown = [...items]
    .reverse()
    .find((item) => item.rank !== null && item.rank <= view.shownByDefault);
  const beyond = items.some((item) => item.rank !== null && item.rank > view.shownByDefault);

  const pin = (id: string) =>
    setDraft((current) =>
      current.pinned.includes(id) || current.pinned.length >= MAX_PINNED
        ? current
        : {
            pinned: [...current.pinned, id],
            hidden: current.hidden.filter((other) => other !== id),
          },
    );
  const unpin = (id: string) =>
    setDraft((current) => ({
      ...current,
      pinned: current.pinned.filter((other) => other !== id),
    }));
  const hide = (id: string) =>
    setDraft((current) =>
      current.hidden.includes(id) || current.hidden.length >= MAX_HIDDEN
        ? current
        : {
            pinned: current.pinned.filter((other) => other !== id),
            hidden: [...current.hidden, id],
          },
    );
  const show = (id: string) =>
    setDraft((current) => ({
      ...current,
      hidden: current.hidden.filter((other) => other !== id),
    }));

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="Similar titles"
          description="What viewers are offered next to this title: on its page, and in the rows made from what they watched. Found by comparing titles, and yours to correct."
        />
        <CardContent className="grid gap-4">
          {disabled ? null : (
            <TitleSearch
              exclude={new Set([title.id, ...draft.pinned])}
              full={pinnedCount >= MAX_PINNED}
              onPick={(picked) => {
                setKnown((current) => new Map(current).set(picked.id, picked));
                pin(picked.id);
              }}
            />
          )}

          <p className="text-sm text-muted-foreground" aria-live="polite">
            {listSummary(items, draft, view.shownByDefault)}
          </p>

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
              <Sparkles className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">Nothing is like this title yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Titles are matched by their genres, keywords, cast, crew and collections, and by
                what the same viewers watch. Give this title genres and keywords, or pin a title
                yourself with the search above.
              </p>
            </div>
          ) : (
            <ol className="overflow-hidden rounded-lg border">
              {items.map((item, index) => (
                <li key={item.title.id}>
                  <Row
                    item={item}
                    disabled={disabled}
                    actions={
                      item.pinned ? (
                        <>
                          <IconAction
                            label={`Move ${item.title.name} up`}
                            disabled={index === 0}
                            onClick={() => setDraft((c) => movePinned(c, item.title.id, -1))}
                          >
                            <ArrowUp />
                          </IconAction>
                          <IconAction
                            label={`Move ${item.title.name} down`}
                            disabled={index >= pinnedCount - 1}
                            onClick={() => setDraft((c) => movePinned(c, item.title.id, 1))}
                          >
                            <ArrowDown />
                          </IconAction>
                          <IconAction
                            label={`Unpin ${item.title.name}`}
                            hint="Unpin: it takes the place its match gives it"
                            onClick={() => unpin(item.title.id)}
                          >
                            <PinOff />
                          </IconAction>
                        </>
                      ) : (
                        <IconAction
                          label={`Pin ${item.title.name}`}
                          hint={
                            pinnedCount >= MAX_PINNED
                              ? `${MAX_PINNED} titles are pinned, which is the most`
                              : 'Pin: always shown, in front of the titles found'
                          }
                          disabled={pinnedCount >= MAX_PINNED}
                          onClick={() => pin(item.title.id)}
                        >
                          <Pin />
                        </IconAction>
                      )
                    }
                    onHide={() => hide(item.title.id)}
                  />
                  {lastShown?.title.id === item.title.id && beyond ? (
                    <p className="border-y bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                      The website shows the {view.shownByDefault} titles above. Apps can ask for up
                      to {view.most}.
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {hidden.length > 0 ? (
        <Card>
          <CardHeader
            title="Hidden"
            description="Never shown next to this title, however alike the two are. It holds for this title only."
          />
          <CardContent>
            <ul className="overflow-hidden rounded-lg border">
              {hidden.map((item) => (
                <li key={item.title.id} className="border-b last:border-b-0">
                  <Row
                    item={item}
                    disabled={disabled}
                    muted
                    actions={
                      <Button size="sm" onClick={() => show(item.title.id)}>
                        <RotateCcw />
                        Show again
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Matching view={view} disabled={disabled} onCounted={onCounted} />

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
              setDraft(saved);
              setKnown(new Map());
            }}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            loading={submit.isPending}
            disabled={!dirty}
            onClick={() => submit.mutate()}
          >
            Save changes
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function IconAction({
  label,
  hint,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const button = (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
  // A disabled button answers no pointer, so its hint hangs on a wrapper.
  return hint ? (
    <Tooltip content={hint}>
      <span className="inline-flex">{button}</span>
    </Tooltip>
  ) : (
    button
  );
}

/** A small poster, or the sign of a movie or series where there is none. */
function Thumb({ title }: { title: SimilarItem['title'] }) {
  const Icon = title.type === 'SERIES' ? Tv : Film;
  return (
    <span className="flex aspect-[2/3] w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted text-muted-foreground/60">
      {title.poster ? (
        <img
          src={apiUrl(title.poster.url)}
          alt=""
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <Icon className="size-4" aria-hidden="true" />
      )}
    </span>
  );
}

/**
 * How alike two titles are: the points as a figure, and a bar of 100 whose
 * parts are the reasons. Bars of different rows share one scale.
 */
function Match({ item }: { item: DraftItem }) {
  if (item.score === null) {
    return (
      <p className="text-xs text-muted-foreground">
        {item.fresh
          ? 'How alike they are shows after saving.'
          : 'Shares nothing with this title. Shown because it is pinned.'}
      </p>
    );
  }
  const parts = barParts(item.signals);
  const weak = weakSummary(item.signals);
  return (
    <div className="grid gap-1.5">
      <div
        role="img"
        aria-label={`Match ${item.score} of 100: ${parts.map((part) => `${part.name} ${part.points}`).join(', ')}`}
        className="flex h-1.5 w-full max-w-64 gap-0.5 overflow-hidden rounded-full bg-muted"
      >
        {parts.map((part) => (
          <Tooltip key={part.key} content={`${part.name}: ${part.points} of 100`}>
            <span
              className="h-full rounded-[2px] first:rounded-l-full"
              style={{ width: `${part.points}%`, background: part.color }}
            />
          </Tooltip>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {strongSignals(item.signals).map((signal) => (
          <li key={signal.signal} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: SIGNAL_LOOKS[signal.signal].color }}
            />
            {describeSignal(signal)}
          </li>
        ))}
        {weak ? (
          <li>
            <Tooltip content={weak}>
              <span className="cursor-default underline decoration-dotted underline-offset-2">
                and more
              </span>
            </Tooltip>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function Row({
  item,
  disabled,
  muted,
  actions,
  onHide,
}: {
  item: DraftItem;
  disabled: boolean;
  muted?: boolean;
  actions: React.ReactNode;
  onHide?: () => void;
}) {
  const unseen = item.unseen ? UNSEEN_LABELS[item.unseen] : null;
  return (
    // On a narrow screen the reasons and the buttons each take a line of their own, under the title.
    <div
      className={cn(
        'grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 border-b px-3 py-3 last:border-b-0 lg:grid-cols-[auto_auto_minmax(0,13rem)_minmax(0,1fr)_auto] lg:gap-x-4',
        item.pinned && 'bg-primary/[0.04]',
      )}
    >
      <span
        className={cn(
          'text-center text-sm tabular-nums',
          muted ? 'w-0' : 'w-6',
          item.rank === null ? 'text-muted-foreground/50' : 'font-medium',
        )}
      >
        {muted ? null : (item.rank ?? <span aria-label="Not shown to viewers">–</span>)}
      </span>
      <Thumb title={item.title} />
      <div className="min-w-0">
        <Link
          to={`/${item.title.type === 'SERIES' ? 'series' : 'movies'}/${item.title.id}`}
          className={cn(
            'block truncate text-sm font-medium hover:underline',
            muted && 'text-muted-foreground',
          )}
        >
          {item.title.name}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            {item.title.type === 'SERIES' ? 'Series' : 'Movie'}
            {item.title.releaseYear ? ` · ${item.title.releaseYear}` : ''}
          </span>
          {item.pinned ? (
            <Badge tone="primary">
              <Pin className="size-3" aria-hidden="true" />
              Pinned
            </Badge>
          ) : null}
          {unseen ? (
            <Tooltip content={unseen[1]}>
              <Badge tone="warning">{unseen[0]}</Badge>
            </Tooltip>
          ) : null}
        </p>
      </div>
      <div className="order-1 col-span-full min-w-0 lg:order-none lg:col-span-1">
        <Match item={item} />
      </div>
      <div className="order-2 col-span-full flex items-center justify-between gap-2 lg:order-none lg:col-span-1 lg:justify-end">
        {item.score === null ? (
          <span />
        ) : (
          <Tooltip content="How alike the two are, out of 100">
            <span className="text-sm font-semibold tabular-nums lg:w-8 lg:text-right">
              <span className="font-normal text-muted-foreground lg:hidden">Match </span>
              {Math.round(item.score)}
            </span>
          </Tooltip>
        )}
        {disabled ? null : (
          <div className="flex items-center">
            {actions}
            {onHide ? (
              <IconAction
                label={`Hide ${item.title.name}`}
                hint="Hide: never shown next to this title"
                onClick={onHide}
              >
                <EyeOff />
              </IconAction>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

const SEARCH_DELAY_MS = 250;

/** Finds any title of the catalog to pin it. */
function TitleSearch({
  exclude,
  full,
  onPick,
}: {
  exclude: ReadonlySet<string>;
  full: boolean;
  onPick: (title: SimilarItem['title']) => void;
}) {
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(typed.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [typed]);
  const found = useQuery({
    queryKey: ['titles', 'pick', q],
    queryFn: ({ signal }) =>
      titlesApi.list({ page: 1, pageSize: 8, q, sort: 'name', order: 'asc' }, signal),
    enabled: q.length > 0,
  });

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

  return (
    <div ref={box} className="relative max-w-xl">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        className="pl-9"
        placeholder={
          full ? `${MAX_PINNED} titles are pinned, which is the most` : 'Search a title to pin'
        }
        aria-label="Search a title to pin"
        value={typed}
        disabled={full}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        onChange={(event) => {
          setTyped(event.target.value);
          setOpen(true);
        }}
      />
      {open && q && found.data ? (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg">
          {found.data.items.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">
              Nothing is called like that.
            </li>
          ) : null}
          {found.data.items.map((title) => {
            const taken = exclude.has(title.id);
            return (
              <li key={title.id} className="border-b last:border-b-0">
                <button
                  type="button"
                  disabled={taken}
                  onClick={() => {
                    onPick({
                      id: title.id,
                      slug: title.slug,
                      name: title.name,
                      type: title.type,
                      releaseYear: title.releaseYear,
                      ageRating: null,
                      status: title.status,
                      poster: title.poster,
                    });
                    setTyped('');
                    setQ('');
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm enabled:hover:bg-accent disabled:opacity-50"
                >
                  {title.type === 'SERIES' ? (
                    <Tv className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <Film className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{title.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {taken
                      ? 'This title, or pinned already'
                      : title.status !== 'PUBLISHED'
                        ? 'Not published'
                        : (title.releaseYear ?? '')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** How the list is made: what each reason can give, and what is known about watching. */
function Matching({
  view,
  disabled,
  onCounted,
}: {
  view: SimilarView;
  disabled: boolean;
  onCounted: () => void;
}) {
  const count = useMutation({
    mutationFn: () => similarApi.rebuildWatching(),
    onSuccess: ({ state }) => {
      toast.success(
        state && state.pairs > 0
          ? `Counted: ${state.pairs} pairs of titles are watched by the same viewers`
          : 'Counted: no two titles share enough viewers yet',
      );
      onCounted();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const watching = view.watching;
  const largest = Math.max(...STRONG_SIGNALS.map((kind) => view.weights[kind] ?? 0), 1);
  const weak = WEAK_SIGNALS.reduce((total, kind) => total + (view.weights[kind] ?? 0), 0);

  const line = (key: string, name: string, description: string, color: string, points: number) => (
    <li key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ background: color }}
          />
          {name}
        </p>
        {description ? (
          <p className="pl-[1.125rem] text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:block">
          <span
            className="block h-full rounded-full"
            style={{ width: `${(points / largest) * 100}%`, background: color }}
          />
        </span>
        <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">
          up to {points}
        </span>
      </div>
    </li>
  );

  return (
    <Card>
      <CardHeader
        title="How titles are matched"
        description="Every pair of titles gets up to 100 points. A title is offered from 10 points on, and only when one of the first six reasons holds."
      />
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <ul className="grid content-start gap-3">
          {STRONG_SIGNALS.map((kind: SimilarSignalKind) =>
            line(
              kind,
              SIGNAL_LOOKS[kind].name,
              SIGNAL_LOOKS[kind].description,
              SIGNAL_LOOKS[kind].color,
              view.weights[kind] ?? 0,
            ),
          )}
          {line(
            'rest',
            'Also alike',
            'Categories, both movies or both series, the time of release, studio and original language. They order titles that are alike anyway.',
            'var(--series-rest)',
            weak,
          )}
          <li className="text-xs text-muted-foreground">
            A title for a much older audience loses 15 points, so a film from 16 does not stand next
            to a film for children. Between equals, the better rated title leads.
          </li>
        </ul>

        <div className="grid content-start gap-3 self-start rounded-lg border bg-muted/30 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            What viewers watch together
          </p>
          {watching ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Pairs of titles</dt>
              <dd className="text-right tabular-nums">{watching.pairs.toLocaleString('en')}</dd>
              <dt className="text-muted-foreground">Profiles counted</dt>
              <dd className="text-right tabular-nums">{watching.profiles.toLocaleString('en')}</dd>
              <dt className="text-muted-foreground">Counted</dt>
              <dd className="text-right">{formatRelative(watching.rebuiltAt)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Not counted yet.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Counted again every six hours from the last year of watching. Two titles count as
            watched together from {watching?.minimumAccounts ?? 3} accounts on, so nothing here can
            be traced to a viewer.
          </p>
          {disabled ? null : (
            <Button size="sm" loading={count.isPending} onClick={() => count.mutate()}>
              <RefreshCw />
              Count now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
