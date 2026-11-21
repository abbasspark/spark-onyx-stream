// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { profilesApi } from '@/lib/profiles';
import { authHref, safeNextPath, ViewerApiError, viewerApi } from '@/lib/viewer-api';
import { FormField } from './form-field';
import { useViewerSession } from './viewer-session';

const MIN_PASSWORD_LENGTH = 8;

/**
 * The sign-in and the sign-up form. After either, the viewer lands where they
 * came from, for example on the video they wanted to watch.
 */
export function AuthScreen({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const { state, viewer, access, setViewer } = useViewerSession();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ViewerApiError | null>(null);

  // Someone who is signed in already has no use for this page.
  useEffect(() => {
    if (state === 'ready' && viewer && !busy) {
      router.replace(next);
    }
  }, [state, viewer, busy, next, router]);

  const isSignUp = mode === 'sign-up';
  const closed = isSignUp && access?.registration === 'closed';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signedIn = isSignUp
        ? await viewerApi.register({ email, displayName, password })
        : await viewerApi.login({ email, password });
      setViewer(signedIn.viewer, signedIn.profile);
      // An account that several people share asks who is watching.
      const shared = isSignUp
        ? false
        : await profilesApi
            .list()
            .then((result) => result.profiles.length > 1)
            .catch(() => false);
      router.replace(shared ? `/profiles?next=${encodeURIComponent(next)}` : next);
      // The button stays busy until the next page is there.
    } catch (caught) {
      setError(
        caught instanceof ViewerApiError
          ? caught
          : new ViewerApiError(0, 'Something went wrong. Try again in a moment.'),
      );
      setBusy(false);
    }
  };

  const other = isSignUp ? (
    <p className="mt-8 text-smoke">
      Already have an account?{' '}
      <Link href={authHref('sign-in', next)} className="text-vein underline underline-offset-4">
        Sign in
      </Link>
    </p>
  ) : access?.registration === 'closed' ? (
    <p className="mt-8 max-w-sm text-sm text-smoke">
      New accounts are created by the people who run this site. Ask them if you need one.
    </p>
  ) : (
    <p className="mt-8 text-smoke">
      New here?{' '}
      <Link href={authHref('sign-up', next)} className="text-vein underline underline-offset-4">
        Create an account
      </Link>
    </p>
  );

  return (
    <div className="gutter grid min-h-[80dvh] content-center pt-28 pb-10">
      <div className="w-full max-w-md">
        <h1 className="display text-4xl sm:text-5xl">
          {isSignUp ? 'Create an account' : 'Sign in'}
        </h1>

        {closed ? (
          <>
            <p className="mt-6 text-lg text-smoke">
              New accounts cannot be created here. The people who run this site create them.
            </p>
            <Link href={authHref('sign-in', next)} className="button button-play mt-8">
              Sign in instead
            </Link>
          </>
        ) : (
          <>
            <form
              onSubmit={(event) => void submit(event)}
              className="mt-9 grid gap-5"
              noValidate={false}
            >
              {isSignUp ? (
                <FormField
                  label="Name"
                  hint="How the site addresses you."
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                  value={displayName}
                  error={error?.fields.displayName}
                  onValue={setDisplayName}
                />
              ) : null}
              <FormField
                label="Email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={254}
                autoFocus
                value={email}
                error={error?.fields.email}
                onValue={setEmail}
              />
              <FormField
                label="Password"
                type="password"
                name="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                required
                minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
                maxLength={128}
                hint={isSignUp ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
                value={password}
                error={error?.fields.password}
                onValue={setPassword}
              />

              {error && Object.keys(error.fields).length === 0 ? (
                <p role="alert" className="border-l-2 border-alarm pl-3 text-alarm">
                  {error.message}
                </p>
              ) : null}

              <button
                type="submit"
                className="button button-play mt-2 justify-self-start"
                disabled={busy}
              >
                {busy ? (
                  <Loader2
                    className="animate-[player-spin_0.9s_linear_infinite]"
                    aria-hidden="true"
                  />
                ) : null}
                {isSignUp ? 'Create account' : 'Sign in'}
              </button>
              {!isSignUp && access?.email ? (
                <Link
                  href="/forgot-password"
                  className="justify-self-start text-sm text-smoke underline underline-offset-4 hover:text-vein"
                >
                  Forgot your password?
                </Link>
              ) : null}
            </form>
            {other}
          </>
        )}
      </div>
    </div>
  );
}
