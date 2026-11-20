// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { profilesApi } from '../api/endpoints';
import {
  ENCODER_PRESETS,
  type EncoderPreset,
  type EncodingProfile,
  type ProfileRendition,
} from '../api/types';
import { useSession } from '../auth/session';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/ui';
import { formatBitrate } from '../lib/format';

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

/** Encoding profiles: the qualities a video is transcoded into. */
export function EncodingProfilesPage() {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const mayWrite = can('encoding-profiles:write');
  // 'new' opens an empty form, an id opens that profile for editing.
  const [editing, setEditing] = useState<string | null>(null);

  const profiles = useQuery({
    queryKey: ['encoding-profiles'],
    queryFn: ({ signal }) => profilesApi.list(signal),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['encoding-profiles'] });

  const makeDefault = useMutation({
    mutationFn: (id: string) => profilesApi.update(id, { isDefault: true }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: profilesApi.remove, onSuccess: refresh });

  return (
    <>
      <PageHeader title="Encoding profiles">
        {mayWrite && editing === null ? (
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            New profile
          </button>
        ) : null}
      </PageHeader>
      <p className="muted lead">
        A profile lists the qualities a video is transcoded into. Qualities larger than the source
        are skipped. Changes apply to videos processed from now on.
      </p>

      {editing === 'new' ? (
        <ProfileForm
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}

      <ErrorNote error={profiles.error ?? makeDefault.error ?? remove.error} />
      {profiles.isPending ? <Spinner label="Loading profiles" /> : null}
      {profiles.data?.length === 0 ? <EmptyState title="No profiles" /> : null}

      {profiles.data?.map((profile) =>
        editing === profile.id ? (
          <ProfileForm
            key={profile.id}
            profile={profile}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              void refresh();
            }}
          />
        ) : (
          <section className="card" key={profile.id}>
            <div className="card-head">
              <h2>
                {profile.name}
                {profile.isDefault ? <span className="tag">Default</span> : null}
              </h2>
              {mayWrite ? (
                <div className="button-row">
                  {!profile.isDefault ? (
                    <button
                      type="button"
                      className="button button-quiet"
                      disabled={makeDefault.isPending}
                      onClick={() => makeDefault.mutate(profile.id)}
                    >
                      Make default
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => setEditing(profile.id)}
                  >
                    Edit
                  </button>
                  {!profile.isDefault ? (
                    <button
                      type="button"
                      className="button button-quiet button-danger"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete the profile "${profile.name}"?`)) {
                          remove.mutate(profile.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {profile.description ? <p className="muted">{profile.description}</p> : null}
            <p className="muted">
              Segments of {profile.segmentSeconds} s, a keyframe every {profile.keyframeSeconds} s
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Quality</th>
                    <th>Height</th>
                    <th>Video</th>
                    <th>Audio</th>
                    <th>Preset</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.renditions.map((rendition) => (
                    <tr key={rendition.id}>
                      <td>{rendition.name}</td>
                      <td>{rendition.height} px</td>
                      <td>{formatBitrate(rendition.videoBitrate)}</td>
                      <td>{formatBitrate(rendition.audioBitrate)}</td>
                      <td>{rendition.preset}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ),
      )}
    </>
  );
}

interface ProfileFormProps {
  /** Left out, the form creates a new profile. */
  profile?: EncodingProfile;
  onClose: () => void;
  onSaved: () => void;
}

function ProfileForm({ profile, onClose, onSaved }: ProfileFormProps) {
  const [name, setName] = useState(profile?.name ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  const [segmentSeconds, setSegmentSeconds] = useState(String(profile?.segmentSeconds ?? 4));
  const [keyframeSeconds, setKeyframeSeconds] = useState(String(profile?.keyframeSeconds ?? 2));
  const [renditions, setRenditions] = useState<RenditionDraft[]>(
    profile
      ? profile.renditions.map(toDraft)
      : [newRendition({ name: '720p', height: '720', videoKbps: '2800' })],
  );

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

  const change = (key: string, values: Partial<RenditionDraft>) =>
    setRenditions((rows) => rows.map((row) => (row.key === key ? { ...row, ...values } : row)));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>{profile ? `Edit ${profile.name}` : 'New profile'}</h2>
      <div className="field-row">
        <label className="field grow">
          Name
          <input
            type="text"
            required
            maxLength={64}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field narrow">
          Segment length (s)
          <input
            type="number"
            required
            min={2}
            max={10}
            value={segmentSeconds}
            onChange={(event) => setSegmentSeconds(event.target.value)}
          />
        </label>
        <label className="field narrow">
          Keyframe every (s)
          <input
            type="number"
            required
            min={1}
            max={10}
            value={keyframeSeconds}
            onChange={(event) => setKeyframeSeconds(event.target.value)}
          />
        </label>
      </div>
      <label className="field">
        Description
        <input
          type="text"
          maxLength={500}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <p className="hint">
        The keyframe interval must divide the segment length evenly, for example 2 and 4.
      </p>

      <div className="table-wrap form-table">
        <table>
          <thead>
            <tr>
              <th>Quality name</th>
              <th>Height (px)</th>
              <th>Video (kbit/s)</th>
              <th>Audio (kbit/s)</th>
              <th>Preset</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {renditions.map((rendition, index) => (
              <tr key={rendition.key}>
                <td>
                  <input
                    type="text"
                    required
                    pattern="[A-Za-z0-9_\-]{1,32}"
                    title="Up to 32 letters, digits, dashes or underscores"
                    aria-label={`Name of quality ${index + 1}`}
                    placeholder="720p"
                    value={rendition.name}
                    onChange={(event) => change(rendition.key, { name: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    required
                    min={144}
                    max={4320}
                    step={2}
                    aria-label={`Height of quality ${index + 1}`}
                    value={rendition.height}
                    onChange={(event) => change(rendition.key, { height: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    required
                    min={100}
                    max={50000}
                    aria-label={`Video bitrate of quality ${index + 1}`}
                    value={rendition.videoKbps}
                    onChange={(event) => change(rendition.key, { videoKbps: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    required
                    min={32}
                    max={512}
                    aria-label={`Audio bitrate of quality ${index + 1}`}
                    value={rendition.audioKbps}
                    onChange={(event) => change(rendition.key, { audioKbps: event.target.value })}
                  />
                </td>
                <td>
                  <select
                    aria-label={`Preset of quality ${index + 1}`}
                    value={rendition.preset}
                    onChange={(event) =>
                      change(rendition.key, { preset: event.target.value as EncoderPreset })
                    }
                  >
                    {ENCODER_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="col-actions">
                  <button
                    type="button"
                    className="button button-quiet"
                    disabled={renditions.length === 1}
                    onClick={() =>
                      setRenditions((rows) => rows.filter((row) => row.key !== rendition.key))
                    }
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Slower presets give smaller files at the same quality but take longer to encode.
      </p>

      <ErrorNote error={save.error} />
      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={renditions.length >= 8}
          onClick={() => setRenditions((rows) => [...rows, newRendition()])}
        >
          Add quality
        </button>
        <span className="grow" />
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}
