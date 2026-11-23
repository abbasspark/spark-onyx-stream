// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Check, Clapperboard, Loader2, Lock, Play } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@/lib/format';
import {
  canWatch,
  describeOwned,
  describeRentalTerms,
  formatMoney,
  opensTitle,
  ownedTitle,
} from '@/lib/plans';
import { authHref, ViewerApiError, viewerApi } from '@/lib/viewer-api';
import type { TitleDetail } from '@/lib/types';
import { episodeCode, movieKey, nextUnwatched, watchHref } from '@/lib/watch';
import { useWatching } from './continue-watching';
import { MyListButton } from './my-list';
import { useViewerSession } from './viewer-session';
import { useWatchedVideos } from './watched-videos';

/** What the site offers around a title, worked out on the server from its plans. */
export interface TitleOffer {
  currency: string;
  /** Whether a viewer can pay on the site. */
  checkout: boolean;
  contactUrl: string | null;
  rental: { startDays: number; watchHours: number };
  /** Whether a plan on offer opens this title. */
  subscribable: boolean;
}

/** How often and how long the site is asked again while a payment is still on its way. */
const RETRY_EVERY_MS = 2500;
const RETRIES = 10;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * The buttons of a title page. The main one knows where this viewer stopped:
 * it resumes a movie, goes on with the episode that was last watched, or
 * starts the episode after the ones that are finished. A title the viewer
 * cannot watch yet shows the ways to get it: subscribe, rent, buy.
 */
