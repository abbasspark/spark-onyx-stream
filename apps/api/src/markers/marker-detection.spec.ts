// SPDX-License-Identifier: AGPL-3.0-only
import {
  buildListenArgs,
  creditsFrom,
  introFrom,
  listenSeconds,
  partnersOf,
} from './marker-detection.js';

const shared = (startA: number, endA: number) => ({ startA, endA, startB: 0, endB: endA - startA });

describe('listenSeconds', () => {
  it('is ten minutes of a long episode, and less than half of a short one', () => {
    expect(listenSeconds(45 * 60_000)).toBe(600);
    expect(listenSeconds(10 * 60_000)).toBe(240);
    expect(listenSeconds(null)).toBe(0);
  });
});

describe('partnersOf', () => {
  it('names the neighbours first, then the ones after them', () => {
    expect(partnersOf(2, 6)).toEqual([3, 1, 4, 0]);
    expect(partnersOf(0, 6)).toEqual([1, 2]);
    expect(partnersOf(5, 6)).toEqual([4, 3]);
    expect(partnersOf(0, 2)).toEqual([1]);
    expect(partnersOf(0, 1)).toEqual([]);
  });
});

describe('introFrom', () => {
  it('marks what two episodes share at their start', () => {
    expect(introFrom(shared(62.34, 121.87))).toEqual({
      kind: 'INTRO',
      startMs: 62_300,
      endMs: 121_900,
    });
  });

  it('marks nothing that is too short, too long, or not there', () => {
    expect(introFrom(shared(10, 18))).toBeNull();
    // Two copies of the same episode share everything.
    expect(introFrom(shared(0, 600))).toBeNull();
    expect(introFrom(null)).toBeNull();
  });
});

describe('creditsFrom', () => {
  it('marks credits that run to the end without an end', () => {
    // The last ten minutes of 45 were listened to. The shared part begins 7:30 into them.
    expect(creditsFrom(shared(450, 595), 2100, 2700)).toEqual({
      kind: 'CREDITS',
      startMs: 2_550_000,
      endMs: null,
    });
  });

  it('gives credits an end when a scene follows them', () => {
    expect(creditsFrom(shared(300, 420), 2100, 2700)).toEqual({
      kind: 'CREDITS',
      startMs: 2_400_000,
      endMs: 2_520_000,
    });
  });

  it('marks nothing in the first half, nothing too short and nothing too long', () => {
    expect(creditsFrom(shared(10, 60), 200, 600)).toBeNull();
    expect(creditsFrom(shared(580, 590), 2100, 2700)).toBeNull();
    expect(creditsFrom(shared(0, 600), 2100, 2700)).toBeNull();
    expect(creditsFrom(null, 2100, 2700)).toBeNull();
  });
});

describe('buildListenArgs', () => {
  it('reads a stretch of one stream as mono samples', () => {
    const args = buildListenArgs({
      sourcePath: '/in/e1.mkv',
      streamIndex: 1,
      fromSeconds: 2100,
      seconds: 600,
      sampleRate: 8000,
      outputPath: '/work/e1-tail.pcm',
    }).join(' ');
    expect(args).toBe(
      '-ss 2100.000 -t 600 -i /in/e1.mkv -map 0:a:1 -vn -sn -dn -ac 1 -ar 8000 -f s16le -y /work/e1-tail.pcm',
    );
  });
});
