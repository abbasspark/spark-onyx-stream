// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  FileAudio,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { type DragEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { audioTracksApi } from '@/api/endpoints';
import type { Asset, AssetMedia, AudioTrack } from '@/api/types';
import { useConfirm } from '@/components/confirm';
import {
  AUDIO_ACCEPT,
  describeAudioCodec,
  describeChannels,
  describeOrigin,
  isAudioFile,
  languageFromFileName,
  MAX_AUDIO_BYTES,
} from '@/lib/audio-tracks';
import { cn } from '@/lib/cn';
import { formatBitrate, formatBytes } from '@/lib/format';
import { isRightToLeft, languageName } from '@/lib/translations';
import { LanguageSelect } from './asset-subtitles';
import { Button } from './ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  ErrorNote,
  Progress,
  Skeleton,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
} from './ui/display';
import { Field, Input, ToggleRow } from './ui/form';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from './ui/overlay';

const UNKNOWN = 'und';

const nameOf = (language: string) =>
  language === UNKNOWN ? 'Language not known' : languageName(language);
const labelOf = (track: AudioTrack) => track.label ?? nameOf(track.language);

/** A language named in itself, as the player lists a track nobody named: "Deutsch" for "de". */
function ownName(language: string): string {
  try {
    const name = new Intl.DisplayNames([language], { type: 'language' }).of(language);
    return name ? name.charAt(0).toLocaleUpperCase(language) + name.slice(1) : language;
  } catch {
    return language;
  }
}

interface AudioTabProps {
  asset: Asset;
  media: { isPending: boolean; isError: boolean; error: unknown; data?: AssetMedia };
  mayWrite: boolean;
}

/**
 * The sound of a video: the languages and versions players offer, and the
 * place to add another as a file, such as a dubbed version.
 */
