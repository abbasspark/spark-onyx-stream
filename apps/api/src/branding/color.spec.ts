// SPDX-License-Identifier: AGPL-3.0-only
import {
  contrastOnBlack,
  deepen,
  MIN_ACCENT_CONTRAST,
  mix,
  normalizeHex,
  readableOnBlack,
} from './color.js';

describe('normalizeHex', () => {
  it('accepts the usual ways of writing a colour', () => {
    expect(normalizeHex('#E6A85C')).toBe('#e6a85c');
    expect(normalizeHex(' e6a85c ')).toBe('#e6a85c');
    expect(normalizeHex('#fa3')).toBe('#ffaa33');
  });

  it('refuses what is no colour', () => {
    expect(normalizeHex('amber')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('#gggggg')).toBeNull();
  });
});

describe('contrastOnBlack', () => {
  it('runs from 1 for black to 21 for white', () => {
    expect(contrastOnBlack('#000000')).toBeCloseTo(1, 5);
    expect(contrastOnBlack('#ffffff')).toBeCloseTo(21, 5);
  });

  it('finds the amber the website ships with readable, and a navy not', () => {
    expect(contrastOnBlack('#e6a85c')).toBeGreaterThan(MIN_ACCENT_CONTRAST);
    expect(contrastOnBlack('#1a3c8f')).toBeLessThan(MIN_ACCENT_CONTRAST);
  });
});

describe('readableOnBlack', () => {
  it('leaves a colour that can be read as it is', () => {
    expect(readableOnBlack('#e6a85c')).toBe('#e6a85c');
  });

  it('lightens a dark colour just enough, keeping its hue', () => {
    const lighter = readableOnBlack('#1a3c8f');
    expect(contrastOnBlack(lighter)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
    expect(contrastOnBlack(lighter)).toBeLessThan(MIN_ACCENT_CONTRAST + 0.4);
    // Still a blue: more blue than red.
    expect(Number.parseInt(lighter.slice(5, 7), 16)).toBeGreaterThan(
      Number.parseInt(lighter.slice(1, 3), 16),
    );
    expect(readableOnBlack('#000000')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('mix and deepen', () => {
  it('moves towards white or black', () => {
    expect(mix('#808080', 1)).toBe('#ffffff');
    expect(mix('#808080', -1)).toBe('#000000');
    expect(mix('#808080', 0)).toBe('#808080');
  });

  it('makes the pressed shade darker than the colour', () => {
    expect(contrastOnBlack(deepen('#e6a85c'))).toBeLessThan(contrastOnBlack('#e6a85c'));
  });
});
