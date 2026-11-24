// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { audienceCookie, audienceFromCookies, limitOf } from '@/lib/audience';
import type { Profile } from '@/lib/profiles';
import { type AccessConfig, type Viewer, viewerApi } from '@/lib/viewer-api';
import { type Opens, opensFrom, type OwnedTitle } from '@/lib/plans';
import { endSync, restartSync, startSync } from '@/lib/watch-sync';

interface ViewerSession {
  /**
   * "loading" until the browser has asked who is signed in. Pages are the same
   * for everyone when they leave the server, so this is only known here.
   */
  state: 'loading' | 'ready';
  viewer: Viewer | null;
  /** Who of the account is watching on this device. Null for a visitor. */
  profile: Profile | null;
  /**
   * Whether the profile in use has an age limit. Such a profile watches: it
   * does not change profiles, the account or its devices, and spends nothing.
   */
  restricted: boolean;
  /**
   * Whether a profile has to be chosen before anything else, because the
   * main one has a PIN and this sign-in has not said who is watching.
   */
  chooseProfile: boolean;
  /** Whether the viewer has a running subscription, which opens paid titles. */
  entitled: boolean;
  /** Which paid titles the subscription opens: all, or those of some packages. Null without one. */
  opens: Opens;
  /** Takes over what the API said about the subscription, after paying for one. */
  setSubscription: (result: {
    entitled: boolean;
    access?: Opens;
    purchases?: OwnedTitle[];
  }) => void;
  /** Titles the viewer rented or bought and can watch now. */
  purchases: OwnedTitle[];
  /** What is open on this site. Null while loading, or when it could not be asked. */
  access: AccessConfig | null;
  /**
   * Takes over a viewer after sign-in, sign-up or a change of name. The
   * profile is given at sign-in; left out, the one in use stays.
   */
  setViewer: (viewer: Viewer | null, profile?: Profile, chooseProfile?: boolean) => void;
  /**
   * Takes over the profile in use: another one after a choice, or the same
   * one after a change of its name or colour.
   */
  setProfile: (profile: Profile) => void;
  /** Changes what is known about the signed-in viewer. Does nothing for a visitor. */
  updateViewer: (change: (viewer: Viewer) => Viewer) => void;
  signOut: () => Promise<void>;
}

const Context = createContext<ViewerSession | null>(null);

/** Tells other tabs of this browser that the sign-in changed. */
const CHANNEL = 'onyx.web.viewer';

/** Where a sign-in that still has to choose a profile may be: choosing, or leaving. */
const OPEN_WHILE_CHOOSING = ['/profiles', '/sign-in', '/sign-up', '/forgot-password'];

