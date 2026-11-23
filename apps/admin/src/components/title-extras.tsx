// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ExternalLink, Film, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { extrasApi } from '@/api/endpoints';
import type { Asset, Extra, ExtraKind, TitleDetail } from '@/api/types';
import { EXTRA_KIND_LABELS, moved } from '@/lib/catalog';
import { formatDuration } from '@/lib/format';
import { AssetPicker } from './asset-picker';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, StatusBadge } from './ui/display';
import { Input, Select } from './ui/form';

const KIND_OPTIONS = (Object.keys(EXTRA_KIND_LABELS) as ExtraKind[]).map((value) => ({
  value,
  label: EXTRA_KIND_LABELS[value],
}));

/** A guess at what a video is from its name in the library. */
export function guessKind(name: string): ExtraKind {
  const text = name.toLowerCase();
  if (text.includes('teaser')) {
    return 'TEASER';
  }
  if (/behind|making|bts/.test(text)) {
    return 'BEHIND_THE_SCENES';
  }
  if (text.includes('interview')) {
    return 'INTERVIEW';
  }
  if (/blooper|outtake|gag reel/.test(text)) {
    return 'BLOOPERS';
  }
  if (text.includes('featurette')) {
    return 'FEATURETTE';
  }
  if (/clip|scene/.test(text)) {
    return 'CLIP';
  }
  return 'TRAILER';
}

interface TitleExtrasProps {
  title: TitleDetail;
  disabled: boolean;
  /** Receives the extras as the server holds them after a change. */
  onChange: (extras: Extra[]) => void;
}

/** The videos around a title: further trailers, clips, a look behind the scenes. */
export function TitleExtras({ title, disabled, onChange }: TitleExtrasProps) {
  const [picking, setPicking] = useState(false);
  const extras = title.extras;
  const onError = (error: Error) => toast.error(error.message);

  const add = useMutation({
    mutationFn: (asset: Asset) =>
      extrasApi.add(title.id, {
        kind: guessKind(asset.title),
        name: asset.title.slice(0, 200),
        assetId: asset.id,
      }),
    onSuccess: (next) => {
      onChange(next);
      toast.success('Video added to the extras');
    },
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; kind?: ExtraKind; name?: string }) =>
      extrasApi.update(id, body),
    onSuccess: onChange,
    onError,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => extrasApi.reorder(title.id, ids),
    onSuccess: onChange,
    onError,
  });
  const remove = useMutation({
    mutationFn: (extra: Extra) => extrasApi.remove(extra.id),
    onSuccess: (_nothing, extra) => {
      onChange(extras.filter((item) => item.id !== extra.id));
      toast.success('Taken out of the extras. The video stays in the library.');
    },
    onError,
  });
  const busy = add.isPending || reorder.isPending || remove.isPending;

  return (
    <Card>
      <CardHeader
        title={`Extras${extras.length > 0 ? ` (${extras.length})` : ''}`}
        description="More videos shown on the title's page: further trailers, clips, a look behind the scenes. Free to watch, like the trailer."
        actions={
          disabled ? null : (
            <Button loading={add.isPending} onClick={() => setPicking(true)}>
              <Plus />
              Add video
            </Button>
          )
        }
      />
      <CardContent>
        {extras.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
            <Film className="size-4" aria-hidden="true" />
            No extras yet. Upload the videos to the library first, then add them here.
          </p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {extras.map((extra, index) => (
              <li key={extra.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
                  <Select
                    aria-label={`Kind of ${extra.name}`}
                    disabled={disabled}
                    value={extra.kind}
                    options={KIND_OPTIONS}
                    onValueChange={(kind) =>
                      update.mutate({ id: extra.id, kind: kind as ExtraKind })
                    }
                  />
                  <ExtraName
                    extra={extra}
                    disabled={disabled}
                    onSave={(name) => update.mutate({ id: extra.id, name })}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {extra.asset ? (
                    <>
                      {extra.asset.playable ? (
                        <span className="tabular-nums">
                          {formatDuration(extra.asset.durationMs)}
                        </span>
                      ) : (
                        <StatusBadge status={extra.asset.status} />
                      )}
                      <Link
                        to={`/assets/${extra.asset.id}`}
                        aria-label={`Open the video of ${extra.name} in the library`}
                        className="hover:text-foreground"
                      >
                        <ExternalLink className="size-4" aria-hidden="true" />
                      </Link>
                    </>
                  ) : (
                    <span className="text-destructive">Video deleted</span>
                  )}
                </div>
                {disabled ? null : (
                  <div className="flex shrink-0 items-center">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${extra.name} up`}
                      disabled={index === 0 || busy}
                      onClick={() =>
                        reorder.mutate(moved(extras, index, -1).map((item) => item.id))
                      }
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${extra.name} down`}
                      disabled={index === extras.length - 1 || busy}
                      onClick={() => reorder.mutate(moved(extras, index, 1).map((item) => item.id))}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${extra.name}`}
                      disabled={busy}
                      onClick={() => remove.mutate(extra)}
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
      <AssetPicker
        open={picking}
        onOpenChange={setPicking}
        title={`Choose a video for the extras of "${title.name}"`}
        onPick={(asset) => {
          setPicking(false);
          add.mutate(asset);
        }}
      />
    </Card>
  );
}

interface ExtraNameProps {
  extra: Extra;
  disabled: boolean;
  onSave: (name: string) => void;
}

/** The name of an extra, saved when the field is left or Enter is pressed. */
function ExtraName({ extra, disabled, onSave }: ExtraNameProps) {
  const [name, setName] = useState(extra.name);
  useEffect(() => setName(extra.name), [extra.name]);
  const commit = () => {
    const next = name.trim();
    if (!next) {
      setName(extra.name);
    } else if (next !== extra.name) {
      onSave(next);
    }
  };
  return (
    <Input
      aria-label={`Name of the extra ${extra.name}`}
      maxLength={200}
      disabled={disabled}
      value={name}
      onChange={(event) => setName(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
