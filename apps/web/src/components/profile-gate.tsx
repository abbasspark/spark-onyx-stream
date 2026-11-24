// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Loader2, Lock } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { isPin } from '@/lib/audience';
import { type Profile, profilesApi } from '@/lib/profiles';
import { ViewerApiError } from '@/lib/viewer-api';
import { FormField } from './form-field';
import { PinField } from './pin-field';
import { ProfileAvatar } from './profile-avatar';

function asError(caught: unknown): ViewerApiError {
  return caught instanceof ViewerApiError
    ? caught
    : new ViewerApiError(0, 'Something went wrong. Try again in a moment.');
}

interface ProfileGateProps {
  profile: Profile;
  /** Called with the profile once it is the one in use on this device. */
  onOpened: (profile: Profile) => void;
  onCancel: () => void;
}

/**
 * Asks for the PIN of a profile before it is used. Whoever forgot it takes
 * the PIN off with the password of the account.
 */
export function ProfileGate({ profile, onOpened, onCancel }: ProfileGateProps) {
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ViewerApiError | null>(null);

  const shut = error?.code === 'pin_locked' || error?.attemptsLeft === 0;

  const open = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onOpened(await profilesApi.select(profile.id, pin));
      // Stays busy until the next page is there.
    } catch (caught) {
      setError(asError(caught));
      setPin('');
      setBusy(false);
    }
  };

  const lift = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await profilesApi.setPin(profile.id, null, password);
      onOpened(await profilesApi.select(profile.id));
    } catch (caught) {
      setError(asError(caught));
      setBusy(false);
    }
  };

  return (
    <div className="gutter grid min-h-[80dvh] content-center justify-items-center pt-28 pb-10 text-center">
      <span className="relative block">
        <ProfileAvatar profile={profile} className="size-24 sm:size-28" />
        <span className="absolute -right-2 -bottom-2 grid size-9 place-items-center rounded-full border border-line bg-coal">
          <Lock className="size-4" aria-hidden="true" />
        </span>
      </span>
      <h1 className="display mt-8 text-4xl sm:text-5xl">
        {forgot ? 'Take the PIN off' : `Enter the PIN for ${profile.name}`}
      </h1>

      {forgot ? (
        <form onSubmit={(event) => void lift(event)} className="mt-8 grid w-full max-w-sm gap-6">
          <p className="text-smoke">
            The password of the account takes the PIN off {profile.name}. You can set a new one
            afterwards under "Manage profiles".
          </p>
          <div className="text-left">
            <FormField
              label="Password of the account"
              name="account-password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              value={password}
              error={error?.message}
              onValue={(value) => {
                setPassword(value);
                setError(null);
              }}
            />
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="submit" className="button button-play" disabled={busy || !password}>
              {busy ? (
                <Loader2
                  className="animate-[player-spin_0.9s_linear_infinite]"
                  aria-hidden="true"
                />
              ) : null}
              Take the PIN off and continue
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={busy}
              onClick={() => {
                setForgot(false);
                setError(null);
              }}
            >
              Back
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={(event) => void open(event)} className="mt-8 grid w-full max-w-sm gap-6">
          <PinField
            label="PIN"
            align="center"
            autoFocus
            value={pin}
            error={error?.message}
            onValue={(value) => {
              setPin(value);
              if (!shut) {
                setError(null);
              }
            }}
          />
          <div className="flex flex-wrap justify-center gap-3">
            <button type="submit" className="button button-play" disabled={busy || !isPin(pin)}>
              {busy ? (
                <Loader2
                  className="animate-[player-spin_0.9s_linear_infinite]"
                  aria-hidden="true"
                />
              ) : null}
              Continue
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={busy}
              onClick={onCancel}
            >
              Back
            </button>
          </div>
          <button
            type="button"
            className="justify-self-center text-sm text-smoke underline underline-offset-4 hover:text-vein"
            onClick={() => {
              setForgot(true);
              setError(null);
            }}
          >
            Forgot the PIN?
          </button>
        </form>
      )}
    </div>
  );
}
