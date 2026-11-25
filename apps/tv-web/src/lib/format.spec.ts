// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { clock, resumePoint, runtime } from './format';

describe('clock', () => {
  it('writes minutes and hours', () => {
    expect(clock(125)).toBe('2:05');
    expect(clock(3725)).toBe('1:02:05');
    expect(clock(-3)).toBe('0:00');
  });
});

describe('runtime', () => {
  it('writes a length for reading', () => {
    expect(runtime(95)).toBe('1 h 35 min');
    expect(runtime(45)).toBe('45 min');
    expect(runtime(120)).toBe('2 h');
    expect(runtime(null)).toBeNull();
  });
});

describe('resumePoint', () => {
  it('resumes in the middle of a film', () => {
    expect(resumePoint(1800, 6000)).toBe(1800);
  });
  it('starts again when barely started or nearly finished', () => {
    expect(resumePoint(10, 6000)).toBe(0);
    expect(resumePoint(5980, 6000)).toBe(0);
    expect(resumePoint(5800, 6000)).toBe(0);
  });
});
