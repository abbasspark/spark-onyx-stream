// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Info } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { titlesApi } from '@/api/endpoints';
import type { TitleDetail } from '@/api/types';
import { Button } from '@/components/ui/button';
import { ErrorNote, Skeleton } from '@/components/ui/display';
import { Checkbox, Field, Input, Label, Select } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import {
  copyName,
  type DuplicateParts,
  effectiveParts,
  PRESETS,
  type PresetKey,
  partRows,
  presetOf,
  type SeasonMode,
  seasonOptions,
} from '@/lib/duplicate';

interface DuplicateTitleDialogProps {
  /** The title to copy. Null: the dialog is closed. */
  titleId: string | null;
  onClose: () => void;
  onDone: (copy: TitleDetail) => void;
}

/**
 * Makes a copy of a title. Shows what the title has, lets the admin choose
 * what comes along, and says what a copy always is: a draft that shares its
 * videos and pictures with the original.
 */
export function DuplicateTitleDialog({ titleId, onClose, onDone }: DuplicateTitleDialogProps) {
  const [name, setName] = useState('');
  const [parts, setParts] = useState<DuplicateParts>(PRESETS.start.parts);
  const baseId = useId();

  const source = useQuery({
    queryKey: ['titles', 'detail', titleId],
    queryFn: ({ signal }) => titlesApi.get(titleId as string, signal),
    enabled: titleId !== null,
  });
  const title = source.data ?? null;

  const duplicate = useMutation({
    mutationFn: () =>
      titlesApi.duplicate(titleId as string, {
        name: name.trim(),
        parts: effectiveParts(title as TitleDetail, parts),
      }),
    onSuccess: (result) => onDone(result.title),
  });

  useEffect(() => {
    if (titleId) {
      duplicate.reset();
      setParts(PRESETS.start.parts);
      setName('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleId]);
  useEffect(() => {
    if (title && title.id === titleId) {
      setName(copyName(title.name));
    }
  }, [title, titleId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (title && name.trim()) {
      duplicate.mutate();
    }
  };

  const preset = presetOf(parts);
  const rows = title ? partRows(title) : [];
  const withSeasons = title?.type === 'SERIES' && title.seasons.length > 0;

  return (
    <Dialog open={titleId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="md"
        title={title ? `Duplicate ${title.name}` : 'Duplicate'}
        description="The copy is a draft with a name and an address of its own. Nothing changes on the original."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <ErrorNote error={source.error} />
            {source.isPending && titleId ? <Skeleton className="h-64 rounded-lg" /> : null}

            {title ? (
              <>
                <Field label="Name of the copy">
                  {(id) => (
                    <Input
                      id={id}
                      autoFocus
                      required
                      maxLength={200}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      onFocus={(event) => event.target.select()}
                    />
                  )}
                </Field>

                <div className="grid gap-2">
                  <p className="text-sm font-medium">What comes along</p>
                  <div
                    role="radiogroup"
                    aria-label="Ready-made choices"
                    className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                  >
                    {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={preset === key}
                        onClick={() => setParts(PRESETS[key].parts)}
                        className={cn(
                          'grid content-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          preset === key
                            ? 'border-primary/50 bg-primary/[0.06] ring-1 ring-primary/30'
                            : 'hover:bg-accent',
                        )}
                      >
                        <span className="text-sm font-medium">{PRESETS[key].label}</span>
                        <span className="text-xs text-muted-foreground">{PRESETS[key].hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <ul className="divide-y rounded-lg border">
                  <li className="flex items-start gap-3 px-3.5 py-2.5">
                    <Checkbox checked disabled aria-label="Texts and facts" className="mt-0.5" />
                    <div className="grid gap-0.5">
                      <p className="text-sm font-medium">Texts and facts</p>
                      <p className="text-xs text-muted-foreground">
                        Always: the synopsis, tagline, year, runtime, age rating, countries, studios
                        and rating.
                      </p>
                    </div>
                  </li>
                  {rows.map((row) => {
                    const id = `${baseId}-${row.key}`;
                    return (
                      <li key={row.key} className="flex items-start gap-3 px-3.5 py-2.5">
                        <Checkbox
                          id={id}
                          className="mt-0.5"
                          disabled={!row.available}
                          checked={row.available && parts[row.key]}
                          onCheckedChange={(checked) =>
                            setParts({ ...parts, [row.key]: checked === true })
                          }
                        />
                        <div className="grid min-w-0 gap-0.5">
                          <Label
                            htmlFor={id}
                            className={cn(!row.available && 'text-muted-foreground')}
                          >
                            {row.label}
                          </Label>
                          <p className="text-xs text-muted-foreground">{row.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {withSeasons ? (
                  <Field label="Seasons and episodes">
                    {(id) => (
                      <Select
                        id={id}
                        value={parts.seasons}
                        onValueChange={(value) =>
                          setParts({ ...parts, seasons: value as SeasonMode })
                        }
                        options={seasonOptions(title)}
                      />
                    )}
                  </Field>
                ) : null}

                <p className="flex items-start gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-xs text-muted-foreground">
                  <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  What viewers did with the original stays with it: plays, progress, purchases and
                  lists. So does its place on the arranged pages.
                </p>
                <ErrorNote error={duplicate.error} />
              </>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={duplicate.isPending}
              disabled={!title || name.trim() === ''}
            >
              <Copy />
              Duplicate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
