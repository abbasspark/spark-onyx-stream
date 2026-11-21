// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Check, Mail } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  bestYearlySaving,
  describeEnd,
  formatMoney,
  type Interval,
  intervalsOf,
  type OwnSubscription,
  type Plans,
  priceOf,
  yearlySaving,
} from '@/lib/plans';
import { authHref, safeNextPath, viewerApi } from '@/lib/viewer-api';
import { useViewerSession } from './viewer-session';

/**
 * The plans of the site, side by side. The page arrives the same for
 * everyone. What depends on who is looking, a running subscription, is
 * added here in the browser.
 */
export function PlansScreen({ offer }: { offer: Plans }) {
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const { state, viewer, entitled } = useViewerSession();
  const { plans, currency } = offer;

  const intervals = intervalsOf(plans);
  const [interval, setInterval] = useState<Interval>(intervals[0] ?? 'month');
  const saving = bestYearlySaving(plans);

  // What the viewer has already, to say so and not sell it twice.
  const [own, setOwn] = useState<OwnSubscription | null>(null);
  const viewerId = viewer?.id;
  useEffect(() => {
    if (!viewerId || !entitled) {
      setOwn(null);
      return;
    }
    let current = true;
    viewerApi
      .subscription()
      .then((result) => {
        if (current) {
          setOwn(result.subscription);
        }
      })
      .catch(() => {
        // The page works without it.
      });
    return () => {
      current = false;
    };
  }, [viewerId, entitled]);

  const shown = plans.filter((plan) => priceOf(plan, interval) !== null);

  return (
    <div className="gutter pt-32 pb-10">
      <h1 className="display text-5xl sm:text-7xl">Plans</h1>
      <p className="mt-5 max-w-xl text-lg text-smoke">
        One subscription opens every title marked with a lock. Everything else on this site stays
        free to watch.
      </p>

      {own ? (
        <p className="mt-8 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-sard py-1 pl-4">
          <Check className="size-5 text-sard" aria-hidden="true" />
          <span>
            You are subscribed to <span className="font-medium">{own.plan.name}</span>,{' '}
            {describeEnd(own)}.
          </span>
          <Link href={next} className="text-sard underline underline-offset-4">
            {next === '/' ? 'Start watching' : 'Go on watching'}
          </Link>
        </p>
      ) : null}

      {intervals.length > 1 ? (
        <div
          role="radiogroup"
          aria-label="How to pay"
          className="mt-10 inline-flex rounded-[3px] border border-line p-1"
        >
          {intervals.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={interval === option}
              onClick={() => setInterval(option)}
              className={`heading flex h-10 items-center gap-2 rounded-[2px] px-5 text-base transition-colors ${
                interval === option ? 'bg-vein text-onyx' : 'text-smoke hover:text-vein'
              }`}
            >
              {option === 'month' ? 'Monthly' : 'Yearly'}
              {option === 'year' && saving ? (
                <span
                  className={`text-xs font-medium ${interval === 'year' ? 'text-onyx/70' : 'text-sard'}`}
                >
                  up to {saving}% less
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <ul
        className="mt-10 grid gap-px overflow-hidden rounded-[3px] border border-line bg-line"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 17rem), 1fr))' }}
      >
        {shown.map((plan) => {
          const price = priceOf(plan, interval) as number;
          const planSaving = interval === 'year' ? yearlySaving(plan) : null;
          const isOwn = own?.plan.id === plan.id;
          return (
            <li key={plan.id} className="relative flex flex-col bg-onyx p-7 sm:p-8">
              {plan.isRecommended ? (
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-sard" />
              ) : null}
              <div className="flex min-h-7 items-center justify-between gap-3">
                <h2 className="heading text-2xl">{plan.name}</h2>
                {isOwn ? (
                  <span className="text-sm text-sard">Your plan</span>
                ) : plan.isRecommended ? (
                  <span className="text-sm text-sard">Recommended</span>
                ) : null}
              </div>
              <p className="mt-6 flex items-baseline gap-2">
                <span className="display text-5xl">{formatMoney(price, currency)}</span>
                <span className="text-smoke">a {interval}</span>
              </p>
              <p className="mt-1 min-h-5 text-sm text-sard">
                {planSaving
                  ? `${planSaving}% less than paying monthly`
                  : plan.trialDays > 0 && offer.checkout
                    ? `First ${plan.trialDays} days free`
                    : ''}
              </p>
              {plan.description ? <p className="mt-5 text-smoke">{plan.description}</p> : null}
              {plan.features.length > 0 ? (
                <ul className="mt-6 grid gap-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 size-4 shrink-0 text-sard" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {own ? null : (
        <div className="mt-10 max-w-2xl">
          <h2 className="heading text-2xl">How to subscribe</h2>
          <p className="mt-3 text-smoke">
            {offer.contactUrl
              ? 'This site does not take payments online. Get in touch, say which plan you want, and your account is opened for it.'
              : 'This site does not take payments online. Ask the people who run it, say which plan you want, and your account is opened for it.'}
            {state === 'ready' && !viewer ? ' You need an account on this site first.' : ''}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {state === 'ready' && !viewer ? (
              <Link href={authHref('sign-up', '/plans')} className="button button-play">
                Create an account
              </Link>
            ) : null}
            {offer.contactUrl ? (
              <a
                href={offer.contactUrl}
                className={`button ${state === 'ready' && !viewer ? 'button-quiet' : 'button-play'}`}
                {...(offer.contactUrl.startsWith('mailto:')
                  ? {}
                  : { target: '_blank', rel: 'noreferrer' })}
              >
                <Mail />
                Get in touch
              </a>
            ) : null}
          </div>
          {viewer ? (
            <p className="mt-5 text-sm text-dust">
              Mention the email address of your account:{' '}
              <span className="text-smoke">{viewer.email}</span>
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
