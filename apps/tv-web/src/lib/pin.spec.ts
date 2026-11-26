// SPDX-License-Identifier: AGPL-3.0-only
import { addDigit, isCompletePin, removeDigit } from './pin';

describe('addDigit', () => {
  it('adds digits up to six', () => {
    let pin = '';
    for (const digit of '12345678') {
      pin = addDigit(pin, digit);
    }
    expect(pin).toBe('123456');
  });

  it('ignores anything that is not one digit', () => {
    expect(addDigit('12', 'a')).toBe('12');
    expect(addDigit('12', '34')).toBe('12');
    expect(addDigit('12', '')).toBe('12');
  });
});

describe('removeDigit', () => {
  it('takes the last digit away and is fine with nothing left', () => {
    expect(removeDigit('123')).toBe('12');
    expect(removeDigit('')).toBe('');
  });
});

describe('isCompletePin', () => {
  it('wants four to six digits', () => {
    expect(isCompletePin('123')).toBe(false);
    expect(isCompletePin('1234')).toBe(true);
    expect(isCompletePin('123456')).toBe(true);
    expect(isCompletePin('1234567')).toBe(false);
    expect(isCompletePin('12a4')).toBe(false);
  });
});
