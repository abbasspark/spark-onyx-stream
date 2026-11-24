// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Finding the same sound in two videos.
 *
 * The opening titles of a series are the same recording in every episode.
 * Two episodes are therefore compared by their sound: each is turned into a
 * fingerprint, a short number per fraction of a second that depends on which
 * pitches are getting louder and which quieter, and the longest stretch in
 * which the fingerprints agree is the part the episodes share.
 *
 * The fingerprint is the one Haitsma and Kalker described in 2002. It does
 * not care about loudness, and survives the sound being encoded again, which
 * is what happens to every episode on its way here.
 */

/** The sound is read at this rate, in one channel. Speech and music are told apart well below 4 kHz. */
export const SAMPLE_RATE = 8000;
/** Samples a fingerprint value looks at: about a quarter of a second. */
const FRAME_SIZE = 2048;
/** Samples between two values: 64 milliseconds. */
const HOP_SIZE = 512;
/** Fingerprint values per second. */
export const FRAMES_PER_SECOND = SAMPLE_RATE / HOP_SIZE;
/** Pitch bands compared, one more than the bits of a value. */
const BANDS = 17;
const LOWEST_HZ = 300;
const HIGHEST_HZ = 3400;
/** A frame quieter than this, on average per sample, is silence and matches nothing. */
const SILENCE_LEVEL = 40;

/** The value of a frame of silence. It never counts as agreeing with anything. */
export const SILENT = 0xffff_ffff;

/** In-place FFT of a power-of-two number of points. */
function fft(real: Float64Array, imaginary: Float64Array): void {
  const size = real.length;
  for (let index = 1, swap = 0; index < size; index += 1) {
    let bit = size >> 1;
    for (; swap & bit; bit >>= 1) {
      swap ^= bit;
    }
    swap ^= bit;
    if (index < swap) {
      [real[index], real[swap]] = [real[swap] as number, real[index] as number];
      [imaginary[index], imaginary[swap]] = [imaginary[swap] as number, imaginary[index] as number];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let turnReal = 1;
      let turnImaginary = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal =
          (real[odd] as number) * turnReal - (imaginary[odd] as number) * turnImaginary;
        const oddImaginary =
          (real[odd] as number) * turnImaginary + (imaginary[odd] as number) * turnReal;
        real[odd] = (real[even] as number) - oddReal;
        imaginary[odd] = (imaginary[even] as number) - oddImaginary;
        real[even] = (real[even] as number) + oddReal;
        imaginary[even] = (imaginary[even] as number) + oddImaginary;
        const nextReal = turnReal * stepReal - turnImaginary * stepImaginary;
        turnImaginary = turnReal * stepImaginary + turnImaginary * stepReal;
        turnReal = nextReal;
      }
    }
  }
}

/** The first FFT bin of each band: the bands are as wide to the ear, which hears in ratios. */
const BAND_EDGES: readonly number[] = Array.from({ length: BANDS + 1 }, (_, band) =>
  Math.round(((LOWEST_HZ * (HIGHEST_HZ / LOWEST_HZ) ** (band / BANDS)) / SAMPLE_RATE) * FRAME_SIZE),
);

const WINDOW: Float64Array = Float64Array.from({ length: FRAME_SIZE }, (_, index) => {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FRAME_SIZE - 1));
});

/**
 * Turns sound into its fingerprint.
 *
 * @param samples One channel at {@link SAMPLE_RATE}, as 16-bit numbers.
 * @returns One value per 64 milliseconds: 16 bits, or {@link SILENT}.
 */
export function fingerprint(samples: Int16Array): Uint32Array {
  const frames = Math.max(0, Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1);
  const values = new Uint32Array(frames);
  const real = new Float64Array(FRAME_SIZE);
  const imaginary = new Float64Array(FRAME_SIZE);
  let before = new Float64Array(BANDS);
  let now = new Float64Array(BANDS);

  for (let frame = 0; frame < frames; frame += 1) {
    const start = frame * HOP_SIZE;
    let level = 0;
    for (let index = 0; index < FRAME_SIZE; index += 1) {
      const sample = samples[start + index] as number;
      level += Math.abs(sample);
      real[index] = sample * (WINDOW[index] as number);
      imaginary[index] = 0;
    }
    fft(real, imaginary);
    for (let band = 0; band < BANDS; band += 1) {
      let energy = 0;
      for (let bin = BAND_EDGES[band] as number; bin < (BAND_EDGES[band + 1] as number); bin += 1) {
        energy += (real[bin] as number) ** 2 + (imaginary[bin] as number) ** 2;
      }
      now[band] = energy;
    }
    if (level / FRAME_SIZE < SILENCE_LEVEL) {
      values[frame] = SILENT;
    } else {
      // A bit says whether the step from one band to the next grew since the frame before.
      let value = 0;
      for (let band = 0; band < BANDS - 1; band += 1) {
        const step = (now[band] as number) - (now[band + 1] as number);
        const stepBefore = (before[band] as number) - (before[band + 1] as number);
        if (step - stepBefore > 0) {
          value |= 1 << band;
        }
      }
      values[frame] = value;
    }
    [before, now] = [now, before];
  }
  return values;
}

