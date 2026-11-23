// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarOff,
  ExternalLink,
  EyeOff,
  Film,
  GalleryHorizontal,
  GripVertical,
  History,
  Layers,
  LayoutTemplate,
  ListOrdered,
  ListPlus,
  MoreHorizontal,
  PanelTop,
  Pencil,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Tv,
  Wand2,
  X,
} from 'lucide-react';
import { type DragEvent, type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { categoriesApi, collectionsApi, genresApi, layoutApi, titlesApi } from '@/api/endpoints';
import type {
  HomeLayout,
  HomeSection,
  HomeSectionInput,
  HomeSectionKind,
  HomeSort,
  HomeSource,
  LayoutPageSlug,
} from '@/api/types';
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
import { Field, Input, Select, Switch, ToggleRow } from '@/components/ui/form';
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
  Tooltip,
} from '@/components/ui/overlay';
import { fromLocalInput, toLocalInput } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import {
  describeSection,
  isOwnRow,
  formProblem,
  LAYOUT_LABELS,
  MAX_HERO_TITLES,
  MAX_ROW_TITLES,
  MIN_ROW_TITLES,
  moved,
  placedAt,
  isLayoutPage,
  LAYOUT_PAGES,
  presetsFor,
  type SectionForm,
  type SectionPreset,
  sectionState,
  SORT_LABELS,
  sortsFor,
  SOURCE_LABELS,
} from '@/lib/home';
import { SITE_URL } from '@/lib/site';

const KIND_LOOKS: Record<HomeSectionKind, { icon: typeof PanelTop; label: string }> = {
  HERO: { icon: PanelTop, label: 'Opening' },
  CONTINUE_WATCHING: { icon: History, label: 'Continue watching' },
  MY_LIST: { icon: ListPlus, label: 'My list' },
  TITLES: { icon: GalleryHorizontal, label: 'Row' },
};

const LAYOUT_ICONS: Record<HomeLayout, typeof RectangleVertical> = {
  POSTER: RectangleVertical,
  LANDSCAPE: RectangleHorizontal,
  NUMBERED: ListOrdered,
};

/** What is being made or changed in the editor. */
type Editing =
  | { mode: 'new'; kind: HomeSectionKind; preset: HomeSectionInput }
  | { mode: 'edit'; section: HomeSection };

/** Reads the page from the address, and sends unknown ones to the home page. */
export function LayoutPage() {
  const { page } = useParams();
  if (!isLayoutPage(page)) {
    return <Navigate to="/layout/home" replace />;
  }
  // Each page starts with a clean builder: nothing of another page is carried over.
  return <LayoutBuilder key={page} page={page} />;
}

