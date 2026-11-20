// SPDX-License-Identifier: AGPL-3.0-only

const MAX_LENGTH = 120;
const FALLBACK_NAME = 'source';

/**
 * Turns a file name supplied by a client into one that is safe as the last
 * segment of a storage key and on any file system.
 *
 * Only the base name is kept, so a path in the name cannot place the file
 * elsewhere. Characters outside letters, digits, dot, dash and underscore
 * become underscores. The original name is stored separately for display.
 */
export function safeSourceFilename(original: string): string {
  // Drop any directory part, whichever separator the client's system uses.
  const baseName = original.split(/[/\\]/).pop() ?? '';

  let cleaned = baseName
    .normalize('NFKD')
    // Remove the combining marks left by normalization, so "é" becomes "e".
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    // Leading dots would create hidden files or the names "." and "..".
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '');

  if (cleaned.length > MAX_LENGTH) {
    const dot = cleaned.lastIndexOf('.');
    const extension = dot > 0 && cleaned.length - dot <= 12 ? cleaned.slice(dot) : '';
    cleaned = cleaned.slice(0, MAX_LENGTH - extension.length).replace(/[._-]+$/, '') + extension;
  }

  return cleaned.length > 0 ? cleaned : FALLBACK_NAME;
}
