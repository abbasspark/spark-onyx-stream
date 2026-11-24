// SPDX-License-Identifier: AGPL-3.0-only
'use client';

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_SETTINGS,
  type PlayerSettings,
  playerSettings,
  subscribeToSettings,
} from '@/lib/player-settings';

/**
 * What the viewer has set in the player, kept in step across every player on
 * the page. The server renders the defaults, which the first paint in the
 * browser replaces with what was stored.
 */
export function usePlayerSettings(): PlayerSettings {
  return useSyncExternalStore(subscribeToSettings, playerSettings, () => DEFAULT_SETTINGS);
}
