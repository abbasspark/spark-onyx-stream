// SPDX-License-Identifier: AGPL-3.0-only
import { useQueryClient } from '@tanstack/react-query';
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
import { configureApiClient } from '../api/client';
import { authApi } from '../api/endpoints';
import type { Me, Permission } from '../api/types';
import { tokenStore } from './token-store';

type SessionState =
  { status: 'loading' } | { status: 'signedOut'; reason?: string } | { status: 'signedIn'; me: Me };

interface SessionContextValue {
  state: SessionState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Whether the signed-in admin holds a permission. */
  can: (permission: Permission) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const tokenRef = useRef<string | null>(tokenStore.read());
  const [state, setState] = useState<SessionState>(
    tokenRef.current ? { status: 'loading' } : { status: 'signedOut' },
  );

  const endSession = useCallback(
    (reason?: string) => {
      tokenRef.current = null;
      tokenStore.clear();
      queryClient.clear();
      setState({ status: 'signedOut', reason });
    },
    [queryClient],
  );

  // The API client asks for the token on every call and reports a refused one.
  useEffect(() => {
    configureApiClient({
      token: () => tokenRef.current,
      onUnauthorized: () => endSession('Your session has ended. Sign in again.'),
    });
  }, [endSession]);

  // On load, a stored token is checked by asking who it belongs to.
  useEffect(() => {
    if (!tokenRef.current) {
      return;
    }
    const controller = new AbortController();
    authApi
      .me(controller.signal)
      .then((me) => setState({ status: 'signedIn', me }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        // A refused token has already ended the session. Anything else is a server problem.
        if (tokenRef.current) {
          setState({
            status: 'signedOut',
            reason: error instanceof Error ? error.message : 'Could not reach the server',
          });
        }
      });
    return () => controller.abort();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    tokenRef.current = result.token;
    tokenStore.write(result.token);
    const me = await authApi.me();
    setState({ status: 'signedIn', me });
  }, []);

  const signOut = useCallback(async () => {
    // The server forgets the session. If that call fails, the browser still does.
    await authApi.logout().catch(() => undefined);
    endSession();
  }, [endSession]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      signIn,
      signOut,
      can: (permission) => state.status === 'signedIn' && state.me.permissions.includes(permission),
    }),
    [state, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return context;
}
