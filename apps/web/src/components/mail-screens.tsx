// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { readLinkToken, ViewerApiError, viewerApi } from '@/lib/viewer-api';
import { FormField } from './form-field';
import { useViewerSession } from './viewer-session';

const MIN_PASSWORD_LENGTH = 8;

function asError(caught: unknown): ViewerApiError {
  return caught instanceof ViewerApiError
    ? caught
    : new ViewerApiError(0, 'Something went wrong. Try again in a moment.');
}

function Spinner() {
  return <Loader2 className="animate-[player-spin_0.9s_linear_infinite]" aria-hidden="true" />;
}

function Screen({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="gutter grid min-h-[80dvh] content-center pt-28 pb-10">
      <div className="w-full max-w-md">
        <h1 className="display text-4xl sm:text-5xl">{heading}</h1>
        {children}
      </div>
    </div>
  );
}

/**
 * Takes the token of an emailed link out of the address. It is kept in
 * memory only, so it does not stay in the address bar or the history.
 *
 * @returns undefined until the address was read, then the token or null.
 */
function useLinkToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setToken((known) => {
      if (known !== undefined) {
        return known;
      }
      const found = readLinkToken(window.location.hash);
      if (found) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      return found;
    });
  }, []);
  return token;
}

/** Asks for the address and sends a link to set a new password. */
export function ForgotPasswordScreen() {
  const { access } = useViewerSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ViewerApiError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await viewerApi.forgotPassword(email.trim());
      setSentTo(email.trim());
    } catch (caught) {
      setError(asError(caught));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <Screen heading="Check your email">
        <p className="mt-6 text-lg text-smoke">
          If <span className="text-vein">{sentTo}</span> belongs to an account, a link to set a new
          password is on its way. It works for one hour.
        </p>
        <p className="mt-4 text-sm text-smoke">
          Nothing after a few minutes? Look in the spam folder, and check the address for typing
          mistakes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/sign-in" className="button button-play">
            Back to sign in
          </Link>
          <button type="button" className="button button-quiet" onClick={() => setSentTo(null)}>
            Use another address
          </button>
        </div>
      </Screen>
    );
  }

  if (access && !access.email) {
    return (
      <Screen heading="Forgot your password?">
        <p className="mt-6 text-lg text-smoke">
          This site does not send email. Ask the people who run it to set a new password for you.
        </p>
        <Link href="/sign-in" className="button button-play mt-8">
          Back to sign in
        </Link>
      </Screen>
    );
  }

  return (
    <Screen heading="Forgot your password?">
      <p className="mt-6 text-lg text-smoke">
        Enter the email address of your account. We send you a link to set a new password.
      </p>
      <form onSubmit={(event) => void submit(event)} className="mt-8 grid gap-5">
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
          {busy ? <Spinner /> : null}
          Send the link
        </button>
      </form>
      <p className="mt-8 text-smoke">
        Remembered it?{' '}
        <Link href="/sign-in" className="text-vein underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </Screen>
  );
}

