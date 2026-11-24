// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type SubtitleLook } from '@/lib/player-settings';
import {
  type AdjustableCue,
  createCueAdjuster,
  cueLine,
  subtitleProperties,
} from './subtitle-look';

const look = (change: Partial<SubtitleLook> = {}): SubtitleLook => ({
  ...DEFAULT_SETTINGS.subtitles,
  ...change,
});

const cue = (start: number, end: number, placed = false): AdjustableCue => ({
  startTime: start,
  endTime: end,
  line: placed ? 2 : 'auto',
  snapToLines: placed,
});

describe('subtitleProperties', () => {
  it('sizes the text against the height of the player', () => {
    const style = subtitleProperties(look({ size: 5, color: '#ffd166' }), 800) as Record<
      string,
      string
    >;
    expect(style['--cue-size']).toBe('40.00px');
    expect(style['--cue-color']).toBe('#ffd166');
  });

  it('falls back to the window until the player has been measured', () => {
    const style = subtitleProperties(look({ size: 5 }), 0) as Record<string, string>;
    expect(style['--cue-size']).toBe('5vh');
  });

  it('has no shadow when no edge is wanted', () => {
    const style = subtitleProperties(look({ edge: 'none' }), 800) as Record<string, string>;
    expect(style['--cue-shadow']).toBe('none');
  });

  it('gives a box a solid band whatever the background was set to', () => {
    const style = subtitleProperties(look({ edge: 'box', background: 0 }), 800) as Record<
      string,
      string
    >;
    expect(style['--cue-background']).toBe('rgb(0 0 0 / 0.75)');
    expect(style['--cue-shadow']).toBe('none');
  });
});

describe('cueLine', () => {
  it('counts from the top of the picture', () => {
    expect(cueLine(8)).toBe(92);
    expect(cueLine(30)).toBe(70);
  });

  it('keeps the line on the picture', () => {
    expect(cueLine(0)).toBe(95);
    expect(cueLine(100)).toBe(5);
  });
});

describe('createCueAdjuster', () => {
  it('moves every cue by the offset', () => {
    const cues = [cue(10, 12), cue(20, 23)];
    createCueAdjuster().apply(cues, look({ offset: 1.5 }));
    expect(cues[0]).toMatchObject({ startTime: 11.5, endTime: 13.5 });
    expect(cues[1]).toMatchObject({ startTime: 21.5, endTime: 24.5 });
  });

  it('moves from where the cues began, not from where they are', () => {
    const cues = [cue(10, 12)];
    const adjuster = createCueAdjuster();
    adjuster.apply(cues, look({ offset: 2 }));
    adjuster.apply(cues, look({ offset: 3 }));
    expect(cues[0]).toMatchObject({ startTime: 13, endTime: 15 });
    adjuster.apply(cues, look({ offset: 0 }));
    expect(cues[0]).toMatchObject({ startTime: 10, endTime: 12 });
  });

  it('does not take a cue back before the video starts', () => {
    const cues = [cue(1, 2)];
    createCueAdjuster().apply(cues, look({ offset: -5 }));
    expect(cues[0]?.startTime).toBe(0);
    expect(cues[0]?.endTime).toBeGreaterThan(0);
  });

  it('puts an ordinary cue where the viewer asked for it', () => {
    const cues = [cue(10, 12)];
    createCueAdjuster().apply(cues, look({ bottom: 20 }));
    expect(cues[0]).toMatchObject({ line: 80, snapToLines: false });
  });

  it('leaves a cue the subtitler placed where it is', () => {
    const cues = [cue(10, 12, true)];
    createCueAdjuster().apply(cues, look({ bottom: 20 }));
    expect(cues[0]).toMatchObject({ line: 2, snapToLines: true });
  });
});
