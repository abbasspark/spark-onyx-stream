// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { authHref } from '@/lib/viewer-api';
import { useViewerSession } from './viewer-session';

/** One or two letters for the round picture of a person. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const picked = words.length > 1 ? [words[0], words.at(-1)] : [words[0]];
  return picked
    .map((word) => [...(word ?? '')][0] ?? '')
    .join('')
    .toUpperCase();
}

/** In the header: "Sign in" for a visitor, the account for a viewer. */
export function AccountMenu() {
  const { state, viewer, signOut } = useViewerSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const here = params.size > 0 ? `${pathname}?${params}` : pathname;
  useEffect(() => setOpen(false), [here]);

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

  // The space is kept while it is not known who is here, so the header does not jump.
  if (state === 'loading') {
    return <div className="size-10" aria-hidden="true" />;
  }

  if (!viewer) {
    return (
      <Link
        href={authHref('sign-in', here)}
        className="heading flex h-10 items-center rounded-[3px] border border-vein/30 px-4 text-base whitespace-nowrap hover:border-vein"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={`Account of ${viewer.displayName}`}
        aria-expanded={open}
        aria-controls="account-menu"
        className="flex size-10 items-center justify-center rounded-full bg-vein text-sm font-bold text-onyx hover:bg-sard"
        onClick={() => setOpen((value) => !value)}
      >
        {initialsOf(viewer.displayName) || <UserRound className="size-5" />}
      </button>
      {open ? (
        <div
          id="account-menu"
          className="absolute top-full right-0 mt-3 w-64 border border-line bg-coal py-2"
        >
          <div className="border-b border-line px-4 pt-1 pb-3">
            <p className="truncate font-medium">{viewer.displayName}</p>
            <p className="truncate text-sm text-smoke">{viewer.email}</p>
          </div>
          <Link
            href="/account"
            className="mt-2 flex h-11 items-center gap-3 px-4 text-smoke hover:bg-ash hover:text-vein"
          >
            <UserRound className="size-4" aria-hidden="true" />
            Account
          </Link>
          <button
            type="button"
            className="flex h-11 w-full items-center gap-3 px-4 text-left text-smoke hover:bg-ash hover:text-vein"
            onClick={() => {
              setOpen(false);
              void signOut().then(() => router.refresh());
            }}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
