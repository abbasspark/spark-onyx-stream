// SPDX-License-Identifier: AGPL-3.0-only
import { createListStore, type ListApi, withAdded, withRemoved } from './my-list';
import type { TitleCard } from './types';

const card = (id: string): TitleCard => ({ id, slug: `slug-${id}`, name: id }) as TitleCard;

function fakeApi(saved: string[] = []): ListApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    ids: async () => [...saved],
    list: async () => ({
      items: saved.map((id) => ({ title: card(id), addedAt: '2026-11-01T00:00:00.000Z' })),
      room: 500 - saved.length,
    }),
    add: async (slug) => void calls.push(`add ${slug}`),
    remove: async (slug) => void calls.push(`remove ${slug}`),
    clear: async () => void calls.push('clear'),
  };
}

describe('withAdded and withRemoved', () => {
  it('put the newest in front and keep the same list when nothing changes', () => {
    const ids = ['a', 'b'];
    expect(withAdded(ids, 'c')).toEqual(['c', 'a', 'b']);
    expect(withAdded(ids, 'a')).toBe(ids);
    expect(withRemoved(ids, 'a')).toEqual(['b']);
    expect(withRemoved(ids, 'z')).toBe(ids);
  });
});

describe('the list of a tab', () => {
  it('does not know who is here until it is told', () => {
    expect(createListStore(fakeApi()).snapshot()).toMatchObject({ status: 'unknown', ids: [] });
  });

  it('is empty for a visitor and asks the account nothing', async () => {
    const api = fakeApi(['a']);
    api.ids = async () => {
      throw new Error('must not be asked');
    };
    const store = createListStore(api);
    await store.start(null);
    expect(store.snapshot()).toMatchObject({ status: 'visitor', ids: [] });
  });

  it('takes the list of the profile, and that of another one when the profile changes', async () => {
    const api = fakeApi(['a', 'b']);
    const store = createListStore(api);
    await store.start('anna');
    expect(store.snapshot()).toMatchObject({ status: 'ready', ids: ['a', 'b'] });

    api.ids = async () => ['c'];
    await store.start('kid');
    expect(store.snapshot().ids).toEqual(['c']);
    await store.start(null);
    expect(store.snapshot()).toMatchObject({ status: 'visitor', ids: [], items: null });
  });

  it('drops an answer that arrives after the profile changed', async () => {
    const api = fakeApi();
    let answer: (ids: string[]) => void = () => undefined;
    api.ids = () => new Promise((resolve) => (answer = resolve));
    const store = createListStore(api);
    const first = store.start('anna');
    await store.start(null);
    answer(['a']);
    await first;
    expect(store.snapshot()).toMatchObject({ status: 'visitor', ids: [] });
  });

  it('shows a change at once and tells the account', async () => {
    const api = fakeApi(['a']);
    const store = createListStore(api);
    await store.start('anna');
    const heard = vi.fn();
    store.subscribe(heard);

    const adding = store.toggle(card('b'));
    expect(store.snapshot().ids).toEqual(['b', 'a']);
    expect(await adding).toBe(true);
    expect(await store.toggle(card('a'))).toBe(false);
    expect(store.snapshot().ids).toEqual(['b']);
    expect(api.calls).toEqual(['add slug-b', 'remove slug-a']);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(store.snapshot().stale).toBe(false);
  });

  it('takes a change back when the account refuses it', async () => {
    const api = fakeApi(['a']);
    api.add = async () => {
      throw new Error('A list holds 500 titles');
    };
    const store = createListStore(api);
    await store.start('anna');
    await expect(store.toggle(card('b'))).rejects.toThrow('500 titles');
    expect(store.snapshot().ids).toEqual(['a']);
  });

  it('keeps the cards in step once a page asked for them', async () => {
    const store = createListStore(fakeApi(['a', 'b']));
    await store.start('anna');
    expect(store.snapshot().items).toBeNull();
    await store.load();
    expect(store.snapshot().items?.map((item) => item.title.id)).toEqual(['a', 'b']);

    // A title that goes leaves at once. One that comes is fetched: its card is not known here.
    await store.toggle(card('a'));
    expect(store.snapshot().items?.map((item) => item.title.id)).toEqual(['b']);
    expect(store.snapshot().stale).toBe(false);
    await store.toggle(card('c'));
    expect(store.snapshot()).toMatchObject({ ids: ['c', 'b'], stale: true });
    expect(store.snapshot().items?.map((item) => item.title.id)).toEqual(['b']);
    await store.clear();
    expect(store.snapshot()).toMatchObject({ ids: [], items: [] });
  });

  it('still works when the list could not be fetched', async () => {
    const api = fakeApi();
    api.ids = async () => {
      throw new Error('offline');
    };
    const store = createListStore(api);
    await store.start('anna');
    expect(store.snapshot().status).toBe('ready');
    expect(await store.toggle(card('a'))).toBe(true);
  });
});
