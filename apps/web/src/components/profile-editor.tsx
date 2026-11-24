// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Check, Loader2, Lock, LockOpen } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { AGE_CHOICES, isPin } from '@/lib/audience';
import { nativeLanguageName } from '@/lib/language';
import { languageChoices } from '@/lib/tracks';
import { colorLabel, colorOf, type Profile, type ProfileInput, profilesApi } from '@/lib/profiles';
import { ViewerApiError } from '@/lib/viewer-api';
import { FormField } from './form-field';
import { PinField } from './pin-field';
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

/** The limit a profile for a child starts with. The same as in the API. */
const KIDS_AGE = 12;

interface ProfileEditorProps {
  /** Null to add a profile. */
  profile: Profile | null;
  colors: readonly string[];
  isCurrent: boolean;
  onCancel: () => void;
  /** Called with the saved profile, or with null after a profile was deleted. */
  onSaved: (profile: Profile | null) => void;
}

/** Adds a profile, or changes one: its name and colour, what it may watch, and its PIN. */
export function ProfileEditor({
  profile,
  colors,
  isCurrent,
  onCancel,
  onSaved,
}: ProfileEditorProps) {
  const { setProfile } = useViewerSession();
  const [name, setName] = useState(profile?.name ?? '');
  const [color, setColor] = useState(profile?.color ?? null);
  const [isKids, setIsKids] = useState(profile?.isKids ?? false);
  const [maxAge, setMaxAge] = useState<number | null>(profile?.maxAge ?? null);
  const [audioLanguage, setAudioLanguage] = useState(profile?.audioLanguage ?? '');
  const [subtitleLanguage, setSubtitleLanguage] = useState(profile?.subtitleLanguage ?? '');
  /** The profile as the API last answered, which knows whether it has a PIN. */
  const [saved, setSaved] = useState(profile);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<ViewerApiError | null>(null);
  const [confirming, setConfirming] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('save');
    setError(null);
    try {
      const input: ProfileInput & { name: string } = {
        name: name.trim(),
        ...(color ? { color } : {}),
        audioLanguage: audioLanguage || null,
        subtitleLanguage: subtitleLanguage || null,
        // The main profile is the way back into the account and has no limit.
        ...(profile?.isMain ? {} : { isKids, maxAge }),
      };
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

          <fieldset>
            <legend className="mb-1 text-sm text-smoke">Languages</legend>
            <p className="mb-3 max-w-prose text-sm text-dust">
              A video starts with these when it has them. What is chosen in the player is remembered
              here.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <LanguageSelect
                label="Sound"
                none="Each video in its own"
                value={audioLanguage}
                onValue={setAudioLanguage}
              />
              <LanguageSelect
                label="Subtitles"
                none="Off"
                value={subtitleLanguage}
                onValue={setSubtitleLanguage}
              />
            </div>
          </fieldset>

          {profile?.isMain ? null : (
            <fieldset>
              <legend className="mb-1 text-sm text-smoke">Can watch</legend>
              <p className="mb-3 max-w-prose text-sm text-dust">
                With a limit, titles and channels rated for older viewers are hidden and do not
                play. So are those nobody rated.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {AGE_CHOICES.map((choice) => {
                  const chosen = maxAge === choice.value;
                  // A profile for a child always has a limit.
                  const unavailable = isKids && choice.value === null;
                  return (
                    <label
                      key={choice.label}
                      className={`relative block rounded-[3px] border px-3.5 py-3 transition-colors ${
                        chosen ? 'border-vein bg-ash' : 'border-line'
                      } ${unavailable ? 'opacity-40' : 'cursor-pointer hover:border-vein/50'} has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-sard`}
                    >
                      <input
                        type="radio"
                        name="profile-limit"
                        className="absolute inset-0 cursor-[inherit] opacity-0"
                        checked={chosen}
                        disabled={unavailable}
                        onChange={() => setMaxAge(choice.value)}
                      />
                      <span className="flex items-center justify-between gap-2 font-medium">
                        {choice.label}
                        {chosen ? <Check className="size-4 text-sard" aria-hidden="true" /> : null}
                      </span>
                      <span className="mt-0.5 block text-sm text-smoke">{choice.hint}</span>
                    </label>
                  );
                })}
              </div>
              <label className="mt-4 flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-sard"
                  checked={isKids}
                  onChange={(event) => {
                    setIsKids(event.target.checked);
                    if (event.target.checked && maxAge === null) {
                      setMaxAge(KIDS_AGE);
                    }
                  }}
                />
                <span>
                  <span className="block font-medium">This is a child&apos;s profile</span>
                  <span className="block text-sm text-smoke">
                    It always has a limit, and the apps show it with a simpler look.
                  </span>
                </span>
              </label>
            </fieldset>
          )}

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

        {saved ? <PinSection profile={saved} onChanged={setSaved} /> : null}

        {profile && !profile.isMain ? (
          <div className="mt-10 border-t border-line pt-8">
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
          <p className="mt-10 border-t border-line pt-8 text-sm text-dust">
            This is the main profile. It stays with the account, cannot be deleted and has no age
            limit: it is the way back into the account.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** A language a profile likes, or none. Languages are named in themselves, as a viewer looks for them. */
function LanguageSelect({
  label,
  none,
  value,
  onValue,
}: {
  label: string;
  /** What choosing no language means. */
  none: string;
  value: string;
  onValue: (value: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        className="input"
        value={value}
        onChange={(event) => onValue(event.target.value)}
      >
        <option value="">{none}</option>
        {languageChoices(value || null, nativeLanguageName).map((choice) => (
          <option key={choice.value} value={choice.value} lang={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Whether choosing the profile asks for a PIN, and the form that sets, changes or lifts it. */
function PinSection({
  profile,
  onChanged,
}: {
  profile: Profile;
  onChanged: (profile: Profile) => void;
}) {
  const [mode, setMode] = useState<'set' | 'remove' | null>(null);
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ViewerApiError | null>(null);
  const locked = profile.locked === true;

  const close = () => {
    setMode(null);
    setPin('');
    setPassword('');
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChanged(await profilesApi.setPin(profile.id, mode === 'remove' ? null : pin, password));
      close();
    } catch (caught) {
      setError(asError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-14 border-t border-line pt-8" aria-labelledby="profile-pin">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-[3px] border border-line text-smoke">
          {locked ? <Lock className="size-5" /> : <LockOpen className="size-5" />}
        </span>
        <div className="min-w-0">
          <h2 id="profile-pin" className="font-medium">
            {locked ? 'Locked with a PIN' : 'No PIN'}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-smoke">
            {profile.isMain
              ? 'With a PIN here, nobody switches to the main profile without it, and a new sign-in asks who is watching before it shows anything.'
              : 'With a PIN, this profile is only chosen by whoever knows it.'}
          </p>
        </div>
      </div>

      {mode ? (
        <form onSubmit={(event) => void submit(event)} className="mt-6 grid max-w-sm gap-5">
          {mode === 'set' ? (
            <PinField
              label={locked ? 'New PIN' : 'PIN'}
              hint="Four to six digits."
              autoFocus
              value={pin}
              error={error?.fields.pin}
              onValue={setPin}
            />
          ) : null}
          <FormField
            label="Password of the account"
            name="account-password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus={mode === 'remove'}
            hint="So that only the owner of the account sets or lifts a PIN."
            value={password}
            error={error && !error.fields.pin ? error.message : undefined}
            onValue={(value) => {
              setPassword(value);
              setError(null);
            }}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className={`button ${mode === 'remove' ? 'button-danger' : 'button-play'}`}
              disabled={busy || !password || (mode === 'set' && !isPin(pin))}
            >
              {busy ? <Spinner /> : null}
              {mode === 'remove' ? 'Take the PIN off' : locked ? 'Change the PIN' : 'Set the PIN'}
            </button>
            <button type="button" className="button button-quiet" disabled={busy} onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="button button-quiet" onClick={() => setMode('set')}>
            {locked ? 'Change the PIN' : 'Set a PIN'}
          </button>
          {locked ? (
            <button type="button" className="button button-quiet" onClick={() => setMode('remove')}>
              Take the PIN off
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
