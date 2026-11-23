// SPDX-License-Identifier: AGPL-3.0-only

/** A colour as three numbers from 0 to 255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * How much lighter than black the accent of the website has to be. 4.5 to 1
 * is what WCAG asks of text, and it serves twice here: the accent is used
 * for text on the black page, and for buttons with black text on them. Both
 * are the same pair of colours, so one number decides both.
 */
export const MIN_ACCENT_CONTRAST = 4.5;

const HEX = /^#[0-9a-f]{6}$/;

/** "#E6A85C" or "e6a85c" or "#fa3" as "#e6a85c". Null for what is no colour. */
export function normalizeHex(value: string): string | null {
  const text = value.trim().toLowerCase().replace(/^#?/, '#');
  if (/^#[0-9a-f]{3}$/.test(text)) {
    return `#${Array.from(text.slice(1), (digit) => digit + digit).join('')}`;
  }
  return HEX.test(text) ? text : null;
}

export function parseHex(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** How light a colour is to the eye, from 0 (black) to 1 (white), as WCAG defines it. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const share = value / 255;
    return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The contrast of a colour against black, from 1 (black itself) to 21 (white). */
export function contrastOnBlack(hex: string): number {
  return (luminance(parseHex(hex)) + 0.05) / 0.05;
}

/** A colour mixed with white (amount above 0) or black (below), by that share. */
export function mix(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex);
  const target = amount >= 0 ? 255 : 0;
  const share = Math.abs(amount);
  return toHex({
    r: r + (target - r) * share,
    g: g + (target - g) * share,
    b: b + (target - b) * share,
  });
}

/**
 * The colour itself when it can be read on black, otherwise the nearest
 * lighter tint of it that can. A dark brand colour keeps its hue this way.
 */
export function readableOnBlack(hex: string, minimum = MIN_ACCENT_CONTRAST): string {
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

/** The darker shade of an accent, for a button that is pressed or pointed at. */
export function deepen(hex: string): string {
  return mix(hex, -0.16);
}
