// SPDX-License-Identifier: AGPL-3.0-only

interface Entry<Value> {
  value: Promise<Value>;
  expiresAt: number;
}

/**
 * Keeps answers for a fixed time and never hands out an older one.
 *
 * - Everyone who asks for the same key while it is being loaded waits for
 *   the same load, so a busy page causes one request, not hundreds.
 * - A failed load is not kept. The next caller tries again.
 * - When full, the entry that was used least recently makes room.
 */
export class TtlCache<Value> {
  private readonly entries = new Map<string, Entry<Value>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string, load: () => Promise<Value>): Promise<Value> {
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > this.now()) {
      // Moved to the end: a Map keeps the order of insertion, so the front is the oldest use.
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.value;
    }

    const value = load();
    const entry: Entry<Value> = { value, expiresAt: this.now() + this.ttlMs };
    this.entries.delete(key);
    this.entries.set(key, entry);
    value.catch(() => {
      // Only if nobody replaced it in the meantime.
      if (this.entries.get(key) === entry) {
        this.entries.delete(key);
      }
    });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
    return value;
  }

  get size(): number {
    return this.entries.size;
  }
}
