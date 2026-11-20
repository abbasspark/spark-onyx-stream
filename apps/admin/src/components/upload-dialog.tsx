// SPDX-License-Identifier: AGPL-3.0-only
import { FileVideo, UploadCloud, X } from 'lucide-react';
import { type DragEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProcessingMode } from '@/api/types';
import { cn } from '@/lib/cn';
import { formatBytes, titleFromFileName } from '@/lib/format';
import { useUploads } from '@/uploads/uploads';
import { Button } from './ui/button';
import { Field, Input, Select, ToggleRow } from './ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from './ui/overlay';

const MODE_OPTIONS = [
  {
    value: 'AUTO',
    label: 'Automatic',
    description: 'Copy when the file allows it, otherwise transcode.',
  },
  {
    value: 'COPY',
    label: 'Copy without re-encoding',
    description: 'Fast. Keeps the source quality as the only quality.',
  },
  {
    value: 'TRANSCODE',
    label: 'Transcode into all qualities',
    description: 'Slower. Players can switch quality.',
  },
];

/** Keeps video files and drops everything else, such as folders or pictures dragged along. */
export function videoFilesOf(list: FileList | null | undefined): File[] {
  return [...(list ?? [])].filter(
    (file) =>
      file.type.startsWith('video/') ||
      /\.(mkv|mov|ts|m2ts|webm|mp4|avi|flv|wmv|mpg|mpeg)$/i.test(file.name),
  );
}

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Files to start with, for example dropped onto the page. */
  initialFiles?: File[];
}

/** Chooses files and options, then hands them to the upload manager. */
export function UploadDialog({ open, onOpenChange, initialFiles }: UploadDialogProps) {
  const { start } = useUploads();
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [encrypt, setEncrypt] = useState(false);
  const [mode, setMode] = useState('AUTO');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) {
      setFiles(initialFiles ?? []);
      setTitle('');
    }
  }, [open, initialFiles]);

  const add = (added: File[]) => {
    if (added.length === 0) {
      toast.error('Those files are not videos');
      return;
    }
    // The same file chosen twice is kept once.
    setFiles((current) => [
      ...current,
      ...added.filter(
        (file) =>
          !current.some((existing) => existing.name === file.name && existing.size === file.size),
      ),
    ]);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    add(videoFilesOf(event.dataTransfer.files));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    for (const file of files) {
      start(file, {
        // A typed title only makes sense for a single file.
        title: (files.length === 1 && title.trim()) || titleFromFileName(file.name),
        encryption: encrypt ? 'AES_128' : 'NONE',
        processingMode: mode === 'AUTO' ? undefined : (mode as ProcessingMode),
      });
    }
    toast.success(files.length === 1 ? 'Upload started' : `${files.length} uploads started`, {
      description: 'You can keep working. Progress is shown in the corner.',
    });
    onOpenChange(false);
  };

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Upload videos"
        description="Each file becomes its own video in the library."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <button
              type="button"
              onClick={() => picker.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors hover:border-primary/60 hover:bg-accent/40',
                dragging && 'border-primary bg-primary/5',
              )}
            >
              <UploadCloud className="size-8 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium">Drop video files here or click to choose</span>
              <span className="text-xs text-muted-foreground">
                MP4, MKV, MOV, WebM and more. Uploads resume after a lost connection.
              </span>
            </button>
            <input
              ref={picker}
              type="file"
              accept="video/*,.mkv,.mov,.ts,.m2ts,.webm"
              multiple
              hidden
              onChange={(event) => {
                add(videoFilesOf(event.target.files));
                event.target.value = '';
              }}
            />

            {files.length > 0 ? (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  {files.length} {files.length === 1 ? 'file' : 'files'}, {formatBytes(totalBytes)}
                </p>
                <ul className="max-h-44 divide-y overflow-y-auto rounded-lg border">
                  {files.map((file) => (
                    <li
                      key={`${file.name}-${file.size}`}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <FileVideo
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatBytes(file.size)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${file.name}`}
                        onClick={() =>
                          setFiles((current) => current.filter((item) => item !== file))
                        }
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {files.length === 1 ? (
              <Field label="Title" hint="Taken from the file name when left empty.">
                {(id) => (
                  <Input
                    id={id}
                    maxLength={200}
                    placeholder={titleFromFileName(files[0]?.name ?? '')}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                )}
              </Field>
            ) : null}

            <Field label="Processing">
              {(id) => (
                <Select id={id} value={mode} onValueChange={setMode} options={MODE_OPTIONS} />
              )}
            </Field>
            <ToggleRow
              label="Encrypt segments (AES-128)"
              description="Protects stored and downloaded files from being played elsewhere."
              checked={encrypt}
              onCheckedChange={setEncrypt}
            />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={files.length === 0}>
              <UploadCloud />
              {files.length > 1 ? `Upload ${files.length} files` : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
