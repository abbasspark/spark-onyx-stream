// SPDX-License-Identifier: AGPL-3.0-only
import { InvalidStorageKeyError, normalizeStorageKey } from './storage-key.js';

describe('normalizeStorageKey', () => {
  it('accepts relative keys', () => {
    expect(normalizeStorageKey('assets/abc/master.m3u8')).toBe('assets/abc/master.m3u8');
    expect(normalizeStorageKey('file.txt')).toBe('file.txt');
    expect(normalizeStorageKey('sources/abc/My Movie (2024).mkv')).toBe(
      'sources/abc/My Movie (2024).mkv',
    );
  });

  it('removes a trailing slash', () => {
    expect(normalizeStorageKey('assets/abc/')).toBe('assets/abc');
  });

  it.each([
    ['', 'empty'],
    ['/', 'absolute'],
    ['/etc/passwd', 'absolute'],
    ['../secret', '".."'],
    ['assets/../../etc/passwd', '".."'],
    ['assets/./x', '"."'],
    ['assets//x', 'empty path segment'],
    ['assets\\..\\x', 'backslash'],
    ['C:/Windows/system32', 'drive letter'],
    ['assets/x\0.txt', 'null byte'],
  ])('rejects %j', (key, reason) => {
    expect(() => normalizeStorageKey(key)).toThrow(InvalidStorageKeyError);
    expect(() => normalizeStorageKey(key)).toThrow(reason);
  });

  it('rejects very long keys', () => {
    expect(() => normalizeStorageKey('a/'.repeat(600))).toThrow(/longer than/);
  });
});
