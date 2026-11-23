// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import {
  Check,
  Loader2,
  type LucideIcon,
  Monitor,
  MonitorSmartphone,
  ShieldAlert,
  Smartphone,
  Tablet,
  Tv,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  askedAgo,
  describeKind,
  type DeviceCodeRequest,
  type DeviceKind,
  devicesApi,
  formatCodeInput,
  isCompleteCode,
} from '@/lib/devices';
import { authHref, ViewerApiError } from '@/lib/viewer-api';
import { useViewerSession } from './viewer-session';

const ICONS: Record<DeviceKind, LucideIcon> = {
  TV: Tv,
  MOBILE: Smartphone,
  TABLET: Tablet,
  DESKTOP: Monitor,
  OTHER: MonitorSmartphone,
};

type Step =
  | { name: 'enter' }
  | { name: 'confirm'; request: DeviceCodeRequest }
  | { name: 'approved'; request: DeviceCodeRequest }
  | { name: 'denied' };

function messageOf(caught: unknown): string {
  if (caught instanceof ViewerApiError && caught.status === 404) {
    return 'This code is not valid. Check it against your device, or get a new code there: a code works for ten minutes.';
  }
  return caught instanceof ViewerApiError
    ? caught.message
    : 'Something went wrong. Try again in a moment.';
}

function Spinner() {
  return <Loader2 className="animate-[player-spin_0.9s_linear_infinite]" aria-hidden="true" />;
}

/**
 * Where a viewer signs in a television, or any device without a keyboard:
 * the device shows a code, the viewer enters it here and says yes.
 */
