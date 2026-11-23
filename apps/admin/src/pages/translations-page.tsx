// SPDX-License-Identifier: AGPL-3.0-only
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Languages, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { termsApi } from '@/api/endpoints';
import { TERM_KINDS, type TermField, type TermKind, type TermRow } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { AddLanguageDialog } from '@/components/title-translations';
import { Button } from '@/components/ui/button';
import {
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Pagination,
  Skeleton,
} from '@/components/ui/display';
import { Input, Label, Select, Switch, Textarea } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import {
  countOf,
  dirtyCount,
  isRowDirty,
  percent,
  saveItems,
  stateOf,
  type TermEdits,
  type TermState,
  teaser,
  valueOf,
  withEdit,
} from '@/lib/terms';
import { isRightToLeft, languageName } from '@/lib/translations';

const PAGE_SIZE = 50;

const isKind = (value: string | null): value is TermKind =>
  value !== null && (TERM_KINDS as readonly string[]).includes(value);

const STATE_LABEL: Record<TermState, string> = {
  done: 'Translated',
  partly: 'Partly translated',
  missing: 'Not translated',
};

/**
 * Names and descriptions of categories, genres, collections and people in
 * the languages viewers read, a language at a time and many at once.
 */
export function TranslationsPage() {
  const { can } = useSession();
  const mayWrite = can('catalog:write');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  /** Languages added here that nothing is stored in yet. */
  const [fresh, setFresh] = useState<string[]>([]);
  const [edits, setEdits] = useState<TermEdits>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const kindParam = params.get('kind');
  const kind: TermKind = isKind(kindParam) ? kindParam : 'categories';
  const q = params.get('q') ?? '';
  const missing = params.get('missing') === '1';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const overview = useQuery({
    queryKey: ['terms', 'overview'],
    queryFn: ({ signal }) => termsApi.overview(signal),
  });
  const stored = overview.data?.languages ?? [];
  const languages = useMemo(
    () => [
      ...stored.map((entry) => entry.language),
      ...fresh.filter((tag) => !stored.some((entry) => entry.language === tag)),
    ],
    [stored, fresh],
  );
  const wanted = params.get('lang');
  const language = wanted && languages.includes(wanted) ? wanted : (languages[0] ?? null);
  const kinds = overview.data?.kinds ?? [];
  const info = kinds.find((entry) => entry.kind === kind);
  const fields: TermField[] = info?.fields ?? [];
  const translatedOf = (entry: TermKind) =>
    stored.find((item) => item.language === language)?.translated[entry] ?? 0;

  const list = useQuery({
    queryKey: ['terms', kind, language, page, q, missing],
    queryFn: ({ signal }) =>
      termsApi.list(
        kind,
        { language: language as string, page, pageSize: PAGE_SIZE, q: q || undefined, missing },
        signal,
      ),
    enabled: language !== null,
    placeholderData: keepPreviousData,
  });
  const rows = list.data?.items ?? [];
  const changed = dirtyCount(edits);

  /** Moves to another view. What was typed is asked about first. */
  const go = async (next: Record<string, string | null>) => {
    if (changed > 0) {
      const confirmed = await confirm({
        title: 'Leave without saving?',
        description: `What you typed for ${changed === 1 ? 'one entry' : `${changed} entries`} is lost.`,
        confirmLabel: 'Leave',
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
    }
    setEdits({});
    setOpen({});
    const updated = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') {
        updated.delete(key);
      } else {
        updated.set(key, value);
      }
    }
    setParams(updated);
  };

  // The search box answers as one types, a moment after the last key.
  const [typed, setTyped] = useState(q);
  useEffect(() => setTyped(q), [q]);
  useEffect(() => {
    if (typed.trim() === q) {
      return;
    }
    const timer = setTimeout(() => void go({ q: typed.trim(), page: null }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const save = useMutation({
    mutationFn: () => termsApi.save(kind, language as string, saveItems(edits)),
    onSuccess: (result) => {
      const count = result.saved + result.cleared;
      toast.success(`${countOf(kind, count)} saved in ${languageName(language as string)}`, {
        description:
          result.cleared > 0
            ? `${result.cleared} of them ${result.cleared === 1 ? 'has' : 'have'} no translation any more.`
            : undefined,
      });
      setEdits({});
      void queryClient.invalidateQueries({ queryKey: ['terms'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeLanguage = useMutation({
    mutationFn: () => termsApi.removeLanguage(kind, language as string),
    onSuccess: (result) => {
      toast.success(
        `${languageName(language as string)} removed from ${countOf(kind, result.removed)}`,
      );
      setEdits({});
      void queryClient.invalidateQueries({ queryKey: ['terms'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const askRemove = async () => {
    const confirmed = await confirm({
      title: `Remove ${languageName(language as string)} from all ${kind}?`,
      description: `Every translation of ${kind} into ${languageName(language as string)} is deleted. Viewers who read in it get them in the language of the catalog. Other languages and the titles stay.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (confirmed) {
      removeLanguage.mutate();
    }
  };

  const listRef = useRef<HTMLDivElement>(null);
  /** Enter in a name goes to the name below, like in a sheet. */
  const onNameKey = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? -1 : 1;
    listRef.current
      ?.querySelector<HTMLInputElement>(`[data-name-index="${index + step}"]`)
      ?.focus();
  };

  const rtl = language ? isRightToLeft(language) : false;

  return (
    <>
      <PageHeader
        title="Translations"
        description="Categories, genres, collections and people in the languages your viewers read. A title is translated on its own page."
        actions={
          <>
            {languages.length > 0 ? (
              <Select
                aria-label="Language"
                className="w-48"
                value={language ?? ''}
                onValueChange={(value) => void go({ lang: value, page: null })}
                options={languages.map((tag) => ({
                  value: tag,
                  label: languageName(tag),
                  description: tag,
                }))}
              />
            ) : null}
            {mayWrite ? (
              <Button
                variant={languages.length === 0 ? 'primary' : 'secondary'}
                onClick={() => setAdding(true)}
              >
                <Plus />
                Add language
              </Button>
            ) : null}
          </>
        }
      />

      <ErrorNote error={overview.error} className="mb-4" />
      {overview.isPending ? <Skeleton className="h-28 rounded-xl" /> : null}

      {overview.data && language === null ? (
        <EmptyState
          icon={Languages}
          title="No language yet"
          action={
            mayWrite ? (
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus />
                Add language
              </Button>
            ) : undefined
          }
        >
          Add the first language to translate the names of your categories, genres, collections and
          people into. Until then viewers read them in the language of the catalog.
        </EmptyState>
      ) : null}

      {overview.data && language !== null ? (
        <>
          <div
            role="tablist"
            aria-label="What to translate"
            className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            {kinds.map((entry) => {
              const done = translatedOf(entry.kind);
              const active = entry.kind === kind;
              return (
                <button
                  key={entry.kind}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => void go({ kind: entry.kind, page: null, q: null, missing: null })}
                  className={cn(
                    'grid gap-2.5 rounded-xl border bg-card px-4 py-3.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'border-primary/50 ring-1 ring-primary/30' : 'hover:bg-accent',
                  )}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{entry.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {percent(done, entry.total)}%
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        done >= entry.total && entry.total > 0 ? 'bg-success' : 'bg-primary',
                      )}
                      style={{ width: `${entry.total === 0 ? 0 : percent(done, entry.total)}%` }}
                    />
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {entry.total === 0 ? 'None yet' : `${done} of ${entry.total} translated`}
                  </span>
                </button>
              );
            })}
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 py-3">
              <div className="relative min-w-48 flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  aria-label={`Search ${kind}`}
                  className="pl-9"
                  placeholder={`Search ${kind}, in either language`}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="only-missing"
                  checked={missing}
                  onCheckedChange={(checked) =>
                    void go({ missing: checked ? '1' : null, page: null })
                  }
                />
                <Label htmlFor="only-missing">Only what is missing</Label>
              </div>
              <p className="ml-auto text-sm text-muted-foreground tabular-nums">
                {list.data ? countOf(kind, list.data.total) : ''}
              </p>
              {mayWrite && translatedOf(kind) > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="More">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem destructive onSelect={() => void askRemove()}>
                      <Trash2 />
                      Remove {languageName(language)} from all {kind}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            <ErrorNote error={list.error} className="m-4" />
            {list.isPending ? (
              <div className="grid gap-2 p-4">
                {[0, 1, 2, 3, 4].map((line) => (
                  <Skeleton key={line} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : null}

            {list.data && rows.length === 0 ? (
              <p className="px-6 py-14 text-center text-sm text-muted-foreground">
                {q
                  ? `Nothing among the ${kind} matches "${q}".`
                  : missing
                    ? `Nothing is missing: each of the ${kind} has something in ${languageName(language)}.`
                    : `There are no ${kind} yet. Make some first, then translate them here.`}
              </p>
            ) : null}

            {rows.length > 0 ? (
              <div ref={listRef}>
                <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_4.5rem] gap-x-5 border-b px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
                  <span>In the language of the catalog</span>
                  <span>{languageName(language)}</span>
                  <span />
                </div>
                <ul className="divide-y">
                  {rows.map((row, index) => (
                    <TermLine
                      key={row.id}
                      row={row}
                      index={index}
                      fields={fields}
                      edits={edits}
                      language={language}
                      rtl={rtl}
                      disabled={!mayWrite || save.isPending}
                      expanded={open[row.id] ?? false}
                      onToggle={() => setOpen({ ...open, [row.id]: !(open[row.id] ?? false) })}
                      onEdit={(key, value) => setEdits(withEdit(edits, row, key, value))}
                      onNameKey={onNameKey}
                    />
                  ))}
                </ul>
              </div>
            ) : null}

            {changed > 0 ? (
              <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t bg-card/95 px-4 py-3 backdrop-blur">
                <p className="text-sm text-muted-foreground">
                  {changed === 1 ? 'One entry' : `${changed} entries`} changed in{' '}
                  {languageName(language)}, not saved yet.
                </p>
                <div className="flex items-center gap-2">
                  <Button onClick={() => setEdits({})} disabled={save.isPending}>
                    Discard
                  </Button>
                  <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
                    Save {changed === 1 ? 'change' : `${changed} changes`}
                  </Button>
                </div>
              </footer>
            ) : null}
          </Card>

          {list.data ? (
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              total={list.data.total}
              onChange={(next) => void go({ page: next === 1 ? null : String(next) })}
            />
          ) : null}
        </>
      ) : null}

      <AddLanguageDialog
        open={adding}
        taken={languages}
        takenMessage="This language is in the list already."
        onClose={() => setAdding(false)}
        onPick={(tag) => {
          setAdding(false);
          setFresh((current) => [...current, tag]);
          // The new language is not in the list of this render yet: set it directly.
          const updated = new URLSearchParams(params);
          updated.set('lang', tag);
          updated.delete('page');
          setEdits({});
          setParams(updated);
        }}
      />
    </>
  );
}

interface TermLineProps {
  row: TermRow;
  index: number;
  fields: readonly TermField[];
  edits: TermEdits;
  language: string;
  rtl: boolean;
  disabled: boolean;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (key: string, value: string) => void;
  onNameKey: (event: KeyboardEvent<HTMLInputElement>, index: number) => void;
}

/** One term: its name in both languages, and its longer texts when opened. */
function TermLine({
  row,
  index,
  fields,
  edits,
  language,
  rtl,
  disabled,
  expanded,
  onToggle,
  onEdit,
  onNameKey,
}: TermLineProps) {
  const more = fields.filter((field) => field.key !== 'name');
  const state = stateOf(row, edits, fields);
  const dirty = isRowDirty(edits, row.id);
  const line = teaser(row, fields);
  const name = row.original.name ?? row.slug;

  return (
    <li className={cn('px-4 py-3', dirty && 'bg-primary/[0.04]')}>
      <div className="grid grid-cols-1 gap-x-5 gap-y-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_4.5rem] lg:items-center">
        <div className="grid min-w-0 gap-0.5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{name}</span>
            <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
              {row.titles === 1 ? '1 title' : `${row.titles} titles`}
            </span>
          </p>
          {line && !expanded ? (
            <p className="truncate text-xs text-muted-foreground">{line}</p>
          ) : null}
        </div>

        <Input
          aria-label={`${name} in ${languageName(language)}`}
          data-name-index={index}
          dir={rtl ? 'rtl' : undefined}
          lang={language}
          maxLength={fields[0]?.maxLength}
          placeholder={name}
          disabled={disabled}
          value={valueOf(row, edits, 'name')}
          onChange={(event) => onEdit('name', event.target.value)}
          onKeyDown={(event) => onNameKey(event, index)}
        />

        <div className="flex items-center justify-between gap-2 lg:justify-end">
          <Tooltip content={dirty ? `${STATE_LABEL[state]}, not saved yet` : STATE_LABEL[state]}>
            <span className="relative inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cn(
                  'size-2 rounded-full',
                  state === 'done' && 'bg-success',
                  state === 'partly' && 'bg-warning',
                  state === 'missing' && 'bg-muted-foreground/30',
                )}
                aria-hidden="true"
              />
              <span className="lg:sr-only">{STATE_LABEL[state]}</span>
            </span>
          </Tooltip>
          {more.length > 0 ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Hide' : 'Show'} the other texts of ${name}`}
              onClick={onToggle}
            >
              <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
            </Button>
          ) : null}
        </div>
      </div>

      {expanded && more.length > 0 ? (
        <div className="mt-3 grid gap-3">
          {more.map((field) => (
            <div
              key={field.key}
              className="grid grid-cols-1 gap-x-5 gap-y-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_4.5rem]"
            >
              <div className="grid content-start gap-1">
                <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
                <p
                  className={cn(
                    'text-sm whitespace-pre-line',
                    row.original[field.key] ? 'text-foreground/85' : 'text-muted-foreground',
                  )}
                >
                  {row.original[field.key] ?? 'None in the language of the catalog.'}
                </p>
              </div>
              {field.long ? (
                <Textarea
                  aria-label={`${field.label} of ${name} in ${languageName(language)}`}
                  rows={4}
                  dir={rtl ? 'rtl' : undefined}
                  lang={language}
                  maxLength={field.maxLength}
                  disabled={disabled}
                  className="lg:mt-5"
                  value={valueOf(row, edits, field.key)}
                  onChange={(event) => onEdit(field.key, event.target.value)}
                />
              ) : (
                <Input
                  aria-label={`${field.label} of ${name} in ${languageName(language)}`}
                  dir={rtl ? 'rtl' : undefined}
                  lang={language}
                  maxLength={field.maxLength}
                  disabled={disabled}
                  className="lg:mt-5"
                  value={valueOf(row, edits, field.key)}
                  onChange={(event) => onEdit(field.key, event.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}
