// SPDX-License-Identifier: AGPL-3.0-only
import { ExternalLink, Film, Replace, Unlink } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { AssetRef, TitleDetail, UpdateTitleInput } from '@/api/types';
import { formatDuration } from '@/lib/format';
import { AssetPicker } from './asset-picker';
import { ImageField } from './image-field';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, StatusBadge } from './ui/display';

interface VideoSlotProps {
  label: string;
  hint: string;
  asset: AssetRef | null;
  disabled?: boolean;
  /** Text of the dialog that chooses the video. */
  pickerTitle: string;
  onChange: (assetId: string | null) => Promise<unknown>;
}

/** One video of a title or an episode: what is attached, with buttons to choose or detach. */
export function VideoSlot({ label, hint, asset, disabled, pickerTitle, onChange }: VideoSlotProps) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const apply = async (assetId: string | null, done: string) => {
    setBusy(true);
    try {
      await onChange(assetId);
      toast.success(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The video could not be changed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {asset ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Film className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <Link
              to={`/assets/${asset.id}`}
              className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium hover:underline"
            >
              <span className="truncate">{asset.title}</span>
              <ExternalLink
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
            <p className="text-xs text-muted-foreground">
              {formatDuration(asset.durationMs)}
              {asset.height ? ` · ${asset.height}p` : ''}
            </p>
          </div>
          <StatusBadge status={asset.status} />
          {!disabled ? (
            <div className="flex gap-1.5">
              <Button size="sm" disabled={busy} onClick={() => setPicking(true)}>
                <Replace />
                Change
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void apply(null, `${label} detached`)}
              >
                <Unlink />
                Detach
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
          <p className="text-sm text-muted-foreground">No video attached.</p>
          {!disabled ? (
            <Button size="sm" loading={busy} onClick={() => setPicking(true)}>
              <Film />
              Choose from the library
            </Button>
          ) : null}
        </div>
      )}
      <AssetPicker
        open={picking}
        onOpenChange={setPicking}
        title={pickerTitle}
        currentId={asset?.id}
        onPick={(picked) => void apply(picked.id, `${label} attached`)}
      />
    </div>
  );
}

interface TitleMediaProps {
  title: TitleDetail;
  disabled: boolean;
  save: (changes: UpdateTitleInput) => Promise<unknown>;
}

/** The videos and the artwork of a title. Every change is saved at once. */
export function TitleMedia({ title, disabled, save }: TitleMediaProps) {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="Videos"
          description={
            title.type === 'MOVIE'
              ? 'The movie itself and, if you have one, a trailer.'
              : 'A series gets its videos per episode. Here you can attach a trailer.'
          }
        />
        <CardContent className="grid gap-5">
          {title.type === 'MOVIE' ? (
            <VideoSlot
              label="Main video"
              hint="What viewers watch. It must be ready before the title can be published."
              pickerTitle={`Choose the video for "${title.name}"`}
              asset={title.asset}
              disabled={disabled}
              onChange={(assetId) => save({ assetId })}
            />
          ) : null}
          <VideoSlot
            label="Trailer"
            hint="Optional. A short preview shown on the title's page."
            pickerTitle={`Choose the trailer for "${title.name}"`}
            asset={title.trailerAsset}
            disabled={disabled}
            onChange={(trailerAssetId) => save({ trailerAssetId })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Artwork"
          description="JPEG, PNG or WebP, up to 10 MB each. Drop a picture onto a field or choose a file."
        />
        <CardContent className="grid gap-6 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
          <ImageField
            label="Poster"
            hint="Upright, 2:3. For example 1000×1500."
            kind="POSTER"
            aspect="aspect-[2/3]"
            image={title.poster}
            disabled={disabled}
            onChange={(image) => save({ posterId: image?.id ?? null })}
          />
          <div className="grid content-start gap-6">
            <ImageField
              label="Backdrop"
              hint="Wide, 16:9, without text. For example 1920×1080."
              kind="BACKDROP"
              aspect="aspect-video"
              image={title.backdrop}
              disabled={disabled}
              onChange={(image) => save({ backdropId: image?.id ?? null })}
            />
            <ImageField
              label="Logo"
              hint="The title's lettering on a transparent background, as PNG or WebP."
              kind="LOGO"
              aspect="aspect-[4/1] max-w-sm"
              fit="contain"
              image={title.logo}
              disabled={disabled}
              onChange={(image) => save({ logoId: image?.id ?? null })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
