// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { QualityDay, QualityFigures } from '@/api/types';
import {
  errorLook,
  formatKbps,
  formatMs,
  formatRate,
  gradeOf,
  heightLabel,
  heightShares,
  mergeDays,
  playbackFailureRate,
  qualityChange,
  serverLabel,
  startFailureRate,
  valueOf,
  verdictOf,
} from './quality';

function figures(over: Partial<QualityFigures> = {}): QualityFigures {
  return {
    attempts: 200,
    started: 196,
    startFailures: 1,
    leftBeforeStart: 3,
    playbackFailures: 1,
    startupP50Ms: 1200,
    startupP95Ms: 3900,
    stalledSessions: 6,
    stallCount: 9,
    stallMs: 20_000,
    playedSeconds: 50_000,
    rebufferRatio: 0.0004,
    bitrateKbps: 4200,
    ...over,
  };
}

describe('rates', () => {
  it('measures failed starts on all playbacks and breaks on the started ones', () => {
    expect(startFailureRate(figures({ attempts: 50, startFailures: 2 }))).toBe(0.04);
    expect(playbackFailureRate(figures({ started: 40, playbackFailures: 2 }))).toBe(0.05);
    expect(startFailureRate(figures({ attempts: 0 }))).toBe(0);
  });

  it('has no value where there is nothing to measure on', () => {
    const none = figures({ attempts: 0, started: 0, startupP50Ms: null });
    expect(valueOf('startupMs', none)).toBeNull();
    expect(valueOf('rebufferRatio', none)).toBeNull();
    expect(valueOf('startFailureRate', none)).toBeNull();
    expect(valueOf('playbackFailureRate', none)).toBeNull();
  });
});

describe('gradeOf', () => {
  it('grades each figure by its own marks', () => {
    expect(gradeOf('startupMs', figures({ startupP50Ms: 2000 }))).toBe('good');
    expect(gradeOf('startupMs', figures({ startupP50Ms: 2001 }))).toBe('fair');
    expect(gradeOf('startupMs', figures({ startupP50Ms: 4001 }))).toBe('poor');
    expect(gradeOf('rebufferRatio', figures({ rebufferRatio: 0.012 }))).toBe('fair');
    expect(gradeOf('startFailureRate', figures({ startFailures: 8 }))).toBe('poor');
    expect(gradeOf('playbackFailureRate', figures())).toBe('good');
  });

  it('says nothing on too few playbacks', () => {
    expect(gradeOf('startFailureRate', figures({ attempts: 4, startFailures: 1 }))).toBeNull();
    expect(gradeOf('startFailureRate', figures({ attempts: 4, startFailures: 1 }), 3)).toBe('poor');
  });
});

describe('formats', () => {
  it('writes times as milliseconds or seconds', () => {
    expect(formatMs(850)).toBe('850 ms');
    expect(formatMs(1440)).toBe('1.4 s');
    expect(formatMs(12_400)).toBe('12 s');
    expect(formatMs(null)).toBe('–');
  });

  it('writes shares so that small ones still show', () => {
    expect(formatRate(0)).toBe('0 %');
    expect(formatRate(0.0004)).toBe('< 0.1 %');
    expect(formatRate(0.004)).toBe('0.4 %');
    expect(formatRate(0.023)).toBe('2.3 %');
    expect(formatRate(0.18)).toBe('18 %');
    expect(formatRate(null)).toBe('–');
  });

  it('writes bitrates, heights and servers', () => {
    expect(formatKbps(5200)).toBe('5.2 Mbit/s');
    expect(formatKbps(800)).toBe('800 kbit/s');
    expect(formatKbps(null)).toBe('–');
    expect(heightLabel(1080)).toBe('1080p');
    expect(heightLabel(2160)).toBe('4K');
    expect(serverLabel('origin')).toBe('Main server');
    expect(serverLabel('edge-fra.example.com')).toBe('edge-fra.example.com');
  });
});

describe('qualityChange', () => {
  it('calls less better', () => {
    expect(qualityChange('startupMs', 900, 1200)).toEqual({ direction: 'better', label: '−25 %' });
    expect(qualityChange('startupMs', 1500, 1200)).toEqual({ direction: 'worse', label: '+25 %' });
    expect(qualityChange('startupMs', 1200, 1200)).toEqual({ direction: 'same', label: '0 %' });
  });

  it('compares shares in points', () => {
    expect(qualityChange('startFailureRate', 0.032, 0.02)).toEqual({
      direction: 'worse',
      label: '+1.2 pt',
    });
    expect(qualityChange('rebufferRatio', 0.004, 0.01)).toEqual({
      direction: 'better',
      label: '−0.6 pt',
    });
  });

  it('has nothing to say without a before', () => {
    expect(qualityChange('startupMs', 900, null)).toBeNull();
    expect(qualityChange('rebufferRatio', null, 0.1)).toBeNull();
  });
});

describe('verdictOf', () => {
  it('is healthy when every figure is good', () => {
    expect(verdictOf(figures())).toMatchObject({ grade: 'good', title: 'Playback is healthy' });
  });

  it('names what is wrong, the worst first', () => {
    const verdict = verdictOf(figures({ startFailures: 12, startupP50Ms: 3000 }));
    expect(verdict.grade).toBe('poor');
    expect(verdict.detail).toBe('failed to start 6.0 %');
    expect(verdictOf(figures({ startupP50Ms: 3000 }))).toMatchObject({
      grade: 'fair',
      detail: 'time to start 3.0 s',
    });
  });

  it('does not judge nothing, or a handful', () => {
    expect(verdictOf(figures({ attempts: 0 })).grade).toBeNull();
    const few = verdictOf(figures({ attempts: 3, startFailures: 3 }));
    expect(few.grade).toBeNull();
    expect(few.detail).toContain('3 playbacks were reported on');
  });
});

describe('mergeDays', () => {
  it('adds counts up and averages the time to start by how many started', () => {
    const day = (over: Partial<QualityDay>): QualityDay => ({
      ...figures({ attempts: 0, started: 0, startFailures: 0, leftBeforeStart: 0 }),
      day: '2026-12-01',
      ...over,
    });
    const merged = mergeDays([
      day({ attempts: 10, started: 10, startupP50Ms: 1000, stallMs: 10_000, playedSeconds: 990 }),
      day({ attempts: 32, started: 30, startupP50Ms: 2000, stallMs: 0, playedSeconds: 1000 }),
      day({ attempts: 0, started: 0, startupP50Ms: null, stallMs: 0, playedSeconds: 0 }),
    ]);
    expect(merged.attempts).toBe(42);
    expect(merged.startupP50Ms).toBe(1750);
    expect(merged.rebufferRatio).toBeCloseTo(10_000 / 2_000_000, 6);
    expect(mergeDays([]).startupP50Ms).toBeNull();
  });
});

describe('what problems and heights are called', () => {
  it('names known problems and shows the others as sent', () => {
    expect(errorLook('network').label).toBe('Could not load');
    expect(errorLook('tv-tuner').label).toBe('tv-tuner');
  });

  it('shares the time played among the heights, the highest first', () => {
    expect(
      heightShares([
        { height: 720, playedSeconds: 100 },
        { height: 1080, playedSeconds: 300 },
      ]),
    ).toEqual([
      { height: 1080, label: '1080p', share: 0.75 },
      { height: 720, label: '720p', share: 0.25 },
    ]);
    expect(heightShares([{ height: 720, playedSeconds: 0 }])).toEqual([]);
  });
});
