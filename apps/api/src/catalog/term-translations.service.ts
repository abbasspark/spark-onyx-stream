// SPDX-License-Identifier: AGPL-3.0-only
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { languageChain, normalizeLanguage, pickTranslation } from './language.js';
import {
  cleanTexts,
  isEmpty,
  overlay,
  TERM_FIELDS,
  TERM_KINDS,
  TERM_LABELS,
  type TermField,
  type TermKind,
  type TermTexts,
} from './term-fields.js';

/** One term with its texts in the language of the catalog and in one more. */
export interface TermRow {
  id: string;
  slug: string;
  original: TermTexts;
  /** Null: nothing of this term is translated into the language. */
  translation: TermTexts | null;
  /** How many titles the term is on, to tell the ones that matter from the rest. */
  titles: number;
  updatedAt: Date | null;
}

export interface TermKindInfo {
  kind: TermKind;
  label: string;
  fields: readonly TermField[];
  /** How many terms of this kind there are. */
  total: number;
}

export interface TermLanguageInfo {
  language: string;
  /** Per kind, how many terms have a text in this language. */
  translated: Record<TermKind, number>;
  /** How many titles are translated into it. */
  titles: number;
}

export interface TermsOverview {
  kinds: TermKindInfo[];
  /** The languages in use, the most used first. */
  languages: TermLanguageInfo[];
}

export interface ListTermsInput {
  language: string;
  page: number;
  pageSize: number;
  q?: string | undefined;
  /** Only terms with nothing in the language yet. */
  missing?: boolean | undefined;
}

export interface SaveTermsInput {
  items: { id: string; texts: Record<string, string | null | undefined> }[];
}

export interface SaveTermsResult {
  /** Terms that have a translation after the save. */
  saved: number;
  /** Terms whose translation was emptied and removed. */
  cleared: number;
}

/**
 * How each kind is stored. The four pairs of tables are alike in everything
 * but their names, so one piece of code serves them all through this table.
 */
interface KindStore {
  entity: 'category' | 'genre' | 'collection' | 'person';
  translation:
    'categoryTranslation' | 'genreTranslation' | 'collectionTranslation' | 'personTranslation';
  /** The column of the translation that points at its term. */
  key: 'categoryId' | 'genreId' | 'collectionId' | 'personId';
  /** The relation whose size says how many titles a term is on. */
  counted: 'titles' | 'credits';
  orderBy: Record<string, 'asc' | 'desc'>[];
}

const STORES: Record<TermKind, KindStore> = {
  categories: {
    entity: 'category',
    translation: 'categoryTranslation',
    key: 'categoryId',
    counted: 'titles',
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  },
  genres: {
    entity: 'genre',
    translation: 'genreTranslation',
    key: 'genreId',
    counted: 'titles',
    orderBy: [{ name: 'asc' }],
  },
  collections: {
    entity: 'collection',
    translation: 'collectionTranslation',
    key: 'collectionId',
    counted: 'titles',
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
  },
  people: {
    entity: 'person',
    translation: 'personTranslation',
    key: 'personId',
    counted: 'credits',
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  },
};

/** A row as the database returns it, read by field name. */
type Loose = Record<string, unknown>;

/**
 * The part of a Prisma model this service uses. The models of the four kinds
 * all have it; naming it once is what lets one piece of code serve them.
 */
interface Table {
  findMany(args: Loose): Promise<Loose[]>;
  count(args?: Loose): Promise<number>;
  groupBy(args: Loose): Promise<Loose[]>;
  upsert(args: Loose): Promise<Loose>;
  deleteMany(args: Loose): Promise<{ count: number }>;
}

const SINGULAR: Record<KindStore['entity'], TermKind> = {
  category: 'categories',
  genre: 'genres',
  collection: 'collections',
  person: 'people',
};

/** Names and descriptions of categories, genres, collections and people in more languages. */
@Injectable()
export class TermTranslationsService {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  private entities(kind: TermKind): Table {
    return this.prisma[STORES[kind].entity] as unknown as Table;
  }

  private translations(kind: TermKind): Table {
    return this.prisma[STORES[kind].translation] as unknown as Table;
  }

