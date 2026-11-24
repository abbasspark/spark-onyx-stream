// SPDX-License-Identifier: AGPL-3.0-only
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Image, Prisma, PrismaClient, type PublishStatus } from '@onyx/database';
import { CARD_INCLUDE } from '../catalog/card-include.js';
import { type ImageView, toImageView } from '../catalog/catalog.views.js';
import { isAvailable, visibleTitle } from '../catalog/playable.js';
import { PublicCatalogService } from '../catalog/public-catalog.service.js';
import { type PublicTitleCard, toPublicCard } from '../catalog/public-catalog.views.js';
import { AppConfig } from '../config/app-config.js';
import { type CoWatchState, CoWatchService, MIN_SHARED_ACCOUNTS } from './co-watch.service.js';
import { DEFAULT_SIMILAR, MAX_SIMILAR, type SimilarChoicesInput } from './similar.schemas.js';
import {
  arrangeSimilar,
  rankSimilar,
  type ScoredTitle,
  type Signal,
  type SignalKind,
  type SimilarCandidate,
  WEIGHTS,
} from './similarity.js';

/** Of each title, the first people in front of the camera and behind it are compared. */
const LEAD_CAST = 10;
const LEAD_CREW = 8;
/** At most this many titles are scored for one answer. The database picks them roughly first. */
const MAX_CANDIDATES = 400;
/** How many found titles the panel lists below the pinned ones. */
const ADMIN_FOUND = 40;

/** Rows of titles like what a profile watched. */
const MAX_ROWS = 3;
const ROW_SIZE = 12;
/** A row with fewer titles than this is not worth showing. */
const MIN_ROW = 4;
/** How far back in what a profile watched rows are looked for. */
const RECENT_TITLES = 8;
/** A profile watched a title, for this purpose, from two minutes on. */
const WATCHED_SECONDS = 120;

const SOURCE_SELECT = {
  id: true,
  type: true,
  releaseYear: true,
  originalLanguage: true,
  minAge: true,
  keywords: true,
  studios: true,
  _count: { select: { genres: true, categories: true } },
} satisfies Prisma.TitleSelect;
type SourceTitle = Prisma.TitleGetPayload<{ select: typeof SOURCE_SELECT }>;

/** What is read of a title to say in words what it shares with another. */
const FEATURE_SELECT = {
  id: true,
  keywords: true,
  studios: true,
  genres: { select: { genre: { select: { id: true, name: true } } } },
  categories: { select: { category: { select: { id: true, name: true } } } },
  collections: { select: { collection: { select: { id: true, name: true } } } },
  credits: {
    where: {
      OR: [
        { kind: 'CAST', position: { lt: LEAD_CAST } },
        { kind: 'CREW', position: { lt: LEAD_CREW } },
      ],
    },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { kind: true, person: { select: { id: true, name: true } } },
  },
} satisfies Prisma.TitleSelect;
type FeatureTitle = Prisma.TitleGetPayload<{ select: typeof FEATURE_SELECT }>;

const ADMIN_TITLE_SELECT = {
  id: true,
  slug: true,
  name: true,
  type: true,
  releaseYear: true,
  ageRating: true,
  status: true,
  availableFrom: true,
  availableUntil: true,
  poster: true,
} satisfies Prisma.TitleSelect;
type AdminTitle = Prisma.TitleGetPayload<{ select: typeof ADMIN_TITLE_SELECT }>;

/** A reason, with the names of what is shared where there are names. */
export interface NamedSignal extends Signal {
  /** The genres, people, keywords, studios or collections both have. Empty for the others. */
  names: string[];
}

export interface SimilarAdminItem {
  title: {
    id: string;
    slug: string;
    name: string;
    type: string;
    releaseYear: number | null;
    ageRating: string | null;
    status: PublishStatus;
    poster: ImageView | null;
  };
  pinned: boolean;
  /** From 0 to 100. Null: the two share nothing, and an editor put it here. */
  score: number | null;
  signals: NamedSignal[];
  /**
   * Where the title stands in what viewers get, from 1. Null while they do
   * not see it, for the reason in `unseen`.
   */
  rank: number | null;
  /** "draft": not published. "dates": outside its dates. "unplayable": nothing to watch yet. */
  unseen: 'draft' | 'dates' | 'unplayable' | null;
}

