// SPDX-License-Identifier: AGPL-3.0-only
import { SecretBox } from './secret-box.js';

const KEY = 'a1'.repeat(32);

describe('SecretBox', () => {
  it('round-trips a secret', () => {
    const box = new SecretBox(KEY);
    const stored = box.encrypt('s3-secret-access-key/with+symbols=');

    expect(stored).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(stored).not.toContain('s3-secret');
    expect(box.decrypt(stored)).toBe('s3-secret-access-key/with+symbols=');
  });

  it('produces a different value each time', () => {
    const box = new SecretBox(KEY);

    expect(box.encrypt('same')).not.toBe(box.encrypt('same'));
  });

  it('handles empty and non-ASCII text', () => {
    const box = new SecretBox(KEY);

    expect(box.decrypt(box.encrypt(''))).toBe('');
    expect(box.decrypt(box.encrypt('pässwörd-密码'))).toBe('pässwörd-密码');
  });

  it('rejects a value encrypted with another key', () => {
    const stored = new SecretBox(KEY).encrypt('secret');

    expect(() => new SecretBox('b2'.repeat(32)).decrypt(stored)).toThrow(/MASTER_KEY differs/);
  });

  it('rejects a modified value', () => {
    const box = new SecretBox(KEY);
    const parts = box.encrypt('secret').split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');

    expect(() => box.decrypt(parts.join('.'))).toThrow(/Could not decrypt/);
  });

  it('rejects malformed input', () => {
    const box = new SecretBox(KEY);

    expect(() => box.decrypt('plain text')).toThrow(/unknown format/);
    expect(() => box.decrypt('v2.a.b.c')).toThrow(/unknown format/);
    expect(() => box.decrypt('v1.a.b.c')).toThrow(/unknown format/);
  });

  it('rejects an invalid master key', () => {
    expect(() => new SecretBox('too-short')).toThrow(/64 hexadecimal/);
  });
});
