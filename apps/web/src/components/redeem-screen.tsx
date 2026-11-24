// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Check, Loader2, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { formatDate } from '@/lib/plans';
import {
  type CodePreview,
  codesApi,
  describeDays,
  describePreview,
  formatCodeInput,
  isCompleteCode,
  refusalOf,
  strangeLetter,
} from '@/lib/prepaid';
import { authHref, viewerApi } from '@/lib/viewer-api';
import { useViewerSession } from './viewer-session';

type Step =
  | { name: 'enter' }
  | { name: 'confirm'; preview: CodePreview }
  | { name: 'done'; result: CodePreview };

function Spinner() {
  return <Loader2 className="animate-[player-spin_0.9s_linear_infinite]" aria-hidden="true" />;
}

/**
 * Where a viewer enters a prepaid code: the site says what the code gives,
 * the viewer says yes, and the plan starts or runs longer.
 */
export function RedeemScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const linked = formatCodeInput(params.get('code') ?? '');
  const { state, viewer, profile, restricted, setSubscription } = useViewerSession();

  const [code, setCode] = useState(linked);
  const [step, setStep] = useState<Step>({ name: 'enter' });
  const [busy, setBusy] = useState<'check' | 'redeem' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const looked = useRef(false);

  // A code belongs to an account. The code comes along and back.
  useEffect(() => {
    if (state === 'ready' && !viewer) {
      const back = linked ? `/redeem?code=${encodeURIComponent(linked)}` : '/redeem';
      router.replace(authHref('sign-in', back));
    }
  }, [state, viewer, linked, router]);

  const check = useCallback(async (value: string) => {
    setBusy('check');
    setError(null);
    try {
      setStep({ name: 'confirm', preview: await codesApi.check(value) });
    } catch (caught) {
      setError(refusalOf(caught).message);
    } finally {
      setBusy(null);
    }
  }, []);

  // A code that came with the link, such as from a card's QR code, is looked up at once.
  // It is never used without the viewer saying yes.
  useEffect(() => {
    if (viewer && !restricted && isCompleteCode(linked) && !looked.current) {
      looked.current = true;
      void check(linked);
    }
  }, [viewer, restricted, linked, check]);

  const redeem = async () => {
    setBusy('redeem');
    setError(null);
    try {
      const result = await codesApi.redeem(code);
      setStep({ name: 'done', result });
      // The rest of the site learns at once that the locks are open.
      void viewerApi
        .subscription()
        .then(setSubscription)
        .catch(() => undefined);
    } catch (caught) {
      // What stood in the way is said where the code is typed.
      setStep({ name: 'enter' });
      setError(refusalOf(caught).message);
    } finally {
      setBusy(null);
    }
  };

  const startOver = () => {
    setCode('');
    setError(null);
    setStep({ name: 'enter' });
    // Without the code of the link, or it would be looked up again on a reload.
    router.replace('/redeem');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isCompleteCode(code)) {
      void check(code);
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

  if (restricted) {
    // A profile with an age limit watches. What the account can watch is for the others.
    return (
      <div className="gutter grid min-h-[60dvh] content-center pt-28">
        <h1 className="display text-4xl sm:text-5xl">Enter a prepaid code</h1>
        <p className="mt-5 max-w-prose text-lg text-smoke">
          {profile?.name ?? 'This profile'} has an age limit. A code is entered from a profile
          without one.
        </p>
        <div className="mt-9">
          <Link href="/profiles" className="button button-play">
            Switch profile
          </Link>
        </div>
      </div>
    );
  }

  const strange = strangeLetter(code);

  return (
    <div className="gutter grid min-h-[80dvh] content-center pt-28 pb-10">
      <div className="w-full max-w-lg">
        {step.name === 'enter' ? (
          <>
            <h1 className="display text-4xl sm:text-5xl">Enter a prepaid code</h1>
            <p className="mt-5 text-lg text-smoke">
              A code from a card or a message opens a plan for your account. You see what it gives
              before it is used.
            </p>
            <form onSubmit={submit} className="mt-9 grid gap-5">
              <div>
                <label htmlFor={fieldId} className="mb-1.5 block text-sm font-medium">
                  Your code
                </label>
                <input
                  id={fieldId}
                  className="input h-16 w-full px-3 text-center font-mono text-[1.15rem] tracking-[0.1em] uppercase sm:text-[1.5rem]"
                  name="code"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${fieldId}-error` : `${fieldId}-hint`}
                  value={code}
                  onChange={(event) => {
                    setCode(formatCodeInput(event.target.value));
                    setError(null);
                  }}
                />
                {error ? (
                  <p id={`${fieldId}-error`} role="alert" className="mt-2 text-alarm">
                    {error}
                  </p>
                ) : strange ? (
                  <p id={`${fieldId}-hint`} className="mt-2 text-sm text-alarm">
                    Codes have no “{strange}”: letters and digits that look alike are left out. Look
                    at your code again.
                  </p>
                ) : (
                  <p id={`${fieldId}-hint`} className="mt-2 text-sm text-smoke">
                    Sixteen letters and digits. Capitals and dashes do not matter.
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="button button-play justify-self-start"
                disabled={!isCompleteCode(code) || busy !== null}
              >
                {busy === 'check' ? <Spinner /> : null}
                Continue
              </button>
            </form>
            <p className="mt-10 text-sm text-dust">
              Signed in as <span className="text-smoke">{viewer.email}</span>. The code is used for
              this account.
            </p>
          </>
        ) : null}

        {step.name === 'confirm' ? (
          <>
            <h1 className="display text-4xl sm:text-5xl">Use this code?</h1>
            <div className="mt-8 flex items-center gap-5 border-y border-line py-6">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-[4px] bg-ash text-vein">
                <Ticket className="size-7" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="heading truncate text-xl">
                  {step.preview.plan.name}, {describeDays(step.preview.days)}
                </p>
                <p className="mt-0.5 font-mono text-sm tracking-wider text-smoke">{code}</p>
              </div>
            </div>
            <p className="mt-6 text-lg text-smoke">{describePreview(step.preview)}</p>
            <p className="mt-3 text-smoke">
              It is used for <span className="text-vein">{viewer.email}</span>. A code works once
              and cannot be moved to another account afterwards.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <button
                type="button"
                className="button button-play"
                disabled={busy !== null}
                aria-busy={busy === 'redeem'}
                onClick={() => void redeem()}
              >
                {busy === 'redeem' ? <Spinner /> : null}
                Use the code
              </button>
              <button
                type="button"
                className="button button-quiet"
                disabled={busy !== null}
                onClick={startOver}
              >
                Not now
              </button>
            </div>
          </>
        ) : null}

        {step.name === 'done' ? (
          <div role="status">
            <span className="flex size-14 items-center justify-center rounded-full bg-sard text-onyx">
              <Check className="size-7" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <h1 className="display mt-7 text-4xl sm:text-5xl">
              {step.result.action === 'extend'
                ? `${describeDays(step.result.days)} added`
                : `${step.result.plan.name} is open`}
            </h1>
            <p className="mt-5 text-lg text-smoke">
              You can watch until {formatDate(step.result.endsAt)}. Nothing is charged and nothing
              renews by itself: enter another code any time to add days.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/" className="button button-play">
                Start watching
              </Link>
              <button type="button" className="button button-quiet" onClick={startOver}>
                Enter another code
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
