// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { brightnessFilter, dragged, DOUBLE_TAP_MS, isDoubleTap, zoneOf } from './gestures';

describe('zoneOf', () => {
  it('splits the picture into three', () => {
    expect(zoneOf(50, 1000)).toBe('left');
    expect(zoneOf(500, 1000)).toBe('middle');
    expect(zoneOf(950, 1000)).toBe('right');
  });

  it('calls a picture without a width the middle', () => {
    expect(zoneOf(10, 0)).toBe('middle');
  });
});

describe('isDoubleTap', () => {
  it('is nothing without a tap before', () => {
    expect(isDoubleTap(null, 1000, 'left')).toBe(false);
  });

  it('pairs two quick taps in the same third', () => {
    expect(isDoubleTap({ at: 1000, zone: 'left' }, 1100, 'left')).toBe(true);
  });

  it('does not pair taps too far apart in time', () => {
    expect(isDoubleTap({ at: 1000, zone: 'left' }, 1000 + DOUBLE_TAP_MS, 'left')).toBe(false);
  });

  it('does not pair taps in different thirds', () => {
    expect(isDoubleTap({ at: 1000, zone: 'left' }, 1100, 'right')).toBe(false);
  });
});

describe('dragged', () => {
  it('raises the value as the finger goes up', () => {
    expect(dragged(-100, 1000, 0.5)).toBeCloseTo(0.61, 2);
  });

  it('lowers it as the finger goes down', () => {
    expect(dragged(100, 1000, 0.5)).toBeCloseTo(0.39, 2);
  });

  it('stays between nothing and everything', () => {
    expect(dragged(-5000, 1000, 0.5)).toBe(1);
    expect(dragged(5000, 1000, 0.5)).toBe(0);
  });

  it('changes nothing on a picture with no height', () => {
    expect(dragged(100, 0, 0.4)).toBe(0.4);
  });
});

describe('brightnessFilter', () => {
  it('leaves the picture alone at full', () => {
    expect(brightnessFilter(1)).toBeUndefined();
  });

  it('dims but never blacks out', () => {
    expect(brightnessFilter(0.5)).toBe('brightness(0.550)');
    expect(brightnessFilter(0)).toBe('brightness(0.100)');
  });
});