  /** @throws BadRequestException for what is not a language tag. */
  language(value: string): string {
    const language = normalizeLanguage(value);
    if (!language) {
      throw new BadRequestException('Write the language as a tag such as "de" or "pt-BR"');
    }
    return language;
  }

  private texts(kind: TermKind, row: Loose): TermTexts {
    return Object.fromEntries(
      TERM_FIELDS[kind].map((field) => {
        const value = row[field.key];
        return [field.key, typeof value === 'string' && value !== '' ? value : null];
      }),
    );
  }

  /** What there is to translate, and how far each language has come. */
  async overview(): Promise<TermsOverview> {
    const [totals, groups, titleGroups] = await Promise.all([
      Promise.all(TERM_KINDS.map((kind) => this.entities(kind).count())),
      Promise.all(
        TERM_KINDS.map((kind) =>
          // A translation without any text is removed on saving, so a row is a translated term.
          this.translations(kind).groupBy({ by: ['language'], _count: { _all: true } }),
        ),
      ),
      this.prisma.titleTranslation.groupBy({ by: ['language'], _count: { _all: true } }),
    ]);

    const languages = new Map<string, TermLanguageInfo>();
    const entry = (language: string): TermLanguageInfo => {
      let info = languages.get(language);
      if (!info) {
        info = {
          language,
          translated: { categories: 0, genres: 0, collections: 0, people: 0 },
          titles: 0,
        };
        languages.set(language, info);
      }
      return info;
    };
    for (const group of titleGroups) {
      entry(group.language).titles = group._count._all;
    }
    TERM_KINDS.forEach((kind, index) => {
      for (const group of groups[index] ?? []) {
        const counted = (group._count as { _all: number })._all;
        entry(group.language as string).translated[kind] = counted;
      }
    });

    const weight = (info: TermLanguageInfo) =>
      info.titles + TERM_KINDS.reduce((sum, kind) => sum + info.translated[kind], 0);
    return {
      kinds: TERM_KINDS.map((kind, index) => ({
        kind,
        label: TERM_LABELS[kind],
        fields: TERM_FIELDS[kind],
        total: totals[index] ?? 0,
      })),
      languages: [...languages.values()].sort(
        (a, b) => weight(b) - weight(a) || a.language.localeCompare(b.language),
      ),
    };
  }

  /** The terms of a kind with their translation into one language, a page at a time. */
  async list(kind: TermKind, input: ListTermsInput): Promise<Page<TermRow>> {
    const store = STORES[kind];
    const language = this.language(input.language);
    const where: Loose = {
      AND: [
        input.q
          ? {
              OR: [
                { name: { contains: input.q, mode: 'insensitive' } },
                {
                  translations: {
                    some: { language, name: { contains: input.q, mode: 'insensitive' } },
                  },
                },
              ],
            }
          : {},
        input.missing ? { NOT: { translations: { some: { language } } } } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.entities(kind).findMany({
        where,
        orderBy: store.orderBy,
        include: {
          translations: { where: { language } },
          _count: { select: { [store.counted]: true } },
        },
        ...toSkipTake(input),
      }),
      this.entities(kind).count({ where }),
    ]);
    return toPage(
      rows.map((row) => {
        const translation = (row.translations as Loose[])[0];
        return {
          id: row.id as string,
          slug: row.slug as string,
          original: this.texts(kind, row),
          translation: translation ? this.texts(kind, translation) : null,
          titles: (row._count as Record<string, number>)[store.counted] ?? 0,
          updatedAt: (translation?.updatedAt as Date | undefined) ?? null,
        };
      }),
      total,
      input,
    );
  }

