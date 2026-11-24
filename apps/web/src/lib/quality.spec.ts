// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { QualityMeter, REPORT_EVERY_MS } from './quality';

/** A meter with a clock the test moves. */
function meter() {
  let at = 0;
  const subject = new QualityMeter(() => at, '1.2.3');
  return {
    subject,
    wait: (ms: number) => {
      at += ms;
    },
    /** Plays for so many seconds from a position, a quarter of a second at a time. */
    run: (from: number, seconds: number) => {
      for (let time = from; time <= from + seconds + 1e-9; time += 0.25) {
        subject.tick(time);
      }
      at += seconds * 1000;
    },
  };
}

describe('QualityMeter', () => {
  it('times the start from the wish to play to the first picture', () => {
    const { subject, wait } = meter();
    wait(1350);
    expect(subject.take().startupMs).toBeUndefined();
    subject.playing();
    expect(subject.take()).toEqual({
      startupMs: 1350,
      played: 0,
      stalls: 0,
      stallMs: 0,
      qualityChanges: 0,
      player: { name: 'web', version: '1.2.3' },
    });
    // Playing again later is not a second start.
    wait(5000);
    subject.playing();
    expect(subject.take().startupMs).toBe(1350);
  });

  it('starts the clock at the click when the browser would not start by itself', () => {
    const { subject, wait } = meter();
    wait(400);
    subject.hold();
    // The viewer looks at the page for a while.
    wait(20_000);
    subject.play();
    wait(600);
    subject.playing();
    expect(subject.take().startupMs).toBe(600);
  });

  it('counts time played from the positions passed, not from jumps', () => {
    const { subject, run } = meter();
    subject.playing();
    run(0, 10);
    subject.seeking();
    subject.tick(500);
    subject.playing();
    run(500, 5);
    expect(subject.take().played).toBe(15);
  });

  it('counts a stall after the start, with how long it lasted', () => {
    const { subject, wait, run } = meter();
    // Loading before the first picture is the start, not a stall.
    subject.waiting();
    wait(900);
    subject.playing();
    run(0, 4);
    subject.waiting();
    // Told twice, counted once.
    subject.waiting();
    wait(2500);
    // A report in the middle of a stall holds the wait so far.
    expect(subject.take()).toMatchObject({ stalls: 1, stallMs: 2500 });
    wait(500);
    subject.playing();
    expect(subject.take()).toMatchObject({ startupMs: 900, stalls: 1, stallMs: 3000 });
  });

  it('does not count loading after a jump, or while paused', () => {
    const { subject, wait, run } = meter();
    subject.playing();
    run(0, 2);
    subject.seeking();
    subject.waiting();
    wait(4000);
    subject.playing();
    subject.pause();
    subject.waiting();
    wait(9000);
    subject.play();
    subject.playing();
    expect(subject.take()).toMatchObject({ stalls: 0, stallMs: 0 });
  });

  it('ends a stall when the viewer pauses or jumps away from it', () => {
    const { subject, wait, run } = meter();
    subject.playing();
    run(0, 2);
    subject.waiting();
    wait(1000);
    subject.pause();
    wait(60_000);
    expect(subject.take()).toMatchObject({ stalls: 1, stallMs: 1000 });
  });

  it('knows the quality it played in: the average bitrate and the height shown longest', () => {
    const { subject, run } = meter();
    subject.level(720, 2_000_000);
    subject.playing();
    run(0, 10);
    subject.level(1080, 5_000_000);
    run(10, 30);
    // The same again is no change.
    subject.level(1080, 5_000_000);
    const report = subject.take();
    expect(report.qualityChanges).toBe(1);
    expect(report.height).toBe(1080);
    expect(report.bitrateKbps).toBe(Math.round((10 * 2000 + 30 * 5000) / 40));
  });

  it('keeps the first problem that ended playback, and closes an open stall', () => {
    const { subject, wait, run } = meter();
    subject.playing();
    run(0, 3);
    subject.waiting();
    wait(2000);
    subject.fail('network', 'fragLoadError', 3.2);
    subject.fail('media', 'later');
    wait(10_000);
    const report = subject.take();
    expect(report.error).toEqual({ code: 'network', message: 'fragLoadError', position: 3.2 });
    expect(report.stallMs).toBe(2000);
    // Nothing is a stall once playback broke.
    subject.waiting();
    expect(subject.take().stalls).toBe(1);
  });

  it('counts what it got over, and the frames the device skipped', () => {
    const { subject } = meter();
    subject.recoveredError();
    subject.droppedFrames(12);
    subject.droppedFrames(9);
    subject.droppedFrames(undefined);
    expect(subject.take()).toMatchObject({ recoveredErrors: 1, droppedFrames: 12 });
  });

  it('asks for a report on news and otherwise twice a minute', () => {
    const { subject, wait } = meter();
    expect(subject.due).toBe(false);
    subject.playing();
    expect(subject.due).toBe(true);
    subject.take();
    expect(subject.due).toBe(false);
    wait(REPORT_EVERY_MS - 1);
    expect(subject.due).toBe(false);
    wait(1);
    expect(subject.due).toBe(true);
    subject.take();
    subject.end();
    expect(subject.due).toBe(true);
    expect(subject.take().ended).toBe(true);
  });
});
