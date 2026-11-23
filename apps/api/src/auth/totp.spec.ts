// SPDX-License-Identifier: AGPL-3.0-only
import {
  fromBase32,
  generateRecoveryCode,
  generateTotpSecret,
  hashRecoveryCode,
  looksLikeTotp,
  normalizeRecoveryCode,
  otpauthUri,
  toBase32,
  totpAt,
  totpStep,
  verifyTotp,
} from './totp.js';

/** The secret of the test vectors of RFC 6238: the ASCII text "12345678901234567890". */
const RFC_SECRET = toBase32(Buffer.from('12345678901234567890'));

describe('base32', () => {
  it('writes bytes the way RFC 4648 does, without padding', () => {
    expect(toBase32(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(toBase32(Buffer.from('fo'))).toBe('MZXQ');
    expect(toBase32(Buffer.from(''))).toBe('');
  });

  it('reads it back, however it was typed', () => {
    expect(fromBase32('MZXW6YTBOI').toString()).toBe('foobar');
    expect(fromBase32('mzxw 6ytb-oi==').toString()).toBe('foobar');
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(toBase32(fromBase32(secret))).toBe(secret);
    expect(() => fromBase32('not base32!')).toThrow();
  });
});

describe('totpAt', () => {
  it('gives the codes of RFC 6238', () => {
    // The RFC lists eight digits. The last six are what an app shows.
    const vectors: [seconds: number, code: string][] = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ];
    for (const [seconds, code] of vectors) {
      expect(totpAt(RFC_SECRET, totpStep(seconds * 1000))).toBe(code);
    }
    expect(totpAt(RFC_SECRET, totpStep(59_000), 8)).toBe('94287082');
  });
});

describe('verifyTotp', () => {
  const now = 1_234_567_890_000;
  const step = totpStep(now);

  it('takes the code of now, and of half a minute before and after', () => {
    expect(verifyTotp(RFC_SECRET, '005924', now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, ' 005 924 ', now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), now)).toBe(step + 1);
  });

  it('refuses a wrong code, an old one, and anything that is not six digits', () => {
    expect(verifyTotp(RFC_SECRET, '000000', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '', now)).toBeNull();
  });

  it('takes a code once', () => {
    expect(verifyTotp(RFC_SECRET, '005924', now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '005924', now, step - 1)).toBe(step);
    // The code of the step before is no way around it either.
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), now, step)).toBe(step + 1);
  });
});

describe('otpauthUri', () => {
  it('names the site and the account, and says how the codes are made', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'Onyx Stream', 'owner@example.com');
    expect(uri).toBe(
      'otpauth://totp/Onyx%20Stream:owner%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Onyx+Stream&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('recovery codes', () => {
  it('are three groups of characters that are not mistaken for each other', () => {
    const codes = new Set(Array.from({ length: 200 }, generateRecoveryCode));
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    }
  });

  it('are compared without regard to case, spaces and hyphens', () => {
    expect(normalizeRecoveryCode(' k7qm 2xhp-9trd ')).toBe('K7QM2XHP9TRD');
    expect(hashRecoveryCode('k7qm 2xhp 9trd')).toBe(hashRecoveryCode('K7QM-2XHP-9TRD'));
    expect(hashRecoveryCode('K7QM-2XHP-9TRD')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode('K7QM-2XHP-9TRE')).not.toBe(hashRecoveryCode('K7QM-2XHP-9TRD'));
  });

  it('are told from the codes of an app by their shape', () => {
    expect(looksLikeTotp('123 456')).toBe(true);
    expect(looksLikeTotp('K7QM-2XHP-9TRD')).toBe(false);
    expect(looksLikeTotp('1234567')).toBe(false);
  });
});
