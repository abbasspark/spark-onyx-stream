// SPDX-License-Identifier: AGPL-3.0-only
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import type { TranslationInput } from './catalog.schemas.js';
import { languageChain, normalizeLanguage, pickTranslation } from './language.js';

/** The texts of a season or an episode in one language. Null: not translated. */
export interface PartTranslation {
  id: string;
  name: string | null;
  synopsis: string | null;
}

/** Everything a title says in one more language. */
export interface TranslationView {
  language: string;
  name: string | null;
  tagline: string | null;
  synopsis: string | null;
  /** Only seasons and episodes that have a translated text. */
  seasons: PartTranslation[];
  episodes: PartTranslation[];
  /** How much is translated, of what there is to translate: see {@link progress}. */
  filled: number;
  total: number;
  updatedAt: Date;
}

/** A language in use, with the number of titles translated into it. */
export interface LanguageUse {
  language: string;
  titles: number;
}

const text = (value: string | null | undefined): string | null => value?.trim() || null;

/** Translated texts of titles, seasons and episodes. */
@Injectable()
export class TranslationsService {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /** @throws BadRequestException for what is not a language tag. */
  language(value: string): string {
    const language = normalizeLanguage(value);
    if (!language) {
      throw new BadRequestException('Write the language as a tag such as "de" or "pt-BR"');
    }
    return language;
  }

