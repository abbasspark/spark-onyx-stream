// SPDX-License-Identifier: AGPL-3.0-only
import type { AdFigures, AdSettings, AdSource } from '@/api/types';

/** A share of a whole as a whole percent, or null while there is nothing to divide. */
export function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

/** Of the ads that started, how many played to the end. */
export const completionRate = (figures: AdFigures) =>
  percentOf(figures.completes, figures.impressions);

/** Of the ads that started, how many were skipped. */
export const skipRate = (figures: AdFigures) => percentOf(figures.skips, figures.impressions);

/** Of the ads that started, how many were clicked. */
export const clickRate = (figures: AdFigures) => percentOf(figures.clicks, figures.impressions);

/** The steps an ad passes while it plays, with how many viewers reached each. */
export function funnelOf(figures: AdFigures): { label: string; value: number }[] {
  return [
    { label: 'Started', value: figures.impressions },
    { label: 'A quarter', value: figures.firstQuartile },
    { label: 'Halfway', value: figures.midpoint },
    { label: 'Three quarters', value: figures.thirdQuartile },
    { label: 'To the end', value: figures.completes },
  ];
}

/** Each source's share of the ads that are shown, by weight. Sources that are off get none. */
export function shareOf(source: AdSource, sources: readonly AdSource[]): number | null {
  if (!source.isActive) {
    return null;
  }
  const total = sources.filter((item) => item.isActive).reduce((sum, item) => sum + item.weight, 0);
  return percentOf(source.weight, total);
}

/** Says in a sentence where the viewer meets ads, for the settings card. */
export function describeBreaks(settings: AdSettings): string {
  if (!settings.enabled) {
    return 'Nobody sees ads while this is off.';
  }
  const parts: string[] = [];
  if (settings.preRoll) {
    parts.push('before the video');
  }
  if (settings.midRollEveryMinutes > 0) {
    parts.push(`every ${settings.midRollEveryMinutes} minutes during it`);
  }
  if (settings.postRoll) {
    parts.push('after it');
  }
  if (parts.length === 0) {
    return 'No place is chosen for ads yet. Pick at least one below.';
  }
  const where =
    parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  const floor =
    settings.minDurationMinutes > 0
      ? ` Videos shorter than ${settings.minDurationMinutes} minutes are left alone.`
      : '';
  return `Viewers without an ad-free plan see an ad ${where}.${floor}`;
}

/** Reads a whole number in a range from a text box. Null: empty. 'invalid': not usable. */
export function parseWhole(text: string, min: number, max: number): number | null | 'invalid' {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    return 'invalid';
  }
  const value = Number(trimmed);
  return value < min || value > max ? 'invalid' : value;
}

/** Whether a text is a web address (http or https), as the server checks it too. */
export function isWebAddress(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
