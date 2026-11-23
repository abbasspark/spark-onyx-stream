// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, DownloadCloud, Languages, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { metadataApi, translationsApi } from '@/api/endpoints';
import type { TitleDetail, Translation } from '@/api/types';
import { cn } from '@/lib/cn';
import {
  COMMON_LANGUAGES,
  isRightToLeft,
  languageName,
  mergeSource,
  normalizeLanguage,
  partOf,
  sameTranslation,
  savedPercent,
  toTranslationForm,
  toTranslationInput,
  type TranslationForm,
  translationProgress,
} from '@/lib/translations';
import { useConfirm } from './confirm';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, EmptyState, ErrorNote, Skeleton } from './ui/display';
import { Field, Input, Select, Textarea } from './ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from './ui/overlay';

interface TitleTranslationsProps {
  title: TitleDetail;
  disabled: boolean;
  /** Called after a language was added or removed, to refresh the title. */
  onLanguagesChange: () => void;
}

/** A thin bar that says how much of a title is translated. */
function Progress({ percent, className }: { percent: number; className?: string }) {
  return (
    <span className={cn('block h-1.5 overflow-hidden rounded-full bg-muted', className)}>
      <span
        className={cn('block h-full rounded-full', percent >= 100 ? 'bg-success' : 'bg-primary')}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

/** The texts of a title in more than one language, with the original beside each field. */
export function TitleTranslations({ title, disabled, onLanguagesChange }: TitleTranslationsProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const key = ['titles', 'translations', title.id];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => translationsApi.list(title.id, signal),
  });
  const metadata = useQuery({
    queryKey: ['metadata', 'status'],
    queryFn: ({ signal }) => metadataApi.status(signal),
    staleTime: 300_000,
  });
  const saved = query.data ?? [];

  // The language being edited. A language that was added and not yet saved lives only here.
  const [language, setLanguage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const current = saved.find((item) => item.language === language);
  const savedForm = useMemo(() => toTranslationForm(current), [current]);
  const [form, setForm] = useState<TranslationForm>(savedForm);
  const dirty = language !== null && (!current || !sameTranslation(form, savedForm));

  // The first language opens by itself, and the form follows the language chosen.
  useEffect(() => {
    if (language === null && saved[0]) {
      setLanguage(saved[0].language);
    }
  }, [language, saved]);
  useEffect(() => {
    setForm(savedForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, current?.updatedAt]);

  const store = (next: Translation[]) => {
    queryClient.setQueryData(key, next);
    void queryClient.invalidateQueries({ queryKey: ['translations', 'languages'] });
    onLanguagesChange();
  };
  const save = useMutation({
    mutationFn: () => translationsApi.save(title.id, language as string, toTranslationInput(form)),
    onSuccess: (next) => {
      store(next);
      toast.success(`${languageName(language as string)} saved`);
    },
  });
  const remove = useMutation({
    mutationFn: (tag: string) => translationsApi.remove(title.id, tag),
    onSuccess: (_nothing, tag) => {
      store(saved.filter((item) => item.language !== tag));
      setLanguage(null);
      toast.success(`${languageName(tag)} removed`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const fetchSource = useMutation({
    mutationFn: () => translationsApi.source(title.id, language as string),
    onSuccess: (source) => {
      const merged = mergeSource(form, source);
      setForm(merged.form);
      for (const warning of source.warnings) {
        toast.warning(warning);
      }
      if (merged.filled > 0) {
        toast.success(
          `${merged.filled} ${merged.filled === 1 ? 'text' : 'texts'} filled in. Look them over, then save.`,
        );
      } else {
        toast.info(`TMDB has nothing more in ${languageName(source.language)} for this title.`);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** Leaving unsaved texts behind is asked about first. */
  const leave = async (): Promise<boolean> =>
    !dirty ||
    (await confirm({
      title: 'Leave without saving?',
      description: `What you typed for ${languageName(language as string)} is lost.`,
      confirmLabel: 'Leave',
      destructive: true,
    }));
  const open = async (tag: string) => {
    if (tag !== language && (await leave())) {
      setLanguage(tag);
    }
  };
  const askRemove = async () => {
    if (!language) {
      return;
    }
    if (!current) {
      // Never saved: there is nothing on the server to delete.
      setLanguage(null);
      return;
    }
    const confirmed = await confirm({
      title: `Remove ${languageName(language)}?`,
      description: `Every text of this title in ${languageName(language)} is deleted. Viewers who read in it get the title in the language of the catalog.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(language);
    }
  };

  const progress = translationProgress(title, form);
  const rtl = language ? isRightToLeft(language) : false;
  const direction = rtl ? 'rtl' : undefined;
  const setPart = (
    kind: 'seasons' | 'episodes',
    id: string,
    field: 'name' | 'synopsis',
    value: string,
  ) =>
    setForm((before) => ({
      ...before,
      [kind]: { ...before[kind], [id]: { ...partOf(before[kind], id), [field]: value } },
    }));

  const languages = saved.map((item) => item.language);
  if (language && !languages.includes(language)) {
    languages.push(language);
  }
  const mayFetch =
    !disabled && metadata.data?.enabled === true && title.metadata?.source === 'tmdb';

  if (query.isPending) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <ErrorNote error={query.error} />
      {languages.length === 0 ? (
        <EmptyState
          icon={Languages}
          title="Only in the language of the catalog"
          action={
            disabled ? null : (
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus />
                Add a language
              </Button>
            )
          }
        >
          Add a language to give this title a name and texts for viewers who read in it. Viewers who
          read in any other language get the texts of the Details tab.
        </EmptyState>
      ) : (
        <div role="tablist" aria-label="Languages" className="flex flex-wrap items-stretch gap-2">
          {languages.map((tag) => {
            const item = saved.find((entry) => entry.language === tag);
            const percent = tag === language ? progress.percent : item ? savedPercent(item) : 0;
            return (
              <button
                key={tag}
                type="button"
                role="tab"
                aria-selected={tag === language}
                onClick={() => void open(tag)}
                className={cn(
                  'grid min-w-36 gap-1.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent/50',
                  tag === language && 'border-primary bg-primary/5',
                )}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{languageName(tag)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{percent}%</span>
                </span>
                <Progress percent={percent} />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {tag}
                  {item ? '' : ' · not saved yet'}
                </span>
              </button>
            );
          })}
          {disabled ? null : (
            <Button className="h-auto self-stretch" onClick={() => setAdding(true)}>
              <Plus />
              Add a language
            </Button>
          )}
        </div>
      )}

      {language ? (
        <>
          <Card>
            <CardHeader
              title={languageName(language)}
              description={`${progress.filled} of ${progress.total} texts translated. What is left empty is shown in the language of the catalog.`}
            />
            <CardContent className="grid gap-5">
              {disabled ? null : (
                <div className="flex flex-wrap gap-2">
                  {mayFetch ? (
                    <Button loading={fetchSource.isPending} onClick={() => fetchSource.mutate()}>
                      <DownloadCloud />
                      Fill from TMDB
                    </Button>
                  ) : null}
                  {disabled ? null : (
                    <Button
                      variant="ghost"
                      className="text-destructive"
                      loading={remove.isPending}
                      onClick={() => void askRemove()}
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  )}
                </div>
              )}
              <Pair original={title.name} label="Name">
                {(id) => (
                  <Input
                    id={id}
                    dir={direction}
                    lang={language}
                    maxLength={200}
                    disabled={disabled}
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                )}
              </Pair>
              <Pair original={title.tagline} label="Tagline">
                {(id) => (
                  <Input
                    id={id}
                    dir={direction}
                    lang={language}
                    maxLength={300}
                    disabled={disabled}
                    value={form.tagline}
                    onChange={(event) => setForm({ ...form, tagline: event.target.value })}
                  />
                )}
              </Pair>
              <Pair original={title.synopsis} label="Synopsis" long>
                {(id) => (
                  <Textarea
                    id={id}
                    dir={direction}
                    lang={language}
                    rows={5}
                    maxLength={4000}
                    disabled={disabled}
                    value={form.synopsis}
                    onChange={(event) => setForm({ ...form, synopsis: event.target.value })}
                  />
                )}
              </Pair>
            </CardContent>
          </Card>

          {title.seasons.map((season) => {
            const ofSeason = partOf(form.seasons, season.id);
            const done = season.episodes.filter(
              (episode) => partOf(form.episodes, episode.id).name.trim() !== '',
            ).length;
            return (
              <details
                key={season.id}
                className="group rounded-xl border bg-card"
                open={title.seasons.length === 1}
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      Season {season.number}
                      {season.name ? ` · ${season.name}` : ''}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {done} of {season.episodes.length} episode names translated
                    </span>
                  </span>
                  <Progress
                    className="hidden w-32 sm:block"
                    percent={
                      season.episodes.length === 0 ? 0 : (done / season.episodes.length) * 100
                    }
                  />
                </summary>
                <div className="grid gap-5 border-t px-5 py-5">
                  <Pair original={season.name} label="Name of the season">
                    {(id) => (
                      <Input
                        id={id}
                        dir={direction}
                        lang={language}
                        maxLength={200}
                        disabled={disabled}
                        value={ofSeason.name}
                        onChange={(event) =>
                          setPart('seasons', season.id, 'name', event.target.value)
                        }
                      />
                    )}
                  </Pair>
                  <Pair original={season.synopsis} label="Synopsis of the season" long>
                    {(id) => (
                      <Textarea
                        id={id}
                        dir={direction}
                        lang={language}
                        rows={3}
                        maxLength={4000}
                        disabled={disabled}
                        value={ofSeason.synopsis}
                        onChange={(event) =>
                          setPart('seasons', season.id, 'synopsis', event.target.value)
                        }
                      />
                    )}
                  </Pair>
                  {season.episodes.map((episode) => {
                    const ofEpisode = partOf(form.episodes, episode.id);
                    return (
                      <fieldset key={episode.id} className="grid gap-3 border-t pt-5">
                        <legend className="sr-only">Episode {episode.number}</legend>
                        <Pair original={episode.name} label={`Episode ${episode.number}`}>
                          {(id) => (
                            <Input
                              id={id}
                              dir={direction}
                              lang={language}
                              maxLength={200}
                              disabled={disabled}
                              value={ofEpisode.name}
                              onChange={(event) =>
                                setPart('episodes', episode.id, 'name', event.target.value)
                              }
                            />
                          )}
                        </Pair>
                        <Pair
                          original={episode.synopsis}
                          label={`Synopsis of episode ${episode.number}`}
                          quiet
                          long
                        >
                          {(id) => (
                            <Textarea
                              id={id}
                              dir={direction}
                              lang={language}
                              rows={2}
                              maxLength={4000}
                              disabled={disabled}
                              value={ofEpisode.synopsis}
                              onChange={(event) =>
                                setPart('episodes', episode.id, 'synopsis', event.target.value)
                              }
                            />
                          )}
                        </Pair>
                      </fieldset>
                    );
                  })}
                </div>
              </details>
            );
          })}

          {!disabled && (dirty || save.error) ? (
            <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-popover/95 px-4 py-3 shadow-lg backdrop-blur-md">
              <div className="mr-auto min-w-0">
                <p className="text-sm font-medium">
                  {current
                    ? `Unsaved changes in ${languageName(language)}`
                    : `${languageName(language)} is not saved yet`}
                </p>
                {save.error ? (
                  <p className="text-sm text-destructive">{save.error.message}</p>
                ) : null}
              </div>
              <Button
                disabled={save.isPending}
                onClick={() => {
                  save.reset();
                  if (current) {
                    setForm(savedForm);
                  } else {
                    setLanguage(null);
                  }
                }}
              >
                Discard
              </Button>
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
                Save {languageName(language)}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <AddLanguageDialog
        open={adding}
        taken={languages}
        onClose={() => setAdding(false)}
        onPick={async (tag) => {
          setAdding(false);
          if (await leave()) {
            setLanguage(tag);
          }
        }}
      />
    </div>
  );
}

interface PairProps {
  label: string;
  /** The text in the language of the catalog. */
  original: string | null;
  /** A long text: the original is not cut to one line. */
  long?: boolean;
  /** The label is for screen readers only, when the field before it says what this is. */
  quiet?: boolean;
  children: (id: string) => ReactNode;
}

/** One text in two languages: the catalog's own on the left to read, the other on the right to write. */
function Pair({ label, original, long, quiet, children }: PairProps) {
  const id = useId();
  return (
    <div className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor={id} className={cn('block text-[13px] font-medium', quiet && 'sr-only')}>
          {label}
        </label>
        <p
          className={cn(
            'text-sm text-muted-foreground',
            long ? 'line-clamp-6 whitespace-pre-line' : 'truncate',
            !original && 'italic',
          )}
        >
          {original || 'Empty in the catalog'}
        </p>
      </div>
      <div className={cn('min-w-0', !quiet && 'sm:pt-[1.375rem]')}>{children(id)}</div>
    </div>
  );
}

interface AddLanguageDialogProps {
  open: boolean;
  /** Languages the title has already. */
  taken: readonly string[];
  /** What to say when a typed language is taken. */
  takenMessage?: string;
  onClose: () => void;
  onPick: (language: string) => void;
}

/** Chooses the language to add: one in use elsewhere, a common one, or any tag. */
export function AddLanguageDialog({
  open,
  taken,
  takenMessage = 'The title has this language already.',
  onClose,
  onPick,
}: AddLanguageDialogProps) {
  const used = useQuery({
    queryKey: ['translations', 'languages'],
    queryFn: ({ signal }) => translationsApi.languages(signal),
    enabled: open,
  });
  const [choice, setChoice] = useState('');
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) {
      setChoice('');
      setTyped('');
    }
  }, [open]);

  const inUse = (used.data ?? []).filter((item) => !taken.includes(item.language));
  const options = [
    ...inUse.map((item) => ({
      value: item.language,
      label: languageName(item.language),
      description: `Used by ${item.titles} ${item.titles === 1 ? 'title' : 'titles'}`,
    })),
    ...COMMON_LANGUAGES.filter(
      (tag) => !taken.includes(tag) && !inUse.some((item) => item.language === tag),
    )
      .map((tag) => ({ value: tag as string, label: languageName(tag), description: tag }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    { value: 'other', label: 'Another language', description: 'Type its tag' },
  ];
  const tag = choice === 'other' ? normalizeLanguage(typed) : choice || null;
  const problem =
    choice === 'other' && typed.trim() && !tag
      ? 'Write a tag such as "sr", "pt-BR" or "zh-Hant".'
      : tag && taken.includes(tag)
        ? takenMessage
        : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title="Add a language"
        description="Languages your catalog uses already come first."
        size="sm"
      >
        <DialogBody>
          <Field label="Language">
            {(id) => (
              <Select
                id={id}
                value={choice}
                placeholder="Choose a language"
                onValueChange={setChoice}
                options={options}
              />
            )}
          </Field>
          {choice === 'other' ? (
            <Field
              label="Language tag"
              hint={
                tag ? languageName(tag) : 'Two or three letters, with a country when it matters.'
              }
            >
              {(id) => (
                <Input
                  id={id}
                  autoFocus
                  className="font-mono"
                  placeholder="sr"
                  maxLength={12}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                />
              )}
            </Field>
          ) : null}
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!tag || problem !== null}
            onClick={() => tag && onPick(tag)}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