export function AudioTab({ asset, media, mayWrite }: AudioTabProps) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<AudioTrack | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['asset-media', asset.id] });
  const settle = {
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => void refresh(),
  };
  const remove = useMutation({
    mutationFn: (track: AudioTrack) => audioTracksApi.remove(asset.id, track.id),
    onSuccess: (_, track) => toast.success(`"${labelOf(track)}" was removed`),
    ...settle,
  });
  const makeDefault = useMutation({
    mutationFn: (track: AudioTrack) =>
      audioTracksApi.update(asset.id, track.id, { isDefault: true }),
    onSuccess: (track) => toast.success(`Players now start with "${labelOf(track)}"`),
    ...settle,
  });
  const retry = useMutation({
    mutationFn: (track: AudioTrack) => audioTracksApi.retry(asset.id, track.id),
    ...settle,
  });

  const choose = (chosen: readonly File[]) => {
    const taken = chosen.filter((file) => isAudioFile(file.name));
    if (taken.length < chosen.length) {
      toast.message(
        taken.length === 0
          ? 'These are not sound files. Use MP3, M4A, WAV, FLAC or similar'
          : `${chosen.length - taken.length} of the files are not sound files and were left out`,
      );
    }
    if (taken.length > 0) {
      setFiles(taken);
    }
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (mayWrite && ready) {
      choose([...event.dataTransfer.files]);
    }
  };
  const askRemove = async (track: AudioTrack) => {
    const confirmed = await confirm({
      title: `Remove the sound track "${labelOf(track)}"?`,
      description:
        track.source === 'EMBEDDED'
          ? 'Players stop offering it. It is part of the video file, so it comes back when the video is processed again.'
          : 'Players stop offering it, and the file you added is deleted.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(track);
    }
  };

  if (media.isPending) {
    return <Skeleton className="h-40 rounded-xl" />;
  }
  if (media.isError || !media.data) {
    return <ErrorNote error={media.error} />;
  }
  const tracks = media.data.audio ?? [];
  const ready = asset.status === 'READY';
  const offered = tracks.filter((track) => track.status === 'READY');

  const picker =
    mayWrite && ready ? (
      <>
        <input
          ref={input}
          type="file"
          multiple
          accept={AUDIO_ACCEPT}
          className="hidden"
          onChange={(event) => {
            choose([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
        <Button variant="secondary" onClick={() => input.current?.click()}>
          <Plus />
          Add a language
        </Button>
      </>
    ) : null;

  return (
    <>
      <Card
        className={cn('overflow-hidden transition-shadow', dragging && 'ring-2 ring-primary')}
        onDragOver={(event) => {
          if (mayWrite && ready && event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <CardHeader
          title="Sound"
          description={
            offered.length > 1
              ? `${offered.length} tracks. Viewers choose between them in the player, and a profile can say which language it likes.`
              : 'The languages and versions viewers choose between in the player.'
          }
          actions={picker}
        />

        {tracks.length === 0 ? (
          <CardContent>
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <AudioLines className="size-5" aria-hidden="true" />
              </span>
              <div className="grid gap-1">
                <p className="text-sm font-medium">
                  {ready ? 'This video has no sound' : 'Nothing to show yet'}
                </p>
                <p className="max-w-md text-sm text-muted-foreground">
                  {ready
                    ? 'Its file brought none. You can add sound as a file: the picture is not processed again.'
                    : 'The sound of the file is listed here once the video is processed.'}
                </p>
              </div>
            </div>
          </CardContent>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name in the player</Th>
                <Th>Language</Th>
                <Th>Sound</Th>
                <Th>Origin</Th>
                <Th className="text-right">Size</Th>
                <Th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <Tr key={track.id}>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="font-medium"
                        dir={isRightToLeft(track.language) ? 'rtl' : undefined}
                      >
                        {labelOf(track)}
                      </span>
                      {track.isDefault ? (
                        <Tooltip content="Players start with this track when the viewer has no preference">
                          <Badge tone="primary">Default</Badge>
                        </Tooltip>
                      ) : null}
                      {track.status === 'PROCESSING' ? (
                        <Badge tone="warning" dot="live">
                          Being made
                        </Badge>
                      ) : null}
                      {track.status === 'FAILED' ? <Badge tone="danger">Failed</Badge> : null}
                    </span>
                    {track.status === 'FAILED' && track.error ? (
                      <p className="mt-1 max-w-md text-xs text-destructive">{track.error}</p>
                    ) : null}
                    {track.fileName ? (
                      <p
                        className="mt-0.5 max-w-xs truncate font-mono text-xs text-muted-foreground"
                        title={track.fileName}
                      >
                        {track.fileName}
                      </p>
                    ) : null}
                  </Td>
                  <Td>
                    {track.language === UNKNOWN ? (
                      <span className="flex items-center gap-1.5 text-warning">
                        <AlertTriangle className="size-3.5" aria-hidden="true" />
                        Not known
                      </span>
                    ) : (
                      <>
                        {languageName(track.language)}{' '}
                        <code className="font-mono text-xs text-muted-foreground">
                          {track.language}
                        </code>
                      </>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">
                    {track.status === 'READY'
                      ? [
                          describeAudioCodec(track.codec),
                          describeChannels(track.channels),
                          track.bitrate > 0 ? formatBitrate(track.bitrate) : null,
                        ]
                          .filter((part) => part && part !== '–')
                          .join(', ')
                      : '–'}
                  </Td>
                  <Td className="text-muted-foreground">{describeOrigin(track)}</Td>
                  <Td className="text-right whitespace-nowrap text-muted-foreground tabular-nums">
                    {track.inVideo ? (
                      <Tooltip content="Part of the video segments, and counted with the qualities">
                        <span>With the video</span>
                      </Tooltip>
                    ) : Number(track.sizeBytes) > 0 ? (
                      formatBytes(track.sizeBytes)
                    ) : (
                      '–'
                    )}
                  </Td>
                  <Td>
                    {mayWrite ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${labelOf(track)}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(track)}>
                            <Pencil />
                            Rename or change
                          </DropdownMenuItem>
                          {track.status === 'READY' && !track.isDefault ? (
                            <DropdownMenuItem onSelect={() => makeDefault.mutate(track)}>
                              <Star />
                              Make it the default
                            </DropdownMenuItem>
                          ) : null}
                          {track.status === 'FAILED' ? (
                            <DropdownMenuItem onSelect={() => retry.mutate(track)}>
                              <RefreshCw />
                              Try again
                            </DropdownMenuItem>
                          ) : null}
                          {track.inVideo ? null : (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem destructive onSelect={() => void askRemove(track)}>
                                <Trash2 />
                                Remove
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {tracks.some((track) => track.language === UNKNOWN && track.status === 'READY') ? (
          <p className="flex items-start gap-2 border-t bg-warning/5 px-6 py-3 text-xs text-warning">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />A track without
            a language cannot be chosen for a viewer by the language they like. Say what it is under
            "Rename or change".
          </p>
        ) : null}
        {mayWrite && ready ? (
          <p className="border-t px-6 py-3 text-xs text-muted-foreground">
            Drop a sound file anywhere on this card to add a language: MP3, M4A, WAV, FLAC, or a
            video file whose sound is taken. A file named like{' '}
            <code className="font-mono">film.de.m4a</code> brings its language with it. The picture
            is not processed again.
          </p>
        ) : null}
        {mayWrite && !ready && asset.status === 'PROCESSING' ? (
          <p className="border-t px-6 py-3 text-xs text-muted-foreground">
            Sound can be added once the video is processed.
          </p>
        ) : null}
      </Card>

      {files.length > 0 ? (
        <AddDialog
          asset={asset}
          files={files}
          onClose={() => {
            setFiles([]);
            void refresh();
          }}
          onAdded={() => void refresh()}
        />
      ) : null}
      {editing ? (
        <EditDialog
          asset={asset}
          track={editing}
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

interface Row {
  file: File;
  language: string;
  label: string;
  state: 'waiting' | 'sending' | 'done' | 'failed';
  /** From 0 to 1 while the file is sent. */
  sent: number;
  message: string | null;
}

function toRow(file: File): Row {
  const tooLarge = file.size > MAX_AUDIO_BYTES;
  return {
    file,
    language: languageFromFileName(file.name) ?? '',
    label: '',
    state: tooLarge ? 'failed' : 'waiting',
    sent: 0,
    message: tooLarge ? 'Larger than 4 GB, which is the most the server takes' : null,
  };
}

/** Asks what language each chosen file is, then sends them one after the other. */
function AddDialog({
  asset,
  files,
  onClose,
  onAdded,
}: {
  asset: Asset;
  files: File[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => files.map(toRow));
  const [busy, setBusy] = useState(false);
  const stop = useRef<AbortController | null>(null);
  // Leaving the dialog stops what is still on its way.
  useEffect(() => () => stop.current?.abort(), []);
  const patch = (index: number, change: Partial<Row>) =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...change } : row)));

  const open = rows.filter((row) => row.state === 'waiting' || row.state === 'failed');
  const sendable = open.filter((row) => row.language !== '' && row.file.size <= MAX_AUDIO_BYTES);
  const done = rows.filter((row) => row.state === 'done').length;
  const finished = open.length === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    stop.current = new AbortController();
    for (const [index, row] of rows.entries()) {
      if (row.state === 'done' || row.language === '' || row.file.size > MAX_AUDIO_BYTES) {
        continue;
      }
      if (stop.current.signal.aborted) {
        break;
      }
      patch(index, { state: 'sending', sent: 0, message: null });
      try {
        await audioTracksApi.add(
          asset.id,
          row.file,
          { filename: row.file.name, language: row.language, label: row.label.trim() },
          {
            signal: stop.current.signal,
            onProgress: (sent) => patch(index, { sent }),
          },
        );
        patch(index, {
          state: 'done',
          sent: 1,
          message: 'Received. It is being made into a track now and shows in the list.',
        });
        onAdded();
      } catch (error) {
        const stopped = error instanceof DOMException && error.name === 'AbortError';
        patch(index, {
          state: stopped ? 'waiting' : 'failed',
          sent: 0,
          message: stopped
            ? 'Stopped'
            : error instanceof Error
              ? error.message
              : 'The file could not be added',
        });
      }
    }
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={(next) => (next || busy ? undefined : onClose())}>
      <DialogContent
        size="lg"
        title={`Add sound to "${asset.title}"`}
        description="Say which language each file is in. The sound is encoded in the background and offered by the player when that is done. The picture is not processed again."
      >
        <form onSubmit={(event) => void submit(event)} className="contents">
          <DialogBody>
            <ul className="grid gap-3">
              {rows.map((row, index) => {
                const locked = busy || row.state === 'done';
                return (
                  <li
                    key={`${row.file.name}-${index}`}
                    className={cn(
                      'grid gap-3 rounded-lg border p-3',
                      row.state === 'done' && 'border-success/40 bg-success/5',
                      row.state === 'failed' && 'border-destructive/40',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        {row.state === 'sending' ? (
                          <Spinner label="Sending" />
                        ) : row.state === 'done' ? (
                          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                        ) : (
                          <FileAudio className="size-4" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[13px]" title={row.file.name}>
                          {row.file.name}
                        </p>
                        <p
                          className={cn(
                            'text-xs',
                            row.state === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {row.message ?? formatBytes(row.file.size)}
                        </p>
                        {row.state === 'sending' ? (
                          <Progress
                            className="mt-2"
                            value={Math.round(row.sent * 100)}
                            label={`Sending ${row.file.name}`}
                          />
                        ) : null}
                      </div>
                      {!locked && rows.length > 1 ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Leave out ${row.file.name}`}
                          onClick={() =>
                            setRows((current) => current.filter((_, at) => at !== index))
                          }
                        >
                          <X />
                        </Button>
                      ) : null}
                    </div>
                    {row.state !== 'done' ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Language">
                          {(id) => (
                            <LanguageSelect
                              id={id}
                              value={row.language}
                              disabled={locked}
                              onChange={(language) => patch(index, { language })}
                            />
                          )}
                        </Field>
                        <Field label="Name in the player" hint="Empty: the language in itself.">
                          {(id) => (
                            <Input
                              id={id}
                              maxLength={80}
                              disabled={locked}
                              dir={isRightToLeft(row.language) ? 'rtl' : undefined}
                              placeholder={
                                row.language && row.language !== UNKNOWN
                                  ? ownName(row.language)
                                  : 'Such as "Director\'s commentary"'
                              }
                              value={row.label}
                              onChange={(event) => patch(index, { label: event.target.value })}
                            />
                          )}
                        </Field>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </DialogBody>
          <DialogFooter>
            {done > 0 ? (
              <p className="mr-auto text-sm text-muted-foreground">
                {done} of {rows.length} received
              </p>
            ) : null}
            {busy ? (
              <Button onClick={() => stop.current?.abort()}>Stop</Button>
            ) : (
              <Button onClick={onClose}>{finished || done > 0 ? 'Close' : 'Cancel'}</Button>
            )}
            {!finished ? (
              <Button
                type="submit"
                variant="primary"
                loading={busy}
                disabled={sendable.length === 0 || sendable.length < open.length}
              >
                <Upload />
                {done > 0
                  ? 'Try the rest again'
                  : `Add ${open.length === 1 ? 'the file' : `${open.length} files`}`}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  asset,
  track,
  onClose,
  onSaved,
}: {
  asset: Asset;
  track: AudioTrack;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [language, setLanguage] = useState(track.language);
  const [label, setLabel] = useState(track.label ?? '');
  const [isDefault, setIsDefault] = useState(track.isDefault);
  const save = useMutation({
    mutationFn: () =>
      audioTracksApi.update(asset.id, track.id, {
        ...(language !== track.language ? { language } : {}),
        ...(label.trim() !== (track.label ?? '') ? { label: label.trim() } : {}),
        ...(isDefault && !track.isDefault ? { isDefault: true as const } : {}),
      }),
    onSuccess: () => {
      toast.success('Sound track changed');
      onSaved();
    },
  });
  const dirty =
    language !== track.language ||
    label.trim() !== (track.label ?? '') ||
    (isDefault && !track.isDefault);

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        size="sm"
        title="Change the sound track"
        description="What the player calls the track, and which language it is. The sound itself stays."
      >
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <DialogBody>
            <Field label="Name in the player">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoFocus
                  maxLength={80}
                  dir={isRightToLeft(language) ? 'rtl' : undefined}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              )}
            </Field>
            <Field
              label="Language"
              hint="Players use it to start with the language a viewer's profile likes."
            >
              {(id) => <LanguageSelect id={id} value={language} onChange={setLanguage} />}
            </Field>
            {track.status === 'READY' ? (
              <ToggleRow
                label="Default"
                description={
                  track.isDefault
                    ? 'Players start with this track. To change that, make another track the default.'
                    : 'Players start with this track when the viewer has no preference.'
                }
                checked={isDefault}
                disabled={track.isDefault}
                onCheckedChange={setIsDefault}
              />
            ) : null}
            {track.source === 'EMBEDDED' ? (
              <p className="text-xs text-muted-foreground">
                What you say here is kept when the video is processed again.
              </p>
            ) : null}
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={!dirty || !label.trim() || language === ''}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