/** One page of the website: its opening and its rows, arranged by hand or left to itself. */
function LayoutBuilder({ page }: { page: LayoutPageSlug }) {
  const about = LAYOUT_PAGES[page];
  const { can } = useSession();
  const mayWrite = can('catalog:write');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // The order shown while a new one is being saved.
  const [pending, setPending] = useState<HomeSection[] | null>(null);

  // On the page of categories or genres: the one the sections are shown with.
  const [exampleId, setExampleId] = useState<string | undefined>(undefined);
  const key = ['layout', page, exampleId ?? null];
  const home = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => layoutApi.get(page, exampleId, signal),
    // Another example brings other titles to the same sections: keep them standing meanwhile.
    placeholderData: (previous) => previous,
  });
  const subjects = useQuery({
    queryKey: [about.each?.one === 'genre' ? 'genres' : 'categories'],
    queryFn: ({ signal }): Promise<{ id: string; name: string }[]> =>
      about.each?.one === 'genre' ? genresApi.list(signal) : categoriesApi.list(signal),
    enabled: about.each !== undefined,
  });
  const hasOpening = about.opening !== false;
  const example = home.data?.example ?? null;
  const sitePath = about.each
    ? example
      ? `/${about.each.one}/${example.slug}`
      : null
    : about.path;
  const pages = useQuery({
    queryKey: ['layout'],
    queryFn: ({ signal }) => layoutApi.pages(signal),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['layout'] });
  const failed = (error: Error) => {
    toast.error(error.message);
    void refresh();
  };

  const start = useMutation({
    mutationFn: () => layoutApi.start(page),
    onSuccess: (answer) => {
      queryClient.setQueryData(key, answer);
      void queryClient.invalidateQueries({ queryKey: ['layout'], exact: true });
      toast.success(
        page === 'home'
          ? 'The page is yours to arrange. It shows what it showed before'
          : 'The page is yours to arrange. Here is a first version of it',
      );
    },
    onError: failed,
  });
  const reset = useMutation({
    mutationFn: () => layoutApi.reset(page),
    onSuccess: () => {
      toast.success(
        page === 'home'
          ? 'The page puts itself together again'
          : `${about.label}: back to the list`,
      );
      void refresh();
    },
    onError: failed,
  });
  const create = useMutation({
    mutationFn: (body: HomeSectionInput & { kind: HomeSectionKind }) =>
      layoutApi.create(page, body),
    onSuccess: (section) => {
      toast.success(`"${section.name ?? section.defaultName}" added`);
      void refresh();
    },
    onError: failed,
  });
  const toggle = useMutation({
    mutationFn: (section: HomeSection) =>
      layoutApi.update(section.id, { visible: !section.visible }),
    onSuccess: () => void refresh(),
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: (section: HomeSection) => layoutApi.remove(section.id),
    onSuccess: () => {
      toast.success('Section removed');
      void refresh();
    },
    onError: failed,
  });
  const reorder = useMutation({
    mutationFn: (sections: HomeSection[]) =>
      layoutApi.reorder(
        page,
        sections.map((entry) => entry.id),
      ),
    onSuccess: (answer) => queryClient.setQueryData(key, answer),
    onError: failed,
    onSettled: () => setPending(null),
  });

  const all = pending ?? home.data?.sections ?? [];
  const hero = all.find((section) => section.kind === 'HERO');
  // The opening always stands first on the page, so it is not part of the order.
  const rows = all.filter((section) => section.kind !== 'HERO');
  const hasContinue = all.some((section) => section.kind === 'CONTINUE_WATCHING');
  const hasList = all.some((section) => section.kind === 'MY_LIST');

  const saveOrder = (next: HomeSection[]) => {
    const ordered = hero ? [hero, ...next] : next;
    setPending(ordered);
    reorder.mutate(ordered);
  };
  const add = (preset: SectionPreset) => {
    if (preset.needs) {
      setEditing({ mode: 'new', kind: preset.kind, preset: preset.input });
    } else {
      create.mutate({ kind: preset.kind, ...preset.input });
    }
  };
  const askRemove = async (section: HomeSection) => {
    const confirmed = await confirm({
      title: `Remove "${section.name ?? section.defaultName}" from the ${about.label.toLowerCase()}?`,
      description:
        section.kind === 'CONTINUE_WATCHING'
          ? 'Viewers no longer see what they started on this page. Their progress is kept.'
          : section.kind === 'MY_LIST'
            ? 'Viewers no longer see their list on this page. The lists are kept, and stay on their own page.'
            : 'Only the section goes. The titles it shows stay in the catalog.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(section);
    }
  };
  const askReset = async () => {
    const confirmed = await confirm({
      title:
        page === 'home'
          ? 'Let the page put itself together again?'
          : page === 'live'
            ? 'Leave the live page to its channels again?'
            : `Give "${about.label}" back to the list?`,
      description:
        page === 'home'
          ? `All ${all.length} sections are deleted. The page then shows the featured titles, the newest, and a row for each category, as it did before.`
          : `All ${all.length} sections are deleted. ${about.automatic.text.replace('Right now ', '').replace(' Nothing to maintain.', '')}`,
      confirmLabel: 'Delete the sections',
      destructive: true,
    });
    if (confirmed) {
      reset.mutate();
    }
  };

  const drop = (event: DragEvent, target: HomeSection) => {
    event.preventDefault();
    if (dragged && dragged !== target.id) {
      saveOrder(placedAt(rows, dragged, target.id));
    }
    setDragged(null);
    setOver(null);
  };

  const addMenu = mayWrite ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="primary" loading={create.isPending}>
          <Plus />
          Add a section
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Rows of titles</DropdownMenuLabel>
        {presetsFor(page).map((preset) => (
          <DropdownMenuItem key={preset.key} onSelect={() => add(preset)}>
            <span className="grid">
              {preset.label}
              <span className="text-xs text-muted-foreground">{preset.about}</span>
            </span>
          </DropdownMenuItem>
        ))}
        {(hasOpening && !hero) || !hasContinue || !hasList ? <DropdownMenuSeparator /> : null}
        {hasOpening && !hero ? (
          <DropdownMenuItem
            onSelect={() =>
              setEditing({ mode: 'new', kind: 'HERO', preset: { source: 'FEATURED', limit: 5 } })
            }
          >
            <span className="grid">
              The opening
              <span className="text-xs text-muted-foreground">
                One title shown large, or a few that take turns
              </span>
            </span>
          </DropdownMenuItem>
        ) : null}
        {!hasContinue ? (
          <DropdownMenuItem onSelect={() => create.mutate({ kind: 'CONTINUE_WATCHING' })}>
            <span className="grid">
              Continue watching
              <span className="text-xs text-muted-foreground">
                Where each viewer finds what they started
              </span>
            </span>
          </DropdownMenuItem>
        ) : null}
        {!hasList ? (
          <DropdownMenuItem onSelect={() => create.mutate({ kind: 'MY_LIST' })}>
            <span className="grid">
              My list
              <span className="text-xs text-muted-foreground">
                Where each viewer finds what they saved for later
              </span>
            </span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <>
      <PageHeader
        title={about.label}
        description={about.description}
        actions={
          <>
            {SITE_URL !== null && sitePath !== null ? (
              <Button asChild>
                <a href={`${SITE_URL}${sitePath}`} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  View the site
                </a>
              </Button>
            ) : null}
            {home.data?.custom && mayWrite ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" aria-label="More">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem destructive onSelect={() => void askReset()}>
                    <RotateCcw />
                    {page === 'home'
                      ? 'Back to the automatic page'
                      : page === 'live'
                        ? 'Back to the channels alone'
                        : 'Back to the list'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {home.data?.custom ? addMenu : null}
          </>
        }
      />

      <nav aria-label="Page" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {(Object.keys(LAYOUT_PAGES) as LayoutPageSlug[]).map((slug) => {
          const summary = pages.data?.find((entry) => entry.page.toLowerCase() === slug);
          const current = slug === page;
          return (
            <Link
              key={slug}
              to={`/layout/${slug}`}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'grid min-w-0 gap-0.5 rounded-xl border bg-card px-4 py-2.5 text-sm shadow-xs transition-colors hover:border-primary/50',
                current && 'border-primary ring-1 ring-primary',
              )}
            >
              <span className="font-medium">{LAYOUT_PAGES[slug].label}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    summary?.custom ? 'bg-success' : 'bg-muted-foreground/40',
                  )}
                  aria-hidden="true"
                />
                {summary
                  ? summary.custom
                    ? `Arranged, ${summary.sections} ${summary.sections === 1 ? 'section' : 'sections'}`
                    : slug === 'home'
                      ? 'Puts itself together'
                      : slug === 'live'
                        ? 'The channels alone'
                        : LAYOUT_PAGES[slug].each
                          ? 'The list of its titles'
                          : 'The list of all of them'
                  : ' '}
              </span>
            </Link>
          );
        })}
      </nav>

      <ErrorNote error={home.error} className="mb-4" />
      {home.isPending ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : null}

      {home.data && !home.data.custom ? (
        <Card>
          <CardContent className="grid gap-6 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:items-center">
            <div className="grid gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wand2 className="size-5" aria-hidden="true" />
              </span>
              <h2 className="text-lg font-semibold">{about.automatic.title}</h2>
              <p className="max-w-xl text-sm text-muted-foreground">{about.automatic.text}</p>
              <p className="max-w-xl text-sm text-muted-foreground">{about.arranged}</p>
              {mayWrite ? (
                <div>
                  <Button
                    variant="primary"
                    loading={start.isPending}
                    onClick={() => start.mutate()}
                  >
                    <Sparkles />
                    Arrange the page myself
                  </Button>
                </div>
              ) : null}
            </div>
            {/* A sketch of what the page is now, not a picture of the real one. */}
            <div
              aria-hidden="true"
              className="hidden gap-2 rounded-xl border bg-muted/40 p-3 md:grid"
            >
              {page === 'home' || about.each ? (
                <div className="flex h-20 items-end rounded-lg bg-linear-to-br from-primary/30 to-primary/5 p-2">
                  <span className="h-2 w-16 rounded-full bg-foreground/40" />
                </div>
              ) : null}
              {about.automatic.rows.map((label) => (
                <div key={label} className="grid gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                  <div className="flex gap-1">
                    {Array.from({ length: 6 }, (_, index) => (
                      <span key={index} className="h-9 flex-1 rounded bg-foreground/10" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {home.data?.custom ? (
        <div className="grid grid-cols-1 gap-3">
          {about.each ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border bg-muted/40 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers className="size-4" aria-hidden="true" />
              </span>
              <p className="min-w-[min(100%,16rem)] flex-1 text-sm text-muted-foreground">
                <span className="block font-medium text-foreground">
                  One arrangement for all your {about.each.many}
                </span>
                {example
                  ? `Each section holds only titles of the ${about.each.one} a visitor opened. Here you see them with one of yours.`
                  : `No ${about.each.one} has a published title yet, so the sections stand empty for now.`}
              </p>
              {example ? (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Shown with</span>
                  <Select
                    aria-label={`The ${about.each.one} the sections are shown with`}
                    className="w-48"
                    value={example.id}
                    onValueChange={setExampleId}
                    options={(subjects.data ?? [example]).map((subject) => ({
                      value: subject.id,
                      label: subject.name,
                    }))}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
          {!hasOpening ? null : hero ? (
            <SectionCard
              section={hero}
              mayWrite={mayWrite}
              within={about.each?.one}
              pinned
              onEdit={() => setEditing({ mode: 'edit', section: hero })}
              onToggle={() => toggle.mutate(hero)}
              onRemove={() => void askRemove(hero)}
            />
          ) : (
            <button
              type="button"
              disabled={!mayWrite}
              onClick={() =>
                setEditing({ mode: 'new', kind: 'HERO', preset: { source: 'FEATURED', limit: 5 } })
              }
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground transition-colors enabled:hover:border-primary/50 enabled:hover:text-foreground"
            >
              <PanelTop className="size-4" aria-hidden="true" />
              The page has no opening and starts with its rows.
              {mayWrite ? <span className="font-medium text-primary">Add one</span> : null}
            </button>
          )}

          {rows.length === 0 ? (
            <EmptyState icon={LayoutTemplate} title="No rows yet" action={addMenu}>
              {hasOpening
                ? 'Add rows of titles to fill the page under the opening.'
                : 'Add rows of titles to stand under the channels.'}
            </EmptyState>
          ) : (
            <ol className="grid grid-cols-1 gap-3">
              {rows.map((section, index) => (
                <li
                  key={section.id}
                  onDragOver={(event) => {
                    if (dragged) {
                      event.preventDefault();
                      setOver(section.id);
                    }
                  }}
                  onDrop={(event) => drop(event, section)}
                  className={cn(
                    'rounded-xl transition-shadow',
                    over === section.id && dragged !== section.id && 'ring-2 ring-primary',
                    dragged === section.id && 'opacity-50',
                  )}
                >
                  <SectionCard
                    section={section}
                    mayWrite={mayWrite}
                    within={about.each?.one}
                    place={index + 1}
                    onEdit={() => setEditing({ mode: 'edit', section })}
                    onToggle={() => toggle.mutate(section)}
                    onRemove={() => void askRemove(section)}
                    onMove={(by) => saveOrder(moved(rows, index, by))}
                    canMoveUp={index > 0}
                    canMoveDown={index < rows.length - 1}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', section.id);
                      setDragged(section.id);
                    }}
                    onDragEnd={() => {
                      setDragged(null);
                      setOver(null);
                    }}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}

      {editing ? (
        <SectionEditor
          page={page}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}

const STATE_BADGES = {
  off: { tone: 'neutral', icon: EyeOff, label: 'Hidden' },
  scheduled: { tone: 'info', icon: CalendarClock, label: 'Scheduled' },
  ended: { tone: 'warning', icon: CalendarOff, label: 'Ended' },
  empty: { tone: 'warning', icon: EyeOff, label: 'Empty, so not shown' },
} as const;

interface SectionCardProps {
  section: HomeSection;
  mayWrite: boolean;
  /** On the page of categories or genres: which of the two the sections stay within. */
  within?: string;
  /** The opening: it stands first and cannot be moved. */
  pinned?: boolean;
  place?: number;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onMove?: (by: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onDragStart?: (event: DragEvent) => void;
  onDragEnd?: () => void;
}

/** One section of the page: what it is, what it shows right now, and what can be done with it. */
function SectionCard({
  section,
  mayWrite,
  within,
  pinned,
  place,
  onEdit,
  onToggle,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
  onDragStart,
  onDragEnd,
}: SectionCardProps) {
  const look = KIND_LOOKS[section.kind];
  const Icon = look.icon;
  const state = sectionState(section);
  const badge = state === 'shown' ? null : STATE_BADGES[state];
  const name = section.name ?? section.defaultName;
  const wide = section.kind === 'HERO' || section.layout === 'LANDSCAPE';
  const dates =
    section.visibleFrom || section.visibleUntil
      ? [
          section.visibleFrom ? `from ${formatDateTime(section.visibleFrom)}` : null,
          section.visibleUntil ? `until ${formatDateTime(section.visibleUntil)}` : null,
        ]
          .filter(Boolean)
          .join(' ')
      : null;

  return (
    <Card className={cn('overflow-hidden', state !== 'shown' && 'bg-muted/30')}>
      <div className="flex items-start gap-3 p-4">
        {pinned ? (
          <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : (
          <span
            draggable={mayWrite}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            title={mayWrite ? 'Drag to move' : undefined}
            className={cn(
              'mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
              mayWrite && 'cursor-grab active:cursor-grabbing',
            )}
          >
            {mayWrite ? (
              <GripVertical className="size-4" aria-hidden="true" />
            ) : (
              <Icon className="size-4" aria-hidden="true" />
            )}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {place ? (
              <span className="text-xs text-muted-foreground tabular-nums">{place}</span>
            ) : null}
            <h2
              className={cn(
                'truncate text-sm font-semibold',
                state !== 'shown' && 'text-muted-foreground',
              )}
            >
              {name}
            </h2>
            <Badge>{look.label}</Badge>
            {badge ? (
              <Badge tone={badge.tone}>
                <badge.icon className="size-3" aria-hidden="true" />
                {badge.label}
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {describeSection(section, within)}
            {dates ? `. Shown ${dates}` : ''}
          </p>

          {!isOwnRow(section.kind) ? (
            section.preview.length > 0 ? (
              <ul
                className="mt-3 flex gap-1.5 overflow-hidden"
                aria-label={`What ${name} shows now`}
              >
                {section.preview.map((title, index) => {
                  const picture = wide ? (title.backdrop ?? title.poster) : title.poster;
                  return (
                    <li
                      key={title.id}
                      title={title.name}
                      className={cn(
                        'relative shrink-0 overflow-hidden rounded bg-muted',
                        wide ? 'aspect-video h-16' : 'aspect-[2/3] h-20',
                      )}
                    >
                      {picture ? (
                        <img
                          src={apiUrl(picture.url)}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center p-1 text-center text-[9px] leading-tight text-muted-foreground">
                          {title.name}
                        </span>
                      )}
                      {section.layout === 'NUMBERED' && section.kind === 'TITLES' ? (
                        <span className="absolute bottom-0 left-0 rounded-tr bg-background/85 px-1 text-[10px] font-semibold tabular-nums">
                          {index + 1}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
                {section.count > section.preview.length ? (
                  <li className="flex shrink-0 items-center px-2 text-xs text-muted-foreground">
                    +{section.count - section.preview.length}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-3 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                No title that viewers can see matches right now. The section appears by itself once
                one does.
              </p>
            )
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {mayWrite ? (
            <Tooltip
              content={section.visible ? 'Shown. Switch off to hide' : 'Hidden. Switch on to show'}
            >
              <span className="mr-1.5 flex">
                <Switch
                  checked={section.visible}
                  onCheckedChange={onToggle}
                  aria-label={`Show ${name}`}
                />
              </span>
            </Tooltip>
          ) : null}
          {mayWrite && onMove ? (
            <span className="hidden sm:flex">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Move ${name} up`}
                disabled={!canMoveUp}
                onClick={() => onMove(-1)}
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Move ${name} down`}
                disabled={!canMoveDown}
                onClick={() => onMove(1)}
              >
                <ArrowDown />
              </Button>
            </span>
          ) : null}
          {mayWrite ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil />
                  Change
                </DropdownMenuItem>
                {onMove ? (
                  <div className="sm:hidden">
                    <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}>
                      <ArrowUp />
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(1)}>
                      <ArrowDown />
                      Move down
                    </DropdownMenuItem>
                  </div>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={onRemove}>
                  <Trash2 />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function toForm(editing: Editing, page: LayoutPageSlug): SectionForm {
  if (editing.mode === 'edit') {
    const { section } = editing;
    return {
      name: section.name ?? '',
      source: section.source,
      categoryId: section.category?.id ?? '',
      genreId: section.genre?.id ?? '',
      collectionId: section.collection?.id ?? '',
      titleType: section.titleType ?? 'ALL',
      sort: section.sort,
      limit: section.limit,
      layout: section.layout,
      visible: section.visible,
      from: toLocalInput(section.visibleFrom),
      until: toLocalInput(section.visibleUntil),
      picked: section.picked,
    };
  }
  const { preset, kind } = editing;
  const source = preset.source ?? 'ALL';
  return {
    name: preset.name ?? '',
    source,
    categoryId: '',
    genreId: '',
    collectionId: '',
    // A new section of the page for movies is about movies, until it is told otherwise.
    titleType: preset.titleType ?? LAYOUT_PAGES[page].titleType ?? 'ALL',
    sort: preset.sort ?? (source === 'MANUAL' || source === 'COLLECTION' ? 'CURATED' : 'NEWEST'),
    limit: preset.limit ?? (kind === 'HERO' ? 5 : 20),
    layout: preset.layout ?? 'POSTER',
    visible: true,
    from: '',
    until: '',
    picked: [],
  };
}

function toInput(form: SectionForm): HomeSectionInput {
  return {
    name: form.name.trim() || null,
    source: form.source,
    categoryId: form.source === 'CATEGORY' ? form.categoryId : null,
    genreId: form.source === 'GENRE' ? form.genreId : null,
    collectionId: form.source === 'COLLECTION' ? form.collectionId : null,
    titleType: form.titleType === 'ALL' ? null : form.titleType,
    sort: form.sort,
    limit: form.limit,
    layout: form.layout,
    visible: form.visible,
    visibleFrom: fromLocalInput(form.from),
    visibleUntil: fromLocalInput(form.until),
    ...(form.source === 'MANUAL' ? { titleIds: form.picked.map((title) => title.id) } : {}),
  };
}

/** Makes or changes a section, in a panel at the side so the page stays in view. */
function SectionEditor({
  page,
  editing,
  onClose,
  onSaved,
}: {
  page: LayoutPageSlug;
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const kind = editing.mode === 'edit' ? editing.section.kind : editing.kind;
  const [form, setForm] = useState<SectionForm>(() => toForm(editing, page));
  const set = (change: Partial<SectionForm>) => setForm((current) => ({ ...current, ...change }));
  const isHero = kind === 'HERO';
  const isContinue = isOwnRow(kind);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => categoriesApi.list(signal),
    enabled: !isContinue,
  });
  const genres = useQuery({
    queryKey: ['genres'],
    queryFn: ({ signal }) => genresApi.list(signal),
    enabled: !isContinue,
  });
  const collections = useQuery({
    queryKey: ['collections'],
    queryFn: ({ signal }) => collectionsApi.list(signal),
    enabled: !isContinue,
  });

  const save = useMutation({
    mutationFn: () =>
      editing.mode === 'edit'
        ? layoutApi.update(editing.section.id, toInput(form))
        : layoutApi.create(page, { kind, ...toInput(form) }),
    onSuccess: (section) => {
      toast.success(
        editing.mode === 'edit'
          ? 'Section saved'
          : `"${section.name ?? section.defaultName}" added`,
      );
      onSaved();
    },
  });
  const problem = formProblem(kind, form);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!problem) {
      save.mutate();
    }
  };
  const chooseSource = (source: HomeSource) => {
    const sorts = sortsFor(source);
    set({
      source,
      sort: sorts.includes(form.sort) ? form.sort : (sorts[0] as HomeSort),
    });
  };
  const defaultName =
    editing.mode === 'edit' ? editing.section.defaultName : 'Named after what it shows';
  const [least, most] = isHero ? [1, MAX_HERO_TITLES] : [MIN_ROW_TITLES, MAX_ROW_TITLES];

  const choice = (
    label: string,
    value: string,
    options: { id: string; name: string }[] | undefined,
    onChange: (id: string) => void,
    empty: string,
  ): ReactNode => (
    <Field label={label} hint={options && options.length === 0 ? empty : undefined}>
      {(id) => (
        <Select
          id={id}
          value={value}
          placeholder={`Choose a ${label.toLowerCase()}`}
          onValueChange={onChange}
          disabled={!options || options.length === 0}
          options={(options ?? []).map((option) => ({ value: option.id, label: option.name }))}
        />
      )}
    </Field>
  );

  return (
    <Dialog open onOpenChange={(open) => (open || save.isPending ? undefined : onClose())}>
      <DialogContent
        variant="sheet"
        size="md"
        title={
          editing.mode === 'edit'
            ? `Change "${editing.section.name ?? editing.section.defaultName}"`
            : isHero
              ? 'The opening of the page'
              : 'A new row'
        }
        description={
          isHero
            ? 'The first thing a visitor sees: a title shown as large as its backdrop allows. With several, they take turns every few seconds.'
            : isContinue
              ? kind === 'MY_LIST'
                ? 'The place on the page where a viewer finds what they saved to watch later.'
                : 'The place on the page where a viewer finds what they started.'
              : 'A heading and a strip of titles that scrolls sideways.'
        }
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            {!isHero && !isContinue ? (
              <Field
                label="Heading"
                hint="Leave it empty and the row is named after what it shows."
              >
                {(id) => (
                  <Input
                    id={id}
                    maxLength={80}
                    placeholder={defaultName}
                    value={form.name}
                    onChange={(event) => set({ name: event.target.value })}
                  />
                )}
              </Field>
            ) : null}

            {!isContinue ? (
              <>
                <Field
                  label="Shows"
                  hint={
                    LAYOUT_PAGES[page].each
                      ? `Always within the ${LAYOUT_PAGES[page].each.one} a visitor opened.`
                      : undefined
                  }
                >
                  {(id) => (
                    <Select
                      id={id}
                      value={form.source}
                      onValueChange={(value) => chooseSource(value as HomeSource)}
                      options={(Object.keys(SOURCE_LABELS) as HomeSource[])
                        .filter((value) => value.toLowerCase() !== LAYOUT_PAGES[page].each?.one)
                        .map((value) => ({
                          value,
                          label: SOURCE_LABELS[value].label,
                          description: SOURCE_LABELS[value].about,
                        }))}
                    />
                  )}
                </Field>
                {form.source === 'CATEGORY'
                  ? choice(
                      'Category',
                      form.categoryId,
                      categories.data,
                      (categoryId) => set({ categoryId }),
                      'There is no category yet. Make one under Categories.',
                    )
                  : null}
                {form.source === 'GENRE'
                  ? choice(
                      'Genre',
                      form.genreId,
                      genres.data,
                      (genreId) => set({ genreId }),
                      'There is no genre yet. Genres come with imported titles.',
                    )
                  : null}
                {form.source === 'COLLECTION'
                  ? choice(
                      'Collection',
                      form.collectionId,
                      collections.data,
                      (collectionId) => set({ collectionId }),
                      'There is no collection yet. Make one under Collections.',
                    )
                  : null}
                {form.source === 'MANUAL' ? (
                  <TitlePicker
                    picked={form.picked}
                    most={most}
                    onChange={(picked) => set({ picked })}
                  />
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Kind of title">
                    {(id) => (
                      <Select
                        id={id}
                        value={form.titleType}
                        onValueChange={(value) =>
                          set({ titleType: value as SectionForm['titleType'] })
                        }
                        options={[
                          { value: 'ALL', label: 'Movies and series' },
                          { value: 'MOVIE', label: 'Movies only' },
                          { value: 'SERIES', label: 'Series only' },
                        ]}
                      />
                    )}
                  </Field>
                  <Field label="Order">
                    {(id) => (
                      <Select
                        id={id}
                        value={form.sort}
                        disabled={form.source === 'MANUAL'}
                        onValueChange={(value) => set({ sort: value as HomeSort })}
                        options={sortsFor(form.source).map((value) => ({
                          value,
                          label:
                            value === 'CURATED' && form.source === 'MANUAL'
                              ? 'Your order'
                              : SORT_LABELS[value].label,
                          description: SORT_LABELS[value].about,
                        }))}
                      />
                    )}
                  </Field>
                </div>
                <Field
                  label={isHero ? 'Titles that take turns' : 'Titles shown at most'}
                  hint={
                    isHero
                      ? 'With 1 the opening stays on one title. Titles with a backdrop are preferred.'
                      : `Between ${least} and ${most}. "See all" leads to the rest.`
                  }
                >
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min={least}
                      max={most}
                      className="w-28"
                      value={Number.isNaN(form.limit) ? '' : form.limit}
                      onChange={(event) => set({ limit: event.target.valueAsNumber })}
                    />
                  )}
                </Field>
              </>
            ) : null}

            {!isHero && !isContinue ? (
              <fieldset className="grid gap-1.5">
                <legend className="mb-1.5 text-sm font-medium">Look</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.keys(LAYOUT_LABELS) as HomeLayout[]).map((value) => {
                    const LayoutIcon = LAYOUT_ICONS[value];
                    const active = form.layout === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => set({ layout: value })}
                        className={cn(
                          'grid gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                          active && 'border-primary bg-primary/5 ring-1 ring-primary',
                        )}
                      >
                        <LayoutIcon
                          className={cn(
                            'size-5',
                            active ? 'text-primary' : 'text-muted-foreground',
                          )}
                          aria-hidden="true"
                        />
                        <span className="text-sm font-medium">{LAYOUT_LABELS[value].label}</span>
                        <span className="text-xs text-muted-foreground">
                          {LAYOUT_LABELS[value].about}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            <ToggleRow
              label="Shown on the page"
              description="Switched off, the section stays here and is not shown to anyone."
              checked={form.visible}
              onCheckedChange={(visible) => set({ visible })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Shown from" hint="Empty: from now on.">
                {(id) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={form.from}
                    onChange={(event) => set({ from: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Shown until" hint="Empty: without an end.">
                {(id) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={form.until}
                    onChange={(event) => set({ until: event.target.value })}
                  />
                )}
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              Dates are for a season or an occasion: the section appears and leaves by itself. Times
              are in your time zone.
            </p>
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            {problem ? <p className="mr-auto text-sm text-muted-foreground">{problem}</p> : null}
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!!problem}>
              {editing.mode === 'edit' ? 'Save' : 'Add to the page'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const SEARCH_DELAY_MS = 250;

/** Picks titles one by one and puts them in order. */
function TitlePicker({
  picked,
  most,
  onChange,
}: {
  picked: SectionForm['picked'];
  most: number;
  onChange: (picked: SectionForm['picked']) => void;
}) {
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
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
  const has = new Set(picked.map((title) => title.id));
  const full = picked.length >= most;

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">
        Titles{' '}
        <span className="font-normal text-muted-foreground tabular-nums">
          {picked.length} of {most} at most
        </span>
      </span>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          className="pl-9"
          placeholder="Search a movie or series to add"
          aria-label="Search a title to add"
          value={typed}
          disabled={full}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>
      {q && found.data ? (
        <ul className="rounded-lg border">
          {found.data.items.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">
              Nothing is called like that.
            </li>
          ) : null}
          {found.data.items.map((title) => (
            <li key={title.id} className="border-b last:border-b-0">
              <button
                type="button"
                disabled={has.has(title.id) || full}
                onClick={() =>
                  onChange([
                    ...picked,
                    {
                      id: title.id,
                      name: title.name,
                      type: title.type,
                      visible: title.status === 'PUBLISHED' && title.isVisible,
                    },
                  ])
                }
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm enabled:hover:bg-accent disabled:opacity-50"
              >
                {title.type === 'SERIES' ? (
                  <Tv className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Film className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate">{title.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {has.has(title.id)
                    ? 'Picked'
                    : title.status !== 'PUBLISHED'
                      ? 'Not published'
                      : (title.releaseYear ?? '')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {picked.length > 0 ? (
        <ol className="grid gap-1">
          {picked.map((title, index) => (
            <li
              key={title.id}
              className="flex items-center gap-2 rounded-lg border bg-card py-1 pr-1 pl-3 text-sm"
            >
              <span className="w-5 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{title.name}</span>
              {!title.visible ? (
                <Tooltip content="Viewers cannot see this title right now, so the section leaves it out">
                  <Badge tone="warning">Not shown</Badge>
                </Tooltip>
              ) : null}
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Move ${title.name} up`}
                disabled={index === 0}
                onClick={() => onChange(moved(picked, index, -1))}
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Move ${title.name} down`}
                disabled={index === picked.length - 1}
                onClick={() => onChange(moved(picked, index, 1))}
              >
                <ArrowDown />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Take out ${title.name}`}
                onClick={() => onChange(picked.filter((entry) => entry.id !== title.id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          Nothing picked yet. Search above and click a title to add it.
        </p>
      )}
    </div>
  );
}