  private async parts(
    titleId: string,
  ): Promise<{ seasonIds: string[]; episodeIds: string[]; texts: number }> {
    const title = await this.prisma.title.findUnique({
      where: { id: titleId },
      select: {
        tagline: true,
        synopsis: true,
        seasons: {
          select: {
            id: true,
            name: true,
            synopsis: true,
            episodes: { select: { id: true, synopsis: true } },
          },
        },
      },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    // What there is to translate: every text the title has in its own language.
    let texts = 1 + (title.tagline ? 1 : 0) + (title.synopsis ? 1 : 0);
    const episodeIds: string[] = [];
    for (const season of title.seasons) {
      texts += (season.name ? 1 : 0) + (season.synopsis ? 1 : 0);
      for (const episode of season.episodes) {
        texts += 1 + (episode.synopsis ? 1 : 0);
        episodeIds.push(episode.id);
      }
    }
    return { seasonIds: title.seasons.map((season) => season.id), episodeIds, texts };
  }

  /** The translations of a title, by language. */
  async list(titleId: string): Promise<TranslationView[]> {
    const { seasonIds, episodeIds, texts } = await this.parts(titleId);
    const [titles, seasons, episodes] = await Promise.all([
      this.prisma.titleTranslation.findMany({
        where: { titleId },
        orderBy: { language: 'asc' },
      }),
      this.prisma.seasonTranslation.findMany({ where: { seasonId: { in: seasonIds } } }),
      this.prisma.episodeTranslation.findMany({ where: { episodeId: { in: episodeIds } } }),
    ]);
    const count = (...values: (string | null)[]) => values.filter(Boolean).length;
    return titles.map((translation) => {
      const ofSeasons = seasons.filter((row) => row.language === translation.language);
      const ofEpisodes = episodes.filter((row) => row.language === translation.language);
      const filled =
        count(translation.name, translation.tagline, translation.synopsis) +
        ofSeasons.reduce((sum, row) => sum + count(row.name, row.synopsis), 0) +
        ofEpisodes.reduce((sum, row) => sum + count(row.name, row.synopsis), 0);
      return {
        language: translation.language,
        name: translation.name,
        tagline: translation.tagline,
        synopsis: translation.synopsis,
        seasons: ofSeasons.map((row) => ({
          id: row.seasonId,
          name: row.name,
          synopsis: row.synopsis,
        })),
        episodes: ofEpisodes.map((row) => ({
          id: row.episodeId,
          name: row.name,
          synopsis: row.synopsis,
        })),
        // A translation can hold more than the original has, so the share stays at the whole.
        filled: Math.min(filled, texts),
        total: texts,
        updatedAt: translation.updatedAt,
      };
    });
  }

  /**
   * Writes the whole translation of a title into one language. Texts left out
   * or empty fall back to the title's own. Seasons and episodes of other
   * titles are refused.
   */
  async put(titleId: string, tag: string, input: TranslationInput): Promise<TranslationView[]> {
    const language = this.language(tag);
    const { seasonIds, episodeIds } = await this.parts(titleId);
    const seasons = input.seasons ?? [];
    const episodes = input.episodes ?? [];
    if (
      seasons.some((season) => !seasonIds.includes(season.id)) ||
      episodes.some((episode) => !episodeIds.includes(episode.id))
    ) {
      throw new BadRequestException('A season or episode does not belong to this title');
    }
    const fields = {
      name: text(input.name),
      tagline: text(input.tagline),
      synopsis: text(input.synopsis),
    };
    const rows = <T extends { id: string; name?: string | null; synopsis?: string | null }>(
      list: readonly T[],
    ) =>
      list
        .map((part) => ({ id: part.id, name: text(part.name), synopsis: text(part.synopsis) }))
        .filter((part) => part.name || part.synopsis);

    await this.prisma.$transaction([
      this.prisma.titleTranslation.upsert({
        where: { titleId_language: { titleId, language } },
        create: { titleId, language, ...fields },
        update: fields,
      }),
      this.prisma.seasonTranslation.deleteMany({
        where: { language, seasonId: { in: seasonIds } },
      }),
      this.prisma.seasonTranslation.createMany({
        data: rows(seasons).map(({ id, ...rest }) => ({ seasonId: id, language, ...rest })),
      }),
      this.prisma.episodeTranslation.deleteMany({
        where: { language, episodeId: { in: episodeIds } },
      }),
      this.prisma.episodeTranslation.createMany({
        data: rows(episodes).map(({ id, ...rest }) => ({ episodeId: id, language, ...rest })),
      }),
    ]);
    return this.list(titleId);
  }

  /** Takes one language away from a title, with its seasons and episodes. */
  async remove(titleId: string, tag: string): Promise<void> {
    const language = this.language(tag);
    const { seasonIds, episodeIds } = await this.parts(titleId);
    const [removed] = await this.prisma.$transaction([
      this.prisma.titleTranslation.deleteMany({ where: { titleId, language } }),
      this.prisma.seasonTranslation.deleteMany({
        where: { language, seasonId: { in: seasonIds } },
      }),
      this.prisma.episodeTranslation.deleteMany({
        where: { language, episodeId: { in: episodeIds } },
      }),
    ]);
    if (removed.count === 0) {
      throw new NotFoundException('The title has no translation into this language');
    }
  }

  /** The languages titles are translated into, the most used first. */
  async languages(): Promise<LanguageUse[]> {
    const groups = await this.prisma.titleTranslation.groupBy({
      by: ['language'],
      _count: { _all: true },
    });
    return groups
      .map((group) => ({ language: group.language, titles: group._count._all }))
      .sort((a, b) => b.titles - a.titles || a.language.localeCompare(b.language));
  }

  // --- For viewers ----------------------------------------------------------------

  /**
   * Puts translated names and taglines into titles shown in rows and grids.
   * Titles without a translation into the language stay as they are.
   */
  async localizeCards<T extends { id: string; name: string; tagline: string | null }>(
    cards: readonly T[],
    language: string | undefined,
  ): Promise<T[]> {
    if (!language || cards.length === 0) {
      return [...cards];
    }
    const rows = await this.prisma.titleTranslation.findMany({
      where: {
        titleId: { in: cards.map((card) => card.id) },
        language: { in: languageChain(language) },
      },
      select: { titleId: true, language: true, name: true, tagline: true },
    });
    return cards.map((card) => {
      const found = pickTranslation(
        rows.filter((row) => row.titleId === card.id),
        language,
      );
      return found
        ? { ...card, name: found.name ?? card.name, tagline: found.tagline ?? card.tagline }
        : card;
    });
  }

  /** The translated texts of one title, its seasons and its episodes, for a language. */
  async forTitle(
    titleId: string,
    language: string | undefined,
  ): Promise<{
    title: { name: string | null; tagline: string | null; synopsis: string | null } | undefined;
    season: (id: string) => { name: string | null; synopsis: string | null } | undefined;
    episode: (id: string) => { name: string | null; synopsis: string | null } | undefined;
  }> {
    if (!language) {
      return { title: undefined, season: () => undefined, episode: () => undefined };
    }
    const chain = languageChain(language);
    const [titles, seasons, episodes] = await Promise.all([
      this.prisma.titleTranslation.findMany({ where: { titleId, language: { in: chain } } }),
      this.prisma.seasonTranslation.findMany({
        where: { season: { titleId }, language: { in: chain } },
      }),
      this.prisma.episodeTranslation.findMany({
        where: { episode: { season: { titleId } }, language: { in: chain } },
      }),
    ]);
    return {
      title: pickTranslation(titles, language),
      season: (id) =>
        pickTranslation(
          seasons.filter((row) => row.seasonId === id),
          language,
        ),
      episode: (id) =>
        pickTranslation(
          episodes.filter((row) => row.episodeId === id),
          language,
        ),
    };
  }
}