function bitsSet(value: number): number {
  let bits = value - ((value >>> 1) & 0x5555_5555);
  bits = (bits & 0x3333_3333) + ((bits >>> 2) & 0x3333_3333);
  return (((bits + (bits >>> 4)) & 0x0f0f_0f0f) * 0x0101_0101) >>> 24;
}

/** How many of the 16 bits of two values differ. A silent frame differs in half of them, as chance would. */
function distance(a: number, b: number): number {
  return a === SILENT || b === SILENT ? 8 : bitsSet(a ^ b);
}

/** The part two fingerprints share, in seconds from the start of each. */
export interface SharedPart {
  startA: number;
  endA: number;
  startB: number;
  endB: number;
}

export interface MatchOptions {
  /** A shared part shorter than this is chance, or a jingle. Seconds. */
  minSeconds?: number;
  /** A shared part may have gaps this long: a title card over silence. Seconds. */
  maxGapSeconds?: number;
}

/** Of 16 bits, the same sound differs in about three after encoding. Chance differs in eight. */
const SAME_SOUND_BITS = 5.2;
/** The agreement is judged over this many frames at a time: about three seconds. */
const SMOOTH_FRAMES = 48;

/**
 * Finds the longest stretch of sound two fingerprints share.
 *
 * First the shift between the two is found: every value of A that also
 * appears in B votes for the shift that would bring them together, and the
 * shared part, being the same sound, votes as one. Then the two are laid
 * over each other with that shift, and the longest run in which they agree
 * is the shared part.
 *
 * @returns Null when they share nothing long enough.
 */
export function findSharedPart(
  a: Uint32Array,
  b: Uint32Array,
  options: MatchOptions = {},
): SharedPart | null {
  const minFrames = Math.round((options.minSeconds ?? 15) * FRAMES_PER_SECOND);
  const maxGap = Math.round((options.maxGapSeconds ?? 3) * FRAMES_PER_SECOND);
  if (a.length < minFrames || b.length < minFrames) {
    return null;
  }

  // Where each value is in B.
  const places = new Map<number, number[]>();
  for (let index = 0; index < b.length; index += 1) {
    const value = b[index] as number;
    if (value === SILENT) {
      continue;
    }
    const list = places.get(value);
    if (list) {
      list.push(index);
    } else {
      places.set(value, [index]);
    }
  }
  // A value that is everywhere says nothing about where.
  const tooCommon = Math.max(50, Math.round(b.length / 100));
  const votes = new Map<number, number>();
  for (let index = 0; index < a.length; index += 1) {
    const list = places.get(a[index] as number);
    if (!list || list.length > tooCommon) {
      continue;
    }
    for (const place of list) {
      const shift = place - index;
      votes.set(shift, (votes.get(shift) ?? 0) + 1);
    }
  }
  // Neighbouring shifts are the same shift, seen a frame apart.
  const candidates = [...votes.entries()]
    .map(([shift, count]) => ({
      shift,
      count: count + (votes.get(shift - 1) ?? 0) + (votes.get(shift + 1) ?? 0),
    }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 5);

  let best: { start: number; end: number; shift: number } | null = null;
  for (const { shift } of candidates) {
    const from = Math.max(0, -shift);
    const to = Math.min(a.length, b.length - shift);
    if (to - from < minFrames) {
      continue;
    }
    // Running sum of how much the two differ, to read the average of any window from.
    const sums = new Float64Array(to - from + 1);
    for (let index = from; index < to; index += 1) {
      sums[index - from + 1] =
        (sums[index - from] as number) + distance(a[index] as number, b[index + shift] as number);
    }
    const agrees = (index: number): boolean => {
      const low = Math.max(0, index - from - SMOOTH_FRAMES / 2);
      const high = Math.min(to - from, index - from + SMOOTH_FRAMES / 2);
      return ((sums[high] as number) - (sums[low] as number)) / (high - low) < SAME_SOUND_BITS;
    };

    let runStart = -1;
    let lastAgreeing = -1;
    const close = (): void => {
      if (runStart !== -1 && lastAgreeing - runStart + 1 >= minFrames) {
        if (!best || lastAgreeing - runStart > best.end - best.start) {
          best = { start: runStart, end: lastAgreeing + 1, shift };
        }
      }
      runStart = -1;
    };
    for (let index = from; index < to; index += 1) {
      if (agrees(index)) {
        if (runStart === -1) {
          runStart = index;
        }
        lastAgreeing = index;
      } else if (runStart !== -1 && index - lastAgreeing > maxGap) {
        close();
      }
    }
    close();
  }
  if (!best) {
    return null;
  }

  const found = best as { start: number; end: number; shift: number };
  // The agreement was judged over windows, which blurs where it begins and
  // ends. The edges are pulled in to the first and last frames that agree
  // by themselves.
  const sameFrame = (index: number): boolean =>
    distance(a[index] as number, b[index + found.shift] as number) <= 4;
  let start = found.start;
  let end = found.end;
  while (start < end - minFrames && !(sameFrame(start) && sameFrame(start + 1))) {
    start += 1;
  }
  while (end > start + minFrames && !(sameFrame(end - 1) && sameFrame(end - 2))) {
    end -= 1;
  }
  const seconds = (frames: number): number =>
    Math.round((frames / FRAMES_PER_SECOND) * 1000) / 1000;
  return {
    startA: seconds(start),
    endA: seconds(end),
    startB: seconds(start + found.shift),
    endB: seconds(end + found.shift),
  };
}
