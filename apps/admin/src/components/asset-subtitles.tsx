// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Captions,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { subtitlesApi } from '@/api/endpoints';
import type { Asset, AssetMedia, SubtitleTrack } from '@/api/types';
import { useConfirm } from '@/components/confirm';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import {
  cueClock,
  defaultSubtitleLabel,
  isSubtitleFile,
  MAX_SUBTITLE_BYTES,
  parseSubtitleName,
  parseVtt,
  SUBTITLE_ACCEPT,
  SUBTITLE_ENCODINGS,
} from '@/lib/subtitles';
import {
  COMMON_LANGUAGES,
  isRightToLeft,
  languageName,
  normalizeLanguage,
} from '@/lib/translations';
import { Button } from './ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  ErrorNote,
  Skeleton,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
} from './ui/display';
import { Checkbox, Field, Input, Select, ToggleRow } from './ui/form';
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
} from './ui/overlay';

const UNKNOWN = 'und';
const OTHER = 'other';
const AUTOMATIC = 'auto';

const SOURCES: Record<SubtitleTrack['source'], string> = {
  EMBEDDED: 'From the video file',
  UPLOADED: 'Added as a file',
  GENERATED: 'Generated',
};

const nameOf = (language: string) =>
  language === UNKNOWN ? 'Language not known' : languageName(language);

