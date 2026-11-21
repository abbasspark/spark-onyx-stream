// SPDX-License-Identifier: AGPL-3.0-only

const BROWSERS: readonly (readonly [pattern: RegExp, name: string])[] = [
  // Order matters: most browsers also name the ones they are built on.
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

const SYSTEMS: readonly (readonly [pattern: RegExp, name: string])[] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b.*\bTV\b|\bSmart-?TV\b|\bTizen\b|\bWeb0S\b|\bwebOS\b/i, 'TV'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'Mac'],
  [/\bCrOS\b/, 'Chromebook'],
  [/\bLinux\b/, 'Linux'],
];

/**
 * A short name for a device from what its browser or app says about itself,
 * such as "Chrome on Windows". The full text is long and hard to read, and it
 * is only a claim: it helps to tell devices apart, not to prove anything.
 */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) {
    return 'Unknown device';
  }
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) {
    return `${browser} on ${system}`;
  }
  // An app or a script: its own name, the part before the version.
  return browser ?? system ?? (userAgent.split(/[/\s(]/)[0]?.slice(0, 40) || 'Unknown device');
}

/** Letters and digits that are not mistaken for each other when read or typed. */
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Makes a random password to hand to a viewer, in groups that are easy to
 * read out: "kT7w-Zq3m-Xb9n-Rf4d".
 *
 * @param random Returns that many random bytes. A parameter so tests can fix the outcome.
 */
export function generatePassword(
  random: (count: number) => Uint8Array = (count) => crypto.getRandomValues(new Uint8Array(count)),
): string {
  const groups: string[] = [];
  let group = '';
  while (groups.length < 4) {
    for (const byte of random(32)) {
      // Bytes past the last full run of the alphabet would favour its first letters.
      if (byte >= 256 - (256 % PASSWORD_ALPHABET.length)) {
        continue;
      }
      group += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
      if (group.length === 4) {
        groups.push(group);
        group = '';
        if (groups.length === 4) {
          break;
        }
      }
    }
  }
  return groups.join('-');
}

/** One or two letters for the round picture of a person without a photo. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : [words[0]];
  return letters
    .map((word) => [...(word ?? '')][0] ?? '')
    .join('')
    .toUpperCase();
}