/** Opened from the link in the email: sets the new password. */
export function ResetPasswordScreen() {
  const token = useLinkToken();
  const { setViewer } = useViewerSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ViewerApiError | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await viewerApi.resetPassword(token, password);
      // The new password signed every device out, this one included.
      setViewer(null);
      setDone(true);
    } catch (caught) {
      setError(asError(caught));
    } finally {
      setBusy(false);
    }
  };

  if (token === undefined) {
    return (
      <Screen heading="Set a new password">
        <div role="status" className="mt-8">
          <Loader2 className="size-10 animate-[player-spin_0.9s_linear_infinite]" />
          <span className="sr-only">Reading the link</span>
        </div>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen heading="Your password is changed">
        <p className="mt-6 text-lg text-smoke">
          You are signed out on all devices. Sign in with the new password.
        </p>
        <Link href="/sign-in" className="button button-play mt-8">
          Sign in
        </Link>
      </Screen>
    );
  }

  // A link that the server refused cannot be tried again with another password.
  const spent = error !== null && error.status === 400 && !error.fields.newPassword;
  if (token === null || spent) {
    return (
      <Screen heading="This link does not work">
        <p className="mt-6 text-lg text-smoke">
          {spent
            ? error.message
            : 'The link is incomplete. Open it from the email again, or copy the whole address.'}
        </p>
        <Link href="/forgot-password" className="button button-play mt-8">
          Send a new link
        </Link>
      </Screen>
    );
  }

  return (
    <Screen heading="Set a new password">
      <form onSubmit={(event) => void submit(event)} className="mt-8 grid gap-5">
        <FormField
          label="New password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          required
          autoFocus
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={128}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. You are signed out on all devices.`}
          value={password}
          error={error?.fields.newPassword}
          onValue={setPassword}
        />
        {error && !error.fields.newPassword ? (
          <p role="alert" className="border-l-2 border-alarm pl-3 text-alarm">
            {error.message}
          </p>
        ) : null}
        <button
          type="submit"
          className="button button-play mt-2 justify-self-start"
          disabled={busy}
        >
          {busy ? <Spinner /> : null}
          Save the new password
        </button>
      </form>
    </Screen>
  );
}

type Verification =
  { state: 'working' } | { state: 'done'; email: string } | { state: 'failed'; message: string };

/** Opened from the link in the email: confirms the address. */
export function VerifyEmailScreen() {
  const token = useLinkToken();
  const { viewer, updateViewer } = useViewerSession();
  const [result, setResult] = useState<Verification>({ state: 'working' });
  // A link works once, so it is used once, however often this runs.
  const used = useRef(false);

  useEffect(() => {
    if (token === undefined || used.current) {
      return;
    }
    used.current = true;
    if (token === null) {
      setResult({
        state: 'failed',
        message: 'The link is incomplete. Open it from the email again, or copy the whole address.',
      });
      return;
    }
    viewerApi
      .verifyEmail(token)
      .then(({ email }) => {
        setResult({ state: 'done', email });
        updateViewer((current) =>
          current.email === email ? { ...current, emailVerified: true } : current,
        );
      })
      .catch((caught: unknown) => setResult({ state: 'failed', message: asError(caught).message }));
  }, [token, updateViewer]);

  if (result.state === 'working') {
    return (
      <Screen heading="Confirming your email address">
        <div role="status" className="mt-8">
          <Loader2 className="size-10 animate-[player-spin_0.9s_linear_infinite]" />
          <span className="sr-only">One moment</span>
        </div>
      </Screen>
    );
  }

  if (result.state === 'done') {
    return (
      <Screen heading="Your email address is confirmed">
        <p className="mt-6 flex items-center gap-3 text-lg text-smoke">
          <MailCheck className="size-6 shrink-0 text-sard" aria-hidden="true" />
          <span className="text-vein">{result.email}</span>
        </p>
        <Link href={viewer ? '/' : '/sign-in'} className="button button-play mt-8">
          {viewer ? 'Start watching' : 'Sign in'}
        </Link>
      </Screen>
    );
  }

  return (
    <Screen heading="This link does not work">
      <p className="mt-6 text-lg text-smoke">{result.message}</p>
      <p className="mt-4 text-sm text-smoke">
        {viewer?.emailVerified
          ? 'Your address is confirmed already, so there is nothing left to do.'
          : 'You can send yourself a new link from your account page.'}
      </p>
      <Link
        href={viewer ? '/account' : '/sign-in?next=%2Faccount'}
        className="button button-play mt-8"
      >
        {viewer ? 'Go to my account' : 'Sign in'}
      </Link>
    </Screen>
  );
}

/** Opens the link sent to a new address, and the account uses it from then on. */
export function ConfirmEmailChangeScreen() {
  const token = useLinkToken();
  const [result, setResult] = useState<Verification>({ state: 'working' });
  // A link works once, so it is used once, however often this runs.
  const used = useRef(false);

  useEffect(() => {
    if (token === undefined || used.current) {
      return;
    }
    used.current = true;
    if (token === null) {
      setResult({
        state: 'failed',
        message: 'The link is incomplete. Open it from the email again, or copy the whole address.',
      });
      return;
    }
    viewerApi
      .confirmEmailChange(token)
      .then(({ email }) => setResult({ state: 'done', email }))
      .catch((caught: unknown) => setResult({ state: 'failed', message: asError(caught).message }));
  }, [token]);

  if (result.state === 'working') {
    return (
      <Screen heading="Changing your email address">
        <div role="status" className="mt-8">
          <Loader2 className="size-10 animate-[player-spin_0.9s_linear_infinite]" />
          <span className="sr-only">One moment</span>
        </div>
      </Screen>
    );
  }

  if (result.state === 'done') {
    return (
      <Screen heading="Your email address was changed">
        <p className="mt-6 flex items-center gap-3 text-lg text-smoke">
          <MailCheck className="size-6 shrink-0 text-sard" aria-hidden="true" />
          <span className="text-vein">{result.email}</span>
        </p>
        <p className="mt-4 text-sm text-smoke">
          From now on you sign in with this address. We told the old one about the change.
        </p>
        {/* A whole page load, so that a signed-in tab learns the new address. */}
        <a href="/account" className="button button-play mt-8">
          Go to my account
        </a>
      </Screen>
    );
  }

  return (
    <Screen heading="This link does not work">
      <p className="mt-6 text-lg text-smoke">{result.message}</p>
      <p className="mt-4 text-sm text-smoke">
        You can ask for a new link from your account page. Your address stays as it is until a link
        is opened.
      </p>
      <Link href="/account" className="button button-play mt-8">
        Go to my account
      </Link>
    </Screen>
  );
}
