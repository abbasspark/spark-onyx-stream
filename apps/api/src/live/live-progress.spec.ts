// SPDX-License-Identifier: AGPL-3.0-only
import { type LiveProgress, LiveProgressReader } from './live-progress.js';

describe('LiveProgressReader', () => {
  it('reports once per block, also when the text arrives in pieces', () => {
    const seen: LiveProgress[] = [];
    const reader = new LiveProgressReader((progress) => seen.push(progress));

    reader.push('frame=50\nfps=25.0\nout_time_us=20');
    expect(seen).toEqual([]);
    reader.push('00000\nspeed=1.01x\nprogress=continue\nout_time_us=4000000\nspeed=N/A\n');
    reader.push('progress=continue\n');

    expect(seen).toEqual([
      { outTimeMs: 2000, speed: 1.01 },
      { outTimeMs: 4000, speed: null },
    ]);
  });

  it('skips a block without a position', () => {
    const seen: LiveProgress[] = [];
    const reader = new LiveProgressReader((progress) => seen.push(progress));
    reader.push('out_time_us=N/A\nprogress=continue\n');
    expect(seen).toEqual([]);
  });
});
