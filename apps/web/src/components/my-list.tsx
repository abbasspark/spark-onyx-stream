// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Check, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { languageFromCookies } from '@/lib/language';
import { type ListState, type ListTitle, myList } from '@/lib/my-list';
import { authHref, ViewerApiError } from '@/lib/viewer-api';
import { PosterCard } from './poster-card';
import { StripRow } from './title-row';
import { useViewerSession } from './viewer-session';

/** How long a word about a change stays on the page. */
const NOTICE_MS = 3200;

type Notice = { text: string; failed: boolean; at: number } | null;
let notice: Notice = null;
const noticeListeners = new Set<() => void>();

function say(text: string, failed = false): void {
  notice = { text, failed, at: Date.now() };
  for (const listener of noticeListeners) {
    listener();
  }
}

function subscribeNotice(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => noticeListeners.delete(listener);
}

/** The list of the profile in use, shared by everything on the page. */
export function useMyList(): ListState {
  return useSyncExternalStore(myList.subscribe, myList.snapshot, myList.serverSnapshot);
}

/**
 * Keeps the list in step with who is signed in, and says what a change did.
 * Mounted once for the whole site.
 */
export function MyListSync() {
  const { state, profile } = useViewerSession();
  const profileId = profile?.id ?? null;
  useEffect(() => {
    if (state === 'ready') {
      void myList.start(profileId);
    }
  }, [state, profileId]);

  const current = useSyncExternalStore(
    subscribeNotice,
    () => notice,
    () => null,
  );
  const [shown, setShown] = useState<Notice>(null);
  useEffect(() => {
    setShown(current);
    if (!current) {
      return;
    }
    const timer = window.setTimeout(() => setShown(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [current]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      {shown ? (
        <p
          className={`border bg-coal px-4 py-2.5 text-sm shadow-lg ${
            shown.failed ? 'border-alarm text-alarm' : 'border-line text-vein'
          }`}
        >
          {shown.text}
        </p>
      ) : null}
    </div>
  );
}

interface MyListButtonProps {
  title: ListTitle;
  /** "button": with its words, beside "Play". "card": a round mark on a card. */
  look?: 'button' | 'card';
  className?: string;
}

/**
 * Puts a title on the viewer's list, or takes it off. A visitor is led to
 * sign in and comes back to the same page.
 */
export function MyListButton({ title, look = 'button', className = '' }: MyListButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, ids } = useMyList();
  const [busy, setBusy] = useState(false);
  const saved = ids.includes(title.id);

  async function toggle() {
    if (status === 'visitor') {
      router.push(authHref('sign-in', pathname));
      return;
    }
    if (status === 'unknown' || busy) {
      return;
    }
    setBusy(true);
    try {
      const now = await myList.toggle(title);
      say(now ? `${title.name} is on your list` : `${title.name} is off your list`);
    } catch (caught) {
      say(
        caught instanceof ViewerApiError
          ? caught.message
          : 'Your list could not be changed. Try again in a moment.',
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  const Icon = saved ? Check : Plus;
  if (look === 'card') {
    return (
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? `Take ${title.name} off my list` : `Put ${title.name} on my list`}
        title={saved ? 'On my list' : 'Add to my list'}
        className={`absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full transition-opacity group-hover/card:opacity-100 hover:brightness-110 focus-visible:opacity-100 pointer-coarse:opacity-100 ${
          saved ? 'bg-sard text-onyx opacity-100' : 'bg-onyx/80 text-vein opacity-0'
        } ${className}`}
        onClick={() => void toggle()}
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={saved}
      className={`button button-quiet ${className}`}
      onClick={() => void toggle()}
    >
      <Icon aria-hidden="true" />
      {saved ? 'On my list' : 'My list'}
    </button>
  );
}

/** Fetches the cards of the list once it is known whose list it is. */
function useListCards(): ListState & { failed: boolean } {
  const list = useMyList();
  const [failed, setFailed] = useState(false);
  const wanted = list.status === 'ready' && (list.items === null || list.stale);
  useEffect(() => {
    if (!wanted) {
      return;
    }
    setFailed(false);
    myList.load(languageFromCookies(document.cookie)).catch(() => setFailed(true));
  }, [wanted]);
  return { ...list, failed };
}

/** The viewer's list as a row of a page. Shows nothing while there is nothing on it. */
export function MyListRow({ heading }: { heading: string }) {
  const { items } = useListCards();
  if (!items || items.length === 0) {
    return null;
  }
  return (
    <StripRow heading={heading} href="/my-list">
      {items.map(({ title }) => (
        <li key={title.id} className="w-[clamp(7.5rem,32vw,11rem)]">
          <PosterCard title={title} />
        </li>
      ))}
    </StripRow>
  );
}

/** The page of the list: everything on it, the last added first. */
export function MyListScreen() {
  const pathname = usePathname();
  const { status, items, failed } = useListCards();
  const [confirming, setConfirming] = useState(false);

  const frame = (children: React.ReactNode, count?: number) => (
    <div className="gutter pt-28 pb-16 sm:pt-32">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="display text-4xl sm:text-5xl">My list</h1>
          <p className="mt-3 text-smoke">
            {count === undefined
              ? 'What you saved to watch later.'
              : count === 0
                ? 'Nothing saved yet.'
                : `${count} ${count === 1 ? 'title' : 'titles'}, the last added first.`}
          </p>
        </div>
        {count ? (
          confirming ? (
            <p className="flex flex-wrap items-center gap-3 text-sm">
              Take all {count} off your list?
              <button
                type="button"
                className="button button-quiet"
                onClick={() => {
                  setConfirming(false);
                  myList
                    .clear()
                    .then(() => say('Your list is empty'))
                    .catch(() => say('Your list could not be emptied. Try again.', true));
                }}
              >
                Empty the list
              </button>
              <button
                type="button"
                className="text-smoke underline underline-offset-4 hover:text-vein"
                onClick={() => setConfirming(false)}
              >
                Keep it
              </button>
            </p>
          ) : (
            <button
              type="button"
              className="text-sm text-smoke underline underline-offset-4 hover:text-vein"
              onClick={() => setConfirming(true)}
            >
              Empty the list
            </button>
          )
        ) : null}
      </div>
      <div className="mt-10">{children}</div>
    </div>
  );

  if (status === 'visitor') {
    return frame(
      <div className="max-w-xl border-l-2 border-sard py-1 pl-5">
        <p className="text-lg">Your list goes with your account.</p>
        <p className="mt-2 text-smoke">
          Sign in to save titles for later and find them again on every device.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={authHref('sign-in', pathname)} className="button button-play">
            Sign in
          </a>
          <a href={authHref('sign-up', pathname)} className="button button-quiet">
            Create an account
          </a>
        </div>
      </div>,
    );
  }
  if (failed) {
    return frame(
      <p role="alert" className="max-w-xl border-l-2 border-alarm py-1 pl-4 text-alarm">
        Your list could not be loaded. Reload the page to try again.
      </p>,
    );
  }
  if (!items) {
    return frame(
      <ul
        aria-hidden="true"
        className="grid grid-cols-[repeat(auto-fill,minmax(clamp(7.5rem,28vw,11rem),1fr))] gap-x-3 gap-y-8"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className="aspect-[2/3] animate-pulse rounded-[3px] bg-ash" />
        ))}
      </ul>,
    );
  }
  if (items.length === 0) {
    return frame(
      <div className="max-w-xl border-l-2 border-line py-1 pl-5">
        <p className="text-lg">Save what you want to watch later.</p>
        <p className="mt-2 text-smoke">
          Every title has a plus sign: on its card and on its page. What you mark with it waits for
          you here.
        </p>
        <a href="/browse" className="button button-quiet mt-6">
          Browse everything
        </a>
      </div>,
      0,
    );
  }
  return frame(
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(clamp(7.5rem,28vw,11rem),1fr))] gap-x-3 gap-y-8">
      {items.map(({ title }) => (
        <li key={title.id}>
          <PosterCard title={title} />
        </li>
      ))}
    </ul>,
    items.length,
  );
}
