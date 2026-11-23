// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  Download,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from 'lucide-react';
import QRCode from 'qrcode';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { twoFactorApi } from '@/api/endpoints';
import type { TwoFactorSetup as SetupSecret } from '@/api/types';
import { useSession } from '@/auth/session';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, ErrorNote, Skeleton } from '@/components/ui/display';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/overlay';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import {
  formatSecret,
  isAppCode,
  isCompleteCode,
  recoveryCodesFile,
  recoveryCodesWarning,
  tidyCode,
} from '@/lib/two-factor';

const SITE = 'Onyx Stream';

/** The field for a code from the app: six digits, wide apart, ready for the keyboard of a phone. */
function CodeInput({
  id,
  value,
  onChange,
  autoFocus,
  kind = 'app',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  kind?: 'app' | 'recovery';
}) {
  return (
    <Input
      id={id}
      required
      autoFocus={autoFocus}
      autoComplete="one-time-code"
      inputMode={kind === 'app' ? 'numeric' : 'text'}
      spellCheck={false}
      maxLength={kind === 'app' ? 7 : 20}
      placeholder={kind === 'app' ? '123 456' : 'XXXX-XXXX-XXXX'}
      className={cn(
        'font-mono text-base tracking-[0.3em] placeholder:tracking-[0.3em]',
        kind === 'recovery' && 'tracking-widest uppercase placeholder:tracking-widest',
      )}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** The recovery codes, shown once, with ways to keep them. */
function RecoveryCodes({ codes, email }: { codes: string[]; email: string }) {
  const [copied, setCopied] = useState(false);
  const text = recoveryCodesFile(codes, { site: SITE, email });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Copying is blocked by the browser. Select the codes and copy them by hand.');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'onyx-stream-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-3">
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border bg-muted/50 p-4 font-mono text-sm tracking-wider select-all"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" size="sm" onClick={download}>
          <Download />
          Download as a file
        </Button>
      </div>
    </div>
  );
}

interface TwoFactorSetupProps {
  /** Called once it is on and the admin said they kept the recovery codes. */
  onDone: () => void;
  /** Called when the admin gives up before it is on. Left out where there is no way back. */
  onCancel?: () => void;
}

/**
 * Setting up two-factor sign-in, step by step: the password, the app, the
 * first code, and the recovery codes. Nothing changes at sign-in before the
 * first code was accepted.
 */
export function TwoFactorSetup({ onDone, onCancel }: TwoFactorSetupProps) {
  const { state } = useSession();
  const email = state.status === 'signedIn' ? state.me.email : '';
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState<SetupSecret | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [kept, setKept] = useState(false);
  const [byHand, setByHand] = useState(false);

  const begin = useMutation({
    mutationFn: () => twoFactorApi.begin(password),
    onSuccess: (made) => {
      setSecret(made);
      setPassword('');
    },
  });
  const enable = useMutation({
    mutationFn: () => twoFactorApi.enable(tidyCode(code)),
    onSuccess: (result) => setCodes(result.recoveryCodes),
  });

  const uri = secret?.uri;
  useEffect(() => {
    if (!uri) {
      return;
    }
    let current = true;
    QRCode.toDataURL(uri, { margin: 1, width: 440, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (current) {
          setQr(url);
        }
      })
      // Without a picture the secret can still be typed in.
      .catch(() => setByHand(true));
    return () => {
      current = false;
    };
  }, [uri]);

  const step = codes ? 3 : secret ? 2 : 1;
  const steps = (
    <ol className="flex items-center gap-2 text-xs text-muted-foreground" aria-label="Steps">
      {['Your password', 'Your app', 'Recovery codes'].map((label, index) => (
        <li
          key={label}
          aria-current={step === index + 1 ? 'step' : undefined}
          className={cn(
            'flex items-center gap-2',
            step === index + 1 && 'font-medium text-foreground',
          )}
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full border text-[11px] tabular-nums',
              step > index + 1 && 'border-success bg-success/15 text-success',
              step === index + 1 && 'border-primary bg-primary text-primary-foreground',
            )}
          >
            {step > index + 1 ? <Check className="size-3" aria-hidden="true" /> : index + 1}
          </span>
          {label}
          {index < 2 ? <span className="mx-1 h-px w-4 bg-border" aria-hidden="true" /> : null}
        </li>
      ))}
    </ol>
  );

  if (codes) {
    return (
      <div className="grid gap-4">
        {steps}
        <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <p>
            <span className="font-medium">Two-factor sign-in is on.</span>{' '}
            <span className="text-muted-foreground">
              Your other devices were signed out. From now on signing in asks for a code from your
              app.
            </span>
          </p>
        </div>
        <div className="grid gap-1">
          <h3 className="text-sm font-medium">Keep these recovery codes</h3>
          <p className="text-sm text-muted-foreground">
            Each one signs you in once without the app: for the day your phone is lost or broken.
            They are shown this once. Keep them somewhere other than the phone.
          </p>
        </div>
        <RecoveryCodes codes={codes} email={email} />
        <label className="flex items-start gap-2.5 text-sm">
          <Checkbox checked={kept} onCheckedChange={(value) => setKept(value === true)} />
          <span>I have kept the codes somewhere safe.</span>
        </label>
        <div className="flex justify-end">
          <Button variant="primary" disabled={!kept} onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (secret) {
    return (
      <form
        className="grid gap-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          enable.mutate();
        }}
      >
        {steps}
        <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <div className="mx-auto flex size-44 items-center justify-center rounded-xl border bg-white p-2 sm:mx-0">
            {qr ? (
              <img src={qr} alt="QR code for your authenticator app" className="size-full" />
            ) : (
              <Skeleton className="size-full" />
            )}
          </div>
          <div className="grid gap-3 text-sm">
            <p>
              <span className="font-medium">Scan the code with an authenticator app.</span>{' '}
              <span className="text-muted-foreground">
                Any app for one-time codes works: Google Authenticator, Microsoft Authenticator,
                Aegis, 1Password and others. The app then shows a code of six digits that changes
                every 30 seconds.
              </span>
            </p>
            {byHand ? (
              <div className="grid gap-1.5">
                <p className="text-xs text-muted-foreground">
                  Enter this key in the app instead, as a time-based key:
                </p>
                <code className="rounded-md border bg-muted px-2.5 py-1.5 font-mono text-xs break-all select-all">
                  {formatSecret(secret.secret)}
                </code>
              </div>
            ) : (
              <button
                type="button"
                className="justify-self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => setByHand(true)}
              >
                Cannot scan? Enter a key by hand
              </button>
            )}
            <Field label="The code your app shows now">
              {(id) => <CodeInput id={id} value={code} onChange={setCode} autoFocus />}
            </Field>
          </div>
        </div>
        <ErrorNote error={enable.error} />
        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button type="button" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            loading={enable.isPending}
            disabled={!isAppCode(code)}
          >
            Switch on
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        begin.mutate();
      }}
    >
      {steps}
      <p className="text-sm text-muted-foreground">
        With two-factor sign-in, your password alone no longer opens this panel: signing in also
        asks for a code from an app on your phone. Have the phone at hand, then confirm that it is
        you.
      </p>
      <Field label="Your password">
        {(id) => (
          <Input
            id={id}
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            className="max-w-sm"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        )}
      </Field>
      <ErrorNote error={begin.error} />
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" loading={begin.isPending}>
          Continue
        </Button>
      </div>
    </form>
  );
}

