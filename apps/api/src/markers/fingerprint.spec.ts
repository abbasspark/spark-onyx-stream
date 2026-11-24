// SPDX-License-Identifier: AGPL-3.0-only
import { findSharedPart, fingerprint, SAMPLE_RATE, SILENT } from './fingerprint.js';

/** A source of numbers that is the same on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** Sound that is like nothing else: what happens in an episode. */
function scene(seconds: number, seed: number): Float64Array {
  const next = random(seed);
  const samples = new Float64Array(Math.round(seconds * SAMPLE_RATE));
  let smooth = 0;
  for (let index = 0; index < samples.length; index += 1) {
    // Low-passed noise with a slow swell, roughly as loud and as dull as speech.
    smooth = smooth * 0.85 + (next() - 0.5) * 0.15;
    samples[index] = smooth * 24_000 * (0.6 + 0.4 * Math.sin(index / 9000));
  }
  return samples;
}

/** A tune: notes that change a few times a second, with overtones. The same for the same seed. */
function theme(seconds: number, seed: number): Float64Array {
  const next = random(seed);
  const samples = new Float64Array(Math.round(seconds * SAMPLE_RATE));
  const noteLength = Math.round(SAMPLE_RATE * 0.22);
  let pitch = 440;
  for (let index = 0; index < samples.length; index += 1) {
    if (index % noteLength === 0) {
      pitch = 330 * 2 ** (Math.floor(next() * 24) / 12);
    }
    const time = index / SAMPLE_RATE;
    const fade = Math.min(1, (index % noteLength) / 200);
    samples[index] =
      fade *
      (5000 * Math.sin(2 * Math.PI * pitch * time) +
        2500 * Math.sin(2 * Math.PI * pitch * 2 * time) +
        1200 * Math.sin(2 * Math.PI * pitch * 3 * time));
  }
  return samples;
}

/** What encoding does to sound, more or less: another loudness, and noise on top. */
function reencoded(samples: Float64Array, gain: number, noise: number, seed: number): Float64Array {
  const next = random(seed);
  return samples.map((sample) => sample * gain + (next() - 0.5) * noise);
}

function joined(...parts: Float64Array[]): Int16Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Int16Array(total);
  let at = 0;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      result[at + index] = Math.max(-32768, Math.min(32767, Math.round(part[index] as number)));
    }
    at += part.length;
  }
  return result;
}

const silence = (seconds: number) => new Float64Array(Math.round(seconds * SAMPLE_RATE));

describe('fingerprint', () => {
  it('gives one value per 64 milliseconds, and marks silence', () => {
    const values = fingerprint(joined(silence(2), theme(2, 1)));
    expect(values.length).toBeGreaterThan(55);
    expect(values.length).toBeLessThan(63);
    expect(values[0]).toBe(SILENT);
    expect(values.at(-1)).not.toBe(SILENT);
    expect(fingerprint(new Int16Array(100))).toHaveLength(0);
  });

  it('is the same for the same sound, however loud', () => {
    const quiet = fingerprint(joined(reencoded(theme(5, 7), 0.3, 0, 1)));
    const loud = fingerprint(joined(theme(5, 7)));
    let same = 0;
    for (let index = 0; index < loud.length; index += 1) {
      same += loud[index] === quiet[index] ? 1 : 0;
    }
    expect(same / loud.length).toBeGreaterThan(0.9);
  });
});

describe('findSharedPart', () => {
  const opening = theme(40, 99);
  const first = fingerprint(joined(scene(20, 1), opening, scene(60, 2)));
  const second = fingerprint(joined(scene(65, 3), reencoded(opening, 0.7, 900, 4), scene(30, 5)));

  it('finds the opening two episodes share, wherever it is in each', () => {
    const shared = findSharedPart(first, second);
    expect(shared).not.toBeNull();
    expect(shared!.startA).toBeCloseTo(20, 0);
    expect(shared!.endA).toBeCloseTo(60, 0);
    expect(shared!.startB).toBeCloseTo(65, 0);
    expect(shared!.endB).toBeCloseTo(105, 0);
    // To the second, or a viewer lands in the middle of a word.
    expect(Math.abs(shared!.startA - 20)).toBeLessThan(0.7);
    expect(Math.abs(shared!.endA - 60)).toBeLessThan(0.7);
  });

  it('finds the same from the other side', () => {
    const shared = findSharedPart(second, first);
    expect(shared!.startA).toBeCloseTo(65, 0);
    expect(shared!.startB).toBeCloseTo(20, 0);
  });

  it('finds nothing in episodes that share nothing', () => {
    const other = fingerprint(joined(scene(60, 11), theme(40, 12), scene(30, 13)));
    expect(findSharedPart(first, other)).toBeNull();
  });

  it('does not take silence in both for something shared', () => {
    const a = fingerprint(joined(scene(20, 21), silence(40), scene(20, 22)));
    const b = fingerprint(joined(scene(30, 23), silence(40), scene(10, 24)));
    expect(findSharedPart(a, b)).toBeNull();
  });

  it('passes over a jingle that is shorter than an opening', () => {
    const jingle = theme(6, 50);
    const a = fingerprint(joined(scene(20, 31), jingle, scene(40, 32)));
    const b = fingerprint(joined(scene(35, 33), jingle, scene(40, 34)));
    expect(findSharedPart(a, b)).toBeNull();
    expect(findSharedPart(a, b, { minSeconds: 4 })).not.toBeNull();
  });

  it('keeps an opening whole that has a short break in it', () => {
    const a = fingerprint(
      joined(scene(10, 41), theme(20, 60), scene(2, 42), theme(20, 61), scene(20, 43)),
    );
    const b = fingerprint(
      joined(scene(25, 44), theme(20, 60), scene(2, 45), theme(20, 61), scene(20, 46)),
    );
    const shared = findSharedPart(a, b);
    expect(shared!.startA).toBeCloseTo(10, 0);
    expect(shared!.endA).toBeCloseTo(52, 0);
  });

  it('has nothing to say about sound that is too short', () => {
    const short = fingerprint(joined(theme(5, 1)));
    expect(findSharedPart(short, short)).toBeNull();
  });
});
