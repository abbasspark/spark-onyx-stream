// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Prisma, PrismaClient } from '@onyx/database';
import { type Page, type PaginationInput, toPage, toSkipTake } from '../common/pagination.js';
import { diffSnapshots } from './title-diff.js';
import {
  type Change,
  type ChangeGroup,
  RESTORABLE_GROUPS,
  type TitleSnapshot,
} from './title-snapshot.js';

/** Revisions kept per title. Older ones go when a new one is written. */
export const MAX_REVISIONS = 100;
/** Changes written out per revision. A bigger change keeps its count and is cut here. */
export const MAX_CHANGES_STORED = 300;

const SNAPSHOT_INCLUDE = {
  asset: { select: { id: true, title: true } },
  trailerAsset: { select: { id: true, title: true } },
  extras: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { assetId: true, name: true, kind: true },
  },
  genres: { select: { genre: { select: { id: true, name: true } } } },
  categories: { select: { category: { select: { id: true, name: true } } } },
  packages: { select: { package: { select: { id: true, name: true } } } },
  credits: {
    orderBy: [{ kind: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    select: { personId: true, kind: true, role: true, person: { select: { name: true } } },
  },
  translations: { select: { language: true, name: true, tagline: true, synopsis: true } },
  seasons: {
    orderBy: { number: 'asc' },
    select: {
      number: true,
      name: true,
      synopsis: true,
      episodes: {
        orderBy: { number: 'asc' },
        select: { number: true, name: true, synopsis: true, status: true, assetId: true },
      },
    },
  },
} satisfies Prisma.TitleInclude;

export interface RevisionView {
  id: string;
  /** What was done, as a word: "update", "publish", "import", "restore". */
  action: string;
  createdAt: Date;
  /** Who did it. Null for the system, or an admin who is gone. */
  admin: { id: string; displayName: string } | null;
  changes: Change[];
  /** How many things changed. More than `changes` holds when the list was cut. */
  changeCount: number;
  /** True for the first revision of a title: there is nothing to compare it with. */
  first: boolean;
}

export interface RevisionDetail extends RevisionView {
  /** What bringing this version back would change now. Empty: the title is as it was then. */
  restore: Change[];
}

export interface RestoreResult {
  /** How many things were brought back. */
  restored: number;
  /**
   * What could not be brought back, because a genre, a person or a picture
   * of that version no longer exists.
   */
  left: Change[];
}

const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * The history of titles: after every change, what the title looks like and
 * what differs from before.
 *
 * It compares whole snapshots instead of trusting each caller to say what it
 * changed. A change made through a path that does not report here is
 * therefore not lost: it shows up in the next revision.
 */
@Injectable()
export class TitleHistoryService {
  private readonly logger = new Logger(TitleHistoryService.name);

  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /** The title as history follows it, or null when it does not exist. */
  async snapshot(titleId: string): Promise<TitleSnapshot | null> {
    const title = await this.prisma.title.findUnique({
      where: { id: titleId },
      include: SNAPSHOT_INCLUDE,
    });
    if (!title) {
      return null;
    }
    return {
      v: 1,
      fields: {
        name: title.name,
        slug: title.slug,
        originalName: title.originalName,
        tagline: title.tagline,
        synopsis: title.synopsis,
        releaseYear: title.releaseYear,
        releaseDate: day(title.releaseDate),
        runtimeMinutes: title.runtimeMinutes,
        ageRating: title.ageRating,
        originalLanguage: title.originalLanguage,
        imdbId: title.imdbId,
        seriesStatus: title.seriesStatus,
        status: title.status,
        isFeatured: title.isFeatured,
        availableFrom: title.availableFrom?.toISOString() ?? null,
        availableUntil: title.availableUntil?.toISOString() ?? null,
        access: title.access,
        purchaseOnly: title.purchaseOnly,
        rentAmount: title.rentAmount,
        buyAmount: title.buyAmount,
      },
      countries: title.countries,
      studios: title.studios,
      keywords: title.keywords,
      images: { poster: title.posterId, backdrop: title.backdropId, logo: title.logoId },
      video: title.asset ? { id: title.asset.id, name: title.asset.title } : null,
      trailer: title.trailerAsset
        ? { id: title.trailerAsset.id, name: title.trailerAsset.title }
        : null,
      extras: title.extras,
      genres: title.genres.map(({ genre }) => genre).sort(byName),
      categories: title.categories.map(({ category }) => category).sort(byName),
      packages: title.packages.map((link) => link.package).sort(byName),
      credits: title.credits.map((credit) => ({
        personId: credit.personId,
        name: credit.person.name,
        kind: credit.kind,
        role: credit.role,
      })),
      translations: Object.fromEntries(
        title.translations
          .sort((a, b) => a.language.localeCompare(b.language))
          .map(({ language, ...texts }) => [language, texts]),
      ),
      seasons: title.seasons,
    };
  }

  /**
   * Writes a revision when the title differs from its last one. Call it
   * after a change. It never fails the change it follows: a problem here is
   * logged and the request goes on.
   *
   * @param action What was done, as a word for the list.
   */
  async capture(titleId: string, adminId: string | null, action: string): Promise<void> {
    try {
      await this.write(titleId, adminId, action);
    } catch (error) {
      this.logger.error(
        `Could not write the history of title ${titleId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** The same for the title a season belongs to. */
  async captureForSeason(seasonId: string, adminId: string | null, action: string): Promise<void> {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      select: { titleId: true },
    });
    if (season) {
      await this.capture(season.titleId, adminId, action);
    }
  }

  /** The same for several titles, one after the other. */
  async captureMany(
    titleIds: readonly string[],
    adminId: string | null,
    action: string,
  ): Promise<void> {
    for (const titleId of titleIds) {
      await this.capture(titleId, adminId, action);
    }
  }

  /**
   * Gives every title that has no history a first revision: the title as it
   * is. For installations that had titles before history was kept, so the
   * first change to each of them has something to be compared with.
   *
   * @returns How many titles got one.
   */
  async backfill(batchSize = 200): Promise<number> {
    let written = 0;
    for (;;) {
      const titles = await this.prisma.title.findMany({
        where: { revisions: { none: {} } },
        orderBy: { id: 'asc' },
        take: batchSize,
        select: { id: true },
      });
      if (titles.length === 0) {
        return written;
      }
      for (const title of titles) {
        await this.capture(title.id, null, 'baseline');
      }
      const left = await this.prisma.title.count({
        where: { id: { in: titles.map((title) => title.id) }, revisions: { none: {} } },
      });
      written += titles.length - left;
      // Titles whose revision cannot be written would otherwise be tried for ever.
      if (left === titles.length) {
        return written;
      }
    }
  }

  private async write(titleId: string, adminId: string | null, action: string): Promise<void> {
    const snapshot = await this.snapshot(titleId);
    if (!snapshot) {
      return;
    }
    const last = await this.prisma.titleRevision.findFirst({
      where: { titleId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { snapshot: true },
    });
    const changes = last ? diffSnapshots(last.snapshot as unknown as TitleSnapshot, snapshot) : [];
    if (last && changes.length === 0) {
      return;
    }
    await this.prisma.titleRevision.create({
      data: {
        titleId,
        adminId,
        action,
        changes: changes.slice(0, MAX_CHANGES_STORED) as unknown as Prisma.InputJsonValue,
        changeCount: changes.length,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prune(titleId);
  }

  /** Removes the revisions of a title beyond the newest hundred. */
  private async prune(titleId: string): Promise<void> {
    const beyond = await this.prisma.titleRevision.findMany({
      where: { titleId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: MAX_REVISIONS,
      select: { id: true },
    });
    if (beyond.length > 0) {
      await this.prisma.titleRevision.deleteMany({
        where: { id: { in: beyond.map((revision) => revision.id) } },
      });
    }
  }

  private async assertTitle(titleId: string): Promise<void> {
    if ((await this.prisma.title.count({ where: { id: titleId } })) === 0) {
      throw new NotFoundException('Title not found');
    }
  }

  /** The revisions of a title, the newest first. */
  async list(
    titleId: string,
    input: PaginationInput & { group?: ChangeGroup | undefined },
  ): Promise<Page<RevisionView>> {
    await this.assertTitle(titleId);
    // The group is looked for inside the stored list of changes.
    const where: Prisma.TitleRevisionWhereInput = {
      titleId,
      ...(input.group ? { changes: { array_contains: [{ group: input.group }] } } : {}),
    };
    const [revisions, total, oldest] = await Promise.all([
      this.prisma.titleRevision.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          action: true,
          createdAt: true,
          changes: true,
          changeCount: true,
          admin: { select: { id: true, displayName: true } },
        },
        ...toSkipTake(input),
      }),
      this.prisma.titleRevision.count({ where }),
      this.prisma.titleRevision.findFirst({
        where: { titleId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
    ]);
    return toPage(
      revisions.map((revision) => ({
        id: revision.id,
        action: revision.action,
        createdAt: revision.createdAt,
        admin: revision.admin,
        changes: revision.changes as unknown as Change[],
        changeCount: revision.changeCount,
        first: revision.id === oldest?.id,
      })),
      total,
      input,
    );
  }

  /**
   * One revision, with what bringing it back would change now.
   *
   * @throws NotFoundException
   */
  async get(titleId: string, revisionId: string): Promise<RevisionDetail> {
    const [revision, current, oldest] = await Promise.all([
      this.prisma.titleRevision.findFirst({
        where: { id: revisionId, titleId },
        include: { admin: { select: { id: true, displayName: true } } },
      }),
      this.snapshot(titleId),
      this.prisma.titleRevision.findFirst({
        where: { titleId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
    ]);
    if (!revision || !current) {
      throw new NotFoundException('This version of the title does not exist');
    }
    return {
      id: revision.id,
      action: revision.action,
      createdAt: revision.createdAt,
      admin: revision.admin,
      changes: revision.changes as unknown as Change[],
      changeCount: revision.changeCount,
      first: revision.id === oldest?.id,
      restore: this.restorePlan(current, revision.snapshot as unknown as TitleSnapshot),
    };
  }

  /** What differs between now and a version, as far as a restore reaches. */
  private restorePlan(current: TitleSnapshot, target: TitleSnapshot): Change[] {
    return diffSnapshots(current, target).filter((change) =>
      RESTORABLE_GROUPS.includes(change.group),
    );
  }

  /**
   * Brings a version of a title back: its texts, facts, access and prices,
   * artwork, genres, categories and keywords, people and translations.
   *
   * Whether it is published, its address, its videos and its seasons and
   * episodes stay as they are: bringing those back could take a title off
   * the site or point it at a video that is gone. What of that version no
   * longer exists (a deleted genre, person or picture) is left out and
   * reported.
   *
   * @throws NotFoundException
   */
  async restore(
    titleId: string,
    revisionId: string,
    adminId: string | null,
  ): Promise<RestoreResult> {
    const [revision, current] = await Promise.all([
      this.prisma.titleRevision.findFirst({ where: { id: revisionId, titleId } }),
      this.snapshot(titleId),
    ]);
    if (!revision || !current) {
      throw new NotFoundException('This version of the title does not exist');
    }
    const target = revision.snapshot as unknown as TitleSnapshot;
    const plan = this.restorePlan(current, target);
    if (plan.length === 0) {
      return { restored: 0, left: [] };
    }

    const ids = <T extends { id: string }>(rows: T[]) => rows.map((row) => row.id);
    const wantedImages = Object.values(target.images).filter((id): id is string => id !== null);
    const [genres, categories, packages, people, images] = await Promise.all([
      this.prisma.genre.findMany({
        where: { id: { in: ids(target.genres) } },
        select: { id: true },
      }),
      this.prisma.category.findMany({
        where: { id: { in: ids(target.categories) } },
        select: { id: true },
      }),
      this.prisma.package.findMany({
        where: { id: { in: ids(target.packages) } },
        select: { id: true },
      }),
      this.prisma.person.findMany({
        where: { id: { in: target.credits.map((credit) => credit.personId) } },
        select: { id: true },
      }),
      this.prisma.image.findMany({ where: { id: { in: wantedImages } }, select: { id: true } }),
    ]);
    const exists = (rows: { id: string }[], id: string) => rows.some((row) => row.id === id);
    /** A picture of then when it is still there, otherwise the one of now. */
    const picture = (key: keyof TitleSnapshot['images']): string | null => {
      const id = target.images[key];
      return id === null || exists(images, id) ? id : current.images[key];
    };
    const credits = target.credits.filter((credit) => exists(people, credit.personId));
    const fields = target.fields;

    await this.prisma.$transaction(async (tx) => {
      await tx.title.update({
        where: { id: titleId },
        data: {
          name: fields.name,
          originalName: fields.originalName,
          tagline: fields.tagline,
          synopsis: fields.synopsis,
          releaseYear: fields.releaseYear,
          releaseDate: fields.releaseDate ? new Date(fields.releaseDate) : null,
          runtimeMinutes: fields.runtimeMinutes,
          ageRating: fields.ageRating,
          originalLanguage: fields.originalLanguage,
          imdbId: fields.imdbId,
          seriesStatus: fields.seriesStatus as never,
          access: fields.access as never,
          purchaseOnly: fields.purchaseOnly,
          rentAmount: fields.rentAmount,
          buyAmount: fields.buyAmount,
          countries: target.countries,
          studios: target.studios,
          keywords: target.keywords,
          posterId: picture('poster'),
          backdropId: picture('backdrop'),
          logoId: picture('logo'),
        },
      });
      await tx.titleGenre.deleteMany({ where: { titleId } });
      await tx.titleGenre.createMany({
        data: genres.map((genre) => ({ titleId, genreId: genre.id })),
      });
      await tx.titleCategory.deleteMany({ where: { titleId } });
      await tx.titleCategory.createMany({
        data: categories.map((category) => ({ titleId, categoryId: category.id })),
      });
      await tx.titlePackage.deleteMany({ where: { titleId } });
      await tx.titlePackage.createMany({
        data: packages.map((entry) => ({ titleId, packageId: entry.id })),
      });
      await tx.credit.deleteMany({ where: { titleId } });
      const position = { CAST: 0, CREW: 0 };
      await tx.credit.createMany({
        data: credits.map((credit) => ({
          titleId,
          personId: credit.personId,
          kind: credit.kind,
          role: credit.role,
          position: position[credit.kind]++,
        })),
      });
      // The texts of the title in each language. Those of seasons and episodes stay.
      await tx.titleTranslation.deleteMany({
        where: { titleId, language: { notIn: Object.keys(target.translations) } },
      });
      for (const [language, texts] of Object.entries(target.translations)) {
        await tx.titleTranslation.upsert({
          where: { titleId_language: { titleId, language } },
          create: { titleId, language, ...texts },
          update: texts,
        });
      }
    });

    await this.capture(titleId, adminId, 'restore');
    const after = await this.snapshot(titleId);
    const left = after ? this.restorePlan(after, target) : [];
    return { restored: plan.length - left.length, left };
  }
}
