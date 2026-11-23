// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { BrandingSettings } from '@/api/types';
import {
  ACCENT_PRESETS,
  contrastOnBlack,
  draftOf,
  iconProblem,
  isCustomized,
  isDirty,
  isLinkTarget,
  judgeAccent,
  moved,
  normalizeHex,
  problemsOf,
  readableOnBlack,
  settingsOf,
} from './branding';

const EMPTY: BrandingSettings = {
  name: null,
  description: null,
  logoId: null,
  logoShowsName: false,
  iconId: null,
  accent: null,
  footerText: null,
  footerLinks: [],
};

describe('colours', () => {
  it('offers only presets that can be read on black', () => {
    for (const preset of ACCENT_PRESETS) {
      expect(contrastOnBlack(preset.color), preset.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('measures like the API does', () => {
    expect(contrastOnBlack('#000000')).toBeCloseTo(1, 5);
    expect(contrastOnBlack('#ffffff')).toBeCloseTo(21, 5);
    expect(normalizeHex('#FA3')).toBe('#ffaa33');
    expect(normalizeHex('blue')).toBeNull();
  });

  it('judges what was typed', () => {
    expect(judgeAccent(' ', 4.5)).toEqual({ state: 'default' });
    expect(judgeAccent('nope', 4.5)).toEqual({ state: 'invalid' });
    expect(judgeAccent('#E6A85C', 4.5)).toMatchObject({ state: 'good', color: '#e6a85c' });
    const dark = judgeAccent('#1a3c8f', 4.5);
    expect(dark.state).toBe('dark');
    if (dark.state === 'dark') {
      expect(contrastOnBlack(dark.suggestion)).toBeGreaterThanOrEqual(4.5);
      expect(dark.suggestion).toBe(readableOnBlack('#1a3c8f', 4.5));
    }
  });
});

describe('the form', () => {
  it('sends empty texts as "as it ships" and drops empty link rows', () => {
    const draft = draftOf(EMPTY);
    draft.name = ' Kino Nord ';
    draft.accent = '4FC3F7';
    draft.footerLinks = [
      { label: ' Imprint ', url: ' /imprint ' },
      { label: '', url: '' },
    ];
    expect(settingsOf(draft)).toEqual({
      ...EMPTY,
      name: 'Kino Nord',
      accent: '#4fc3f7',
      footerLinks: [{ label: 'Imprint', url: '/imprint' }],
    });
  });

  it('knows when something changed, and when the site differs from how it ships', () => {
    const draft = draftOf(EMPTY);
    expect(isDirty(draft, EMPTY)).toBe(false);
    draft.footerLinks = [{ label: '', url: '' }];
    expect(isDirty(draft, EMPTY)).toBe(false);
    draft.logoShowsName = true;
    expect(isDirty(draft, EMPTY)).toBe(true);

    expect(isCustomized(EMPTY)).toBe(false);
    expect(isCustomized({ ...EMPTY, accent: '#4fc3f7' })).toBe(true);
  });

  it('says what keeps it from being saved', () => {
    const draft = draftOf(EMPTY);
    expect(problemsOf(draft, 4.5).any).toBe(false);

    draft.accent = '#1a3c8f';
    draft.footerLinks = [
      { label: 'Imprint', url: 'imprint' },
      { label: '', url: '/privacy' },
      { label: 'Fine', url: 'https://example.com/terms' },
    ];
    const problems = problemsOf(draft, 4.5);
    expect(problems.accent).toMatch(/Too dark/);
    expect(problems.links[0]).toMatch(/Start with/);
    expect(problems.links[1]).toMatch(/label/);
    expect(problems.links[2]).toBeNull();
    expect(problems.any).toBe(true);
  });

  it('knows where a link may lead', () => {
    expect(isLinkTarget('/imprint')).toBe(true);
    expect(isLinkTarget('mailto:hello@example.com')).toBe(true);
    expect(isLinkTarget('https://example.com')).toBe(true);
    expect(isLinkTarget('javascript:alert(1)')).toBe(false);
    expect(isLinkTarget('//evil.example')).toBe(false);
  });

  it('moves a link up and down, and not past the ends', () => {
    expect(moved(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moved(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moved(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('asks for a square PNG as the icon', () => {
    expect(iconProblem({ type: 'image/png' }, { width: 512, height: 512 })).toBeNull();
    expect(iconProblem({ type: 'image/jpeg' }, { width: 512, height: 512 })).toMatch(/PNG/);
    expect(iconProblem({ type: 'image/png' }, { width: 512, height: 200 })).toMatch(/square/);
    expect(iconProblem({ type: 'image/png' }, { width: 32, height: 32 })).toMatch(/small/);
  });
});
