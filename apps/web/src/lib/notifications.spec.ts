// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { badgeOf, keyBytes, safeLink, timeAgo } from './notifications';

describe('timeAgo', () => {
  const now = new Date('2026-12-10T12:00:00Z');
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

  it('says how long ago in words that get coarser', () => {
    expect(timeAgo(ago(0), now)).toBe('just now');
    expect(timeAgo(ago(5), now)).toBe('5 min ago');
    expect(timeAgo(ago(59), now)).toBe('59 min ago');
    expect(timeAgo(ago(60), now)).toBe('1 h ago');
    expect(timeAgo(ago(23 * 60), now)).toBe('23 h ago');
    expect(timeAgo(ago(30 * 60), now)).toBe('yesterday');
    expect(timeAgo(ago(4 * 24 * 60), now)).toBe('4 days ago');
    expect(timeAgo(ago(20 * 24 * 60), now)).toBe('Nov 20');
  });

  it('calls a moment that is to come, or no moment, "just now"', () => {
    expect(timeAgo(ago(-10), now)).toBe('just now');
    expect(timeAgo('nonsense', now)).toBe('just now');
  });
});

describe('badgeOf', () => {
  it('shows the number up to nine', () => {
    expect(badgeOf(0)).toBeNull();
    expect(badgeOf(1)).toBe('1');
    expect(badgeOf(9)).toBe('9');
    expect(badgeOf(10)).toBe('9+');
    expect(badgeOf(250)).toBe('9+');
  });
});

describe('safeLink', () => {
  it('follows paths of this website only', () => {
    expect(safeLink('/title/glass-tide')).toBe('/title/glass-tide');
    expect(safeLink('/browse?sort=newest')).toBe('/browse?sort=newest');
    expect(safeLink('https://evil.example.com')).toBeNull();
    expect(safeLink('//evil.example.com')).toBeNull();
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink(null)).toBeNull();
  });
});

describe('keyBytes', () => {
  it('turns the key of the server into the bytes browsers want', () => {
    expect([...keyBytes('BAEC_-8')]).toEqual([4, 1, 2, 255, 239]);
    expect(keyBytes(Buffer.alloc(65, 7).toString('base64url'))).toHaveLength(65);
  });
});
