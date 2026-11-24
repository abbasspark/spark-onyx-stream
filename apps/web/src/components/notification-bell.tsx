// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { Bell, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { languageFromCookies } from '@/lib/language';
import {
  badgeOf,
  type NotificationItem,
  notificationsApi,
  refreshPush,
  safeLink,
  timeAgo,
} from '@/lib/notifications';
import { useViewerSession } from './viewer-session';

/** How often it is asked whether something new arrived, while the page is in front. */
const ASK_EVERY_MS = 60_000;

/**
 * The bell of a signed-in viewer: a mark when something arrived, and the
 * list of what was sent. Nothing for a visitor. A profile with an age limit
 * has no bell: what is sent is for whoever holds the account.
 */
export function NotificationBell() {
  const { state, viewer, restricted } = useViewerSession();
  const pathname = usePathname();
  const signedIn = state === 'ready' && viewer !== null && !restricted;
  const viewerId = viewer?.id ?? null;
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  // The mark: asked for now and then, and when the tab comes back to the front.
  useEffect(() => {
    if (!signedIn) {
      setUnread(0);
      setItems(null);
      return;
    }
    let current = true;
    const ask = () => {
      if (document.visibilityState === 'visible') {
        notificationsApi
          .unread()
          .then((count) => current && setUnread(count))
          .catch(() => undefined);
      }
    };
    ask();
    const timer = window.setInterval(ask, ASK_EVERY_MS);
    document.addEventListener('visibilitychange', ask);
    // A browser that allowed notifications once takes them for whoever is signed in now.
    void refreshPush(languageFromCookies(document.cookie)).catch(() => undefined);
    return () => {
      current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', ask);
    };
  }, [signedIn, viewerId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const load = useCallback(() => {
    setFailed(false);
    notificationsApi
      .list()
      .then((list) => {
        setItems(list.items);
        setNext(list.next);
        // Opening the list is seeing what is in it.
        if (list.unread > 0) {
          void notificationsApi
            .read()
            .then(() => setUnread(0))
            .catch(() => undefined);
        }
      })
      .catch(() => setFailed(true));
  }, []);

  if (!signedIn) {
    return null;
  }
  const badge = badgeOf(unread);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative flex size-11 items-center justify-center rounded-[3px] hover:bg-vein/10"
        onClick={() => {
          if (!open) {
            load();
          }
          setOpen(!open);
        }}
      >
        <Bell className="size-5" />
        {badge ? (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sard px-1 text-[10px] leading-none font-semibold text-onyx"
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[min(34rem,calc(100dvh-5rem))] overflow-y-auto border border-line bg-coal shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2 sm:w-[24rem]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="heading text-base">Notifications</h2>
            <Link href="/account#notifications" className="text-sm text-smoke hover:text-vein">
              Settings
            </Link>
          </div>
          {failed ? (
            <p className="px-4 py-6 text-sm text-smoke">
              The list could not be read.{' '}
              <button type="button" className="underline underline-offset-4" onClick={load}>
                Try again
              </button>
            </p>
          ) : items === null ? (
            <p className="px-4 py-6 text-sm text-smoke">One moment…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-smoke">
              Nothing yet. New episodes of what you follow will show up here.
            </p>
          ) : (
            <ul>
              {items.map((item) => {
                const link = safeLink(item.link);
                const words = (
                  <>
                    {item.image ? (
                      <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        className="h-12 w-20 shrink-0 rounded-[2px] bg-ash object-cover"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        {item.read ? null : (
                          <span
                            aria-label="New"
                            className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-sard"
                          />
                        )}
                        <span className="truncate text-sm font-medium">{item.title}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-sm text-smoke">{item.body}</span>
                      <span className="mt-1 block text-xs text-dust">
                        {timeAgo(item.createdAt)}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li
                    key={item.id}
                    className="group/item relative border-b border-line last:border-b-0"
                  >
                    {link ? (
                      <Link
                        href={link}
                        className="flex gap-3 py-3 pr-11 pl-4 hover:bg-vein/5"
                        onClick={() => void notificationsApi.opened(item.id).catch(() => undefined)}
                      >
                        {words}
                      </Link>
                    ) : (
                      <div className="flex gap-3 py-3 pr-11 pl-4">{words}</div>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove "${item.title}"`}
                      className="absolute top-2 right-1.5 flex size-8 items-center justify-center rounded-full text-smoke opacity-0 group-hover/item:opacity-100 hover:bg-vein/10 hover:text-vein focus-visible:opacity-100 pointer-coarse:opacity-100"
                      onClick={() => {
                        setItems(
                          (current) => current?.filter((other) => other.id !== item.id) ?? null,
                        );
                        void notificationsApi.remove(item.id).catch(() => undefined);
                      }}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {next && items ? (
            <button
              type="button"
              className="w-full border-t border-line px-4 py-3 text-sm text-smoke hover:text-vein"
              onClick={() =>
                void notificationsApi
                  .list(next)
                  .then((list) => {
                    setItems([...items, ...list.items]);
                    setNext(list.next);
                  })
                  .catch(() => setFailed(true))
              }
            >
              Show older
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