export function ActivateScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const linked = formatCodeInput(params.get('code') ?? '');
  const { state, viewer } = useViewerSession();

  const [code, setCode] = useState(linked);
  const [step, setStep] = useState<Step>({ name: 'enter' });
  const [busy, setBusy] = useState<'find' | 'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const looked = useRef(false);

  // Answering needs an account. The code comes along and back.
  useEffect(() => {
    if (state === 'ready' && !viewer) {
      const back = linked ? `/activate?code=${encodeURIComponent(linked)}` : '/activate';
      router.replace(authHref('sign-in', back));
    }
  }, [state, viewer, linked, router]);

  const find = useCallback(async (value: string) => {
    setBusy('find');
    setError(null);
    try {
      setStep({ name: 'confirm', request: await devicesApi.find(value) });
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  }, []);

  // A code that came with the link (the QR code on the television) is looked up at once.
  useEffect(() => {
    if (viewer && isCompleteCode(linked) && !looked.current) {
      looked.current = true;
      void find(linked);
    }
  }, [viewer, linked, find]);

  const answer = async (kind: 'approve' | 'deny', request: DeviceCodeRequest) => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'approve') {
        await devicesApi.approve(request.userCode);
        setStep({ name: 'approved', request });
      } else {
        await devicesApi.deny(request.userCode);
        setStep({ name: 'denied' });
      }
    } catch (caught) {
      // A code that ran out while the viewer read: back to the start.
      setStep({ name: 'enter' });
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  };

  const startOver = () => {
    setCode('');
    setError(null);
    setStep({ name: 'enter' });
    // Without the code of the link, or it would be looked up again on a reload.
    router.replace('/activate');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isCompleteCode(code)) {
      void find(code);
    }
  };

  if (!viewer) {
    return (
      <div className="gutter flex min-h-[60dvh] items-center pt-28" role="status">
        <Loader2 className="size-10 animate-[player-spin_0.9s_linear_infinite]" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <div className="gutter grid min-h-[80dvh] content-center pt-28 pb-10">
      <div className="w-full max-w-lg">
        {step.name === 'enter' ? (
          <>
            <h1 className="display text-4xl sm:text-5xl">Sign in a device</h1>
            <p className="mt-5 text-lg text-smoke">
              Enter the code your television shows. It is signed in to your account, without typing
              a password with the remote.
            </p>
            <form onSubmit={submit} className="mt-9 grid gap-5">
              <div>
                <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium">
                  Code on your device
                </label>
                <input
                  id={fieldId}
                  className="input h-16 w-full max-w-[21rem] px-3 text-center font-mono text-[1.7rem] tracking-[0.12em] uppercase"
                  name="code"
                  inputMode="text"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  placeholder="XXXX-XXXX"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${fieldId}-error` : `${fieldId}-hint`}
                  value={code}
                  onChange={(event) => {
                    setCode(formatCodeInput(event.target.value));
                    setError(null);
                  }}
                />
                {error ? (
                  <p id={`${fieldId}-error`} role="alert" className="mt-2 max-w-md text-alarm">
                    {error}
                  </p>
                ) : (
                  <p id={`${fieldId}-hint`} className="mt-2 text-sm text-smoke">
                    Eight letters and digits. Capitals or not does not matter.
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="button button-play justify-self-start"
                disabled={!isCompleteCode(code) || busy !== null}
              >
                {busy === 'find' ? <Spinner /> : null}
                Continue
              </button>
            </form>
          </>
        ) : null}

        {step.name === 'confirm' ? (
          <Confirm
            request={step.request}
            email={viewer.email}
            busy={busy}
            onApprove={() => void answer('approve', step.request)}
            onDeny={() => void answer('deny', step.request)}
          />
        ) : null}

        {step.name === 'approved' ? (
          <div role="status">
            <span className="flex size-14 items-center justify-center rounded-full bg-sard text-onyx">
              <Check className="size-7" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <h1 className="display mt-7 text-4xl sm:text-5xl">{step.request.device.name} is in</h1>
            <p className="mt-5 text-lg text-smoke">
              It signs in by itself within a few seconds. You can put this device away.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/" className="button button-play">
                Done
              </Link>
              <Link href="/account" className="button button-quiet">
                See your devices
              </Link>
            </div>
          </div>
        ) : null}

        {step.name === 'denied' ? (
          <div role="status">
            <span className="flex size-14 items-center justify-center rounded-full border border-line text-smoke">
              <X className="size-7" aria-hidden="true" />
            </span>
            <h1 className="display mt-7 text-4xl sm:text-5xl">Not signed in</h1>
            <p className="mt-5 text-lg text-smoke">
              The device was turned away and its code no longer works. If someone gave you that
              code, they were trying to watch on your account.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <button type="button" className="button button-play" onClick={startOver}>
                Enter another code
              </button>
              <Link href="/" className="button button-quiet">
                Back to the site
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Confirm({
  request,
  email,
  busy,
  onApprove,
  onDeny,
}: {
  request: DeviceCodeRequest;
  email: string;
  busy: 'find' | 'approve' | 'deny' | null;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const Icon = ICONS[request.device.kind] ?? MonitorSmartphone;
  return (
    <>
      <h1 className="display text-4xl sm:text-5xl">Sign this device in?</h1>
      <div className="mt-8 flex items-center gap-5 border-y border-line py-6">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-[4px] bg-ash text-vein">
          <Icon className="size-7" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="heading truncate text-xl">{request.device.name}</p>
          <p className="mt-0.5 text-smoke">{describeKind(request.device)}</p>
          <p className="mt-0.5 text-sm text-dust">
            Asked {askedAgo(request.requestedAt)}, showing{' '}
            <span className="font-mono text-smoke">{request.userCode}</span>
          </p>
        </div>
      </div>
      <p className="mt-6 text-lg text-smoke">
        It will watch as <span className="text-vein">{email}</span>, with everything your account
        can watch.
      </p>
      <p className="mt-5 flex items-start gap-3 text-smoke">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-sard" aria-hidden="true" />
        <span>
          Only continue if this code is on your own screen right now. A code somebody sent you would
          sign their device in to your account.
        </span>
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <button
          type="button"
          className="button button-play"
          disabled={busy !== null}
          onClick={onApprove}
        >
          {busy === 'approve' ? <Spinner /> : null}
          Sign it in
        </button>
        <button
          type="button"
          className="button button-quiet"
          disabled={busy !== null}
          onClick={onDeny}
        >
          {busy === 'deny' ? <Spinner /> : null}
          This is not my device
        </button>
      </div>
    </>
  );
}
