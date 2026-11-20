// SPDX-License-Identifier: AGPL-3.0-only
import { credentialKind, generateApiKey, generateSessionToken, hashToken } from './tokens.js';

describe('tokens', () => {
  it('generates unique session tokens whose hash matches', () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(first.token).not.toBe(second.token);
    expect(first.token.startsWith('onyx_sess_')).toBe(true);
    expect(first.tokenHash).toBe(hashToken(first.token));
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates API keys that start with their public prefix', () => {
    const generated = generateApiKey();

    expect(generated.prefix).toMatch(/^onyx_key_[0-9a-f]{8}$/);
    expect(generated.key.startsWith(`${generated.prefix}_`)).toBe(true);
    expect(generated.keyHash).toBe(hashToken(generated.key));
  });

  it('recognizes the credential kind', () => {
    expect(credentialKind(generateSessionToken().token)).toBe('session');
    expect(credentialKind(generateApiKey().key)).toBe('apiKey');
    expect(credentialKind('eyJhbGciOi.something.else')).toBeNull();
  });
});
