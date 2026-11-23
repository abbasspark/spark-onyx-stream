// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Wand2,
} from 'lucide-react';
import { type DragEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { brandingApi, imagesApi } from '@/api/endpoints';
import type { Branding, CatalogImage } from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { SitePreview } from '@/components/site-preview';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, ErrorNote, PageHeader, Skeleton } from '@/components/ui/display';
import { Field, Input, Label, Switch, Textarea } from '@/components/ui/form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/ui/overlay';
import {
  ACCENT_PRESETS,
  type BrandingDraft,
  deepen,
  draftOf,
  iconProblem,
  isCustomized,
  isDirty,
  judgeAccent,
  MAX_FOOTER_LINKS,
  moved,
  problemsOf,
  settingsOf,
} from '@/lib/branding';
import { cn } from '@/lib/cn';

const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

/** The width and height of a picture file, read in the browser before it is sent. */
function sizeOf(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The file is not a picture a browser can show'));
    };
    image.src = url;
  });
}

/** How the website presents itself: its name, logo, colour and footer. */
export function BrandingPage() {
  const { can } = useSession();
  const mayWrite = can('settings:write');
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const branding = useQuery({
    queryKey: ['branding'],
    queryFn: ({ signal }) => brandingApi.get(signal),
  });
  const saved = branding.data ?? null;

  const [draft, setDraft] = useState<BrandingDraft | null>(null);
  /** Pictures by id: those that are saved and those uploaded since. */
  const [pictures, setPictures] = useState<Record<string, CatalogImage>>({});

  const adopt = (view: Branding) => {
    setDraft(draftOf(view.settings));
    setPictures((current) => ({
      ...current,
      ...(view.logo ? { [view.logo.id]: view.logo } : {}),
      ...(view.icon ? { [view.icon.id]: view.icon } : {}),
    }));
  };
  // The form starts from what is saved, once, when it has loaded.
  useEffect(() => {
    if (saved && draft === null) {
      adopt(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const save = useMutation({
    mutationFn: (current: BrandingDraft) => brandingApi.save(settingsOf(current)),
    onSuccess: (view) => {
      // Pictures the site no longer shows are of no use to anything.
      for (const old of [saved?.settings.logoId, saved?.settings.iconId]) {
        if (old && old !== view.settings.logoId && old !== view.settings.iconId) {
          void imagesApi.remove(old).catch(() => undefined);
        }
      }
      queryClient.setQueryData(['branding'], view);
      adopt(view);
      toast.success('Branding saved', {
        description: 'The website shows it within about a minute.',
      });
    },
  });

  const reset = useMutation({
    mutationFn: () => brandingApi.reset(),
    onSuccess: (view) => {
      for (const old of [saved?.settings.logoId, saved?.settings.iconId]) {
        if (old) {
          void imagesApi.remove(old).catch(() => undefined);
        }
      }
      queryClient.setQueryData(['branding'], view);
      adopt(view);
      toast.success('The site looks as it ships again');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const askReset = async () => {
    const confirmed = await confirm({
      title: 'Put everything back as it ships?',
      description:
        'The name from the installation, the built-in mark, the amber accent and an empty footer. The logo and the icon are deleted.',
      confirmLabel: 'Reset',
      destructive: true,
    });
    if (confirmed) {
      reset.mutate();
    }
  };

  if (branding.isPending || !saved || !draft) {
    return (
      <>
        <PageHeader
          title="Branding"
          description="The name, logo, colour and footer of your site."
        />
        <ErrorNote error={branding.error} className="mb-4" />
        {branding.isPending ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <Skeleton className="h-[36rem] rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        ) : null}
      </>
    );
  }

  const set = (change: Partial<BrandingDraft>) => setDraft({ ...draft, ...change });
  const dirty = isDirty(draft, saved.settings);
  const problems = problemsOf(draft, saved.minimumContrast);
  const verdict = judgeAccent(draft.accent, saved.minimumContrast);
  const accent =
    verdict.state === 'good' || verdict.state === 'dark' ? verdict.color : saved.defaults.accent;
  const logo = draft.logoId ? (pictures[draft.logoId] ?? null) : null;
  const icon = draft.iconId ? (pictures[draft.iconId] ?? null) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!problems.any && dirty) {
      save.mutate(draft);
    }
  };

  return (
    <form onSubmit={submit}>
      <PageHeader
        title="Branding"
        description="The name, logo, colour and footer of your site. Viewers see them on every page, and the name signs your emails."
        actions={
          mayWrite && isCustomized(saved.settings) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem destructive onSelect={() => void askReset()}>
                  <RotateCcw />
                  Put everything back as it ships
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Card>
            <CardHeader title="Name" description="What the site is called, and what it is." />
            <div className="grid gap-4 px-5 pt-4 pb-5">
              <Field
                label="Name of the site"
                hint="In the header, the browser tab, link previews and emails."
              >
                {(id) => (
                  <Input
                    id={id}
                    maxLength={60}
                    disabled={!mayWrite}
                    placeholder={saved.defaults.name}
                    value={draft.name}
                    onChange={(event) => set({ name: event.target.value })}
                  />
                )}
              </Field>
              <Field
                label="In one sentence"
                hint="For search engines and for the preview when someone shares a link to the site."
              >
                {(id) => (
                  <Textarea
                    id={id}
                    rows={2}
                    maxLength={200}
                    disabled={!mayWrite}
                    placeholder={saved.defaults.description}
                    value={draft.description}
                    onChange={(event) => set({ description: event.target.value })}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Logo and icon"
              description="Without a logo, the site shows its built-in mark next to the name."
            />
            <div className="grid gap-5 px-5 pt-4 pb-5">
              <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <PictureField
                  label="Logo"
                  hint="Wide, on a transparent background, light enough for a black page. PNG or WebP, about 600 pixels wide."
                  picture={logo}
                  shape="wide"
                  disabled={!mayWrite}
                  onPicked={(picture) => {
                    setPictures((current) => ({ ...current, [picture.id]: picture }));
                    set({ logoId: picture.id });
                  }}
                  onRemoved={() => set({ logoId: null })}
                />
                <PictureField
                  label="Icon"
                  hint="Square PNG, 512 by 512. For the browser tab and home screens."
                  picture={icon}
                  shape="square"
                  disabled={!mayWrite}
                  check={iconProblem}
                  onPicked={(picture) => {
                    setPictures((current) => ({ ...current, [picture.id]: picture }));
                    set({ iconId: picture.id });
                  }}
                  onRemoved={() => set({ iconId: null })}
                />
              </div>
              <div className="flex items-start gap-3">
                <Switch
                  id="logo-shows-name"
                  className="mt-0.5"
                  checked={draft.logoShowsName}
                  disabled={!mayWrite || !draft.logoId}
                  onCheckedChange={(checked) => set({ logoShowsName: checked })}
                />
                <div className="grid gap-0.5">
                  <Label htmlFor="logo-shows-name">Write the name next to the logo</Label>
                  <p className="text-xs text-muted-foreground">
                    Leave it off when the logo already spells the name.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Colour"
              description="The one colour of the interface: what can be played, links, progress and focus. Everything else is black, white and the artwork."
            />
            <div className="grid gap-4 px-5 pt-4 pb-5">
              <div
                role="radiogroup"
                aria-label="Ready-made colours"
                className="flex flex-wrap items-center gap-2"
              >
                {ACCENT_PRESETS.map((preset) => {
                  const chosen =
                    accent === preset.color &&
                    (draft.accent !== '' || preset.color === saved.defaults.accent);
                  return (
                    <Tooltip key={preset.color} content={preset.name}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        aria-label={preset.name}
                        disabled={!mayWrite}
                        onClick={() =>
                          set({
                            accent: preset.color === saved.defaults.accent ? '' : preset.color,
                          })
                        }
                        className={cn(
                          'flex size-8 items-center justify-center rounded-full text-black ring-offset-2 ring-offset-card outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          chosen && 'ring-2 ring-foreground/70',
                        )}
                        style={{ background: preset.color }}
                      >
                        {chosen ? <Check className="size-4" /> : null}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <Field label="Your own" className="w-44">
                  {(id) => (
                    <Input
                      id={id}
                      className="font-mono"
                      maxLength={7}
                      disabled={!mayWrite}
                      placeholder={saved.defaults.accent}
                      value={draft.accent}
                      onChange={(event) => set({ accent: event.target.value })}
                    />
                  )}
                </Field>
                <input
                  type="color"
                  aria-label="Pick a colour"
                  disabled={!mayWrite}
                  value={accent}
                  onChange={(event) => set({ accent: event.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
                />
                {verdict.state === 'dark' && mayWrite ? (
                  <Button onClick={() => set({ accent: verdict.suggestion })}>
                    <Wand2 />
                    Lighten it until it can be read
                    <span
                      className="size-3.5 rounded-full border border-white/20"
                      style={{ background: verdict.suggestion }}
                      aria-hidden="true"
                    />
                  </Button>
                ) : null}
              </div>

              {problems.accent ? (
                <p className="-mt-2 text-xs text-destructive">{problems.accent}</p>
              ) : null}

              <ContrastMeter
                contrast={
                  verdict.state === 'good' || verdict.state === 'dark' ? verdict.contrast : null
                }
                minimum={saved.minimumContrast}
                color={accent}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Footer"
              description="A line of your own and links at the bottom of every page: who runs the site, the imprint, the privacy notice."
            />
            <div className="grid gap-4 px-5 pt-4 pb-5">
              <Field
                label="Line of text"
                hint="A copyright or the name of the company, for instance."
              >
                {(id) => (
                  <Textarea
                    id={id}
                    rows={2}
                    maxLength={300}
                    disabled={!mayWrite}
                    placeholder="© 2026 Your company"
                    value={draft.footerText}
                    onChange={(event) => set({ footerText: event.target.value })}
                  />
                )}
              </Field>

              <div className="grid gap-2">
                <p className="text-sm font-medium">Links</p>
                {draft.footerLinks.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
                    None yet. A link can lead to a page of this site (/imprint), to another site
                    (https://…) or to an email address (mailto:…).
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {draft.footerLinks.map((link, index) => {
                      const update = (change: Partial<typeof link>) =>
                        set({
                          footerLinks: draft.footerLinks.map((entry, at) =>
                            at === index ? { ...entry, ...change } : entry,
                          ),
                        });
                      const problem = problems.links[index];
                      return (
                        // Rows have no identity but their place while they are typed.
                        <li key={index} className="grid gap-1.5">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]">
                            <Input
                              aria-label={`Label of link ${index + 1}`}
                              maxLength={40}
                              disabled={!mayWrite}
                              placeholder="Imprint"
                              value={link.label}
                              onChange={(event) => update({ label: event.target.value })}
                            />
                            <Input
                              aria-label={`Address of link ${index + 1}`}
                              className="max-sm:col-start-1 max-sm:row-start-2"
                              maxLength={500}
                              disabled={!mayWrite}
                              placeholder="/imprint"
                              aria-invalid={problem ? true : undefined}
                              value={link.url}
                              onChange={(event) => update({ url: event.target.value })}
                            />
                            {mayWrite ? (
                              <div className="flex items-center max-sm:row-span-2 max-sm:flex-col">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Move link ${index + 1} up`}
                                  disabled={index === 0}
                                  onClick={() =>
                                    set({ footerLinks: moved(draft.footerLinks, index, -1) })
                                  }
                                >
                                  <ArrowUp />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Move link ${index + 1} down`}
                                  disabled={index === draft.footerLinks.length - 1}
                                  onClick={() =>
                                    set({ footerLinks: moved(draft.footerLinks, index, 1) })
                                  }
                                >
                                  <ArrowDown />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Remove link ${index + 1}`}
                                  onClick={() =>
                                    set({
                                      footerLinks: draft.footerLinks.filter(
                                        (_, at) => at !== index,
                                      ),
                                    })
                                  }
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {mayWrite ? (
                  <div>
                    <Button
                      size="sm"
                      disabled={draft.footerLinks.length >= MAX_FOOTER_LINKS}
                      onClick={() =>
                        set({ footerLinks: [...draft.footerLinks, { label: '', url: '' }] })
                      }
                    >
                      <Plus />
                      Add a link
                    </Button>
                    {draft.footerLinks.length >= MAX_FOOTER_LINKS ? (
                      <span className="ml-3 text-xs text-muted-foreground">
                        The footer holds {MAX_FOOTER_LINKS} links.
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <ErrorNote error={save.error} />
        </div>

        <aside className="grid gap-3 lg:sticky lg:top-20" aria-label="Preview">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">Preview</h2>
            <p className="text-xs text-muted-foreground">
              {dirty ? 'With what you changed, not saved yet' : 'As the site is now'}
            </p>
          </div>
          <SitePreview
            name={draft.name.trim() || saved.defaults.name}
            logoUrl={logo ? apiUrl(logo.url) : null}
            logoShowsName={draft.logoShowsName}
            iconUrl={icon ? apiUrl(icon.url) : null}
            accent={accent}
            accentDeep={deepen(accent)}
            footerText={draft.footerText.trim()}
            footerLinks={settingsOf(draft).footerLinks}
          />
          <p className="text-xs text-muted-foreground">
            A sketch of the site, not the site itself: it shows where the name, the logo and the
            colour go.
          </p>
        </aside>
      </div>

      {mayWrite && dirty ? (
        <footer className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <p className="text-sm text-muted-foreground">
            {problems.any
              ? 'Something above needs a look before this can be saved.'
              : 'You have changes that are not saved.'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              disabled={save.isPending}
              onClick={() => {
                save.reset();
                setDraft(draftOf(saved.settings));
              }}
            >
              Discard
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={problems.any}
            >
              Save branding
            </Button>
          </div>
        </footer>
      ) : null}
    </form>
  );
}

/** How well the colour can be read against black, as a bar with the line it has to cross. */
function ContrastMeter({
  contrast,
  minimum,
  color,
}: {
  contrast: number | null;
  minimum: number;
  color: string;
}) {
  // The scale runs from 1 to 21, the two ends of what contrast can be.
  const at = (value: number) => `${((Math.min(value, 21) - 1) / 20) * 100}%`;
  const passes = contrast === null || contrast >= minimum;
  return (
    <div className="grid gap-2 rounded-lg border px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium">Readable on the black page</p>
        <p className="text-sm tabular-nums">
          {contrast === null ? (
            <span className="text-muted-foreground">The colour the site ships with</span>
          ) : (
            <>
              <span className={cn('font-medium', !passes && 'text-destructive')}>
                {contrast.toFixed(1)} to 1
              </span>
              <span className="text-muted-foreground">, needs {minimum} to 1</span>
            </>
          )}
        </p>
      </div>
      <div className="relative h-2 rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', passes ? 'bg-success' : 'bg-destructive')}
          style={{
            width: contrast === null ? '100%' : at(contrast),
            opacity: contrast === null ? 0.35 : 1,
          }}
        />
        <span
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground/70"
          style={{ left: at(minimum) }}
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span
          className="rounded-sm px-2.5 py-1 font-bold"
          style={{ background: color, color: '#000000' }}
        >
          Play
        </span>
        <span className="rounded-sm bg-black px-2.5 py-1 font-medium" style={{ color }}>
          A link on black
        </span>
        {passes ? (
          <span>Both have to be easy to read: the same two colours, either way round.</span>
        ) : (
          <span className="flex items-center gap-1.5 text-destructive">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            Too dark: neither can be read comfortably.
          </span>
        )}
      </div>
    </div>
  );
}

interface PictureFieldProps {
  label: string;
  hint: string;
  picture: CatalogImage | null;
  shape: 'wide' | 'square';
  disabled: boolean;
  /** Says what is wrong with a file before it is sent. */
  check?: (file: File, size: { width: number; height: number }) => string | null;
  onPicked: (picture: CatalogImage) => void;
  onRemoved: () => void;
}

/**
 * One picture of the branding, shown on black as the site will show it. A
 * file is uploaded when chosen and becomes part of the form; the site
 * changes when the form is saved.
 */
function PictureField({
  label,
  hint,
  picture,
  shape,
  disabled,
  check,
  onPicked,
  onRemoved,
}: PictureFieldProps) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Use a PNG, WebP or JPEG picture');
      return;
    }
    if (file.size > MAX_PICTURE_BYTES) {
      toast.error('The picture is larger than 10 MB');
      return;
    }
    setBusy(true);
    try {
      const problem = check?.(file, await sizeOf(file));
      if (problem) {
        toast.error(problem);
        return;
      }
      onPicked(await imagesApi.upload('LOGO', file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The picture could not be uploaded');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) {
      void upload(event.dataTransfer.files[0]);
    }
  };

  return (
    <div className="grid content-start gap-2">
      <p className="text-sm font-medium">{label}</p>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(!disabled);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-lg border bg-black',
          shape === 'wide' ? 'h-28 px-6' : 'h-28 w-28',
          dragging && 'ring-2 ring-primary',
        )}
      >
        {picture ? (
          <img
            src={apiUrl(picture.url)}
            alt={`The ${label.toLowerCase()} of the site`}
            className={cn(
              'object-contain',
              shape === 'wide' ? 'max-h-14 max-w-full' : 'size-16 rounded-xl',
            )}
          />
        ) : (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => picker.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-1.5 text-xs text-white/60 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
          >
            <ImagePlus className="size-5" aria-hidden="true" />
            {shape === 'wide' ? 'Choose a file or drop it here' : 'Choose'}
          </button>
        )}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/70">
            <Loader2 className="size-5 animate-spin text-white" aria-label="Uploading" />
          </span>
        ) : null}
      </div>
      {picture && !disabled ? (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => picker.current?.click()}>
            Replace
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onRemoved}>
            Remove
          </Button>
          {shape === 'wide' ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {picture.width} × {picture.height}
            </span>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{hint}</p>
      <input
        ref={picker}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}
