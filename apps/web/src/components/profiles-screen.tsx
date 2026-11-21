// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Check, Loader2, Pencil, Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { colorLabel, colorOf, type Profile, type Profiles, profilesApi } from '@/lib/profiles';
import { authHref, safeNextPath, ViewerApiError } from '@/lib/viewer-api';
import { FormField } from './form-field';
import { ProfileAvatar } from './profile-avatar';
import { useViewerSession } from './viewer-session';

function asError(caught: unknown): ViewerApiError {
  return caught instanceof ViewerApiError
    ? caught
    : new ViewerApiError(0, 'Something went wrong. Try again in a moment.');
}

function Spinner() {
  return <Loader2 className="animate-[player-spin_0.9s_linear_infinite]" aria-hidden="true" />;
}

const TILE = 'size-[clamp(6.5rem,24vw,10rem)]';

/**
 * "Who is watching?": choosing the profile for this device, and, in its
 * second mode, adding, changing and deleting profiles.
 */
export function ProfilesScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const { state, viewer, profile: current, setProfile } = useViewerSession();

  const [data, setData] = useState<Profiles | null>(null);
  const [error, setError] = useState<ViewerApiError | null>(null);
  const [managing, setManaging] = useState(false);
  /** The profile being changed, "new" for one being added, null for none. */
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);

  useEffect(() => {
    if (state === 'ready' && !viewer) {
      router.replace(authHref('sign-in', '/profiles'));
    }
  }, [state, viewer, router]);

  const load = useCallback(async () => {
    try {
      setData(await profilesApi.list());
      setError(null);
    } catch (caught) {
      setError(asError(caught));
    }
  }, []);

  const viewerId = viewer?.id;
  useEffect(() => {
    if (viewerId) {
      void load();
    }
  }, [viewerId, load]);

  const choose = async (profile: Profile) => {
    setChoosing(profile.id);
    try {
      setProfile(await profilesApi.select(profile.id));
      router.replace(next);
      // The tile stays busy until the next page is there.
    } catch (caught) {
      setError(asError(caught));
      setChoosing(null);
      void load();
    }
  };

  if (state === 'loading' || !viewer || (!data && !error)) {
    return (
      <div role="status" className="grid min-h-[70dvh] place-items-center pt-28">
        <Loader2 className="size-10 animate-[player-spin_0.9s_linear_infinite]" />
        <span className="sr-only">Loading the profiles</span>
      </div>
    );
  }

  if (editing && data) {
    return (
      <ProfileEditor
        profile={editing === 'new' ? null : editing}
        colors={data.colors}
        isCurrent={editing !== 'new' && editing.id === current?.id}
        onCancel={() => setEditing(null)}
        onSaved={(saved) => {
          if (saved && saved.id === current?.id) {
            setProfile(saved);
          }
          setEditing(null);
          void load();
        }}
      />
    );
  }

  const profiles = data?.profiles ?? [];
  const canAdd = data !== null && profiles.length < data.limit;

  return (
    <div className="gutter grid min-h-[80dvh] content-center justify-items-center pt-28 pb-10 text-center">
      <h1 className="display text-4xl sm:text-6xl">
        {managing ? 'Manage profiles' : 'Who is watching?'}
      </h1>
      <p className="mt-4 max-w-md text-smoke">
        {managing
          ? 'Choose a profile to change its name or colour, or to delete it.'
          : 'Each profile has its own "Continue watching" and its own watched marks.'}
      </p>

      {error ? (
        <p role="alert" className="mt-6 border-l-2 border-alarm pl-3 text-left text-alarm">
          {error.message}
        </p>
      ) : null}

      <ul className="mt-10 flex max-w-4xl flex-wrap justify-center gap-x-6 gap-y-8 sm:gap-x-8">
        {profiles.map((profile) => (
          <li key={profile.id}>
            <button
              type="button"
              disabled={choosing !== null}
              aria-label={managing ? `Change ${profile.name}` : `Watch as ${profile.name}`}
              className="group grid justify-items-center gap-3 outline-offset-8"
              onClick={() => (managing ? setEditing(profile) : void choose(profile))}
            >
              <span className="relative block">
                <ProfileAvatar
                  profile={profile}
                  className={`${TILE} transition-[filter,outline-color] outline-2 outline-offset-4 outline-transparent group-hover:outline-vein group-focus-visible:outline-vein ${
                    managing ? 'brightness-50' : ''
                  }`}
                />
                {managing ? (
                  <span className="absolute inset-0 grid place-items-center">
                    <Pencil className="size-8" aria-hidden="true" />
                  </span>
                ) : null}
                {choosing === profile.id ? (
                  <span className="absolute inset-0 grid place-items-center bg-onyx/60">
                    <Loader2 className="size-8 animate-[player-spin_0.9s_linear_infinite]" />
                  </span>
                ) : null}
              </span>
              <span className="flex max-w-40 items-center gap-1.5 text-smoke group-hover:text-vein">
                <span className="truncate">{profile.name}</span>
                {!managing && profile.id === current?.id ? (
                  <Check className="size-4 shrink-0 text-sard" aria-label="In use on this device" />
                ) : null}
              </span>
            </button>
          </li>
        ))}
        {canAdd ? (
          <li>
            <button
              type="button"
              className="group grid justify-items-center gap-3 outline-offset-8"
              onClick={() => setEditing('new')}
            >
              <span
                className={`${TILE} grid place-items-center rounded-[3px] border border-dashed border-line text-smoke transition-colors group-hover:border-vein group-hover:text-vein`}
              >
                <Plus className="size-10" aria-hidden="true" />
              </span>
              <span className="text-smoke group-hover:text-vein">Add a profile</span>
            </button>
          </li>
        ) : null}
      </ul>

      {data && !canAdd ? (
        <p className="mt-8 text-sm text-dust">An account can have {data.limit} profiles.</p>
      ) : null}

      <button
        type="button"
        className="button button-quiet mt-12"
        onClick={() => setManaging((value) => !value)}
      >
        {managing ? 'Done' : 'Manage profiles'}
      </button>
    </div>
  );
}