/** Knows who is signed in, for everything on the page that depends on it. */
export function ViewerSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  const [viewer, setViewerState] = useState<Viewer | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [chooseProfile, setChooseProfile] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const [opens, setOpens] = useState<Opens>(null);
  const entitled = opens !== null;
  const [purchases, setPurchases] = useState<OwnedTitle[]>([]);
  const setSubscription = useCallback(
    (result: { entitled: boolean; access?: Opens; purchases?: OwnedTitle[] }) => {
      setOpens(opensFrom(result));
      // An answer that does not name them leaves what is known.
      if (result.purchases) {
        setPurchases(result.purchases);
      }
    },
    [],
  );
  const [access, setAccess] = useState<AccessConfig | null>(null);

  /** The viewer and the profile whose watch history this browser holds. */
  const signedInAs = useRef<{ viewer: string; profile: string | null } | null>(null);

  const load = useCallback(async () => {
    const [me, config] = await Promise.allSettled([viewerApi.session(), viewerApi.config()]);
    // Without an answer the page behaves as for a visitor, which is always safe.
    const known = me.status === 'fulfilled' ? me.value : { viewer: null, profile: null };
    setViewerState(known.viewer);
    setProfileState(known.profile);
    setChooseProfile(known.viewer !== null && known.chooseProfile === true);
    setOpens(opensFrom({ entitled: known.entitled === true, access: known.access }));
    setPurchases(known.purchases ?? []);
    if (me.status === 'fulfilled') {
      const before = signedInAs.current;
      signedInAs.current = known.viewer
        ? { viewer: known.viewer.id, profile: known.profile.id }
        : null;
      // Before "ready", so a player that waits for the session also finds
      // the watch history on its way.
      if (before && known.viewer && before.profile !== known.profile.id) {
        // Another profile was chosen in another tab.
        restartSync();
      } else {
        startSync(known.viewer !== null);
      }
    }
    setAccess(config.status === 'fulfilled' ? config.value : null);
    setState('ready');
  }, []);

  useEffect(() => {
    void load();
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => void load();
    return () => channel.close();
  }, [load]);

  // The pages the server draws follow a cookie with the age limit of the
  // profile in use. When that changes, what is on screen was drawn for
  // somebody else and is asked for again.
  const limit = limitOf({ chooseProfile, profile: viewer ? profile : null });
  useEffect(() => {
    if (state !== 'ready') {
      return;
    }
    if ((audienceFromCookies(document.cookie) ?? null) !== limit) {
      document.cookie = audienceCookie(limit);
      router.refresh();
    }
  }, [state, limit, router]);

  useEffect(() => {
    if (state === 'ready' && chooseProfile && !OPEN_WHILE_CHOOSING.includes(pathname)) {
      router.replace(`/profiles?next=${encodeURIComponent(pathname)}`);
    }
  }, [state, chooseProfile, pathname, router]);

  const announce = () => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage('changed');
      channel.close();
    }
  };

  const setViewer = useCallback(
    (next: Viewer | null, nextProfile?: Profile, mustChoose = false) => {
      // A change of name is the same viewer and has nothing to hand over.
      if ((next?.id ?? null) !== (signedInAs.current?.viewer ?? null)) {
        signedInAs.current = next ? { viewer: next.id, profile: nextProfile?.id ?? null } : null;
        if (next) {
          startSync(true);
          // Signing in does not say whether the viewer is subscribed.
          viewerApi
            .subscription()
            .then(setSubscription)
            .catch(() => {
              // Stays as for a viewer without one. The player asks the API anyway.
            });
        } else {
          endSync();
        }
      }
      setViewerState(next);
      if (!next) {
        setProfileState(null);
        setChooseProfile(false);
        setOpens(null);
        setPurchases([]);
      } else if (nextProfile) {
        setProfileState(nextProfile);
        setChooseProfile(mustChoose);
      }
      announce();
    },
    [setSubscription],
  );

  const setProfile = useCallback((next: Profile) => {
    const current = signedInAs.current;
    if (!current) {
      return;
    }
    if (current.profile !== next.id) {
      signedInAs.current = { ...current, profile: next.id };
      restartSync();
    }
    setProfileState(next);
    // Whoever chose a profile said who is watching.
    setChooseProfile(false);
    announce();
  }, []);

  const updateViewer = useCallback((change: (viewer: Viewer) => Viewer) => {
    setViewerState((current) => (current ? change(current) : current));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await viewerApi.logout();
    } finally {
      // Whatever the server said, this browser no longer shows the account.
      signedInAs.current = null;
      endSync();
      setViewerState(null);
      setProfileState(null);
      setChooseProfile(false);
      setOpens(null);
      setPurchases([]);
      announce();
    }
  }, []);

  const value = useMemo(
    () => ({
      state,
      viewer,
      profile,
      restricted: limit !== null,
      chooseProfile,
      entitled,
      opens,
      purchases,
      setSubscription,
      access,
      setViewer,
      setProfile,
      updateViewer,
      signOut,
    }),
    [
      state,
      viewer,
      profile,
      limit,
      chooseProfile,
      entitled,
      opens,
      purchases,
      setSubscription,
      access,
      setViewer,
      setProfile,
      updateViewer,
      signOut,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useViewerSession(): ViewerSession {
  const session = useContext(Context);
  if (!session) {
    throw new Error('useViewerSession needs a ViewerSessionProvider above it');
  }
  return session;
}
