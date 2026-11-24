// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { favourites, subscribeToFavourites, toggleFavourite } from '@/lib/favourites';

const NONE: string[] = [];

/**
 * The channels marked as favourites on this device, kept in step across the
 * lists and the guide. The server renders none, which the first paint in the
 * browser replaces with what was stored.
 */
export function useFavourites(): { marked: string[]; toggle: (slug: string) => void } {
  const marked = useSyncExternalStore(subscribeToFavourites, favourites, () => NONE);
  const toggle = useCallback((slug: string) => {
    toggleFavourite(slug);
  }, []);
  return { marked, toggle };
}
