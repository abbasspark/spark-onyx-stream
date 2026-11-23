// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, ShieldCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { ErrorNote, Spinner } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { isCompleteCode, tidyCode } from '@/lib/two-factor';

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
  // The second step, for an admin with two-factor sign-in: null until it is asked for.
  const [codeKind, setCodeKind] = useState<'app' | 'recovery' | null>(null);
  const [code, setCode] = useState('');

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
      const left = await signIn(email, password, codeKind ? tidyCode(code) : undefined);
      if (left !== undefined) {
        toast.warning(
          left === 0
            ? 'That was your last recovery code'
            : `You signed in with a recovery code. ${left} ${left === 1 ? 'is' : 'are'} left`,
          {
            description: 'Make new ones under My account, or set up your authenticator app again.',
            duration: 12_000,
          },
        );
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'two_factor_required') {
        // The password was right. The form now asks for the code.
        setCodeKind('app');
        setCode('');
      } else {
        setError(caught);
        if (caught instanceof ApiError && caught.code === 'two_factor_invalid') {
          setCode('');
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setCodeKind(null);
    setCode('');
    setPassword('');
    setError(null);
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
                  {needsSetup ? 'Create the first admin' : codeKind ? 'Enter your code' : 'Sign in'}
                </h1>
                {codeKind ? (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <ShieldCheck
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {codeKind === 'app'
                      ? `Open your authenticator app and enter the code it shows for ${email}.`
                      : 'Enter one of the recovery codes you kept when you set this up. Each works once.'}
                  </p>
                ) : null}
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

              {codeKind ? (
                <>
                  <Field label={codeKind === 'app' ? 'Code from your app' : 'Recovery code'}>
                    {(id) => (
                      <Input
                        key={codeKind}
                        id={id}
                        required
                        autoFocus
                        autoComplete="one-time-code"
                        inputMode={codeKind === 'app' ? 'numeric' : 'text'}
                        spellCheck={false}
                        maxLength={codeKind === 'app' ? 7 : 20}
                        placeholder={codeKind === 'app' ? '123 456' : 'XXXX-XXXX-XXXX'}
                        className={
                          codeKind === 'app'
                            ? 'font-mono text-lg tracking-[0.3em] placeholder:tracking-[0.3em]'
                            : 'font-mono tracking-widest uppercase placeholder:tracking-widest'
                        }
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                      />
                    )}
                  </Field>
                  <ErrorNote error={error} />
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    loading={busy}
                    disabled={!isCompleteCode(code, codeKind)}
                  >
                    Sign in
                  </Button>
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm">
                    <button
                      type="button"
                      className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      onClick={() => {
                        setCodeKind(codeKind === 'app' ? 'recovery' : 'app');
                        setCode('');
                        setError(null);
                      }}
                    >
                      {codeKind === 'app' ? 'Use a recovery code' : 'Use a code from the app'}
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      onClick={startOver}
                    >
                      Start over
                    </button>
                  </div>
                  {codeKind === 'recovery' ? (
                    <p className="text-xs text-muted-foreground">
                      No phone and no recovery codes? Another admin can take two-factor sign-in off
                      your account under Admins. The only owner uses the command line of the server.
                    </p>
                  ) : null}
                </>
              ) : (
                <>
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
              )}
            </>
          ) : null}
        </form>
      </div>
    </div>
  );
}
