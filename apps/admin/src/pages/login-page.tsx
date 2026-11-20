// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { authApi } from '../api/endpoints';
import { useSession } from '../auth/session';
import { ErrorNote, Spinner } from '../components/ui';

/** Sign-in screen. On a fresh installation it asks for the first owner instead. */
export function LoginPage() {
  const { state, signIn } = useSession();
  const queryClient = useQueryClient();
  const setup = useQuery({ queryKey: ['setup-status'], queryFn: authApi.setupStatus, retry: 1 });

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const needsSetup = setup.data?.required === true;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (needsSetup) {
        await authApi.setup({ email, displayName, password });
        await queryClient.invalidateQueries({ queryKey: ['setup-status'] });
      }
      await signIn(email, password);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card login-card" onSubmit={(event) => void submit(event)}>
        <div className="brand brand-large">
          <span className="brand-mark" aria-hidden="true" />
          Onyx Stream
        </div>

        {setup.isPending ? <Spinner label="Connecting to the server" /> : null}
        {setup.isError ? <ErrorNote error={setup.error} /> : null}

        {setup.isSuccess ? (
          <>
            <h1>{needsSetup ? 'Create the first admin' : 'Sign in'}</h1>
            {needsSetup ? (
              <p className="muted">
                This installation has no admin yet. The account you create here is the owner.
              </p>
            ) : null}
            {state.status === 'signedOut' && state.reason && !error ? (
              <p className="note">{state.reason}</p>
            ) : null}

            <label className="field">
              Email
              <input
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {needsSetup ? (
              <label className="field">
                Name
                <input
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={100}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
            ) : null}
            <label className="field">
              Password
              <input
                type="password"
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                required
                minLength={needsSetup ? 12 : 1}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {needsSetup ? <span className="hint">At least 12 characters.</span> : null}
            </label>

            <ErrorNote error={error} />
            <button type="submit" className="button button-primary" disabled={busy}>
              {busy ? 'Please wait…' : needsSetup ? 'Create admin and sign in' : 'Sign in'}
            </button>
          </>
        ) : null}
      </form>
    </div>
  );
}
