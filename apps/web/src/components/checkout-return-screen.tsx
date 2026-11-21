// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { describeEnd, type OwnSubscription, takeAfterCheckout } from '@/lib/plans';
import { authHref, safeNextPath, ViewerApiError, viewerApi } from '@/lib/viewer-api';
import { useViewerSession } from './viewer-session';

/** How often and how long the site is asked again while a payment is still on its way. */
const RETRY_EVERY_MS = 2500;
const RETRIES = 12;

type Outcome =
  | { state: 'working' }
  | { state: 'done'; subscription: OwnSubscription }
  /** Paid, as far as the viewer is concerned, but the site has not heard of it yet. */
  | { state: 'waiting' }
  | { state: 'failed'; message: string };

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

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Where a viewer lands after Stripe's payment page. It tells the site that
 * the viewer is back, which records the subscription at once, and says so.
 */
export function CheckoutReturnScreen() {
  const router = useRouter();
  const sessionId = useSearchParams().get('session');
  const { state, viewer, setSubscription } = useViewerSession();
  const [outcome, setOutcome] = useState<Outcome>({ state: 'working' });
  const [next, setNext] = useState('/');
  const started = useRef(false);
  const viewerId = viewer?.id;

  // Whether the page is still shown. The work below outlives a change of the address.
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  useEffect(() => {
    if (state !== 'ready' || started.current) {
      return;
    }
    if (!sessionId) {
      router.replace('/plans');
      return;
    }
    if (!viewerId) {
      // Signed out in the meantime. The payment is found again after signing in.
      router.replace(authHref('sign-in', `/plans/thanks?session=${encodeURIComponent(sessionId)}`));
      return;
    }
    started.current = true;
    setNext(safeNextPath(takeAfterCheckout()));
    // The id has done its part once read. It need not stay in the address bar.
    // Taking it out runs this effect again, which is why the work is started once.
    window.history.replaceState(null, '', '/plans/thanks');

    void (async () => {
      for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
        try {
          const result = await viewerApi.confirmCheckout(sessionId);
          if (!shown.current) {
            return;
          }
          if (result.subscription) {
            setSubscription(result);
            setOutcome({ state: 'done', subscription: result.subscription });
            return;
          }
        } catch (caught) {
          if (!shown.current) {
            return;
          }
          // An address that names no payment of this viewer will not start to.
          if (caught instanceof ViewerApiError && [400, 404].includes(caught.status)) {
            setOutcome({
              state: 'failed',
              message:
                'This payment was not found on your account. If you paid, your subscription shows on your account page within a few minutes.',
            });
            return;
          }
        }
        if (attempt === 2) {
          setOutcome({ state: 'waiting' });
        }
        await wait(RETRY_EVERY_MS);
        if (!shown.current) {
          return;
        }
      }
      setOutcome({
        state: 'failed',
        message:
          'Your payment has not arrived here yet. That can take a few minutes. Your subscription then shows on your account page, and nothing is charged twice.',
      });
    })();
  }, [state, sessionId, viewerId, router, setSubscription]);

  if (outcome.state === 'done') {
    const { subscription } = outcome;
    return (
      <Screen heading="You are subscribed">
        <p className="mt-6 flex items-start gap-3 text-lg text-smoke">
          <Check className="mt-1 size-6 shrink-0 text-sard" aria-hidden="true" />
          <span>
            <span className="text-vein">{subscription.plan.name}</span> is yours. You can watch
            every title marked with a lock, {describeEnd(subscription)}.
          </span>
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={next} className="button button-play">
            {next === '/' ? 'Start watching' : 'Go on watching'}
          </Link>
          <Link href="/account" className="button button-quiet">
            Your account
          </Link>
        </div>
        <p className="mt-6 text-sm text-dust">
          Stripe sends the receipt to {viewer?.email}. You cancel whenever you like on your account
          page.
        </p>
      </Screen>
    );
  }

  if (outcome.state === 'failed') {
    return (
      <Screen heading="We are still waiting for your payment">
        <p role="alert" className="mt-6 text-lg text-smoke">
          {outcome.message}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/account" className="button button-play">
            Your account
          </Link>
          <Link href="/plans" className="button button-quiet">
            Back to the plans
          </Link>
        </div>
      </Screen>
    );
  }

  return (
    <Screen heading={outcome.state === 'waiting' ? 'Almost there' : 'Setting up your subscription'}>
      <div role="status" className="mt-8 flex items-center gap-4 text-smoke">
        <Loader2 className="size-8 shrink-0 animate-[player-spin_0.9s_linear_infinite]" />
        <span>
          {outcome.state === 'waiting'
            ? 'Your payment is on its way to us. This page updates by itself.'
            : 'One moment'}
        </span>
      </div>
    </Screen>
  );
}
