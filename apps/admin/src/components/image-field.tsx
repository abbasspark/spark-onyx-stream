// SPDX-License-Identifier: AGPL-3.0-only
import { ImagePlus, Loader2, Replace, Trash2 } from 'lucide-react';
import { type DragEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { imagesApi } from '@/api/endpoints';
import type { CatalogImage, ImageKind } from '@/api/types';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { Button } from './ui/button';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

interface ImageFieldProps {
  label: string;
  /** What the picture is for and which shape works best. */
  hint: string;
  kind: ImageKind;
  image: CatalogImage | null;
  /** Shape of the preview, as a Tailwind aspect class. */
  aspect: string;
  /** "contain" shows the whole picture, for artwork with a transparent background. */
  fit?: 'cover' | 'contain';
  disabled?: boolean;
  /** Called with the new picture, or null when it was removed. Saves the change. */
  onChange: (image: CatalogImage | null) => Promise<unknown>;
}

/**
 * Shows one picture of a title and lets the admin set, replace or remove it,
 * by choosing a file or dropping one onto the field.
 */
export function ImageField({
  label,
  hint,
  kind,
  image,
  aspect,
  fit = 'cover',
  disabled,
  onChange,
}: ImageFieldProps) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!ACCEPTED.includes(file.type)) {
      toast.error('Use a JPEG, PNG or WebP picture');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`The picture is larger than ${formatBytes(MAX_BYTES)}`);
      return;
    }

    setBusy(true);
    const previous = image;
    try {
      const uploaded = await imagesApi.upload(kind, file);
      await onChange(uploaded);
      toast.success(`${label} saved`);
      // The picture that was replaced is no longer used by anything.
      if (previous) {
        void imagesApi.remove(previous.id).catch(() => undefined);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The picture could not be saved');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!image) {
      return;
    }
    setBusy(true);
    try {
      await onChange(null);
      void imagesApi.remove(image.id).catch(() => undefined);
      toast.success(`${label} removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The picture could not be removed');
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
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div
        className={cn(
          'group relative overflow-hidden rounded-lg border bg-muted/40',
          aspect,
          !image && 'border-dashed',
          dragging && 'border-primary bg-primary/5',
        )}
        onDragOver={(event) => {
          if (!disabled) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {image ? (
          <img
            src={apiUrl(image.url)}
            alt={label}
            className={cn(
              'size-full',
              fit === 'contain' ? 'bg-zinc-800 object-contain p-3' : 'object-cover',
            )}
          />
        ) : (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => picker.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none"
          >
            <ImagePlus className="size-6" aria-hidden="true" />
            <span className="text-xs font-medium">
              {disabled ? 'No picture' : 'Choose or drop a picture'}
            </span>
          </button>
        )}

        {image && !disabled ? (
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-linear-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <Button size="sm" disabled={busy} onClick={() => picker.current?.click()}>
              <Replace />
              Replace
            </Button>
            <Button
              size="icon-sm"
              disabled={busy}
              aria-label={`Remove the ${label.toLowerCase()}`}
              onClick={() => void remove()}
            >
              <Trash2 />
            </Button>
          </div>
        ) : null}

        {busy ? (
          <div
            className="absolute inset-0 flex items-center justify-center bg-background/70"
            role="status"
          >
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">Saving the picture</span>
          </div>
        ) : null}
      </div>
      {image ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          {image.width}×{image.height} · {formatBytes(image.bytes)}
        </p>
      ) : null}
      <input
        ref={picker}
        type="file"
        accept={ACCEPTED.join(',')}
        hidden
        onChange={(event) => {
          void upload(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}
