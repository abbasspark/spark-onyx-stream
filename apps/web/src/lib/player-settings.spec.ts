// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, fitStyle, heightCap, readSettings, SEEK_STEPS } from './player-settings';

describe('readSettings', () => {
  it('gives the defaults for nothing at all', () => {
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the fields it understands and replaces the rest', () => {
    const settings = readSettings({
      fit: 'zoom',
      boost: 1.6,
      dataSaver: 'cheap',
      seekStep: 30,
      subtitles: { size: 6, edge: 'box', offset: 1.5, color: 'rebeccapurple' },
    });
    expect(settings.fit).toBe('zoom');
    expect(settings.boost).toBe(1.6);
    expect(settings.seekStep).toBe(30);
    expect(settings.subtitles.size).toBe(6);
    expect(settings.subtitles.edge).toBe('box');
    expect(settings.subtitles.offset).toBe(1.5);
    // A saver step and a colour the player does not offer fall back.
    expect(settings.dataSaver).toBe('off');
    expect(settings.subtitles.color).toBe(DEFAULT_SETTINGS.subtitles.color);
  });

  it('holds numbers to what the controls offer', () => {
    const settings = readSettings({
      boost: 99,
      subtitles: { size: 0.1, bottom: 500, offset: -40, background: 3 },
    });
    expect(settings.boost).toBe(3);
    expect(settings.subtitles.size).toBe(2.4);
    expect(settings.subtitles.bottom).toBe(40);
    expect(settings.subtitles.offset).toBe(-10);
    expect(settings.subtitles.background).toBe(1);
  });

  it('refuses numbers that are not numbers', () => {
    const settings = readSettings({ boost: 'loud', seekStep: 7, subtitles: { size: null } });
    expect(settings.boost).toBe(DEFAULT_SETTINGS.boost);
    expect(settings.subtitles.size).toBe(DEFAULT_SETTINGS.subtitles.size);
    // 7 is not one of the steps the menu offers.
    expect(SEEK_STEPS).not.toContain(7 as never);
    expect(settings.seekStep).toBe(DEFAULT_SETTINGS.seekStep);
  });
});

describe('heightCap', () => {
  it('has no limit while the saver is off', () => {
    expect(heightCap('off')).toBeNull();
  });

  it('reads the step as a height', () => {
    expect(heightCap('720')).toBe(720);
    expect(heightCap('480')).toBe(480);
  });
});

describe('fitStyle', () => {
  it('leaves the whole picture visible by default', () => {
    expect(fitStyle('fit')).toEqual({ objectFit: 'contain', scale: 1 });
  });

  it('crops to fill and scales up to zoom', () => {
    expect(fitStyle('fill').objectFit).toBe('cover');
    expect(fitStyle('zoom').scale).toBeGreaterThan(1);
    expect(fitStyle('stretch').objectFit).toBe('fill');
  });
});
