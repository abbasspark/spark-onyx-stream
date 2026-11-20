// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { authApi } from '@/api/endpoints';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { ErrorNote, Spinner } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';

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
    <div className="relative grid min-h-dvh place-items-center overflow-hidden p-6">
      {/* Soft color in the background, purely decorative. */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 size-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span
            className="size-11 rounded-2xl bg-linear-to-br from-primary to-fuchsia-500 shadow-lg"
            aria-hidden="true"
          />
          <div>
            <p className="text-xl font-semibold tracking-tight">Onyx Stream</p>
            <p className="text-sm text-muted-foreground">Admin panel</p>
          </div>
        </div>

        <form
          className="grid gap-4 rounded-2xl border bg-card p-6 shadow-xl"
          onSubmit={(event) => void submit(event)}
        >
          {setup.isPending ? <Spinner label="Connecting to the server" /> : null}
          <ErrorNote error={setup.error} />

          {setup.isSuccess ? (
            <>
              <div className="grid gap-1">
                <h1 className="text-lg font-semibold">
                  {needsSetup ? 'Create the first admin' : 'Sign in'}
                </h1>
                {needsSetup ? (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <ShieldCheck
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    This installation has no admin yet. The account you create here is the owner.
                  </p>
                ) : null}
              </div>

              {state.status === 'signedOut' && state.reason && !error ? (
                <p className="flex items-start gap-2 rounded-lg border bg-muted px-3 py-2 text-sm">
                  <Info
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {state.reason}
                </p>
              ) : null}

              <Field label="Email">
                {(id) => (
                  <Input
                    id={id}
                    type="email"
                    autoComplete="username"
                    required
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                )}
              </Field>
              {needsSetup ? (
                <Field label="Name">
                  {(id) => (
                    <Input
                      id={id}
                      autoComplete="name"
                      required
                      maxLength={100}
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                  )}
                </Field>
              ) : null}
              <Field label="Password" hint={needsSetup ? 'At least 12 characters.' : undefined}>
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete={needsSetup ? 'new-password' : 'current-password'}
                    required
                    minLength={needsSetup ? 12 : 1}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                )}
              </Field>

              <ErrorNote error={error} />
              <Button type="submit" variant="primary" size="lg" loading={busy}>
                {needsSetup ? 'Create admin and sign in' : 'Sign in'}
              </Button>
            </>
          ) : null}
        </form>
      </div>
    </div>
  );
}
