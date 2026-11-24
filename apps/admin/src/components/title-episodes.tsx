// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation } from '@tanstack/react-query';
import {
  ListVideo,
  MoreHorizontal,
  Pencil,
  Plus,
  ScanSearch,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { titlesApi } from '@/api/endpoints';
import type { AssetRef, CatalogImage, Episode, Season, TitleDetail } from '@/api/types';
import { countStates, EPISODE_STATE_LOOKS, episodeState, formatRuntime } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDay, formatDuration } from '@/lib/format';
import { useConfirm } from './confirm';
import { SeasonMarkersDialog } from './season-markers';
import { ImageField } from './image-field';
import { VideoSlot } from './title-media';
import { Button } from './ui/button';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorNote,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from './ui/display';
import { Field, Input, Switch, Textarea } from './ui/form';
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

const onError = (error: Error) => toast.error(error.message);

/** "Season 2" or, with a name, "Season 2 · The Return". */
function seasonLabel(season: Season): string {
  return season.name ? `Season ${season.number} · ${season.name}` : `Season ${season.number}`;
}

interface TitleEpisodesProps {
  title: TitleDetail;
  disabled: boolean;
  /** Loads the title again after a change. */
  refresh: () => void;
}

/** The seasons of a series with their episodes. */
export function TitleEpisodes({ title, disabled, refresh }: TitleEpisodesProps) {
  const confirm = useConfirm();
  const [seasonForm, setSeasonForm] = useState<Season | 'new' | null>(null);
  /** The season whose intros and credits are being searched for. */
  const [searching, setSearching] = useState<Season | null>(null);
  const [episodeForm, setEpisodeForm] = useState<{ season: Season; episode?: Episode } | null>(
    null,
  );

  const removeSeason = useMutation({
    mutationFn: (season: Season) => titlesApi.removeSeason(season.id),
    onSuccess: () => {
      toast.success('Season deleted');
      refresh();
    },
    onError,
  });
  const removeEpisode = useMutation({
    mutationFn: (episode: Episode) => titlesApi.removeEpisode(episode.id),
    onSuccess: () => {
      toast.success('Episode deleted');
      refresh();
    },
    onError,
  });
  const setEpisodeStatus = useMutation({
    mutationFn: ({ episode, published }: { episode: Episode; published: boolean }) =>
      titlesApi.updateEpisode(episode.id, { status: published ? 'PUBLISHED' : 'DRAFT' }),
    onSuccess: (episode) => {
      toast.success(
        episode.status === 'PUBLISHED'
          ? `"${episode.name}" is published`
          : `"${episode.name}" is a draft again`,
      );
      refresh();
    },
    onError,
  });

  const askDeleteSeason = async (season: Season) => {
    const count = season.episodes.length;
    const confirmed = await confirm({
      title: `Delete season ${season.number}?`,
      description:
        count > 0
          ? `Its ${count === 1 ? 'episode is' : `${count} episodes are`} deleted with it. The videos stay in the library.`
          : 'The season has no episodes.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      removeSeason.mutate(season);
    }
  };

  const askDeleteEpisode = async (episode: Episode) => {
    const confirmed = await confirm({
      title: `Delete "${episode.name}"?`,
      description: 'The episode is removed from the series. Its video stays in the library.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      removeEpisode.mutate(episode);
    }
  };

  const addSeason = !disabled ? (
    <Button onClick={() => setSeasonForm('new')}>
      <Plus />
      Add season
    </Button>
  ) : null;

  return (
    <div className="grid gap-6">
      <SeriesOverview title={title} />
      {title.seasons.length === 0 ? (
        <EmptyState icon={ListVideo} title="No seasons yet" action={addSeason}>
          Add the first season, then its episodes. A series can be published once one episode is
          published.
        </EmptyState>
      ) : null}

      {title.seasons.map((season) => {
        const published = season.episodes.filter((episode) => episode.status === 'PUBLISHED');
        return (
          <Card
            key={season.id}
            id={`season-${season.number}`}
            className="scroll-mt-24 overflow-hidden"
          >
            <CardHeader
              className="pb-4"
              title={
                <>
                  {season.poster ? (
                    <img
                      src={apiUrl(season.poster.url)}
                      alt=""
                      loading="lazy"
                      className="aspect-[2/3] w-9 rounded object-cover"
                    />
                  ) : null}
                  {seasonLabel(season)}
                  <Badge>
                    {published.length} of {season.episodes.length} published
                  </Badge>
                </>
              }
              description={
                season.airDate || season.synopsis ? (
                  <>
                    {season.airDate ? (
                      <span className="mr-2 whitespace-nowrap text-foreground">
                        From {formatDay(season.airDate)}
                      </span>
                    ) : null}
                    {season.synopsis ? (
                      <span className="line-clamp-2">{season.synopsis}</span>
                    ) : null}
                  </>
                ) : undefined
              }
              actions={
                !disabled ? (
                  <>
                    <Button size="sm" onClick={() => setEpisodeForm({ season })}>
                      <Plus />
                      Add episode
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for season ${season.number}`}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setSeasonForm(season)}>
                          <Pencil />
                          Edit season
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setSearching(season)}>
                          <ScanSearch />
                          Find intros and credits…
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => void askDeleteSeason(season)}>
                          <Trash2 />
                          Delete season
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                ) : null
              }
            />
            {season.episodes.length > 0 ? (
              <EpisodeMap
                season={season}
                onOpen={disabled ? undefined : (episode) => setEpisodeForm({ season, episode })}
              />
            ) : null}
            {season.episodes.length === 0 ? (
              <p className="border-t px-5 py-6 text-center text-sm text-muted-foreground">
                This season has no episodes yet.
              </p>
            ) : (
              <div className="border-t">
                <Table>
                  <thead>
                    <tr>
                      <Th className="w-12">No.</Th>
                      <Th>Episode</Th>
                      <Th>Video</Th>
                      <Th className="w-32">Published</Th>
                      <Th className="w-10" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {season.episodes.map((episode) => {
                      const ready = episode.asset?.playable === true;
                      const isPublished = episode.status === 'PUBLISHED';
                      const toggle = (
                        <Switch
                          checked={isPublished}
                          disabled={
                            disabled || setEpisodeStatus.isPending || (!isPublished && !ready)
                          }
                          aria-label={`Publish ${episode.name}`}
                          onCheckedChange={(checked) =>
                            setEpisodeStatus.mutate({ episode, published: checked })
                          }
                        />
                      );
                      return (
                        <Tr key={episode.id}>
                          <Td className="text-muted-foreground tabular-nums">{episode.number}</Td>
                          <Td>
                            <div className="flex items-center gap-3">
                              <div className="aspect-video w-16 shrink-0 overflow-hidden rounded bg-muted">
                                {episode.still ? (
                                  <img
                                    src={apiUrl(episode.still.url)}
                                    alt=""
                                    loading="lazy"
                                    className="size-full object-cover"
                                  />
                                ) : null}
                              </div>
                              <div className="min-w-0">
                                {disabled ? (
                                  <p className="max-w-xs truncate font-medium">{episode.name}</p>
                                ) : (
                                  <button
                                    type="button"
                                    className="block max-w-xs truncate text-left font-medium hover:underline"
                                    onClick={() => setEpisodeForm({ season, episode })}
                                  >
                                    {episode.name}
                                  </button>
                                )}
                                {episode.airDate || episode.runtimeMinutes ? (
                                  <p className="text-xs text-muted-foreground tabular-nums">
                                    {[
                                      episode.airDate ? formatDay(episode.airDate) : null,
                                      episode.runtimeMinutes
                                        ? formatRuntime(episode.runtimeMinutes)
                                        : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                ) : null}
                                {episode.synopsis ? (
                                  <p className="max-w-sm truncate text-xs text-muted-foreground">
                                    {episode.synopsis}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </Td>
                          <Td>
                            {episode.asset ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge status={episode.asset.status} />
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {formatDuration(episode.asset.durationMs)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">No video</span>
                            )}
                          </Td>
                          <Td>
                            {!isPublished && !ready && !disabled ? (
                              <Tooltip content="Attach a video that is ready first">
                                <span className="inline-flex">{toggle}</span>
                              </Tooltip>
                            ) : (
                              toggle
                            )}
                          </Td>
                          <Td>
                            {!disabled ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Actions for ${episode.name}`}
                                  >
                                    <MoreHorizontal />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() => setEpisodeForm({ season, episode })}
                                  >
                                    <Pencil />
                                    Edit
                                  </DropdownMenuItem>
                                  {episode.asset ? (
                                    <DropdownMenuItem asChild>
                                      <Link to={`/assets/${episode.asset.id}?tab=markers`}>
                                        <SkipForward />
                                        Intro and credits
                                      </Link>
                                    </DropdownMenuItem>
                                  ) : null}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    destructive
                                    onSelect={() => void askDeleteEpisode(episode)}
                                  >
                                    <Trash2 />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>
        );
      })}

      {title.seasons.length > 0 && addSeason ? <div>{addSeason}</div> : null}

      {searching ? (
        <SeasonMarkersDialog season={searching} onClose={() => setSearching(null)} />
      ) : null}
      <SeasonDialog
        titleId={title.id}
        refresh={refresh}
        target={seasonForm}
        onClose={() => setSeasonForm(null)}
        onSaved={() => {
          setSeasonForm(null);
          refresh();
        }}
      />
      <EpisodeDialog
        target={episodeForm}
        onClose={() => setEpisodeForm(null)}
        onSaved={() => {
          setEpisodeForm(null);
          refresh();
        }}
        refresh={refresh}
      />
    </div>
  );
}

/** The whole series at a glance: how far its videos are, season by season. */
function SeriesOverview({ title }: { title: TitleDetail }) {
  const episodes = title.seasons.flatMap((season) => season.episodes);
  if (episodes.length === 0) {
    return null;
  }
  const states = countStates(episodes);
  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="text-sm font-medium">
            {title.seasons.length} {title.seasons.length === 1 ? 'season' : 'seasons'},{' '}
            {episodes.length} {episodes.length === 1 ? 'episode' : 'episodes'}
          </p>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {states.map(([state, count]) => (
              <li key={state} className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    'size-3 rounded-[3px] border',
                    EPISODE_STATE_LOOKS[state].className,
                  )}
                  aria-hidden="true"
                />
                <span className="font-medium text-foreground tabular-nums">{count}</span>
                {EPISODE_STATE_LOOKS[state].label.toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
        {title.seasons.length > 1 ? (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {title.seasons.map((season) => {
              const ready = season.episodes.filter(
                (episode) => episode.asset?.playable === true,
              ).length;
              const total = season.episodes.length;
              return (
                <li key={season.id}>
                  <a
                    href={`#season-${season.number}`}
                    className="grid gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{seasonLabel(season)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {ready} / {total}
                      </span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn(
                          'block h-full rounded-full',
                          total > 0 && ready === total ? 'bg-success' : 'bg-primary',
                        )}
                        style={{ width: total === 0 ? 0 : `${(ready / total) * 100}%` }}
                      />
                    </span>
                    <span className="sr-only">
                      {ready} of {total} episodes have a video
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface EpisodeMapProps {
  season: Season;
  /** Opens an episode for editing. Without it the squares only show. */
  onOpen?: (episode: Episode) => void;
}

/** One square per episode, coloured by how far it is. Shows at a glance which videos are missing. */
function EpisodeMap({ season, onOpen }: EpisodeMapProps) {
  return (
    <ul
      aria-label={`Episodes of season ${season.number} by state`}
      className="flex flex-wrap gap-1.5 border-t px-5 py-3"
    >
      {season.episodes.map((episode) => {
        const look = EPISODE_STATE_LOOKS[episodeState(episode)];
        const classes = cn(
          'flex h-7 min-w-7 items-center justify-center rounded-md border px-1 text-xs font-medium tabular-nums',
          look.className,
        );
        return (
          <li key={episode.id}>
            <Tooltip content={`${episode.number}. ${episode.name}: ${look.label.toLowerCase()}`}>
              {onOpen ? (
                <button
                  type="button"
                  className={cn(classes, 'transition-transform hover:scale-110')}
                  aria-label={`Episode ${episode.number}, ${episode.name}: ${look.label}`}
                  onClick={() => onOpen(episode)}
                >
                  {episode.number}
                </button>
              ) : (
                <span className={classes}>{episode.number}</span>
              )}
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

interface SeasonDialogProps {
  refresh: () => void;
  titleId: string;
  target: Season | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}

function SeasonDialog({ titleId, target, onClose, onSaved, refresh }: SeasonDialogProps) {
  const season = target === 'new' || target === null ? undefined : target;
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [airDate, setAirDate] = useState('');
  // The poster as it is now: it is saved the moment it is chosen.
  const [poster, setPoster] = useState<CatalogImage | null>(null);

  const save = useMutation({
    mutationFn: () =>
      season
        ? titlesApi.updateSeason(season.id, {
            number: Number(number),
            name,
            synopsis,
            airDate: airDate || null,
          })
        : titlesApi.createSeason(titleId, { name }),
    onSuccess: () => {
      toast.success(season ? 'Season saved' : 'Season added');
      onSaved();
    },
  });

  useEffect(() => {
    if (target !== null) {
      save.reset();
      setNumber(season ? String(season.number) : '');
      setName(season?.name ?? '');
      setSynopsis(season?.synopsis ?? '');
      setAirDate(season?.airDate ?? '');
      setPoster(season?.poster ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        variant={season ? 'sheet' : undefined}
        title={season ? `Edit season ${season.number}` : 'Add season'}
        description={season ? undefined : 'It gets the next free number.'}
        size={season ? undefined : 'sm'}
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            {season ? (
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4">
                <Field label="Number" hint="0 is for specials.">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      required
                      min={0}
                      max={10000}
                      value={number}
                      onChange={(event) => setNumber(event.target.value)}
                    />
                  )}
                </Field>
                <Field label="First shown" hint="Optional.">
                  {(id) => (
                    <Input
                      id={id}
                      type="date"
                      value={airDate}
                      onChange={(event) => setAirDate(event.target.value)}
                    />
                  )}
                </Field>
              </div>
            ) : null}
            <Field label="Name" hint="Optional. Without one it is shown as its number.">
              {(id) => (
                <Input
                  id={id}
                  autoFocus
                  maxLength={200}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            {season ? (
              <Field label="Synopsis">
                {(id) => (
                  <Textarea
                    id={id}
                    rows={4}
                    maxLength={5000}
                    value={synopsis}
                    onChange={(event) => setSynopsis(event.target.value)}
                  />
                )}
              </Field>
            ) : null}
            {season ? (
              <ImageField
                label="Poster"
                hint="Optional. A poster of this season alone, 2:3. Without one the poster of the series is shown."
                kind="POSTER"
                aspect="aspect-[2/3] max-w-40"
                image={poster}
                onChange={async (image) => {
                  await titlesApi.updateSeason(season.id, { posterId: image?.id ?? null });
                  setPoster(image);
                  refresh();
                }}
              />
            ) : null}
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {season ? 'Save' : 'Add season'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EpisodeDialogProps {
  target: { season: Season; episode?: Episode } | null;
  onClose: () => void;
  onSaved: () => void;
  refresh: () => void;
}

/**
 * Creates or edits an episode. Text is saved with the button. The video and
 * the picture of an existing episode are saved the moment they are chosen.
 */
function EpisodeDialog({ target, onClose, onSaved, refresh }: EpisodeDialogProps) {
  const existing = target?.episode;
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [airDate, setAirDate] = useState('');
  const [runtime, setRuntime] = useState('');
  // The video and picture as they are now, which can change while the dialog is open.
  const [asset, setAsset] = useState<AssetRef | null>(null);
  const [still, setStill] = useState<CatalogImage | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);

  const apply = (episode: Episode) => {
    setEpisodeId(episode.id);
    setAsset(episode.asset);
    setStill(episode.still);
  };

  const save = useMutation({
    mutationFn: () => {
      const text = {
        name: name.trim(),
        synopsis,
        airDate: airDate || null,
        runtimeMinutes: runtime.trim() ? Number(runtime) : null,
      };
      if (episodeId) {
        return titlesApi.updateEpisode(episodeId, { ...text, number: Number(number) });
      }
      return titlesApi.createEpisode((target as { season: Season }).season.id, {
        ...text,
        ...(number ? { number: Number(number) } : {}),
      });
    },
    onSuccess: (episode) => {
      if (episodeId) {
        toast.success('Episode saved');
        onSaved();
        return;
      }
      // A new episode stays open, so that its video can be attached right away.
      toast.success('Episode added. You can attach its video now.');
      apply(episode);
      setNumber(String(episode.number));
      refresh();
    },
  });

  useEffect(() => {
    if (target !== null) {
      save.reset();
      setNumber(existing ? String(existing.number) : '');
      setName(existing?.name ?? '');
      setSynopsis(existing?.synopsis ?? '');
      setAirDate(existing?.airDate ?? '');
      setRuntime(existing?.runtimeMinutes ? String(existing.runtimeMinutes) : '');
      setEpisodeId(existing?.id ?? null);
      setAsset(existing?.asset ?? null);
      setStill(existing?.still ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  /** Saves one media change of the episode and keeps the dialog open. */
  const saveMedia = async (changes: { assetId?: string | null; stillId?: string | null }) => {
    const episode = await titlesApi.updateEpisode(episodeId as string, changes);
    apply(episode);
    refresh();
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        variant="sheet"
        title={episodeId ? `Edit episode ${number}` : 'Add episode'}
        description={target ? seasonLabel(target.season) : undefined}
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-4">
              <Field label="Number" hint={episodeId ? undefined : 'Empty: the next one.'}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    required={Boolean(episodeId)}
                    min={0}
                    max={10000}
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Name">
                {(id) => (
                  <Input
                    id={id}
                    required
                    autoFocus
                    maxLength={200}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="First shown" hint="Optional.">
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    value={airDate}
                    onChange={(event) => setAirDate(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Length (minutes)" hint="Optional. Shown until the video tells it.">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    max={1500}
                    value={runtime}
                    onChange={(event) => setRuntime(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field label="Synopsis" hint="What happens in this episode, in a few sentences.">
              {(id) => (
                <Textarea
                  id={id}
                  rows={5}
                  maxLength={5000}
                  value={synopsis}
                  onChange={(event) => setSynopsis(event.target.value)}
                />
              )}
            </Field>

            {episodeId ? (
              <>
                <VideoSlot
                  label="Video"
                  hint="It must be ready before the episode can be published."
                  pickerTitle="Choose the video for this episode"
                  asset={asset}
                  onChange={(assetId) => saveMedia({ assetId })}
                />
                <ImageField
                  label="Picture"
                  hint="Optional. A wide still from the episode, 16:9."
                  kind="STILL"
                  aspect="aspect-video max-w-sm"
                  image={still}
                  onChange={(image) => saveMedia({ stillId: image?.id ?? null })}
                />
              </>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                After adding the episode you can attach its video and a picture.
              </p>
            )}
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>{episodeId ? 'Close' : 'Cancel'}</Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={!name.trim()}
            >
              {episodeId ? 'Save' : 'Add episode'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
