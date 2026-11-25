// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation } from '@tanstack/react-query';
import { Film, Link2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { adsApi } from '@/api/endpoints';
import { ApiError } from '@/api/client';
import type { AdSource, AdSourceInput, AdSourceKind } from '@/api/types';
import { AssetPicker } from '@/components/asset-picker';
import { Button } from '@/components/ui/button';
import { Field, Input, ToggleRow } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import { isWebAddress, parseWhole } from '@/lib/ads';

interface AdSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The source to change. Without one, a new source is made. */
  source: AdSource | null;
  onSaved: (source: AdSource, created: boolean) => void;
}

const KINDS: { kind: AdSourceKind; label: string; hint: string; icon: typeof Film }[] = [
  {
    kind: 'VAST_TAG',
    label: 'Ad network',
    hint: 'A VAST tag from your ad server or network. The ad is fetched fresh for every break.',
    icon: Link2,
  },
  {
    kind: 'HOUSE',
    label: 'Your own video',
    hint: 'A video from your library, such as a trailer or a sponsor spot, with a link to click.',
    icon: Film,
  },
];

/** The form of an ad source: where its ads come from and how often it is chosen. */
export function AdSourceDialog({ open, onOpenChange, source, onSaved }: AdSourceDialogProps) {
  const [kind, setKind] = useState<AdSourceKind>('VAST_TAG');
  const [name, setName] = useState('');
  const [vastUrl, setVastUrl] = useState('');
  const [asset, setAsset] = useState<{ id: string; title: string } | null>(null);
  const [clickUrl, setClickUrl] = useState('');
  const [skipAfter, setSkipAfter] = useState('');
  const [weight, setWeight] = useState('1');
  const [isActive, setActive] = useState(true);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKind(source?.kind ?? 'VAST_TAG');
      setName(source?.name ?? '');
      setVastUrl(source?.vastUrl ?? '');
      setAsset(source?.asset ?? null);
      setClickUrl(source?.clickUrl ?? '');
      setSkipAfter(
        source?.skipAfterSeconds === null || !source ? '' : String(source.skipAfterSeconds),
      );
      setWeight(String(source?.weight ?? 1));
      setActive(source?.isActive ?? true);
      setProblem(null);
    }
  }, [open, source]);

  const save = useMutation({
    mutationFn: (input: AdSourceInput) => {
      if (!source) {
        return adsApi.createSource(input);
      }
      // The kind of a source stays as it was made. Only its fields change.
      const { kind: _kind, ...fields } = input;
      return adsApi.updateSource(source.id, fields);
    },
    onSuccess: (saved) => onSaved(saved, source === null),
    onError: (error) =>
      setProblem(
        error instanceof ApiError && error.issues.length > 0
          ? error.issues.map((issue) => issue.message).join('. ')
          : error.message,
      ),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const share = parseWhole(weight, 1, 100);
    if (share === null || share === 'invalid') {
      setProblem('Weight is a whole number from 1 to 100.');
      return;
    }
    const base = { name: name.trim(), weight: share, isActive };
    if (kind === 'VAST_TAG') {
      if (!isWebAddress(vastUrl)) {
        setProblem('The VAST tag must be a web address starting with https://.');
        return;
      }
      setProblem(null);
      save.mutate({ kind, ...base, vastUrl: vastUrl.trim() });
      return;
    }
    if (!asset) {
      setProblem('Choose the video that is played as the ad.');
      return;
    }
    if (clickUrl.trim() !== '' && !isWebAddress(clickUrl)) {
      setProblem('The link must be a web address starting with https://.');
      return;
    }
    const skip = parseWhole(skipAfter, 0, 60);
    if (skip === 'invalid') {
      setProblem('Skip after is a number of seconds from 0 to 60, or empty.');
      return;
    }
    setProblem(null);
    save.mutate({
      kind,
      ...base,
      assetId: asset.id,
      clickUrl: clickUrl.trim() || null,
      skipAfterSeconds: skip,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title={source ? `Edit ${source.name}` : 'New ad source'}
          description="Where ads come from. Each break picks one of the active sources, more often the higher its weight."
          size="lg"
        >
          <form onSubmit={submit} className="contents">
            <DialogBody>
              {source ? null : (
                <div
                  role="radiogroup"
                  aria-label="Kind of source"
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {KINDS.map((item) => (
                    <button
                      key={item.kind}
                      type="button"
                      role="radio"
                      aria-checked={kind === item.kind}
                      onClick={() => setKind(item.kind)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                        kind === item.kind && 'border-primary bg-primary/5 ring-1 ring-primary',
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <item.icon className="size-4 text-muted-foreground" aria-hidden="true" />
                        {item.label}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{item.hint}</span>
                    </button>
                  ))}
                </div>
              )}

              <Field label="Name" hint="Only you see it, in lists and in the report.">
                {(id) => (
                  <Input
                    id={id}
                    required
                    autoFocus
                    maxLength={120}
                    placeholder={kind === 'VAST_TAG' ? 'Main network' : 'Sponsor spot, spring'}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                )}
              </Field>

              {kind === 'VAST_TAG' ? (
                <Field
                  label="VAST tag"
                  hint="Wrapper chains are followed on the server. The address never reaches viewers."
                >
                  {(id) => (
                    <Input
                      id={id}
                      required
                      type="url"
                      inputMode="url"
                      className="font-mono text-[13px]"
                      placeholder="https://ads.example.com/vast?zone=1&w=[WIDTH]&h=[HEIGHT]"
                      value={vastUrl}
                      onChange={(event) => setVastUrl(event.target.value)}
                    />
                  )}
                </Field>
              ) : (
                <>
                  <Field label="Video" hint="It must be ready in the library.">
                    {() => (
                      <div className="flex items-center gap-3 rounded-lg border p-3">
                        <Film
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {asset ? asset.title : 'No video chosen'}
                        </span>
                        <Button type="button" size="sm" onClick={() => setPicking(true)}>
                          {asset ? 'Change' : 'Choose'}
                        </Button>
                      </div>
                    )}
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                    <Field
                      label="Link for “Visit advertiser”"
                      hint="Empty: the ad cannot be clicked."
                    >
                      {(id) => (
                        <Input
                          id={id}
                          type="url"
                          inputMode="url"
                          placeholder="https://sponsor.example.com"
                          value={clickUrl}
                          onChange={(event) => setClickUrl(event.target.value)}
                        />
                      )}
                    </Field>
                    <Field label="Skip after (s)" hint="Empty: cannot be skipped.">
                      {(id) => (
                        <Input
                          id={id}
                          inputMode="numeric"
                          placeholder="5"
                          value={skipAfter}
                          onChange={(event) => setSkipAfter(event.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                </>
              )}

              <Field
                label="Weight"
                hint="A source of weight 3 is chosen three times as often as one of weight 1."
              >
                {(id) => (
                  <Input
                    id={id}
                    className="sm:max-w-32"
                    inputMode="numeric"
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                  />
                )}
              </Field>
              <ToggleRow
                label="Use this source"
                description="Off, no break takes an ad from it. Its figures stay in the report."
                checked={isActive}
                onCheckedChange={setActive}
              />
              {problem ? (
                <p role="alert" className="text-sm text-destructive">
                  {problem}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={save.isPending}>
                {source ? 'Save' : 'Add source'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AssetPicker
        open={picking}
        onOpenChange={setPicking}
        title="Video for the ad"
        currentId={asset?.id}
        onPick={(picked) => {
          setAsset({ id: picked.id, title: picked.title });
          setPicking(false);
        }}
      />
    </>
  );
}