export function TitleActions({ title, offer }: { title: TitleDetail; offer: TitleOffer }) {
  const router = useRouter();
  const watching = useWatching();
  const watched = useWatchedVideos(title.slug);
  const { state, viewer, entitled, opens, purchases, setSubscription } = useViewerSession();
  // Until it is known who is here the button says "Play": the player explains the rest.
  const locked = state === 'ready' && !canWatch(title, opens, purchases);
  const owned = ownedTitle(purchases, title.id);
  const throughPlan = !title.purchaseOnly && opensTitle(opens, title);

  // The way being paid for, what went wrong with it, and what a payment just brought.
  const [opening, setOpening] = useState<'RENT' | 'BUY' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [arriving, setArriving] = useState(false);
  const confirmed = useRef(false);
  const viewerId = viewer?.id;

  // Back from Stripe's payment page: the address names the payment. The site
  // is told, which records the title at once, and the name is taken out again.
  useEffect(() => {
    if (state !== 'ready' || confirmed.current) {
      return;
    }
    const sessionId = new URLSearchParams(window.location.search).get('paid');
    if (!sessionId) {
      return;
    }
    confirmed.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    if (!viewerId) {
      return;
    }
    setArriving(true);
    void (async () => {
      for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
        try {
          const result = await viewerApi.confirmCheckout(sessionId);
          if (result.purchases?.some((purchase) => purchase.titleId === title.id)) {
            setSubscription(result);
            setArriving(false);
            return;
          }
        } catch (caught) {
          if (caught instanceof ViewerApiError && [400, 404].includes(caught.status)) {
            break;
          }
        }
        await wait(RETRY_EVERY_MS);
      }
      setArriving(false);
      setProblem(
        'Your payment has not arrived here yet. That can take a few minutes: reload this page then. Nothing is charged twice.',
      );
    })();
  }, [state, viewerId, title.id, setSubscription]);

  async function pay(kind: 'RENT' | 'BUY') {
    if (!viewer) {
      // Back here after signing up, to pay with an account.
      router.push(authHref('sign-up', `/title/${title.slug}`));
      return;
    }
    setOpening(kind);
    setProblem(null);
    try {
      const { url } = await viewerApi.purchase(title.id, kind);
      // The payment page is Stripe's. The button stays busy until the browser has left.
      window.location.assign(url);
    } catch (caught) {
      setOpening(null);
      setProblem(
        caught instanceof ViewerApiError
          ? caught.message
          : 'The payment page could not be opened. Try again in a moment.',
      );
    }
  }

  const rent = title.rentAmount ?? null;
  const buy = title.buyAmount ?? null;
  const sells = rent !== null || buy !== null;

  let href: string;
  let label: string;
  let progress: number | null = null;

  if (title.type === 'MOVIE') {
    const entry = watching.find((item) => item.key === movieKey(title.slug));
    href = watchHref(title.slug);
    label = entry ? `Resume at ${formatClock(entry.position)}` : 'Play';
    progress = entry ? entry.position / entry.duration : null;
  } else {
    // The list is ordered by time, so the first match is the episode watched last.
    const entry = watching.find((item) => item.href.startsWith(`${watchHref(title.slug)}/`));
    const first = nextUnwatched(title, watched);
    if (entry) {
      href = entry.href;
      label = `Resume ${entry.detail?.split(' ').slice(0, 2).join(' ') ?? 'episode'}`;
      progress = entry.position / entry.duration;
    } else {
      href = first ? watchHref(title.slug, first.episode.id) : `/title/${title.slug}`;
      label = first ? `Play ${episodeCode(first.season.number, first.episode.number)}` : 'Play';
    }
  }

  const payButton = (kind: 'RENT' | 'BUY', amount: number, primary: boolean) => (
    <button
      type="button"
      className={`button ${primary ? 'button-play' : 'button-quiet'}`}
      disabled={opening !== null}
      aria-busy={opening === kind}
      onClick={() => void pay(kind)}
    >
      {opening === kind ? (
        <Loader2 className="animate-[player-spin_0.9s_linear_infinite]" aria-hidden="true" />
      ) : null}
      {opening === kind
        ? 'Opening the payment page'
        : `${kind === 'RENT' ? 'Rent' : 'Buy'} ${formatMoney(amount, offer.currency)}`}
    </button>
  );
  // The first way on offer is the prominent one.
  const subscribeFirst = locked && offer.subscribable;
  const rentFirst = !subscribeFirst;

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {arriving ? (
          <span role="status" className="button button-quiet pointer-events-none">
            <Loader2 className="animate-[player-spin_0.9s_linear_infinite]" aria-hidden="true" />
            Getting your title ready
          </span>
        ) : null}
        {subscribeFirst && !arriving ? (
          <Link
            href={`/plans?next=${encodeURIComponent(`/title/${title.slug}`)}`}
            className="button button-play"
          >
            <Lock />
            {entitled ? 'Not in your plan' : 'Subscribe to watch'}
          </Link>
        ) : null}
        {locked && !arriving && offer.checkout ? (
          <>
            {rent !== null ? payButton('RENT', rent, rentFirst) : null}
            {buy !== null ? payButton('BUY', buy, rentFirst && rent === null) : null}
          </>
        ) : null}
        <Link
          href={href}
          className={`button relative overflow-hidden ${locked || arriving ? 'hidden' : 'button-play'}`}
        >
          <Play className="fill-current" />
          {label}
          {progress !== null ? (
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-onyx/25">
              <span className="block h-full bg-onyx/70" style={{ width: `${progress * 100}%` }} />
            </span>
          ) : null}
        </Link>
        {title.hasTrailer ? (
          <Link href={`${watchHref(title.slug)}?trailer=1`} className="button button-quiet">
            <Clapperboard />
            Trailer
          </Link>
        ) : null}
        <MyListButton title={{ id: title.id, slug: title.slug, name: title.name }} />
      </div>

      {problem ? (
        <p role="alert" className="mt-4 max-w-xl border-l-2 border-alarm py-1 pl-4 text-alarm">
          {problem}
        </p>
      ) : null}
      {!locked && owned && !throughPlan && state === 'ready' ? (
        <p className="mt-4 flex max-w-xl items-start gap-2 text-sm text-vein/85">
          <Check className="mt-0.5 size-4 shrink-0 text-sard" aria-hidden="true" />
          {describeOwned(owned)}
        </p>
      ) : null}
      {locked && !arriving && sells ? (
        <p className="mt-4 max-w-xl text-sm text-vein/75">
          {offer.checkout ? (
            <>
              {rent !== null ? `Renting gives you ${describeRentalTerms(offer.rental)} ` : ''}
              {buy !== null ? 'A bought title is yours for as long as it is on this site. ' : ''}
              {title.purchaseOnly ? 'No plan includes this title.' : ''}
            </>
          ) : (
            <>
              {[
                rent !== null ? `rented for ${formatMoney(rent, offer.currency)}` : null,
                buy !== null ? `bought for ${formatMoney(buy, offer.currency)}` : null,
              ]
                .filter(Boolean)
                .join(' or ')
                .replace(/^./, (first) => `This title can be ${first}`)}
              . This site does not take payments online.{' '}
              {offer.contactUrl ? (
                <a href={offer.contactUrl} className="underline underline-offset-4">
                  Get in touch
                </a>
              ) : (
                'Ask the people who run it.'
              )}
            </>
          )}
        </p>
      ) : null}
      {locked && !arriving && !sells && !offer.subscribable ? (
        <p className="mt-4 flex max-w-xl items-start gap-2 text-sm text-vein/75">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This title is not on offer at the moment.
        </p>
      ) : null}
    </div>
  );
}
