// SPDX-License-Identifier: AGPL-3.0-only

const STORAGE_KEY = 'onyx.admin.session';

/**
 * Keeps the session token in the browser so a reload does not sign the admin
 * out. The token is opaque and can be revoked on the server by signing out.
 */
export const tokenStore = {
  read(): string | null {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be blocked, for example in private windows. The session then lasts until reload.
      return null;
    }
  },
  write(token: string): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, token);
    } catch {
      // See read().
    }
  },
  clear(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // See read().
    }
  },
};
