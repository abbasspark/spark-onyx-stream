// SPDX-License-Identifier: AGPL-3.0-only
import {
  formatSecret,
  isAppCode,
  isCompleteCode,
  isRecoveryCode,
  recoveryCodesFile,
  recoveryCodesWarning,
  tidyCode,
} from './two-factor';

describe('formatSecret', () => {
  it('sets the secret in groups of four', () => {
    expect(formatSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(formatSecret('JBSWY3')).toBe('JBSW Y3');
    expect(formatSecret('')).toBe('');
  });
});

describe('codes as they are typed', () => {
  it('tells a code from the app by its six digits', () => {
    expect(isAppCode('123456')).toBe(true);
    expect(isAppCode(' 123 456 ')).toBe(true);
    expect(isAppCode('12345')).toBe(false);
    expect(isAppCode('12345a')).toBe(false);
  });

  it('tells a recovery code by its twelve characters, however grouped', () => {
    expect(isRecoveryCode('K7QM-2XHP-9TRD')).toBe(true);
    expect(isRecoveryCode('k7qm 2xhp 9trd')).toBe(true);
    expect(isRecoveryCode('K7QM-2XHP')).toBe(false);
    expect(isRecoveryCode('123456')).toBe(false);
  });

  it('knows when there is enough to send', () => {
    expect(isCompleteCode('123456', 'app')).toBe(true);
    expect(isCompleteCode('123456', 'recovery')).toBe(false);
    expect(isCompleteCode('K7QM-2XHP-9TRD', 'recovery')).toBe(true);
    expect(tidyCode('  123 456 ')).toBe('123 456');
  });
});

describe('recoveryCodesFile', () => {
  it('says what the codes are, whose and from when', () => {
    const text = recoveryCodesFile(
      ['AAAA-BBBB-CCCC', 'DDDD-EEEE-FFFF'],
      { site: 'Onyx Stream', email: 'owner@example.com' },
      new Date('2026-11-23T10:00:00Z'),
    );
    expect(text.split('\n')[0]).toBe('Onyx Stream: recovery codes for owner@example.com');
    expect(text).toContain('Made on 2026-11-23');
    expect(text).toContain('\nAAAA-BBBB-CCCC\nDDDD-EEEE-FFFF\n');
  });
});

describe('recoveryCodesWarning', () => {
  it('speaks up when few are left', () => {
    expect(recoveryCodesWarning(10)).toBeNull();
    expect(recoveryCodesWarning(4)).toBeNull();
    expect(recoveryCodesWarning(3)).toContain('3 recovery codes left');
    expect(recoveryCodesWarning(1)).toContain('1 recovery code left');
    expect(recoveryCodesWarning(0)).toContain('no recovery codes left');
  });
});
