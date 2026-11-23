// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { ListPlus, LogOut, Tv, UserRound, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { type Profile, profilesApi } from '@/lib/profiles';
import { authHref } from '@/lib/viewer-api';
import { ProfileAvatar } from './profile-avatar';
import { useViewerSession } from './viewer-session';

/** In the header: "Sign in" for a visitor, who is watching for a viewer. */
export function AccountMenu() {
  const { state, viewer, profile, setProfile, signOut } = useViewerSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [others, setOthers] = useState<Profile[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
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

  // The other people of the account, asked for when the menu opens.
  const profileId = profile?.id;
  useEffect(() => {
    if (!open || !profileId) {
      return;
    }
    let current = true;
    profilesApi
      .list()
      .then((result) => {
        if (current) {
          setOthers(result.profiles.filter((other) => other.id !== profileId));
        }
      })
      .catch(() => {
        // The menu works without the list.
      });
    return () => {
      current = false;
    };
  }, [open, profileId]);

  const switchTo = async (next: Profile) => {
    setSwitching(next.id);
    try {
      setProfile(await profilesApi.select(next.id));
      setOpen(false);
    } catch {
      // Deleted on another device in the meantime. The page to manage profiles shows what is there.
      router.push('/profiles');
    } finally {
      setSwitching(null);
    }
  };

  // The space is kept while it is not known who is here, so the header does not jump.
  if (state === 'loading') {
    return <div className="size-10" aria-hidden="true" />;
  }

  if (!viewer || !profile) {
    return (
      <Link
        href={authHref('sign-in', here)}
        className="heading flex h-10 items-center rounded-[3px] border border-vein/30 px-4 text-base whitespace-nowrap hover:border-vein"
      >
        Sign in
      </Link>
    );
  }

  const item =
    'flex h-11 w-full items-center gap-3 px-4 text-left text-smoke hover:bg-ash hover:text-vein';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={`${profile.name}, account of ${viewer.displayName}`}
        aria-expanded={open}
        aria-controls="account-menu"
        className="block rounded-[3px] outline-offset-4 hover:brightness-110"
        onClick={() => setOpen((value) => !value)}
      >
        <ProfileAvatar profile={profile} className="size-10" />
      </button>
      {open ? (
        <div
          id="account-menu"
          className="absolute top-full right-0 mt-3 w-72 border border-line bg-coal py-2"
        >
          <div className="flex items-center gap-3 border-b border-line px-4 pt-1 pb-3">
            <ProfileAvatar profile={profile} className="size-11" />
            <div className="min-w-0">
              <p className="truncate font-medium">{profile.name}</p>
              <p className="truncate text-sm text-smoke">{viewer.email}</p>
            </div>
          </div>
          {others.length > 0 ? (
            <ul className="border-b border-line py-2" aria-label="Switch profile">
              {others.map((other) => (
                <li key={other.id}>
                  <button
                    type="button"
                    className={item}
                    disabled={switching !== null}
                    onClick={() => void switchTo(other)}
                  >
                    <ProfileAvatar profile={other} className="size-7" />
                    <span className="truncate">{other.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/my-list" className={`${item} mt-2`}>
            <ListPlus className="size-4" aria-hidden="true" />
            My list
          </Link>
          <Link href="/profiles" className={item}>
            <UsersRound className="size-4" aria-hidden="true" />
            {others.length > 0 ? 'Manage profiles' : 'Add a profile'}
          </Link>
          <Link href="/activate" className={item}>
            <Tv className="size-4" aria-hidden="true" />
            Sign in a TV
          </Link>
          <Link href="/account" className={item}>
            <UserRound className="size-4" aria-hidden="true" />
            Account
          </Link>
          <button
            type="button"
            className={item}
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
