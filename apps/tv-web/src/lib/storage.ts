// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What the television keeps between starts. Storage on a television can be
 * switched off or full, so every read and write is allowed to fail quietly.
 */
export const storage = {
  get(name: string): string | null {
    try {
      return window.localStorage.getItem(`onyx.${name}`);
    } catch {
      return null;
    }
  },
  set(name: string, value: string): void {
    try {
      window.localStorage.setItem(`onyx.${name}`, value);
    } catch {
      // The viewer signs in again next time.
    }
  },
  remove(name: string): void {
    try {
      window.localStorage.removeItem(`onyx.${name}`);
    } catch {
      // Nothing to remove.
    }
  },
};

/** An id that tells this installation of the app from another, made once and kept. */
export function installationId(): string {
  const kept = storage.get('installation');
  if (kept && /^[A-Za-z0-9_-]{8,64}$/.test(kept)) {
    return kept;
  }
  const bytes = new Uint8Array(18);
  window.crypto.getRandomValues(bytes);
  const made = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  storage.set('installation', made);
  return made;
}
