// SPDX-License-Identifier: AGPL-3.0-only
import type { BrandingSettings, FooterLink } from '@/api/types';

export const MAX_FOOTER_LINKS = 8;

/** Colours that work as the accent of the website: all light enough for the black page. */
export const ACCENT_PRESETS: { name: string; color: string }[] = [
  { name: 'Amber', color: '#e6a85c' },
  { name: 'Coral', color: '#ff8a65' },
  { name: 'Rose', color: '#f48fb1' },
  { name: 'Violet', color: '#b39ddb' },
  { name: 'Sky', color: '#4fc3f7' },
  { name: 'Teal', color: '#4db6ac' },
  { name: 'Lime', color: '#c0ca33' },
  { name: 'Bone', color: '#f4f1ea' },
];

/** "#E6A85C" or "e6a85c" or "#fa3" as "#e6a85c". Null for what is no colour. */
export function normalizeHex(value: string): string | null {
  const text = value.trim().toLowerCase().replace(/^#?/, '#');
  if (/^#[0-9a-f]{3}$/.test(text)) {
    return `#${Array.from(text.slice(1), (digit) => digit + digit).join('')}`;
  }
  return /^#[0-9a-f]{6}$/.test(text) ? text : null;
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * The contrast of a colour against black, from 1 to 21, as WCAG defines it.
 * It decides two things at once: whether text in the colour can be read on
 * the black page, and whether black text can be read on a button in it.
 */
export function contrastOnBlack(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const share = value / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05) / 0.05;
}

/** A colour mixed with white (amount above 0) or black (below), by that share. */
export function mix(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const share = Math.abs(amount);
  return `#${channels(hex)
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value + (target - value) * share)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** The colour itself when it can be read on black, otherwise the nearest lighter tint that can. */
export function readableOnBlack(hex: string, minimum: number): string {
  if (contrastOnBlack(hex) >= minimum) {
    return hex;
  }
  for (let step = 1; step <= 100; step += 1) {
    const lighter = mix(hex, step / 100);
    if (contrastOnBlack(lighter) >= minimum) {
      return lighter;
    }
  }
  return '#ffffff';
}

/** The darker shade of an accent, as the website uses it for a pressed button. */
export function deepen(hex: string): string {
  return mix(hex, -0.16);
}

/** Where a footer link may lead: a page of this or another site, or an email address. */
export function isLinkTarget(value: string): boolean {
  const url = value.trim();
  if (/^\/(?!\/)/.test(url)) {
    return true;
  }
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(url)) {
    return true;
  }
  return /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url) || /^https?:\/\/localhost\b/i.test(url);
}

/** What the form holds while it is edited. Texts are strings, empty for "as it ships". */
export interface BrandingDraft {
  name: string;
  description: string;
  logoId: string | null;
  logoShowsName: boolean;
  iconId: string | null;
  /** As typed. Empty: the colour the site ships with. */
  accent: string;
  footerText: string;
  footerLinks: FooterLink[];
}

export function draftOf(settings: BrandingSettings): BrandingDraft {
  return {
    name: settings.name ?? '',
    description: settings.description ?? '',
    logoId: settings.logoId,
    logoShowsName: settings.logoShowsName,
    iconId: settings.iconId,
    accent: settings.accent ?? '',
    footerText: settings.footerText ?? '',
    footerLinks: settings.footerLinks.map((link) => ({ ...link })),
  };
}

/** What is sent: trimmed, with empty texts as "as it ships" and empty link rows left out. */
export function settingsOf(draft: BrandingDraft): BrandingSettings {
  return {
    name: draft.name.trim() || null,
    description: draft.description.trim() || null,
    logoId: draft.logoId,
    logoShowsName: draft.logoShowsName,
    iconId: draft.iconId,
    accent: draft.accent.trim() ? (normalizeHex(draft.accent) ?? draft.accent.trim()) : null,
    footerText: draft.footerText.trim() || null,
    footerLinks: draft.footerLinks
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.label !== '' || link.url !== ''),
  };
}

export function isDirty(draft: BrandingDraft, saved: BrandingSettings): boolean {
  return JSON.stringify(settingsOf(draft)) !== JSON.stringify(settingsOf(draftOf(saved)));
}

/** Whether anything differs from how the site ships: only then is there something to reset. */
export function isCustomized(settings: BrandingSettings): boolean {
  return (
    settings.name !== null ||
    settings.description !== null ||
    settings.logoId !== null ||
    settings.iconId !== null ||
    settings.accent !== null ||
    settings.footerText !== null ||
    settings.footerLinks.length > 0
  );
}

export type AccentVerdict =
  | { state: 'default' }
  | { state: 'invalid' }
  | { state: 'good'; color: string; contrast: number }
  | { state: 'dark'; color: string; contrast: number; suggestion: string };

/** What to make of the colour as typed. */
export function judgeAccent(typed: string, minimum: number): AccentVerdict {
  if (typed.trim() === '') {
    return { state: 'default' };
  }
  const color = normalizeHex(typed);
  if (!color) {
    return { state: 'invalid' };
  }
  const contrast = contrastOnBlack(color);
  return contrast >= minimum
    ? { state: 'good', color, contrast }
    : { state: 'dark', color, contrast, suggestion: readableOnBlack(color, minimum) };
}

/** Why the form cannot be saved yet, by field. Empty: it can. */
export function problemsOf(
  draft: BrandingDraft,
  minimumContrast: number,
): { accent?: string; links: (string | null)[]; any: boolean } {
  const verdict = judgeAccent(draft.accent, minimumContrast);
  const accent =
    verdict.state === 'invalid'
      ? 'Write the colour as #rrggbb, like #e6a85c.'
      : verdict.state === 'dark'
        ? 'Too dark to read on the black page.'
        : undefined;
  const links = draft.footerLinks.map((link) => {
    const [label, url] = [link.label.trim(), link.url.trim()];
    if (label === '' && url === '') {
      return null;
    }
    if (label === '') {
      return 'Give the link a label.';
    }
    if (!isLinkTarget(url)) {
      return 'Start with https://, with / for a page of this site, or with mailto: for an email address.';
    }
    return null;
  });
  return { accent, links, any: accent !== undefined || links.some((problem) => problem !== null) };
}

/** A list with one entry moved one place up or down. */
export function moved<T>(items: readonly T[], index: number, step: -1 | 1): T[] {
  const target = index + step;
  if (target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  [next[index], next[target]] = [next[target] as T, next[index] as T];
  return next;
}

/** What a picture has to be to serve as the icon. Null: it will do. */
export function iconProblem(
  file: { type: string },
  size: { width: number; height: number },
): string | null {
  if (file.type !== 'image/png') {
    return 'The icon has to be a PNG picture.';
  }
  if (Math.min(size.width, size.height) < 64) {
    return 'The icon is too small. Use at least 64 by 64 pixels, better 512 by 512.';
  }
  const ratio = size.width / size.height;
  if (ratio < 0.95 || ratio > 1.05) {
    return 'The icon has to be square.';
  }
  return null;
}
