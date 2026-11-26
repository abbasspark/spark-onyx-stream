// SPDX-License-Identifier: AGPL-3.0-only
import { colorOf, initialOf, onlyChoice } from './profiles';

const profile = (over: Partial<{ id: string; locked: boolean }> = {}) => ({
  id: 'a',
  name: 'Ada',
  color: 'amber',
  locked: false,
  ...over,
});

describe('onlyChoice', () => {
  it('takes a single profile without a PIN', () => {
    expect(onlyChoice([profile()])?.id).toBe('a');
  });

  it('asks when there is a PIN or more than one profile', () => {
    expect(onlyChoice([profile({ locked: true })])).toBeNull();
    expect(onlyChoice([profile(), profile({ id: 'b' })])).toBeNull();
    expect(onlyChoice([])).toBeNull();
  });
});

describe('colorOf', () => {
  it('knows the colours and draws a new one as slate', () => {
    expect(colorOf('teal')).toBe('#52b8aa');
    expect(colorOf('chartreuse')).toBe(colorOf('slate'));
  });
});

describe('initialOf', () => {
  it('is the first letter, in capitals', () => {
    expect(initialOf('  ada')).toBe('A');
    expect(initialOf('émile')).toBe('É');
    expect(initialOf('')).toBe('?');
  });
});
