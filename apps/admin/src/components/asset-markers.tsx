// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crosshair, Play, Plus, RotateCcw, ScanSearch, SkipForward, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { markersApi } from '@/api/endpoints';
import type { Asset } from '@/api/types';
import { cn } from '@/lib/cn';
import {
  formatMoment,
  type Marker,
  MARKER_KINDS,
  MARKER_LOOKS,
  type MarkerKind,
  markersProblem,
  parseMoment,
  sameMarkers,
  suggestMarker,
} from '@/lib/markers';
import { Button } from './ui/button';
import { Badge, Card, CardContent, CardHeader, ErrorNote, Skeleton } from './ui/display';
import { Checkbox, Input, Label } from './ui/form';
import { Tooltip } from './ui/overlay';

interface MarkersTabProps {
  asset: Asset;
  /** The preview player of the page, to read the position from and to jump in. Null while there is none. */
  video: HTMLVideoElement | null;
  mayWrite: boolean;
}

/** Where the preview player is, in milliseconds, kept up to date while it plays. */
function usePosition(video: HTMLVideoElement | null): number {
  const [position, setPosition] = useState(0);
  useEffect(() => {
    if (!video) {
      return;
    }
    const read = () => setPosition(Math.round(video.currentTime * 1000));
    read();
    video.addEventListener('timeupdate', read);
    video.addEventListener('seeked', read);
    return () => {
      video.removeEventListener('timeupdate', read);
      video.removeEventListener('seeked', read);
    };
  }, [video]);
  return position;
}

/**
 * The stretches of a video players offer to skip: recap, intro and credits.
 * Each is set against the preview player above: play to the moment, and take
 * it over.
 */
