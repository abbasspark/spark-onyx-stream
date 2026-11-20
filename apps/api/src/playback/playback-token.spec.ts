// SPDX-License-Identifier: AGPL-3.0-only
import { createPlaybackToken, verifyPlaybackToken } from './playback-token.js';

const SECRET = 's'.repeat(64);
const ASSET = '019a2b3c-0000-7000-8000-000000000001';
const NOW = 1_800_000_000;

describe('playback tokens', () => {
  it('accepts a token for its asset before it expires', () => {
    const token = createPlaybackToken(ASSET, NOW + 60, SECRET);

    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]{43}$/);
    expect(verifyPlaybackToken(token, ASSET, SECRET, NOW)).toEqual({ valid: true });
  });

  it('refuses an expired token', () => {
    const token = createPlaybackToken(ASSET, NOW - 1, SECRET);

    expect(verifyPlaybackToken(token, ASSET, SECRET, NOW)).toEqual({
      valid: false,
      reason: 'expired',
    });
    expect(
      verifyPlaybackToken(createPlaybackToken(ASSET, NOW, SECRET), ASSET, SECRET, NOW),
    ).toEqual({
      valid: false,
      reason: 'expired',
    });
  });

  it('refuses a token for another asset', () => {
    const token = createPlaybackToken(ASSET, NOW + 60, SECRET);
    const other = '019a2b3c-0000-7000-8000-000000000002';

    expect(verifyPlaybackToken(token, other, SECRET, NOW)).toEqual({
      valid: false,
      reason: 'signature',
    });
  });

  it('refuses a token whose expiry was extended', () => {
    const token = createPlaybackToken(ASSET, NOW + 60, SECRET);
    const extended = `${NOW + 86_400}.${token.split('.')[1]}`;

    expect(verifyPlaybackToken(extended, ASSET, SECRET, NOW)).toEqual({
      valid: false,
      reason: 'signature',
    });
  });

  it('refuses a token signed with another secret', () => {
    const token = createPlaybackToken(ASSET, NOW + 60, 'x'.repeat(64));

    expect(verifyPlaybackToken(token, ASSET, SECRET, NOW)).toEqual({
      valid: false,
      reason: 'signature',
    });
  });

  it('refuses malformed tokens', () => {
    for (const token of [
      '',
      'abc',
      '.sig',
      '123.',
      '12a.' + 'A'.repeat(43),
      '123.short',
      `${NOW + 60}.${'A'.repeat(44)}`,
    ]) {
      expect(verifyPlaybackToken(token, ASSET, SECRET, NOW)).toEqual({
        valid: false,
        reason: 'malformed',
      });
    }
  });
});
