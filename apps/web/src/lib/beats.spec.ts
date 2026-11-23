// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { BeatMeter } from './beats';

/** Lets a video run from one position to another, a quarter of a second at a time. */
function run(meter: BeatMeter, from: number, to: number): void {
  for (let time = from; time <= to + 1e-9; time += 0.25) {
    meter.tick(time);
  }
}

describe('BeatMeter', () => {
  it('counts the time a video ran', () => {
    const meter = new BeatMeter();
    run(meter, 0, 12);
    expect(meter.due).toBe(false);
    expect(meter.take()).toEqual({ position: 12, watched: 12 });
    // What was reported is not reported again.
    expect(meter.take()).toBeNull();
  });

  it('is due after half a minute of playing', () => {
    const meter = new BeatMeter();
    run(meter, 100, 129);
    expect(meter.due).toBe(false);
    run(meter, 129.25, 131);
    expect(meter.due).toBe(true);
  });

  it('does not count jumps, forward or back', () => {
    const meter = new BeatMeter();
    run(meter, 0, 5);
    meter.tick(3000);
    run(meter, 3000.25, 3005);
    meter.tick(10);
    run(meter, 10.25, 12);
    expect(meter.take()).toEqual({ position: 12, watched: 12 });
  });

  it('reports nothing for a video that only sat there', () => {
    const meter = new BeatMeter();
    meter.tick(42);
    meter.tick(42);
    meter.tick(Number.NaN);
    expect(meter.take()).toBeNull();
  });
});
