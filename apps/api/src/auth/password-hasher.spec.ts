// SPDX-License-Identifier: AGPL-3.0-only
import { hashPassword, needsRehash, verifyPassword } from './password-hasher.js';

describe('password hasher', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('correct horse battery stapl', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    const first = await hashPassword('same password here');
    const second = await hashPassword('same password here');

    expect(first).not.toBe(second);
  });

  it('stores the parameters with the hash', async () => {
    const hash = await hashPassword('another long password');

    expect(hash).toMatch(/^scrypt\$32768\$8\$3\$[\w-]+\$[\w-]+$/);
    expect(needsRehash(hash)).toBe(false);
  });

  it('returns false for malformed or tampered hashes without throwing', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$whatever')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$3$8$3$c2FsdA$aGFzaA')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$1073741824$8$3$c2FsdA$aGFzaA')).toBe(false);
  });

  it('flags hashes made with other parameters for rehashing', () => {
    expect(needsRehash('scrypt$16384$8$1$c2FsdA$aGFzaA')).toBe(true);
  });
});
