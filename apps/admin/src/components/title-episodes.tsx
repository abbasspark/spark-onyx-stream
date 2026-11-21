// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation } from '@tanstack/react-query';
import { ListVideo, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiUrl } from '@/api/client';
import { titlesApi } from '@/api/endpoints';
import type { AssetRef, CatalogImage, Episode, Season, TitleDetail } from '@/api/types';
import { formatDuration } from '@/lib/format';
import { useConfirm } from './confirm';
import { ImageField } from './image-field';
import { VideoSlot } from './title-media';
import { Button } from './ui/button';
import {
  Badge,
  Card,
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
      {title.seasons.length === 0 ? (
        <EmptyState icon={ListVideo} title="No seasons yet" action={addSeason}>
          Add the first season, then its episodes. A series can be published once one episode is
          published.
        </EmptyState>
      ) : null}

      {title.seasons.map((season) => {
        const published = season.episodes.filter((episode) => episode.status === 'PUBLISHED');
        return (
          <Card key={season.id} className="overflow-hidden">
            <CardHeader
              className="pb-4"
              title={
                <>
                  {seasonLabel(season)}
                  <Badge>
                    {published.length} of {season.episodes.length} published
                  </Badge>
                </>
              }
              description={season.synopsis}
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

      <SeasonDialog
        titleId={title.id}
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

interface SeasonDialogProps {
  titleId: string;
  target: Season | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}

function SeasonDialog({ titleId, target, onClose, onSaved }: SeasonDialogProps) {
  const season = target === 'new' || target === null ? undefined : target;
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [synopsis, setSynopsis] = useState('');

  const save = useMutation({
    mutationFn: () =>
      season
        ? titlesApi.updateSeason(season.id, { number: Number(number), name, synopsis })
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
        title={season ? `Edit season ${season.number}` : 'Add season'}
        description={season ? undefined : 'It gets the next free number.'}
        size="sm"
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            {season ? (
              <Field label="Number" hint="Season 0 is commonly used for specials.">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    required
                    min={0}
                    max={10000}
                    className="w-28"
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                  />
                )}
              </Field>
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
      const text = { name: name.trim(), synopsis };
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
