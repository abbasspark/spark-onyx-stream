// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, SlidersHorizontal, Star, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { profilesApi } from '@/api/endpoints';
import {
  ENCODER_PRESETS,
  type EncoderPreset,
  type EncodingProfile,
  type ProfileRendition,
} from '@/api/types';
import { useSession } from '@/auth/session';
import { useConfirm } from '@/components/confirm';
import { Button } from '@/components/ui/button';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  PageHeader,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
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
} from '@/components/ui/overlay';
import { formatBitrate } from '@/lib/format';

/** A quality while it is being edited: numbers are text until the form is sent. */
interface RenditionDraft {
  key: string;
  name: string;
  height: string;
  videoKbps: string;
  audioKbps: string;
  preset: EncoderPreset;
}

const newRendition = (values: Partial<RenditionDraft> = {}): RenditionDraft => ({
  key: crypto.randomUUID(),
  name: '',
  height: '',
  videoKbps: '',
  audioKbps: '128',
  preset: 'medium',
  ...values,
});

const toDraft = (rendition: ProfileRendition): RenditionDraft =>
  newRendition({
    name: rendition.name,
    height: String(rendition.height),
    videoKbps: String(Math.round(rendition.videoBitrate / 1000)),
    audioKbps: String(Math.round(rendition.audioBitrate / 1000)),
    preset: rendition.preset,
  });

/** Common qualities that fill a row with one click. */
const QUICK_QUALITIES: [name: string, height: string, videoKbps: string][] = [
  ['2160p', '2160', '14000'],
  ['1080p', '1080', '5000'],
  ['720p', '720', '2800'],
  ['480p', '480', '1400'],
  ['360p', '360', '800'],
];

