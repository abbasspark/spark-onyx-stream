// SPDX-License-Identifier: AGPL-3.0-only
import { ProgressReader, toPercent } from './progress.js';

describe('ProgressReader', () => {
  it('reports the position once per block', () => {
    const positions: number[] = [];
    const reader = new ProgressReader((ms) => positions.push(ms));

    reader.push('frame=10\nout_time_us=2000000\nout_time=00:00:02.000000\nprogress=continue\n');
    reader.push('frame=20\nout_time_us=4500000\nprogress=end\n');

    expect(positions).toEqual([2000, 4500]);
  });

  it('handles lines split across chunks', () => {
    const positions: number[] = [];
    const reader = new ProgressReader((ms) => positions.push(ms));

    reader.push('out_time_u');
    reader.push('s=1500000\nprogr');
    reader.push('ess=continue\n');

    expect(positions).toEqual([1500]);
  });

  it('ignores blocks without a usable position', () => {
    const positions: number[] = [];
    const reader = new ProgressReader((ms) => positions.push(ms));

    reader.push('out_time_us=N/A\nprogress=continue\n');

    expect(positions).toEqual([]);
  });
});

describe('toPercent', () => {
  it('converts a position to a percentage', () => {
    expect(toPercent(5_000, 20_000)).toBe(25);
    expect(toPercent(19_999, 20_000)).toBe(99);
  });

  it('stays between 0 and 100', () => {
    expect(toPercent(30_000, 20_000)).toBe(100);
    expect(toPercent(-5, 20_000)).toBe(0);
  });

  it('gives 0 when the duration is unknown', () => {
    expect(toPercent(5_000, null)).toBe(0);
    expect(toPercent(5_000, 0)).toBe(0);
  });
});