export interface SimilarAdminView {
  title: { id: string; name: string; type: string };
  /** Pinned titles in their order, then the titles found, most alike first. */
  items: SimilarAdminItem[];
  /** Titles an editor took out. */
  hidden: SimilarAdminItem[];
  /** How many titles the website and the apps show unless they ask for more, and the most they get. */
  shownByDefault: number;
  most: number;
  /** The most points each reason can give. */
  weights: Record<SignalKind, number>;
  /** What is known about titles watched by the same people. Null: never counted. */
  watching: (CoWatchState & { minimumAccounts: number }) | null;
}

/** Titles like one the profile watched. */
export interface RecommendationRow {
  /** The title the row is about. */
  because: PublicTitleCard;
  titles: PublicTitleCard[];
}

interface CandidateRow extends SimilarCandidate {
  status: string;
}

/**
 * Which titles are like a title.
 *
 * Found by comparing what the catalog knows of them and what viewers watched,
 * then corrected by an editor: titles pinned to the front, and titles taken
 * out. Nothing is stored about the result. It is worked out when asked for,
 * so a change to a title, a genre or a cast shows at once.
 */
@Injectable()
export class SimilarService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(PublicCatalogService) private readonly catalog: PublicCatalogService,
    @Inject(CoWatchService) private readonly coWatch: CoWatchService,
  ) {}

  /**
   * The titles similar to one, as viewers get them.
   *
   * @throws NotFoundException when no visible title has this slug.
   */
  async forTitle(
    slug: string,
    limit: number = DEFAULT_SIMILAR,
    language?: string,
  ): Promise<PublicTitleCard[]> {
    const title = await this.prisma.title.findFirst({
      where: { slug, ...visibleTitle() },
      select: SOURCE_SELECT,
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    return this.cards(await this.order(title), limit, language);
  }

  /**
   * Rows for a profile: titles like the ones it watched last, without what
   * it already started and without a title twice.
   */
  async forProfile(profileId: string, language?: string): Promise<RecommendationRow[]> {
    const [recent, started] = await Promise.all([
      this.prisma.watchProgress.findMany({
        where: {
          profileId,
          title: visibleTitle(),
          OR: [{ completedAt: { not: null } }, { positionSeconds: { gte: WATCHED_SECONDS } }],
        },
        orderBy: [{ watchedAt: 'desc' }, { id: 'desc' }],
        take: 80,
        select: { title: { select: SOURCE_SELECT } },
      }),
      this.prisma.watchProgress.findMany({
        where: { profileId },
        distinct: ['titleId'],
        select: { titleId: true },
      }),
    ]);
    const sources = [...new Map(recent.map((entry) => [entry.title.id, entry.title])).values()];
    const used = new Set(started.map((entry) => entry.titleId));

    const rows: { source: SourceTitle; titles: PublicTitleCard[] }[] = [];
    for (const source of sources.slice(0, RECENT_TITLES)) {
      if (rows.length >= MAX_ROWS) {
        break;
      }
      const order = (await this.order(source)).filter((id) => !used.has(id));
      const titles = await this.cards(order, ROW_SIZE, language);
      if (titles.length >= MIN_ROW) {
        rows.push({ source, titles });
        for (const card of titles) {
          used.add(card.id);
        }
      }
    }
    if (rows.length === 0) {
      return [];
    }

    const because = await this.cards(
      rows.map((row) => row.source.id),
      rows.length,
      language,
    );
    const byId = new Map(because.map((card) => [card.id, card]));
    return rows.flatMap((row) => {
      const card = byId.get(row.source.id);
      return card ? [{ because: card, titles: row.titles }] : [];
    });
  }

  /**
   * Everything the panel shows about the similar titles of a title: the list
   * with the reasons, what viewers see of it, and what an editor decided.
   *
   * @throws NotFoundException when the title does not exist.
   */
  async forAdmin(titleId: string): Promise<SimilarAdminView> {
    const title = await this.prisma.title.findUnique({
      where: { id: titleId },
      select: { ...SOURCE_SELECT, name: true },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    const choices = await this.choices(titleId);
    const chosen = [...choices.pinned, ...choices.hidden];
    const ranked = await this.ranked(title, chosen);
    const scores = new Map(ranked.map((entry) => [entry.id, entry]));

    const hidden = new Set(choices.hidden);
    const pinned = new Set(choices.pinned);
    const found = ranked
      .filter((entry) => entry.status === 'PUBLISHED' && !pinned.has(entry.id))
      .map((entry) => entry.id);
    const listed = arrangeSimilar(found, choices.pinned, hidden).slice(
      0,
      choices.pinned.length + ADMIN_FOUND,
    );

    const ids = [...listed, ...choices.hidden];
    const [titles, visible, features] = await Promise.all([
      this.prisma.title.findMany({ where: { id: { in: ids } }, select: ADMIN_TITLE_SELECT }),
      this.prisma.title.findMany({
        where: { id: { in: ids }, ...visibleTitle() },
        select: { id: true },
      }),
      this.prisma.title.findMany({
        where: { id: { in: [titleId, ...ids] } },
        select: FEATURE_SELECT,
      }),
    ]);
    const byId = new Map(titles.map((entry) => [entry.id, entry]));
    const seen = new Set(visible.map((entry) => entry.id));
    const featuresOf = new Map(features.map((entry) => [entry.id, entry]));
    const own = featuresOf.get(titleId);

    let rank = 0;
    const item = (id: string, counts: boolean): SimilarAdminItem[] => {
      const entry = byId.get(id);
      if (!entry) {
        return [];
      }
      const scored = scores.get(id);
      const other = featuresOf.get(id);
      const isSeen = seen.has(id);
      return [
        {
          title: {
            id: entry.id,
            slug: entry.slug,
            name: entry.name,
            type: entry.type,
            releaseYear: entry.releaseYear,
            ageRating: entry.ageRating,
            status: entry.status,
            poster: this.image(entry.poster),
          },
          pinned: pinned.has(id),
          score: scored?.score ?? null,
          signals: (scored?.signals ?? []).map((signal) => ({
            ...signal,
            names: own && other ? sharedNames(signal.signal, own, other) : [],
          })),
          rank: counts && isSeen ? ++rank : null,
          unseen: isSeen ? null : unseenReason(entry),
        },
      ];
    };

    const state = await this.coWatch.state();
    return {
      title: { id: title.id, name: title.name, type: title.type },
      items: listed.flatMap((id) => item(id, true)),
      hidden: choices.hidden.flatMap((id) => item(id, false)),
      shownByDefault: DEFAULT_SIMILAR,
      most: MAX_SIMILAR,
      weights: WEIGHTS,
      watching: state ? { ...state, minimumAccounts: MIN_SHARED_ACCOUNTS } : null,
    };
  }

  /**
   * Replaces what an editor decided for a title.
   *
   * @returns What was decided before, for the audit log.
   * @throws NotFoundException when the title does not exist.
   * @throws BadRequestException when a named title does not exist, or is the title itself.
   */
  async setChoices(
    titleId: string,
    input: SimilarChoicesInput,
  ): Promise<{ name: string; before: { pinned: number; hidden: number } }> {
    const title = await this.prisma.title.findUnique({
      where: { id: titleId },
      select: { id: true, name: true },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    const ids = [...input.pinned, ...input.hidden];
    if (ids.includes(titleId)) {
      throw new BadRequestException('A title cannot be similar to itself');
    }
    const known = await this.prisma.title.count({ where: { id: { in: ids } } });
    if (known !== ids.length) {
      throw new BadRequestException('One of the titles does not exist');
    }

    const before = await this.choices(titleId);
    await this.prisma.$transaction([
      this.prisma.similarChoice.deleteMany({ where: { titleId } }),
      this.prisma.similarChoice.createMany({
        data: [
          ...input.pinned.map((otherId, position) => ({
            titleId,
            otherId,
            kind: 'PINNED' as const,
            position,
          })),
          ...input.hidden.map((otherId) => ({ titleId, otherId, kind: 'HIDDEN' as const })),
        ],
      }),
    ]);
    return {
      name: title.name,
      before: { pinned: before.pinned.length, hidden: before.hidden.length },
    };
  }

  /** What an editor pinned to a title, in order, and what they hid from it. */
  private async choices(titleId: string): Promise<{ pinned: string[]; hidden: string[] }> {
    const rows = await this.prisma.similarChoice.findMany({
      where: { titleId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { otherId: 'asc' }],
      select: { otherId: true, kind: true },
    });
    return {
      pinned: rows.filter((row) => row.kind === 'PINNED').map((row) => row.otherId),
      hidden: rows.filter((row) => row.kind === 'HIDDEN').map((row) => row.otherId),
    };
  }

  /** The ids of the similar titles in the order viewers get them, before any is checked for being visible. */
  private async order(title: SourceTitle): Promise<string[]> {
    const [choices, ranked] = await Promise.all([this.choices(title.id), this.ranked(title)]);
    return arrangeSimilar(
      ranked.map((entry) => entry.id),
      choices.pinned,
      new Set(choices.hidden),
    );
  }

  /**
   * Cards of the first titles of a list that viewers can see, in the order
   * of the list. Whoever is asking decides what is visible: a profile for a
   * child gets nothing above its age.
   */
  private async cards(
    ids: readonly string[],
    limit: number,
    language?: string,
  ): Promise<PublicTitleCard[]> {
    if (ids.length === 0) {
      return [];
    }
    const titles = await this.prisma.title.findMany({
      where: { id: { in: [...ids] }, ...visibleTitle() },
      include: CARD_INCLUDE,
    });
    const byId = new Map(titles.map((title) => [title.id, title]));
    const cards = ids
      .flatMap((id) => {
        const title = byId.get(id);
        return title ? [toPublicCard(title, this.config.mediaBaseUrl)] : [];
      })
      .slice(0, limit);
    return this.catalog.cards(cards, language);
  }

  /**
   * Every title that shares something with one, scored, most alike first.
   *
   * Only published titles are looked at, and the titles named in `also`:
   * what an editor pinned or hid is scored whatever its state.
   */
  private async ranked(
    title: SourceTitle,
    also: readonly string[] = [],
  ): Promise<(ScoredTitle & { status: string })[]> {
    const candidates = await this.candidates(title, also);
    const status = new Map(candidates.map((candidate) => [candidate.id, candidate.status]));
    return rankSimilar(
      {
        type: title.type,
        releaseYear: title.releaseYear,
        originalLanguage: title.originalLanguage,
        minAge: title.minAge,
        genreCount: title._count.genres,
        categoryCount: title._count.categories,
      },
      candidates,
    ).map((entry) => ({ ...entry, status: status.get(entry.id) ?? 'PUBLISHED' }));
  }

  /**
   * What the database knows of the titles that share something with one: a
   * count per kind of thing shared. The points are given in code, see
   * similarity.ts. The order here only decides which titles are looked at
   * when there are more than can be scored, and follows the points roughly.
   */
  private candidates(title: SourceTitle, also: readonly string[]): Promise<CandidateRow[]> {
    const id = Prisma.sql`${title.id}::uuid`;
    const keywords = Prisma.sql`${title.keywords}::text[]`;
    const studios = Prisma.sql`${title.studios}::text[]`;
    const named = Prisma.sql`${[...also]}::uuid[]`;
    return this.prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      WITH genres AS (
        SELECT b."titleId" AS id, count(*)::int AS n
        FROM title_genres a
        JOIN title_genres b ON b."genreId" = a."genreId"
        WHERE a."titleId" = ${id} AND b."titleId" <> ${id}
        GROUP BY 1
      ),
      categories AS (
        SELECT b."titleId" AS id, count(*)::int AS n
        FROM title_categories a
        JOIN title_categories b ON b."categoryId" = a."categoryId"
        WHERE a."titleId" = ${id} AND b."titleId" <> ${id}
        GROUP BY 1
      ),
      collections AS (
        SELECT b."titleId" AS id, count(*)::int AS n
        FROM collection_titles a
        JOIN collection_titles b ON b."collectionId" = a."collectionId"
        WHERE a."titleId" = ${id} AND b."titleId" <> ${id}
        GROUP BY 1
      ),
      actors AS (
        SELECT b."titleId" AS id, count(DISTINCT b."personId")::int AS n
        FROM credits a
        JOIN credits b ON b."personId" = a."personId"
                      AND b.kind = 'CAST' AND b.position < ${LEAD_CAST}
        WHERE a."titleId" = ${id} AND a.kind = 'CAST' AND a.position < ${LEAD_CAST}
          AND b."titleId" <> ${id}
        GROUP BY 1
      ),
      makers AS (
        SELECT b."titleId" AS id, count(DISTINCT b."personId")::int AS n
        FROM credits a
        JOIN credits b ON b."personId" = a."personId"
                      AND b.kind = 'CREW' AND b.position < ${LEAD_CREW}
        WHERE a."titleId" = ${id} AND a.kind = 'CREW' AND a.position < ${LEAD_CREW}
          AND b."titleId" <> ${id}
        GROUP BY 1
      ),
      words AS (
        SELECT t.id,
               (SELECT count(*) FROM unnest(t.keywords) k WHERE k = ANY(${keywords}))::int AS n
        FROM titles t
        WHERE t.keywords && ${keywords} AND t.id <> ${id}
      ),
      houses AS (
        SELECT t.id,
               (SELECT count(*) FROM unnest(t.studios) k WHERE k = ANY(${studios}))::int AS n
        FROM titles t
        WHERE t.studios && ${studios} AND t.id <> ${id}
      ),
      together AS (
        SELECT "otherId" AS id, viewers, strength
        FROM title_co_watch
        WHERE "titleId" = ${id}
      ),
      found AS (
        SELECT id FROM genres
        UNION SELECT id FROM collections
        UNION SELECT id FROM actors
        UNION SELECT id FROM makers
        UNION SELECT id FROM words
        UNION SELECT id FROM together
        UNION SELECT t.id FROM titles t WHERE t.id = ANY(${named}) AND t.id <> ${id}
      )
      SELECT t.id,
             t.type::text AS type,
             t.status::text AS status,
             t."releaseYear",
             t."originalLanguage",
             t."minAge"::int AS "minAge",
             t.rating,
             (SELECT count(*) FROM title_genres x WHERE x."titleId" = t.id)::int AS "genreCount",
             (SELECT count(*) FROM title_categories x WHERE x."titleId" = t.id)::int
               AS "categoryCount",
             coalesce(g.n, 0) AS "sharedGenres",
             coalesce(c.n, 0) AS "sharedCategories",
             coalesce(o.n, 0) AS "sharedCollections",
             coalesce(w.n, 0) AS "sharedKeywords",
             coalesce(a.n, 0) AS "sharedCast",
             coalesce(m.n, 0) AS "sharedCrew",
             coalesce(h.n, 0) AS "sharedStudios",
             coalesce(v.viewers, 0) AS "coViewers",
             coalesce(v.strength, 0)::float AS "coStrength"
      FROM found f
      JOIN titles t ON t.id = f.id
      LEFT JOIN genres g ON g.id = t.id
      LEFT JOIN categories c ON c.id = t.id
      LEFT JOIN collections o ON o.id = t.id
      LEFT JOIN words w ON w.id = t.id
      LEFT JOIN actors a ON a.id = t.id
      LEFT JOIN makers m ON m.id = t.id
      LEFT JOIN houses h ON h.id = t.id
      LEFT JOIN together v ON v.id = t.id
      WHERE t.status = 'PUBLISHED' OR t.id = ANY(${named})
      ORDER BY (t.id = ANY(${named})) DESC,
               coalesce(o.n, 0) * 20 + coalesce(v.strength, 0) * 50 + coalesce(g.n, 0) * 5
                 + coalesce(w.n, 0) * 3 + coalesce(a.n, 0) * 3 + coalesce(m.n, 0) * 4 DESC,
               t.id
      LIMIT ${MAX_CANDIDATES}
    `);
  }

  private image(image: Image | null): ImageView | null {
    return image ? toImageView(image, this.config.mediaBaseUrl) : null;
  }
}

/** Why viewers do not see a title, for one that is not visible. */
function unseenReason(title: AdminTitle): 'draft' | 'dates' | 'unplayable' {
  if (title.status !== 'PUBLISHED') {
    return 'draft';
  }
  return isAvailable(title) ? 'unplayable' : 'dates';
}

/** The names of what two titles share for one reason. */
function sharedNames(signal: SignalKind, a: FeatureTitle, b: FeatureTitle): string[] {
  const both = (
    left: { id: string; name: string }[],
    right: { id: string; name: string }[],
  ): string[] => {
    const ids = new Set(right.map((entry) => entry.id));
    return [...new Map(left.filter((entry) => ids.has(entry.id)).map((e) => [e.id, e.name]))]
      .map(([, name]) => name)
      .slice(0, 8);
  };
  const people = (title: FeatureTitle, kind: 'CAST' | 'CREW') =>
    title.credits.filter((credit) => credit.kind === kind).map((credit) => credit.person);
  const words = (left: string[], right: string[]): string[] => {
    const set = new Set(right);
    return left.filter((word) => set.has(word)).slice(0, 8);
  };
  switch (signal) {
    case 'genres':
      return both(
        a.genres.map((link) => link.genre),
        b.genres.map((link) => link.genre),
      ).sort((x, y) => x.localeCompare(y));
    case 'categories':
      return both(
        a.categories.map((link) => link.category),
        b.categories.map((link) => link.category),
      );
    case 'collection':
      return both(
        a.collections.map((link) => link.collection),
        b.collections.map((link) => link.collection),
      );
    case 'cast':
      return both(people(a, 'CAST'), people(b, 'CAST'));
    case 'crew':
      return both(people(a, 'CREW'), people(b, 'CREW'));
    case 'keywords':
      return words(a.keywords, b.keywords);
    case 'studio':
      return words(a.studios, b.studios);
    default:
      return [];
  }
}
