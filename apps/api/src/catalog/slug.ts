// SPDX-License-Identifier: AGPL-3.0-only

export const MAX_SLUG_LENGTH = 80;
/** A slug is lowercase letters and digits of any script, in groups joined by single dashes. */
export const SLUG_PATTERN = /^[\p{Ll}\p{Lo}\p{N}]+(?:-[\p{Ll}\p{Lo}\p{N}]+)*$/u;

/**
 * Turns a name into the part of a web address that stands for it:
 * "The Long Road (2024)" becomes "the-long-road-2024".
 *
 * Accents are removed from Latin letters. Letters of other scripts, such as
 * Arabic or Japanese, are kept, because browsers show them as they are.
 *
 * @returns An empty string when the name has no letter or digit.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}

/**
 * Finds a slug that is still free, by adding "-2", "-3" and so on.
 *
 * @param base The wanted slug. "untitled" is used when it is empty.
 * @param isTaken Says whether a slug is already in use.
 */
export async function uniqueSlug(
  base: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = base || 'untitled';
  if (!(await isTaken(root))) {
    return root;
  }
  for (let counter = 2; counter < 1000; counter += 1) {
    const suffix = `-${counter}`;
    const candidate = `${root.slice(0, MAX_SLUG_LENGTH - suffix.length)}${suffix}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }
  throw new Error(`No free slug found for "${root}"`);
}
