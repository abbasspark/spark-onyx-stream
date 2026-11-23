// SPDX-License-Identifier: AGPL-3.0-only
//
// "My list": the titles a viewer saved to watch later. The list is kept by
// the account, per profile. Pages hold a copy here, so that every button on a
// page knows at once whether its title is on the list.
import { withLanguage } from './language';
import type { TitleCard } from './types';
import { call } from './viewer-api';

/** A title on the list, with when it was put there. */
export interface ListItem {
  title: TitleCard;
  addedAt: string;
}

export interface ListApi {
  ids: () => Promise<string[]>;
  list: (language?: string) => Promise<{ items: ListItem[]; room: number }>;
  add: (slug: string) => Promise<unknown>;
  remove: (slug: string) => Promise<unknown>;
  clear: () => Promise<unknown>;
}

export const listApi: ListApi = {
  ids: () => call<{ ids: string[] }>('GET', '/list/ids').then((result) => result.ids),
  list: (language) =>
    call<{ items: ListItem[]; room: number }>('GET', withLanguage('/list', language)),
  add: (slug) => call('PUT', `/list/${encodeURIComponent(slug)}`),
  remove: (slug) => call('DELETE', `/list/${encodeURIComponent(slug)}`),
  clear: () => call('DELETE', '/list'),
};

export interface ListState {
  /**
   * "unknown" until it is known who is here, "visitor" when nobody is signed
   * in, "loading" while the list of the profile is on its way.
   */
  status: 'unknown' | 'visitor' | 'loading' | 'ready';
  /** The ids of the titles on the list, the last added first. */
  ids: readonly string[];
  /** The titles as cards, once a page asked for them. */
  items: readonly ListItem[] | null;
  /** True when the cards miss a title that was added since: they are due to be fetched again. */
  stale: boolean;
}

/** What a button knows of its title: enough to change the list and to say so. */
export type ListTitle = Pick<TitleCard, 'id' | 'slug' | 'name'>;

const EMPTY: ListState = { status: 'unknown', ids: [], items: null, stale: false };

/** The ids with one more in front. Unchanged when it is there already. */
export function withAdded(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids : [id, ...ids];
}

/** The ids without one. Unchanged when it is not there. */
export function withRemoved(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : ids;
}

/**
 * The copy of one profile's list that the pages of a browser tab share.
 *
 * A change shows at once and is sent to the account behind it. When the
 * account refuses, the change is taken back and the caller hears why.
 */
export function createListStore(api: ListApi = listApi) {
  let state = EMPTY;
  /** Whose list this is: the profile, or null for a visitor. Undefined: not known yet. */
  let owner: string | null | undefined;
  const listeners = new Set<() => void>();

  const set = (next: Partial<ListState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: (): ListState => state,
    serverSnapshot: (): ListState => EMPTY,

    /**
     * Called when it is known who is here, and again when that changes. The
     * list of another profile is dropped before the new one is fetched.
     *
     * @param profileId The profile in use, or null for a visitor.
     */
    async start(profileId: string | null): Promise<void> {
      if (owner === profileId) {
        return;
      }
      owner = profileId;
      if (profileId === null) {
        set({ status: 'visitor', ids: [], items: null, stale: false });
        return;
      }
      set({ status: 'loading', ids: [], items: null, stale: false });
      try {
        const ids = await api.ids();
        if (owner === profileId) {
          set({ status: 'ready', ids });
        }
      } catch {
        // Without the list the buttons still work: each change is sent on its own.
        if (owner === profileId) {
          set({ status: 'ready' });
        }
      }
    },

    /** Fetches the titles as cards, for a page that shows them. */
    async load(language?: string): Promise<void> {
      const asked = owner;
      if (!asked) {
        return;
      }
      const { items } = await api.list(language);
      if (owner === asked) {
        set({ status: 'ready', items, ids: items.map((item) => item.title.id), stale: false });
      }
    },

    /**
     * Puts a title on the list, or takes it off.
     *
     * @returns Whether the title is on the list now.
     * @throws What the account answered, after the change was taken back.
     */
    async toggle(title: ListTitle): Promise<boolean> {
      const asked = owner;
      const before = state;
      const saved = !state.ids.includes(title.id);
      set({
        ids: saved ? withAdded(state.ids, title.id) : withRemoved(state.ids, title.id),
        items:
          state.items === null || saved
            ? state.items
            : state.items.filter((item) => item.title.id !== title.id),
      });
      try {
        await (saved ? api.add(title.slug) : api.remove(title.slug));
        if (saved && owner === asked && state.items !== null) {
          // The card of the new title is not known here: the cards are fetched again.
          set({ stale: true });
        }
        return saved;
      } catch (caught) {
        if (owner === asked) {
          set({ ids: before.ids, items: before.items });
        }
        throw caught;
      }
    },

    /** Empties the list. @throws What the account answered, with the list as it was. */
    async clear(): Promise<void> {
      const before = state;
      set({ ids: [], items: state.items === null ? null : [], stale: false });
      try {
        await api.clear();
      } catch (caught) {
        set({ ids: before.ids, items: before.items });
        throw caught;
      }
    },
  };
}

export type ListStore = ReturnType<typeof createListStore>;

/** The list of this browser tab. */
export const myList = createListStore();
