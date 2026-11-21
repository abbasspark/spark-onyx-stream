// SPDX-License-Identifier: AGPL-3.0-only
import { colorLabel, colorOf, initialOf, PROFILE_COLORS } from './profiles';

describe('profile colours', () => {
  it('knows every colour the API offers', () => {
    for (const name of ['amber', 'coral', 'rose', 'violet', 'blue', 'teal', 'green', 'slate']) {
      expect(PROFILE_COLORS[name]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('draws a colour it does not know as slate', () => {
    expect(colorOf('amber')).toBe('#e6a85c');
    expect(colorOf('ultraviolet')).toBe(PROFILE_COLORS.slate);
  });

  it('names a colour in words', () => {
    expect(colorLabel('teal')).toBe('Teal');
  });
});

describe('initialOf', () => {
  it('takes the first letter, as a capital', () => {
    expect(initialOf('sam')).toBe('S');
    expect(initialOf('  kids room')).toBe('K');
  });

  it('keeps a letter of any script, or a picture, whole', () => {
    expect(initialOf('عباس')).toBe('ع');
    expect(initialOf('👾 Gamer')).toBe('👾');
  });

  it('has something for a name that is empty', () => {
    expect(initialOf('   ')).toBe('?');
  });
});
