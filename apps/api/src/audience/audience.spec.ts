// SPDX-License-Identifier: AGPL-3.0-only
import { currentMaxAge, stricter, suits, suitsAudience, withAudience } from './audience.js';

describe('audience', () => {
  it('is nobody in particular outside a request', () => {
    expect(currentMaxAge()).toBeNull();
    expect(suitsAudience()).toEqual({});
    expect(suits(18)).toBe(true);
    expect(suits(null)).toBe(true);
  });

  it('is carried through everything a request awaits', async () => {
    const seen = await withAudience({ maxAge: 12 }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [currentMaxAge(), suitsAudience()];
    });
    expect(seen).toEqual([12, { minAge: { lte: 12 } }]);
    expect(currentMaxAge()).toBeNull();
  });

  it('keeps two requests apart', async () => {
    const [kid, adult] = await Promise.all([
      withAudience({ maxAge: 6 }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return currentMaxAge();
      }),
      withAudience({ maxAge: null }, async () => currentMaxAge()),
    ]);
    expect([kid, adult]).toEqual([6, null]);
  });

  it('leaves out what is for older people, and what nobody rated', () => {
    withAudience({ maxAge: 12 }, () => {
      expect(suits(6)).toBe(true);
      expect(suits(12)).toBe(true);
      expect(suits(16)).toBe(false);
      expect(suits(null)).toBe(false);
    });
  });

  it('takes the stricter of two limits', () => {
    expect(stricter(null, null)).toBeNull();
    expect(stricter(12, null)).toBe(12);
    expect(stricter(null, 6)).toBe(6);
    expect(stricter(12, 6)).toBe(6);
  });
});