/** Encoding profiles: the qualities a video is transcoded into. */
export function EncodingProfilesPage() {
  const { can } = useSession();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const mayWrite = can('encoding-profiles:write');
  // null: closed, 'new': empty form, a profile: editing it.
  const [editing, setEditing] = useState<EncodingProfile | 'new' | null>(null);

  const profiles = useQuery({
    queryKey: ['encoding-profiles'],
    queryFn: ({ signal }) => profilesApi.list(signal),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['encoding-profiles'] });
  const onError = (error: Error) => toast.error(error.message);

  const makeDefault = useMutation({
    mutationFn: (profile: EncodingProfile) => profilesApi.update(profile.id, { isDefault: true }),
    onSuccess: (profile) => {
      toast.success(`"${profile.name}" is now the default`);
      void refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (profile: EncodingProfile) => profilesApi.remove(profile.id),
    onSuccess: () => {
      toast.success('Profile deleted');
      void refresh();
    },
    onError,
  });

  const askDelete = async (profile: EncodingProfile) => {
    const confirmed = await confirm({
      title: `Delete the profile "${profile.name}"?`,
      description: 'Videos already processed with it keep their streams.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      remove.mutate(profile);
    }
  };

  return (
    <>
      <PageHeader
        title="Encoding profiles"
        description="A profile lists the qualities a video is transcoded into. Qualities larger than the source are skipped. Changes apply to videos processed from now on."
        actions={
          mayWrite ? (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus />
              New profile
            </Button>
          ) : null
        }
      />

      <ErrorNote error={profiles.error} className="mb-4" />
      {profiles.isPending ? <Skeleton className="h-64 rounded-xl" /> : null}
      {profiles.data?.length === 0 ? (
        <EmptyState icon={SlidersHorizontal} title="No profiles" />
      ) : null}

      <div className="grid gap-4">
        {profiles.data?.map((profile) => (
          <Card key={profile.id} className="overflow-hidden">
            <CardHeader
              className="pb-4"
              title={
                <>
                  {profile.name}
                  {profile.isDefault ? (
                    <Badge tone="primary">
                      <Star className="size-3" aria-hidden="true" />
                      Default
                    </Badge>
                  ) : null}
                </>
              }
              description={
                <>
                  {profile.description ? `${profile.description} · ` : ''}
                  Segments of {profile.segmentSeconds} s, a keyframe every {profile.keyframeSeconds}{' '}
                  s
                </>
              }
              actions={
                mayWrite ? (
                  <>
                    <Button size="sm" onClick={() => setEditing(profile)}>
                      <Pencil />
                      Edit
                    </Button>
                    {!profile.isDefault ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`More actions for ${profile.name}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => makeDefault.mutate(profile)}>
                            <Star />
                            Make default
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => void askDelete(profile)}>
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </>
                ) : null
              }
            />
            <div className="border-t">
              <Table>
                <thead>
                  <tr>
                    <Th>Quality</Th>
                    <Th>Height</Th>
                    <Th>Video</Th>
                    <Th>Audio</Th>
                    <Th>Preset</Th>
                  </tr>
                </thead>
                <tbody>
                  {profile.renditions.map((rendition) => (
                    <Tr key={rendition.id}>
                      <Td className="font-medium">{rendition.name}</Td>
                      <Td className="tabular-nums">{rendition.height} px</Td>
                      <Td className="tabular-nums">{formatBitrate(rendition.videoBitrate)}</Td>
                      <Td className="tabular-nums">{formatBitrate(rendition.audioBitrate)}</Td>
                      <Td>{rendition.preset}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        ))}
      </div>

      <ProfileDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={(profile) => {
          toast.success(`Profile "${profile.name}" saved`);
          setEditing(null);
          void refresh();
        }}
      />
    </>
  );
}

interface ProfileDialogProps {
  target: EncodingProfile | 'new' | null;
  onClose: () => void;
  onSaved: (profile: EncodingProfile) => void;
}

function ProfileDialog({ target, onClose, onSaved }: ProfileDialogProps) {
  const profile = target === 'new' || target === null ? undefined : target;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [segmentSeconds, setSegmentSeconds] = useState('4');
  const [keyframeSeconds, setKeyframeSeconds] = useState('2');
  const [renditions, setRenditions] = useState<RenditionDraft[]>([]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        segmentSeconds: Number(segmentSeconds),
        keyframeSeconds: Number(keyframeSeconds),
        renditions: renditions.map((rendition) => ({
          name: rendition.name.trim(),
          height: Number(rendition.height),
          videoBitrate: Number(rendition.videoKbps) * 1000,
          audioBitrate: Number(rendition.audioKbps) * 1000,
          preset: rendition.preset,
        })),
      };
      return profile
        ? profilesApi.update(profile.id, { ...body, description: description.trim() || null })
        : profilesApi.create({ ...body, description: description.trim() || undefined });
    },
    onSuccess: onSaved,
  });

  // The form is filled each time the dialog opens.
  useEffect(() => {
    if (target === null) {
      return;
    }
    save.reset();
    setName(profile?.name ?? '');
    setDescription(profile?.description ?? '');
    setSegmentSeconds(String(profile?.segmentSeconds ?? 4));
    setKeyframeSeconds(String(profile?.keyframeSeconds ?? 2));
    setRenditions(
      profile
        ? profile.renditions.map(toDraft)
        : [
            newRendition({ name: '1080p', height: '1080', videoKbps: '5000' }),
            newRendition({ name: '720p', height: '720', videoKbps: '2800' }),
            newRendition({ name: '480p', height: '480', videoKbps: '1400' }),
          ],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const change = (key: string, values: Partial<RenditionDraft>) =>
    setRenditions((rows) => rows.map((row) => (row.key === key ? { ...row, ...values } : row)));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  const unused = QUICK_QUALITIES.filter(
    ([, height]) => !renditions.some((rendition) => rendition.height === height),
  );

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        variant="sheet"
        size="lg"
        title={profile ? `Edit ${profile.name}` : 'New profile'}
        description="Qualities are listed from the highest down. Players switch between them as the connection allows."
      >
        <form onSubmit={submit} className="contents">
          <DialogBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                {(id) => (
                  <Input
                    id={id}
                    required
                    maxLength={64}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Description">
                {(id) => (
                  <Input
                    id={id}
                    maxLength={500}
                    placeholder="Optional"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Segment length in seconds"
                hint="Shorter segments switch quality faster, longer ones compress better."
              >
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    required
                    min={2}
                    max={10}
                    value={segmentSeconds}
                    onChange={(event) => setSegmentSeconds(event.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Keyframe interval in seconds"
                hint="Must divide the segment length evenly, for example 2 and 4."
              >
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    required
                    min={1}
                    max={10}
                    value={keyframeSeconds}
                    onChange={(event) => setKeyframeSeconds(event.target.value)}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium">Qualities</p>
                <p className="text-xs text-muted-foreground">{renditions.length} of 8</p>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th>Name</Th>
                      <Th>Height (px)</Th>
                      <Th>Video (kbit/s)</Th>
                      <Th>Audio (kbit/s)</Th>
                      <Th>Preset</Th>
                      <Th className="w-10" aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {renditions.map((rendition, index) => (
                      <tr key={rendition.key} className="[&:last-child>td]:border-b-0">
                        <Td className="p-2">
                          <Input
                            required
                            pattern="[A-Za-z0-9_\-]{1,32}"
                            title="Up to 32 letters, digits, dashes or underscores"
                            aria-label={`Name of quality ${index + 1}`}
                            placeholder="720p"
                            className="min-w-24"
                            value={rendition.name}
                            onChange={(event) =>
                              change(rendition.key, { name: event.target.value })
                            }
                          />
                        </Td>
                        <Td className="p-2">
                          <Input
                            type="number"
                            required
                            min={144}
                            max={4320}
                            step={2}
                            aria-label={`Height of quality ${index + 1}`}
                            className="min-w-24"
                            value={rendition.height}
                            onChange={(event) =>
                              change(rendition.key, { height: event.target.value })
                            }
                          />
                        </Td>
                        <Td className="p-2">
                          <Input
                            type="number"
                            required
                            min={100}
                            max={50000}
                            aria-label={`Video bitrate of quality ${index + 1}`}
                            className="min-w-24"
                            value={rendition.videoKbps}
                            onChange={(event) =>
                              change(rendition.key, { videoKbps: event.target.value })
                            }
                          />
                        </Td>
                        <Td className="p-2">
                          <Input
                            type="number"
                            required
                            min={32}
                            max={512}
                            aria-label={`Audio bitrate of quality ${index + 1}`}
                            className="min-w-20"
                            value={rendition.audioKbps}
                            onChange={(event) =>
                              change(rendition.key, { audioKbps: event.target.value })
                            }
                          />
                        </Td>
                        <Td className="p-2">
                          <Select
                            aria-label={`Preset of quality ${index + 1}`}
                            className="min-w-28"
                            value={rendition.preset}
                            onValueChange={(value) =>
                              change(rendition.key, { preset: value as EncoderPreset })
                            }
                            options={ENCODER_PRESETS.map((preset) => ({
                              value: preset,
                              label: preset,
                            }))}
                          />
                        </Td>
                        <Td className="p-2">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={renditions.length === 1}
                            aria-label={`Remove quality ${index + 1}`}
                            onClick={() =>
                              setRenditions((rows) =>
                                rows.filter((row) => row.key !== rendition.key),
                              )
                            }
                          >
                            <Trash2 />
                          </Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={renditions.length >= 8}
                  onClick={() => setRenditions((rows) => [...rows, newRendition()])}
                >
                  <Plus />
                  Add quality
                </Button>
                {renditions.length < 8
                  ? unused.map(([qualityName, height, videoKbps]) => (
                      <Button
                        key={qualityName}
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setRenditions((rows) =>
                            [...rows, newRendition({ name: qualityName, height, videoKbps })].sort(
                              (a, b) => Number(b.height) - Number(a.height),
                            ),
                          )
                        }
                      >
                        + {qualityName}
                      </Button>
                    ))
                  : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Slower presets give smaller files at the same quality but take longer to encode.
              </p>
            </div>
            <ErrorNote error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Save profile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