export function MarkersTab({ asset, video, mayWrite }: MarkersTabProps) {
  const queryClient = useQueryClient();
  const durationMs = asset.media.durationMs;
  const position = usePosition(video);
  const stored = useQuery({
    queryKey: ['asset-markers', asset.id],
    queryFn: ({ signal }) => markersApi.list(asset.id, signal),
  });
  const [draft, setDraft] = useState<Marker[] | null>(null);
  // What is stored is what is edited, until something is changed.
  useEffect(() => setDraft(null), [stored.data]);
  const markers = draft ?? stored.data ?? [];
  const dirty = draft !== null && !sameMarkers(draft, stored.data ?? []);
  const problem = useMemo(() => markersProblem(markers, durationMs), [markers, durationMs]);

  const save = useMutation({
    mutationFn: () =>
      markersApi.replace(
        asset.id,
        markers.map(({ kind, startMs, endMs }) => ({ kind, startMs, endMs })),
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(['asset-markers', asset.id], saved);
      setDraft(null);
      toast.success(saved.length === 0 ? 'Markers removed' : 'Markers saved');
    },
  });

  const change = (kind: MarkerKind, next: Partial<Marker> | null) => {
    save.reset();
    setDraft(
      next === null
        ? markers.filter((marker) => marker.kind !== kind)
        : markers.some((marker) => marker.kind === kind)
          ? markers.map((marker) =>
              marker.kind === kind ? { ...marker, ...next, source: 'MANUAL' as const } : marker,
            )
          : [...markers, { ...suggestMarker(kind, position, durationMs), ...next }],
    );
  };
  const seek = (milliseconds: number) => {
    if (video) {
      video.currentTime = Math.max(0, milliseconds / 1000);
    }
  };

  if (stored.isPending) {
    return <Skeleton className="h-56 rounded-xl" />;
  }
  if (stored.isError) {
    return <ErrorNote error={stored.error} />;
  }
  const unchecked = (stored.data ?? []).filter((marker) => marker.source === 'DETECTED').length;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Markers"
        description="What players offer to skip. Play the video above to a moment, then take it over here."
        actions={
          mayWrite ? (
            <>
              {dirty ? (
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
                  <RotateCcw />
                  Undo changes
                </Button>
              ) : null}
              <Button
                variant="primary"
                loading={save.isPending}
                disabled={!dirty || problem !== null}
                onClick={() => save.mutate()}
              >
                Save markers
              </Button>
            </>
          ) : null
        }
      />
      <CardContent className="grid gap-6">
        {unchecked > 0 && !dirty ? (
          <p className="flex items-start gap-2 rounded-lg border border-info/25 bg-info/5 px-3 py-2.5 text-sm">
            <ScanSearch className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
            <span>
              {unchecked === 1 ? 'One marker was' : `${unchecked} markers were`} found by comparing
              the episodes of the season. Play to each edge to check it: a change you save counts as
              checked.
            </span>
          </p>
        ) : null}

        <Timeline
          markers={markers}
          durationMs={durationMs}
          position={position}
          onSeek={video ? seek : undefined}
        />

        <ul className="grid gap-3">
          {MARKER_KINDS.map((kind) => {
            const marker = markers.find((item) => item.kind === kind);
            const look = MARKER_LOOKS[kind];
            return (
              <li key={kind} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-2.5 shrink-0 rounded-full"
                    style={{ background: look.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {look.name}
                      {marker?.source === 'DETECTED' ? (
                        <Tooltip content="Found by comparing episodes, and not checked by anyone yet">
                          <Badge tone="info">Detected</Badge>
                        </Tooltip>
                      ) : null}
                      {marker ? (
                        <span className="font-normal text-muted-foreground tabular-nums">
                          {formatMoment(
                            (marker.endMs ?? durationMs ?? marker.startMs) - marker.startMs,
                          )}{' '}
                          long
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{look.description}</p>
                  </div>
                  {mayWrite ? (
                    marker ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove the ${look.name.toLowerCase()}`}
                        onClick={() => change(kind, null)}
                      >
                        <Trash2 />
                        Remove
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => change(kind, {})}>
                        <Plus />
                        Mark the {look.name.toLowerCase()}
                      </Button>
                    )
                  ) : null}
                </div>

                {marker ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <MomentField
                      label="Starts at"
                      value={marker.startMs}
                      position={position}
                      canPlay={video !== null}
                      disabled={!mayWrite}
                      onChange={(startMs) => change(kind, { startMs })}
                      onPlay={() => seek(marker.startMs - 3000)}
                    />
                    {marker.endMs === null ? (
                      <div className="grid content-start gap-1.5">
                        <Label>Ends</Label>
                        <p className="flex h-9 items-center text-sm text-muted-foreground">
                          With the video
                        </p>
                      </div>
                    ) : (
                      <MomentField
                        label="Ends at"
                        value={marker.endMs}
                        position={position}
                        canPlay={video !== null}
                        disabled={!mayWrite}
                        onChange={(endMs) => change(kind, { endMs })}
                        onPlay={() => seek((marker.endMs as number) - 3000)}
                      />
                    )}
                    {kind === 'CREDITS' && mayWrite ? (
                      <label className="flex cursor-pointer items-start gap-2.5 text-sm sm:col-span-2">
                        <Checkbox
                          className="mt-0.5"
                          checked={marker.endMs === null}
                          onCheckedChange={(checked) =>
                            change(kind, {
                              endMs:
                                checked === true
                                  ? null
                                  : Math.max(
                                      marker.startMs + 1000,
                                      (durationMs ?? marker.startMs + 60_000) - 30_000,
                                    ),
                            })
                          }
                        />
                        <span>
                          The credits run to the end of the video
                          <span className="block text-xs text-muted-foreground">
                            Off for a scene after the credits: players then offer to skip to it.
                          </span>
                        </span>
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {problem && dirty ? <p className="text-sm text-destructive">{problem}</p> : null}
        <ErrorNote error={save.error} />
        {!video ? (
          <p className="text-xs text-muted-foreground">
            The video cannot be played here right now, so moments are typed: as 1:30 or 1:02:05.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The video as a line, with its markers on it and where the player is. Click to jump. */
function Timeline({
  markers,
  durationMs,
  position,
  onSeek,
}: {
  markers: readonly Marker[];
  durationMs: number | null;
  position: number;
  onSeek?: (milliseconds: number) => void;
}) {
  if (!durationMs) {
    return null;
  }
  const share = (milliseconds: number) =>
    `${Math.min(100, Math.max(0, (milliseconds / durationMs) * 100))}%`;
  return (
    <div>
      <div
        className={cn(
          'relative h-9 overflow-hidden rounded-md border bg-muted/40',
          onSeek && 'cursor-pointer',
        )}
        role="img"
        aria-label={
          markers.length === 0
            ? 'The video, without markers'
            : `The video with ${markers
                .map(
                  (marker) =>
                    `${MARKER_LOOKS[marker.kind].name.toLowerCase()} from ${formatMoment(marker.startMs)}`,
                )
                .join(', ')}`
        }
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          onSeek?.(((event.clientX - box.left) / box.width) * durationMs);
        }}
      >
        {markers.map((marker) => (
          <span
            key={marker.kind}
            className="absolute inset-y-0 flex items-center overflow-hidden px-1.5 text-[11px] font-medium whitespace-nowrap text-white"
            style={{
              left: share(marker.startMs),
              width: `max(3px, calc(${share(marker.endMs ?? durationMs)} - ${share(marker.startMs)}))`,
              background: MARKER_LOOKS[marker.kind].color,
            }}
          >
            {MARKER_LOOKS[marker.kind].name}
          </span>
        ))}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-foreground"
          style={{ left: share(position) }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>0:00</span>
        <span>Player at {formatMoment(position)}</span>
        <span>{formatMoment(durationMs)}</span>
      </div>
    </div>
  );
}

/** A moment of the video: typed, or taken over from where the player is. */
function MomentField({
  label,
  value,
  position,
  canPlay,
  disabled,
  onChange,
  onPlay,
}: {
  label: string;
  value: number;
  position: number;
  canPlay: boolean;
  disabled: boolean;
  onChange: (milliseconds: number) => void;
  onPlay: () => void;
}) {
  const [text, setText] = useState(formatMoment(value));
  // What is typed stays as typed, until the value changes from elsewhere.
  useEffect(() => {
    setText((current) => (parseMoment(current) === value ? current : formatMoment(value)));
  }, [value]);
  const invalid = parseMoment(text) === null;
  const id = useId();

  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          className="font-mono tabular-nums"
          inputMode="decimal"
          disabled={disabled}
          aria-invalid={invalid}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const parsed = parseMoment(event.target.value);
            if (parsed !== null) {
              onChange(parsed);
            }
          }}
          onBlur={() => setText(formatMoment(value))}
        />
        {canPlay && !disabled ? (
          <Tooltip content={`Take over where the player is: ${formatMoment(position)}`}>
            <Button
              size="icon"
              aria-label={`Set "${label}" to where the player is`}
              onClick={() => onChange(Math.round(position / 100) * 100)}
            >
              <Crosshair />
            </Button>
          </Tooltip>
        ) : null}
        {canPlay ? (
          <Tooltip content="Play from three seconds before, to check it">
            <Button size="icon" variant="ghost" aria-label={`Play to "${label}"`} onClick={onPlay}>
              {label.startsWith('Ends') ? <SkipForward /> : <Play />}
            </Button>
          </Tooltip>
        ) : null}
      </div>
      {invalid ? (
        <p className="text-xs text-destructive">Write a moment as 1:30 or 1:02:05.</p>
      ) : null}
    </div>
  );
}
