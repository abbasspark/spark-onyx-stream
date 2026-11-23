// SPDX-License-Identifier: AGPL-3.0-only
import type { TranslationInput } from '../catalog/catalog.schemas.js';
import type { PartTranslation, TranslationView } from '../catalog/translations.service.js';
import type { SourceTranslation } from '../metadata/metadata.types.js';

/**
 * Puts what the source offers into the translation a title has.
 *
 * @param overwrite Off, only what is empty is filled: nothing an admin typed is replaced.
 * @returns the translation to save, and how many texts are new in it. Zero means
 *   there is nothing to save.
 */
export function mergeTranslation(
  existing: TranslationView | undefined,
  source: SourceTranslation,
  overwrite: boolean,
): { input: TranslationInput; added: number } {
  let added = 0;
  const take = (current: string | null | undefined, offered: string | null): string | null => {
    const own = current?.trim() || null;
    if (!offered || offered === own || (own && !overwrite)) {
      return own;
    }
    added += 1;
    return offered;
  };
  const parts = (
    current: readonly PartTranslation[],
    offered: readonly PartTranslation[],
  ): PartTranslation[] => {
    const byId = new Map(current.map((part) => [part.id, part]));
    for (const part of offered) {
      const own = byId.get(part.id);
      byId.set(part.id, {
        id: part.id,
        name: take(own?.name, part.name),
        synopsis: take(own?.synopsis, part.synopsis),
      });
    }
    return [...byId.values()];
  };
  const input: TranslationInput = {
    name: take(existing?.name, source.name),
    tagline: take(existing?.tagline, source.tagline),
    synopsis: take(existing?.synopsis, source.synopsis),
    seasons: parts(existing?.seasons ?? [], source.seasons),
    episodes: parts(existing?.episodes ?? [], source.episodes),
  };
  return { input, added };
}