  /**
   * Writes the translations of several terms into one language. A text that
   * is left out stays as it is; a term left with no text at all loses its
   * translation.
   *
   * @throws BadRequestException for a term that does not exist, a text the
   *   kind does not have, or one that is too long. Nothing is written then.
   */
  async save(kind: TermKind, tag: string, input: SaveTermsInput): Promise<SaveTermsResult> {
    const store = STORES[kind];
    const language = this.language(tag);
    const ids = [...new Set(input.items.map((item) => item.id))];
    if (ids.length !== input.items.length) {
      throw new BadRequestException('A term is in the list twice');
    }
    const [found, current] = await Promise.all([
      this.entities(kind).findMany({ where: { id: { in: ids } }, select: { id: true } }),
      this.translations(kind).findMany({ where: { language, [store.key]: { in: ids } } }),
    ]);
    if (found.length !== ids.length) {
      throw new BadRequestException(
        `Some of these ${TERM_LABELS[kind].toLowerCase()} do not exist (any more)`,
      );
    }

    const writes: { id: string; texts: TermTexts }[] = [];
    for (const item of input.items) {
      const cleaned = cleanTexts(kind, item.texts);
      if ('problem' in cleaned) {
        throw new BadRequestException(cleaned.problem);
      }
      const before = current.find((row) => row[store.key] === item.id);
      // What was not sent keeps the text it has.
      writes.push({
        id: item.id,
        texts: { ...(before ? this.texts(kind, before) : {}), ...cleaned.texts },
      });
    }

    const emptied = writes.filter((write) => isEmpty(write.texts)).map((write) => write.id);
    const kept = writes.filter((write) => !isEmpty(write.texts));
    let cleared = 0;
    await this.prisma.$transaction(async (tx) => {
      const table = tx[store.translation] as unknown as Table;
      if (emptied.length > 0) {
        cleared = (await table.deleteMany({ where: { language, [store.key]: { in: emptied } } }))
          .count;
      }
      for (const write of kept) {
        await table.upsert({
          where: { [`${store.key}_language`]: { [store.key]: write.id, language } },
          create: { [store.key]: write.id, language, ...write.texts },
          update: write.texts,
        });
      }
    });
    return { saved: kept.length, cleared };
  }

  /**
   * Takes one language away from a kind altogether.
   *
   * @returns How many translations went.
   */
  async removeLanguage(kind: TermKind, tag: string): Promise<number> {
    const language = this.language(tag);
    return (await this.translations(kind).deleteMany({ where: { language } })).count;
  }

  // --- For viewers ----------------------------------------------------------------

  /**
   * Puts translated texts into terms on their way to a viewer. Each needs its
   * `id`; of the texts of its kind, those it carries are replaced where a
   * translation has them. Without a language, everything stays as it is.
   */
  async localize<T extends { id: string }>(
    entity: KindStore['entity'],
    terms: readonly T[],
    language: string | undefined,
  ): Promise<T[]> {
    if (!language || terms.length === 0) {
      return [...terms];
    }
    const kind = SINGULAR[entity];
    const store = STORES[kind];
    const rows = await this.translations(kind).findMany({
      where: {
        [store.key]: { in: [...new Set(terms.map((term) => term.id))] },
        language: { in: languageChain(language) },
      },
    });
    if (rows.length === 0) {
      return [...terms];
    }
    return terms.map((term) =>
      overlay(
        kind,
        term,
        pickTranslation(
          rows.filter((row) => row[store.key] === term.id) as (Loose & { language: string })[],
          language,
        ),
      ),
    );
  }

  /**
   * The translated names of a kind by slug, for places that show a term as a
   * link: the genres of a title, the category of a row. Terms without a
   * translated name are not in it. Not for people: there are too many.
   */
  async names(
    entity: Exclude<KindStore['entity'], 'person'>,
    language: string | undefined,
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (!language) {
      return names;
    }
    const kind = SINGULAR[entity];
    const rows = (await this.translations(kind).findMany({
      where: { language: { in: languageChain(language) }, name: { not: null } },
      select: { language: true, name: true, [entity]: { select: { slug: true } } },
    })) as (Loose & { language: string })[];
    const bySlug = new Map<string, (Loose & { language: string })[]>();
    for (const row of rows) {
      const slug = (row[entity] as { slug: string }).slug;
      bySlug.set(slug, [...(bySlug.get(slug) ?? []), row]);
    }
    for (const [slug, translations] of bySlug) {
      const best = pickTranslation(translations, language);
      if (best && typeof best.name === 'string') {
        names.set(slug, best.name);
      }
    }
    return names;
  }

  /** The same for a single term. */
  async localizeOne<T extends { id: string }>(
    entity: KindStore['entity'],
    term: T,
    language: string | undefined,
  ): Promise<T> {
    const [localized] = await this.localize(entity, [term], language);
    return localized ?? term;
  }
}
