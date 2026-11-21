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
import { type AccessConfig, type Viewer, viewerApi } from '@/lib/viewer-api';
import { endSync, startSync } from '@/lib/watch-sync';

interface ViewerSession {
  /**
   * "loading" until the browser has asked who is signed in. Pages are the same
   * for everyone when they leave the server, so this is only known here.
   */
  state: 'loading' | 'ready';
  viewer: Viewer | null;
  /** What is open on this site. Null while loading, or when it could not be asked. */
  access: AccessConfig | null;
  /** Takes over a viewer after sign-in, sign-up or a change of name. */
  setViewer: (viewer: Viewer | null) => void;
  signOut: () => Promise<void>;
}

const Context = createContext<ViewerSession | null>(null);

/** Tells other tabs of this browser that the sign-in changed. */
const CHANNEL = 'onyx.web.viewer';

/** Knows who is signed in, for everything on the page that depends on it. */
export function ViewerSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ready'>('loading');
  const [viewer, setViewerState] = useState<Viewer | null>(null);
  const [access, setAccess] = useState<AccessConfig | null>(null);

  const signedInAs = useRef<string | null>(null);

  const load = useCallback(async () => {
    const [me, config] = await Promise.allSettled([viewerApi.me(), viewerApi.config()]);
    // Without an answer the page behaves as for a visitor, which is always safe.
    setViewerState(me.status === 'fulfilled' ? me.value : null);
    if (me.status === 'fulfilled') {
      // Before "ready", so a player that waits for the session also finds
      // the watch history on its way.
      signedInAs.current = me.value?.id ?? null;
      startSync(me.value !== null);
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

  const announce = () => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage('changed');
      channel.close();
    }
  };

  const setViewer = useCallback((next: Viewer | null) => {
    // A change of name is the same viewer and has nothing to hand over.
    if ((next?.id ?? null) !== signedInAs.current) {
      signedInAs.current = next?.id ?? null;
      if (next) {
        startSync(true);
      } else {
        endSync();
      }
    }
    setViewerState(next);
    announce();
  }, []);

  const signOut = useCallback(async () => {
    try {
      await viewerApi.logout();
    } finally {
      // Whatever the server said, this browser no longer shows the account.
      signedInAs.current = null;
      endSync();
      setViewerState(null);
      announce();
    }
  }, []);

  const value = useMemo(
    () => ({ state, viewer, access, setViewer, signOut }),
    [state, viewer, access, setViewer, signOut],
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