interface ProveDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Does what the dialog is for. What it answers is shown in place of the form. */
  run: (proof: { password: string; code: string }) => Promise<ReactNode | void>;
  onClose: () => void;
  onDone: () => void;
}

/** Asks for the password and a code before something that weakens or renews the second factor. */
function ProveDialog({
  open,
  title,
  description,
  confirmLabel,
  destructive,
  run,
  onClose,
  onDone,
}: ProveDialogProps) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'app' | 'recovery'>('app');
  const [result, setResult] = useState<ReactNode>(null);

  const act = useMutation({
    mutationFn: () => run({ password, code: tidyCode(code) }),
    onSuccess: (shown) => {
      if (shown) {
        setResult(shown);
      } else {
        onDone();
      }
    },
  });
  useEffect(() => {
    if (open) {
      setPassword('');
      setCode('');
      setKind('app');
      setResult(null);
      act.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : result ? onDone() : onClose())}>
      <DialogContent title={title} description={description}>
        {result ? (
          <>
            <DialogBody>{result}</DialogBody>
            <DialogFooter>
              <Button variant="primary" onClick={onDone}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="contents"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              act.mutate();
            }}
          >
            <DialogBody>
              <Field label="Your password">
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    required
                    autoFocus
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                )}
              </Field>
              <Field label={kind === 'app' ? 'Code from your app' : 'A recovery code'}>
                {(id) => <CodeInput id={id} value={code} onChange={setCode} kind={kind} />}
              </Field>
              <button
                type="button"
                className="justify-self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={() => {
                  setKind(kind === 'app' ? 'recovery' : 'app');
                  setCode('');
                }}
              >
                {kind === 'app' ? 'Use a recovery code instead' : 'Use a code from the app instead'}
              </button>
              <ErrorNote error={act.error} />
            </DialogBody>
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={destructive ? 'destructive' : 'primary'}
                loading={act.isPending}
                disabled={!isCompleteCode(code, kind)}
              >
                {confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Two-factor sign-in of the signed-in admin, on their account page. */
export function TwoFactorCard() {
  const { state, refresh } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<'setup' | 'codes' | 'off' | null>(null);
  const status = useQuery({
    queryKey: ['two-factor'],
    queryFn: ({ signal }) => twoFactorApi.status(signal),
  });
  const email = state.status === 'signedIn' ? state.me.email : '';

  const changed = () => {
    setOpen(null);
    void queryClient.invalidateQueries({ queryKey: ['two-factor'] });
    void queryClient.invalidateQueries({ queryKey: ['admins'] });
    void refresh();
  };
  const data = status.data;
  const warning = data?.enabled ? recoveryCodesWarning(data.recoveryCodesLeft) : null;

  return (
    <Card>
      <CardHeader
        title="Two-factor sign-in"
        description="A code from an app on your phone, on top of your password."
        actions={
          data ? (
            <Badge tone={data.enabled ? 'success' : 'neutral'} dot>
              {data.enabled ? 'On' : 'Off'}
            </Badge>
          ) : null
        }
      />
      <CardContent className="grid gap-4">
        <ErrorNote error={status.error} />
        {status.isPending ? <Skeleton className="h-16 rounded-lg" /> : null}

        {data && !data.enabled ? (
          <>
            <div className="flex items-start gap-3 text-sm">
              <Smartphone
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-muted-foreground">
                A password can be guessed, reused or phished. With two-factor sign-in, whoever has
                your password still cannot get in without your phone. It takes two minutes to set
                up, with any authenticator app.
              </p>
            </div>
            <div>
              <Button variant="primary" onClick={() => setOpen('setup')}>
                <ShieldCheck />
                Set up two-factor sign-in
              </Button>
            </div>
          </>
        ) : null}

        {data?.enabled ? (
          <>
            <div className="flex items-start gap-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <p>
                Signing in asks for a code from your app
                {data.enabledAt ? `, since ${formatDateTime(data.enabledAt)}` : ''}.{' '}
                <span className="text-muted-foreground">
                  {data.recoveryCodesLeft} of 10 recovery codes are left.
                </span>
              </p>
            </div>
            {warning ? (
              <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                {warning}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setOpen('codes')}>
                <KeyRound />
                New recovery codes
              </Button>
              {data.required ? null : (
                <Button onClick={() => setOpen('off')}>
                  <ShieldOff />
                  Switch off
                </Button>
              )}
            </div>
            {data.required ? (
              <p className="text-xs text-muted-foreground">
                This installation asks every admin for two-factor sign-in, so it cannot be switched
                off. For a new phone, ask another admin to take it off, then set it up again.
              </p>
            ) : null}
          </>
        ) : null}
      </CardContent>

      <Dialog open={open === 'setup'} onOpenChange={(next) => (next ? undefined : changed())}>
        <DialogContent
          title="Set up two-factor sign-in"
          description="You need your phone with an authenticator app."
          size="lg"
        >
          <DialogBody>
            {open === 'setup' ? <TwoFactorSetup onDone={changed} onCancel={changed} /> : null}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ProveDialog
        open={open === 'codes'}
        title="New recovery codes"
        description="Makes ten new codes. The ones you have now stop working."
        confirmLabel="Make new codes"
        run={async (proof) => {
          const made = await twoFactorApi.newRecoveryCodes(proof);
          return (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                These replace your old codes. They are shown this once.
              </p>
              <RecoveryCodes codes={made.recoveryCodes} email={email} />
            </div>
          );
        }}
        onClose={() => setOpen(null)}
        onDone={changed}
      />
      <ProveDialog
        open={open === 'off'}
        title="Switch off two-factor sign-in"
        description="Your password alone will open this panel again. Your recovery codes are deleted."
        confirmLabel="Switch off"
        destructive
        run={async (proof) => {
          await twoFactorApi.disable(proof);
          toast.success('Two-factor sign-in is off');
        }}
        onClose={() => setOpen(null)}
        onDone={changed}
      />
    </Card>
  );
}

/**
 * The only screen of an admin who has yet to set up two-factor sign-in on an
 * installation that asks every admin for it.
 */
export function TwoFactorRequiredScreen() {
  const { state, refresh, signOut } = useSession();
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Set up two-factor sign-in</h1>
            <p className="text-sm text-muted-foreground">
              This installation asks every admin for it. Until it is on, nothing else in the panel
              is open to you
              {state.status === 'signedIn' ? `, ${state.me.displayName}` : ''}.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-xl">
          <TwoFactorSetup onDone={() => void refresh()} />
        </div>
        <button
          type="button"
          className="mt-4 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