/** A choice of language: the common ones, "not known", or a tag that is typed. */
function LanguageSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  /** A tag, "und", or empty while nothing is chosen. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const listed =
    value === '' || value === UNKNOWN || (COMMON_LANGUAGES as readonly string[]).includes(value);
  const [typing, setTyping] = useState(!listed);
  const [typed, setTyped] = useState(listed ? '' : value);
  const options = useMemo(
    () => [
      ...COMMON_LANGUAGES.map((tag) => ({
        value: tag,
        label: languageName(tag),
        description: tag,
      })),
      { value: UNKNOWN, label: 'Not known', description: 'The player lists it by its name only' },
      { value: OTHER, label: 'Another language…', description: 'Type its tag' },
    ],
    [],
  );
  return (
    <div className="grid gap-2">
      <Select
        id={id}
        value={typing ? OTHER : value}
        placeholder="Choose a language"
        disabled={disabled}
        options={options}
        onValueChange={(next) => {
          setTyping(next === OTHER);
          onChange(next === OTHER ? (normalizeLanguage(typed) ?? '') : next);
        }}
      />
      {typing ? (
        <Input
          aria-label="Language tag"
          placeholder='A tag such as "pt-BR"'
          maxLength={20}
          disabled={disabled}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            onChange(normalizeLanguage(event.target.value) ?? '');
          }}
        />
      ) : null}
    </div>
  );
}

interface SubtitlesTabProps {
  asset: Asset;
  media: { isPending: boolean; isError: boolean; error: unknown; data?: AssetMedia };
  mayWrite: boolean;
}

/** The subtitle tracks players offer for a video, and the place to add more as files. */
export function SubtitlesTab({ asset, media, mayWrite }: SubtitlesTabProps) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<SubtitleTrack | null>(null);
  const [reading, setReading] = useState<SubtitleTrack | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['asset-media', asset.id] });
  const remove = useMutation({
    mutationFn: (track: SubtitleTrack) => subtitlesApi.remove(asset.id, track.id),
    onSuccess: () => {
      toast.success('Subtitles removed');
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const choose = (chosen: readonly File[]) => {
    const taken = chosen.filter((file) => isSubtitleFile(file.name));
    if (taken.length < chosen.length) {
      toast.message(
        taken.length === 0
          ? 'These are not subtitle files. Use .srt, .vtt, .ass or .ssa'
          : `${chosen.length - taken.length} of the files are not subtitle files and were left out`,
      );
    }
    if (taken.length > 0) {
      setFiles(taken);
    }
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (mayWrite) {
      choose([...event.dataTransfer.files]);
    }
  };
  const save = async (track: SubtitleTrack) => {
    try {
      const text = await subtitlesApi.file(asset.id, track.id);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
      link.download = `${asset.title || 'subtitles'}.${track.language}.vtt`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The file could not be read');
    }
  };
  const askRemove = async (track: SubtitleTrack) => {
    const confirmed = await confirm({
      title: `Remove the subtitles "${track.label ?? nameOf(track.language)}"?`,
      description:
        track.source === 'EMBEDDED'
          ? 'Players stop offering them. They are part of the video file, so they come back when the video is processed again.'
          : 'Players stop offering them and the file is deleted.',
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
  const tracks = media.data.subtitles;
  const ready = asset.status === 'READY';

  const picker = mayWrite ? (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={SUBTITLE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          choose([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      <Button
        variant={tracks.length === 0 ? 'primary' : 'secondary'}
        onClick={() => input.current?.click()}
      >
        <Plus />
        Add subtitle files
      </Button>
    </>
  ) : null;

  return (
    <>
      <Card
        className={cn('overflow-hidden transition-shadow', dragging && 'ring-2 ring-primary')}
        onDragOver={(event) => {
          if (mayWrite && event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <CardHeader
          title="Subtitles"
          description={
            tracks.length === 0
              ? 'Viewers choose them in the player.'
              : `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}, in the order the player lists them.`
          }
          actions={tracks.length > 0 ? picker : null}
        />
        {!ready && tracks.some((track) => track.source === 'UPLOADED') ? (
          <p className="border-b bg-muted/40 px-6 py-2.5 text-sm text-muted-foreground">
            The video is not ready to play yet. The files you added are offered once it is.
          </p>
        ) : null}

        {tracks.length === 0 ? (
          <CardContent>
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Captions className="size-5" aria-hidden="true" />
              </span>
              <div className="grid gap-1">
                <p className="text-sm font-medium">This video has no subtitles</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Text subtitles inside a video file are taken over when it is processed.
                  {mayWrite
                    ? ' You can add more as files: drop .srt, .vtt or .ass files here, one per language.'
                    : ''}
                </p>
              </div>
              {picker}
            </div>
          </CardContent>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name in the player</Th>
                <Th>Language</Th>
                <Th>Origin</Th>
                <Th className="w-10" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <Tr key={track.id}>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => setReading(track)}
                      >
                        {track.label ?? nameOf(track.language)}
                      </button>
                      {track.isForced ? <Badge tone="info">Forced</Badge> : null}
                    </span>
                  </Td>
                  <Td>
                    {nameOf(track.language)}{' '}
                    {track.language !== UNKNOWN ? (
                      <code className="font-mono text-xs text-muted-foreground">
                        {track.language}
                      </code>
                    ) : null}
                  </Td>
                  <Td className="text-muted-foreground">{SOURCES[track.source]}</Td>
                  <Td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${track.label ?? track.language}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setReading(track)}>
                          <Eye />
                          Read
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void save(track)}>
                          <Download />
                          Download as WebVTT
                        </DropdownMenuItem>
                        {mayWrite ? (
                          <>
                            <DropdownMenuItem onSelect={() => setEditing(track)}>
                              <Pencil />
                              Rename or change
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive onSelect={() => void askRemove(track)}>
                              <Trash2 />
                              Remove
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {tracks.length > 0 && mayWrite ? (
          <p className="border-t px-6 py-3 text-xs text-muted-foreground">
            Drop .srt, .vtt or .ass files anywhere on this card to add them. A file named like{' '}
            <code className="font-mono">film.de.srt</code> brings its language with it.
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
      {reading ? (
        <ReadDialog asset={asset} track={reading} onClose={() => setReading(null)} />
      ) : null}
    </>
  );
}

interface Row {
  file: File;
  language: string;
  label: string;
  forced: boolean;
  sdh: boolean;
  encoding: string;
  state: 'waiting' | 'sending' | 'done' | 'failed';
  /** What the server said: how it went, or why it did not. */
  message: string | null;
  warning: string | null;
}

function toRow(file: File): Row {
  const named = parseSubtitleName(file.name);
  const tooLarge = file.size > MAX_SUBTITLE_BYTES;
  return {
    file,
    language: named.language ?? '',
    label: '',
    forced: named.forced,
    sdh: named.sdh,
    encoding: AUTOMATIC,
    state: tooLarge ? 'failed' : 'waiting',
    message: tooLarge ? 'Larger than 5 MB, which no subtitle file is' : null,
    warning: null,
  };
}

/** Asks what each chosen file is, then sends them one after the other. */
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
  const patch = (index: number, change: Partial<Row>) =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...change } : row)));

  const open = rows.filter((row) => row.state === 'waiting' || row.state === 'failed');
  const sendable = open.filter((row) => row.language !== '' && row.file.size <= MAX_SUBTITLE_BYTES);
  const done = rows.filter((row) => row.state === 'done').length;
  const finished = open.length === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    for (const [index, row] of rows.entries()) {
      if (row.state === 'done' || row.language === '' || row.file.size > MAX_SUBTITLE_BYTES) {
        continue;
      }
      patch(index, { state: 'sending', message: null });
      try {
        const added = await subtitlesApi.add(asset.id, row.file, {
          filename: row.file.name,
          language: row.language,
          label: row.label.trim() || defaultSubtitleLabel(row.language, row),
          forced: row.forced,
          encoding: row.encoding === AUTOMATIC ? undefined : row.encoding,
        });
        patch(index, {
          state: 'done',
          message: `${added.cues.toLocaleString('en')} ${added.cues === 1 ? 'subtitle' : 'subtitles'}${added.encoding === 'utf-8' ? '' : `, read as ${added.encoding}`}`,
          warning: added.warning,
        });
        onAdded();
      } catch (error) {
        patch(index, {
          state: 'failed',
          message: error instanceof Error ? error.message : 'The file could not be added',
        });
      }
    }
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={(next) => (next || busy ? undefined : onClose())}>
      <DialogContent
        size="lg"
        title={`Add subtitles to "${asset.title}"`}
        description="Say which language each file is in. The files are converted to WebVTT and offered by the player at once: the video is not processed again."
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
                          <Spinner label="Adding" />
                        ) : row.state === 'done' ? (
                          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                        ) : (
                          <FileText className="size-4" aria-hidden="true" />
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
                        {row.warning ? (
                          <p className="mt-1 flex gap-1.5 text-xs text-warning">
                            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                            {row.warning}
                          </p>
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
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
                        <Field label="Name in the player">
                          {(id) => (
                            <Input
                              id={id}
                              maxLength={80}
                              disabled={locked}
                              dir={isRightToLeft(row.language) ? 'rtl' : undefined}
                              placeholder={defaultSubtitleLabel(row.language, row)}
                              value={row.label}
                              onChange={(event) => patch(index, { label: event.target.value })}
                            />
                          )}
                        </Field>
                        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                          <Checkbox
                            className="mt-0.5"
                            checked={row.forced}
                            disabled={locked}
                            onCheckedChange={(checked) =>
                              patch(index, { forced: checked === true })
                            }
                          />
                          <span>
                            Forced
                            <span className="block text-xs text-muted-foreground">
                              Only the parts in another language. Shown without being turned on.
                            </span>
                          </span>
                        </label>
                        <Field
                          label="Text encoding"
                          hint={
                            row.state === 'failed' || row.encoding !== AUTOMATIC
                              ? 'Change it when letters come out wrong.'
                              : undefined
                          }
                        >
                          {(id) => (
                            <Select
                              id={id}
                              value={row.encoding}
                              disabled={locked}
                              onValueChange={(encoding) => patch(index, { encoding })}
                              options={[
                                {
                                  value: AUTOMATIC,
                                  label: 'Automatic',
                                  description: 'Unicode, or the usual one of the language',
                                },
                                ...SUBTITLE_ENCODINGS,
                              ]}
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
                {done} of {rows.length} added
              </p>
            ) : null}
            <Button onClick={onClose} disabled={busy}>
              {finished ? 'Close' : done > 0 ? 'Close' : 'Cancel'}
            </Button>
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
                  : `Add ${sendable.length === 1 ? 'the file' : `${open.length} files`}`}
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
  track: SubtitleTrack;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [language, setLanguage] = useState(track.language);
  const [label, setLabel] = useState(track.label ?? '');
  const [forced, setForced] = useState(track.isForced);
  const save = useMutation({
    mutationFn: () =>
      subtitlesApi.update(asset.id, track.id, {
        ...(language !== track.language ? { language } : {}),
        ...(label.trim() !== (track.label ?? '') ? { label: label.trim() } : {}),
        ...(forced !== track.isForced ? { isForced: forced } : {}),
      }),
    onSuccess: () => {
      toast.success('Subtitles changed');
      onSaved();
    },
  });
  const dirty =
    language !== track.language ||
    label.trim() !== (track.label ?? '') ||
    forced !== track.isForced;

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        size="sm"
        title="Change the subtitles"
        description="What the player calls the track, and what it is. The text itself stays."
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
              hint="Players use it to choose subtitles in the language of the viewer."
            >
              {(id) => <LanguageSelect id={id} value={language} onChange={setLanguage} />}
            </Field>
            <ToggleRow
              label="Forced"
              description="Only the parts spoken in another language. Players show them without the viewer turning subtitles on."
              checked={forced}
              onCheckedChange={setForced}
            />
            {track.source === 'EMBEDDED' ? (
              <p className="text-xs text-muted-foreground">
                These subtitles are part of the video file. Processing the video again brings back
                what the file says.
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

const SHOWN_AT_ONCE = 300;

/** The text of a track, line by line with its times, to check a file without playing the video. */
function ReadDialog({
  asset,
  track,
  onClose,
}: {
  asset: Asset;
  track: SubtitleTrack;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const file = useQuery({
    queryKey: ['asset-subtitle', asset.id, track.id],
    queryFn: ({ signal }) => subtitlesApi.file(asset.id, track.id, signal),
    staleTime: 60_000,
  });
  const cues = useMemo(() => (file.data ? parseVtt(file.data) : []), [file.data]);
  const shown = useMemo(() => {
    const wanted = search.trim().toLowerCase();
    return wanted ? cues.filter((cue) => cue.text.toLowerCase().includes(wanted)) : cues;
  }, [cues, search]);
  useEffect(() => setSearch(''), [track.id]);
  const last = cues.at(-1);

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent
        title={track.label ?? nameOf(track.language)}
        description={
          file.data
            ? `${cues.length.toLocaleString('en')} ${cues.length === 1 ? 'subtitle' : 'subtitles'}${last ? `, the last at ${cueClock(last.startMs)}` : ''}. ${SOURCES[track.source]}.`
            : SOURCES[track.source]
        }
      >
        <DialogBody>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              className="pl-9"
              placeholder="Find words"
              aria-label="Find words in the subtitles"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <ErrorNote error={file.error} />
          {file.isPending ? <Skeleton className="h-48 rounded-lg" /> : null}
          {file.data && shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {cues.length === 0 ? 'The file holds no subtitles.' : 'No subtitle has these words.'}
            </p>
          ) : null}
          {shown.length > 0 ? (
            <ol
              className="max-h-[50dvh] divide-y overflow-y-auto rounded-lg border"
              dir={isRightToLeft(track.language) ? 'rtl' : undefined}
            >
              {shown.slice(0, SHOWN_AT_ONCE).map((cue) => (
                <li key={`${cue.start}-${cue.end}`} className="flex gap-3 px-3 py-2 text-sm">
                  <time
                    dir="ltr"
                    className="w-14 shrink-0 pt-px font-mono text-xs text-muted-foreground tabular-nums"
                    title={`${cue.start} to ${cue.end}`}
                  >
                    {cueClock(cue.startMs)}
                  </time>
                  <p className="whitespace-pre-line">{cue.text}</p>
                </li>
              ))}
            </ol>
          ) : null}
          {shown.length > SHOWN_AT_ONCE ? (
            <p className="text-xs text-muted-foreground">
              The first {SHOWN_AT_ONCE} of {shown.length.toLocaleString('en')} are shown. Search to
              find a later one.
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
