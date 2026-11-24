// SPDX-License-Identifier: AGPL-3.0-only
//
// The channels a viewer wants at the top of the list. Kept on the device: a
// household shares an account, the remote control in the living room and the
// phone in the kitchen do not watch the same things, and a favourite is a
// small enough thing to be worth no round trip.

const KEY = 'onyx.web.favourite-channels';
/** More than this and the list stops being a short cut. */
const MOST = 100;

let current: string[] | null = null;
const listeners = new Set<() => void>();

/** Reads a stored list, keeping only what could be a channel's name in an address. */
export function parseFavourites(raw: string | null): string[] {
  let stored: unknown;
  try {
    stored = JSON.parse(raw ?? 'null');
  } catch {
    return [];
  }
  if (!Array.isArray(stored)) {
    return [];
  }
  const seen = new Set<string>();
  return stored
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .filter((slug) => !seen.has(slug) && seen.add(slug))
    .slice(0, MOST);
}

/** The list with a channel put in, or taken out when it is already there. */
export function withFavourite(marked: readonly string[], slug: string): string[] {
  return marked.includes(slug)
    ? marked.filter((entry) => entry !== slug)
    : [...marked, slug].slice(0, MOST);
}

export function favourites(): string[] {
  if (current) {
    return current;
  }
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    current = parseFavourites(window.localStorage.getItem(KEY));
  } catch {
    // Storage can be switched off. Favourites then last for this page.
    current = [];
  }
  return current;
}

export function isFavourite(slug: string): boolean {
  return favourites().includes(slug);
}

/** Puts a channel in the list, or takes it out. Returns the list afterwards. */
export function toggleFavourite(slug: string): string[] {
  const next = withFavourite(favourites(), slug);
  current = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // As above: kept for this page only.
  }
  for (const listener of listeners) {
    listener();
  }
  return next;
}

export function subscribeToFavourites(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Forgets what was read, for tests. */
export function resetFavouritesCache(): void {
  current = null;
}

/**
 * The channels in the order a viewer wants to see them: favourites first, in
 * the order they were marked, then the rest as they came.
 */
export function favouritesFirst<T extends { slug: string }>(
  channels: readonly T[],
  marked: readonly string[],
): T[] {
  const liked: T[] = [];
  for (const slug of marked) {
    const channel = channels.find((entry) => entry.slug === slug);
    if (channel) {
      liked.push(channel);
    }
  }
  return [...liked, ...channels.filter((channel) => !marked.includes(channel.slug))];
}

/**
 * The channels whose name or number matches what was typed. An empty search
 * matches everything.
 */
export function matching<T extends { name: string; number?: number | null }>(
  channels: readonly T[],
  search: string,
): T[] {
  const wanted = search.trim().toLowerCase();
  if (wanted === '') {
    return [...channels];
  }
  return channels.filter(
    (channel) =>
      channel.name.toLowerCase().includes(wanted) ||
      String(channel.number ?? '').startsWith(wanted),
  );
}
