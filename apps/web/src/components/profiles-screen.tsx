// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Check, Loader2, Lock, Pencil, Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { describeLimit } from '@/lib/audience';
import { type Profile, type Profiles, profilesApi } from '@/lib/profiles';
import { authHref, safeNextPath, ViewerApiError } from '@/lib/viewer-api';
import { ProfileAvatar } from './profile-avatar';
import { ProfileEditor } from './profile-editor';
import { ProfileGate } from './profile-gate';
import { useViewerSession } from './viewer-session';

function asError(caught: unknown): ViewerApiError {
  return caught instanceof ViewerApiError
    ? caught
    : new ViewerApiError(0, 'Something went wrong. Try again in a moment.');
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
  const {
    state,
    viewer,
    profile: current,
    restricted,
    chooseProfile,
    setProfile,
  } = useViewerSession();

  const [data, setData] = useState<Profiles | null>(null);
  const [error, setError] = useState<ViewerApiError | null>(null);
  const [managing, setManaging] = useState(false);
  /** The profile being changed, "new" for one being added, null for none. */
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  /** The profile whose PIN is being asked for. */
  const [gated, setGated] = useState<Profile | null>(null);
  // A profile with a limit watches. It does not change who may watch what.
  const canManage = !restricted;

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
    if (profile.locked) {
      setError(null);
      setGated(profile);
      return;
    }
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

  if (gated) {
    return (
      <ProfileGate
        profile={gated}
        onCancel={() => setGated(null)}
        onOpened={(opened) => {
          setProfile(opened);
          router.replace(next);
        }}
      />
    );
  }

  if (editing && data && canManage) {
    return (
      <ProfileEditor
        profile={editing === 'new' ? null : editing}
        colors={data.colors}
        isCurrent={editing !== 'new' && editing.id === current?.id}
        onCancel={() => {
          setEditing(null);
          // A PIN may have been set or lifted in the meantime.
          void load();
        }}
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
  const canAdd = canManage && data !== null && profiles.length < data.limit;
  // Until a sign-in said who is watching, no profile is the one in use.
  const inUse = chooseProfile ? null : current?.id;

  return (
    <div className="gutter grid min-h-[80dvh] content-center justify-items-center pt-28 pb-10 text-center">
      <h1 className="display text-4xl sm:text-6xl">
        {managing ? 'Manage profiles' : 'Who is watching?'}
      </h1>
      <p className="mt-4 max-w-md text-smoke">
        {managing
          ? 'Choose a profile to change its name, what it can watch or its PIN, or to delete it.'
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
              aria-label={
                managing
                  ? `Change ${profile.name}`
                  : `Watch as ${profile.name}${profile.locked ? ', asks for a PIN' : ''}`
              }
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
                {profile.locked && !managing ? (
                  <span className="absolute -right-2 -bottom-2 grid size-8 place-items-center rounded-full border border-line bg-coal">
                    <Lock className="size-3.5" aria-label="Asks for a PIN" />
                  </span>
                ) : null}
                {choosing === profile.id ? (
                  <span className="absolute inset-0 grid place-items-center bg-onyx/60">
                    <Loader2 className="size-8 animate-[player-spin_0.9s_linear_infinite]" />
                  </span>
                ) : null}
              </span>
              <span className="grid justify-items-center gap-0.5">
                <span className="flex max-w-40 items-center gap-1.5 text-smoke group-hover:text-vein">
                  <span className="truncate">{profile.name}</span>
                  {!managing && profile.id === inUse ? (
                    <Check
                      className="size-4 shrink-0 text-sard"
                      aria-label="In use on this device"
                    />
                  ) : null}
                </span>
                {describeLimit(profile.maxAge) ? (
                  <span className="text-xs text-dust">
                    {profile.isKids
                      ? `Kids, ${describeLimit(profile.maxAge)?.toLowerCase()}`
                      : describeLimit(profile.maxAge)}
                  </span>
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

      {canManage ? (
        <button
          type="button"
          className="button button-quiet mt-12"
          onClick={() => setManaging((value) => !value)}
        >
          {managing ? 'Done' : 'Manage profiles'}
        </button>
      ) : (
        <p className="mt-12 max-w-sm text-sm text-dust">
          {chooseProfile
            ? 'Choose a profile to start watching.'
            : 'Profiles are managed from a profile without an age limit.'}
        </p>
      )}
    </div>
  );
}