interface ProfileEditorProps {
  /** Null to add a profile. */
  profile: Profile | null;
  colors: readonly string[];
  isCurrent: boolean;
  onCancel: () => void;
  /** Called with the saved profile, or with null after a profile was deleted. */
  onSaved: (profile: Profile | null) => void;
}

function ProfileEditor({ profile, colors, isCurrent, onCancel, onSaved }: ProfileEditorProps) {
  const { setProfile } = useViewerSession();
  const [name, setName] = useState(profile?.name ?? '');
  const [color, setColor] = useState(profile?.color ?? null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<ViewerApiError | null>(null);
  const [confirming, setConfirming] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('save');
    setError(null);
    try {
      const input = { name: name.trim(), ...(color ? { color } : {}) };
      onSaved(
        profile ? await profilesApi.update(profile.id, input) : await profilesApi.create(input),
      );
    } catch (caught) {
      setError(asError(caught));
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!profile) {
      return;
    }
    setBusy('delete');
    setError(null);
    try {
      await profilesApi.remove(profile.id);
      if (isCurrent) {
        // This device was using it, and is back on the main profile.
        const { profiles, currentId } = await profilesApi.list();
        const now = profiles.find((candidate) => candidate.id === currentId);
        if (now) {
          setProfile(now);
        }
      }
      onSaved(null);
    } catch (caught) {
      setError(asError(caught));
      setBusy(null);
    }
  };

  const shown = { name: name.trim() || '?', color: color ?? colors[0] ?? 'slate' };
  const nameError = error?.fields.name ?? (error?.status === 409 ? error.message : undefined);

  return (
    <div className="gutter grid min-h-[80dvh] content-center pt-28 pb-10">
      <div className="w-full max-w-xl">
        <h1 className="display text-4xl sm:text-5xl">
          {profile ? 'Change profile' : 'Add a profile'}
        </h1>
        <form onSubmit={(event) => void submit(event)} className="mt-10 grid gap-8">
          <div className="flex items-end gap-5">
            <ProfileAvatar profile={shown} className="size-24 sm:size-28" />
            <div className="min-w-0 flex-1">
              <FormField
                label="Name"
                name="profile-name"
                autoComplete="off"
                required
                autoFocus
                maxLength={40}
                value={name}
                error={nameError}
                onValue={(value) => {
                  setName(value);
                  // The complaint was about the name as it was.
                  setError(null);
                }}
              />
            </div>
          </div>

          <fieldset>
            <legend className="mb-3 text-sm text-smoke">Colour</legend>
            <div className="flex flex-wrap gap-3">
              {colors.map((option) => (
                <label key={option} className="relative block size-11 cursor-pointer">
                  <input
                    type="radio"
                    name="profile-color"
                    value={option}
                    checked={shown.color === option}
                    onChange={() => setColor(option)}
                    className="peer absolute inset-0 cursor-pointer opacity-0"
                    aria-label={colorLabel(option)}
                  />
                  <span
                    className="block size-full rounded-[3px] outline-2 outline-offset-3 outline-transparent peer-checked:outline-vein peer-focus-visible:outline-sard"
                    style={{ background: colorOf(option) }}
                  />
                  {shown.color === option ? (
                    <Check
                      className="pointer-events-none absolute inset-0 m-auto size-5 text-onyx"
                      aria-hidden="true"
                    />
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>

          {error && !nameError ? (
            <p role="alert" className="border-l-2 border-alarm pl-3 text-alarm">
              {error.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="button button-play" disabled={busy !== null}>
              {busy === 'save' ? <Spinner /> : null}
              {profile ? 'Save' : 'Add profile'}
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={busy !== null}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </form>

        {profile && !profile.isMain ? (
          <div className="mt-14 border-t border-line pt-8">
            {confirming ? (
              <div className="grid gap-4">
                <p>
                  Deleting {profile.name} also deletes what this profile watched. This cannot be
                  undone.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="button button-danger"
                    disabled={busy !== null}
                    onClick={() => void remove()}
                  >
                    {busy === 'delete' ? <Spinner /> : null}
                    Delete {profile.name}
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    disabled={busy !== null}
                    onClick={() => setConfirming(false)}
                  >
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setConfirming(true)}
              >
                Delete this profile
              </button>
            )}
          </div>
        ) : null}
        {profile?.isMain ? (
          <p className="mt-14 border-t border-line pt-8 text-sm text-dust">
            This is the main profile. It stays with the account and cannot be deleted.
          </p>
        ) : null}
      </div>
    </div>
  );
}
