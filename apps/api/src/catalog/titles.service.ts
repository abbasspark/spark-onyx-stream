// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@onyx/database';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { AppConfig } from '../config/app-config.js';
import type {
  CreateEpisodeInput,
  CreateSeasonInput,
  CreateTitleInput,
  ListTitlesInput,
  SetStatusInput,
  UpdateEpisodeInput,
  UpdateSeasonInput,
  UpdateTitleInput,
} from './catalog.schemas.js';
import {
  buildChecklist,
  type EpisodeView,
  type TitleDetail,
  type TitleDetailRecord,
  type TitleSummary,
  toEpisodeView,
  toTitleDetail,
  toTitleSummary,
} from './catalog.views.js';
import { availableAt, isPlayable, PLAYABLE_ASSET, visibleTitle } from './playable.js';
import { slugify, uniqueSlug } from './slug.js';

const SUMMARY_INCLUDE = {
  poster: true,
  asset: true,
  categories: { include: { category: true } },
  genres: { include: { genre: true } },
  packages: { include: { package: { select: { id: true, name: true, position: true } } } },
  seasons: { select: { _count: { select: { episodes: true } } } },
} satisfies Prisma.TitleInclude;

const DETAIL_INCLUDE = {
  poster: true,
  backdrop: true,
  logo: true,
  asset: true,
  trailerAsset: true,
  categories: { include: { category: true } },
  genres: { include: { genre: true } },
  credits: { include: { person: { include: { portrait: true } } } },
  extras: { include: { asset: true } },
  translations: { select: { language: true } },
  collections: { include: { collection: { select: { id: true, name: true } } } },
  packages: { include: { package: { select: { id: true, name: true, position: true } } } },
  seasons: { include: { poster: true, episodes: { include: { asset: true, still: true } } } },
} satisfies Prisma.TitleInclude;

/** Sort fields that can be empty. Titles without a value come last in either direction. */
const NULLABLE_SORT_FIELDS: readonly ListTitlesInput['sort'][] = [
  'releaseYear',
  'publishedAt',
  'releaseDate',
  'rating',
  'runtimeMinutes',
];

/** Titles by the dates they are shown between. "current" also holds titles without dates. */
function availabilityFilter(which: NonNullable<ListTitlesInput['availability']>) {
  const now = new Date();
  if (which === 'scheduled') {
    return { availableFrom: { gt: now } } satisfies Prisma.TitleWhereInput;
  }
  if (which === 'ended') {
    return { availableUntil: { lte: now } } satisfies Prisma.TitleWhereInput;
  }
  return { AND: availableAt(now) } satisfies Prisma.TitleWhereInput;
}

/** An episode without a video that plays. */
const EPISODE_WITHOUT_VIDEO = {
  OR: [{ assetId: null }, { asset: { NOT: PLAYABLE_ASSET } }],
} satisfies Prisma.EpisodeWhereInput;

/** Titles by whether their video is there. See "video" in the list schema. */
const VIDEO_FILTER = {
  ready: {
    OR: [
      { type: 'MOVIE', asset: PLAYABLE_ASSET },
      {
        type: 'SERIES',
        seasons: { some: { episodes: { some: {} } } },
        NOT: { seasons: { some: { episodes: { some: EPISODE_WITHOUT_VIDEO } } } },
      },
    ],
  },
  missing: {
    OR: [
      { type: 'MOVIE', OR: [{ assetId: null }, { asset: { NOT: PLAYABLE_ASSET } }] },
      {
        type: 'SERIES',
        OR: [
          { seasons: { none: { episodes: { some: {} } } } },
          { seasons: { some: { episodes: { some: EPISODE_WITHOUT_VIDEO } } } },
        ],
      },
    ],
  },
} satisfies Record<'ready' | 'missing', Prisma.TitleWhereInput>;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Titles of the catalog with their seasons and episodes. */
@Injectable()
export class TitlesService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  // --- Titles ----------------------------------------------------------------

  async list(input: ListTitlesInput): Promise<Page<TitleSummary>> {
    const where: Prisma.TitleWhereInput = {
      type: input.type,
      status: input.status,
      access: input.access,
      seriesStatus: input.seriesStatus,
      ...(input.categoryId ? { categories: { some: { categoryId: input.categoryId } } } : {}),
      ...(input.genreId ? { genres: { some: { genreId: input.genreId } } } : {}),
      ...(input.personId ? { credits: { some: { personId: input.personId } } } : {}),
      ...(input.video || input.availability
        ? {
            AND: [
              ...(input.video ? [VIDEO_FILTER[input.video]] : []),
              ...(input.availability ? [availabilityFilter(input.availability)] : []),
            ],
          }
        : {}),
      ...(input.collectionId
        ? { collections: { some: { collectionId: input.collectionId } } }
        : {}),
      ...(input.packageId ? { packages: { some: { packageId: input.packageId } } } : {}),
      ...(input.packaged === 'none' ? { access: 'PAID', packages: { none: {} } } : {}),
      ...(input.q
        ? {
            OR: [
              { name: { contains: input.q, mode: 'insensitive' } },
              { originalName: { contains: input.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.TitleOrderByWithRelationInput = NULLABLE_SORT_FIELDS.includes(input.sort)
      ? { [input.sort]: { sort: input.order, nulls: 'last' } }
      : { [input.sort]: input.order };

    const [titles, total] = await Promise.all([
      this.prisma.title.findMany({
        where,
        // The id breaks ties, so paging stays stable when many rows share a value.
        orderBy: [orderBy, { id: 'desc' }],
        include: SUMMARY_INCLUDE,
        ...toSkipTake(input),
      }),
      this.prisma.title.count({ where }),
    ]);

    // Which of the published titles on this page viewers can actually see.
    const published = titles.filter((title) => title.status === 'PUBLISHED');
    const visible = new Set(
      published.length === 0
        ? []
        : (
            await this.prisma.title.findMany({
              where: { id: { in: published.map((title) => title.id) }, ...visibleTitle() },
              select: { id: true },
            })
          ).map((title) => title.id),
    );

    const ready = await this.readyEpisodes(
      titles.filter((title) => title.type === 'SERIES').map((title) => title.id),
    );

    return toPage(
      titles.map((title) =>
        toTitleSummary(
          title,
          this.config.mediaBaseUrl,
          visible.has(title.id),
          ready.get(title.id) ?? 0,
        ),
      ),
      total,
      input,
    );
  }

  /** How many episodes of each series have a video that plays. */
  private async readyEpisodes(titleIds: readonly string[]): Promise<Map<string, number>> {
    if (titleIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.$queryRaw<{ titleId: string; ready: number }[]>`
      SELECT s."titleId", count(*)::int AS ready
      FROM episodes e
      JOIN seasons s ON s.id = e."seasonId"
      JOIN assets a ON a.id = e."assetId"
      WHERE s."titleId" = ANY(${[...titleIds]}::uuid[])
        AND a.status = 'READY' AND a."manifestPath" IS NOT NULL
      GROUP BY s."titleId"`;
    return new Map(rows.map((row) => [row.titleId, row.ready]));
  }

  async get(id: string): Promise<TitleDetail> {
    return toTitleDetail(await this.findOrThrow(id), this.config.mediaBaseUrl);
  }

  async create(input: CreateTitleInput, adminId: string | null): Promise<TitleDetail> {
    const slug =
      input.slug ?? (await uniqueSlug(slugify(input.name), (value) => this.slugTaken(value)));
    try {
      const title = await this.prisma.title.create({
        data: { type: input.type, name: input.name, slug, createdById: adminId },
        include: DETAIL_INCLUDE,
      });
      return toTitleDetail(title, this.config.mediaBaseUrl);
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('Another title already uses this slug')
        : error;
    }
  }

  async update(id: string, input: UpdateTitleInput): Promise<TitleDetail> {
    const current = await this.findOrThrow(id);
    const { categoryIds, packageIds, genreIds, collectionIds, releaseDate, ...fields } = input;
    const data: Prisma.TitleUncheckedUpdateInput = {
      ...fields,
      ...(releaseDate !== undefined
        ? { releaseDate: releaseDate ? new Date(`${releaseDate}T00:00:00Z`) : null }
        : {}),
    };
    // The two dates are checked together, also when only one of them is sent.
    const from = fields.availableFrom === undefined ? current.availableFrom : fields.availableFrom;
    const until =
      fields.availableUntil === undefined ? current.availableUntil : fields.availableUntil;
    if (from && until && new Date(until) <= new Date(from)) {
      throw new BadRequestException('The end of the availability must come after its start');
    }
    if (collectionIds) {
      const found = await this.prisma.collection.count({ where: { id: { in: collectionIds } } });
      if (found !== new Set(collectionIds).size) {
        throw new BadRequestException('One of the chosen collections does not exist');
      }
    }
    if (current.type === 'MOVIE' && fields.seriesStatus) {
      throw new BadRequestException('Only a series is running or ended. This title is a movie');
    }
    if (genreIds) {
      const found = await this.prisma.genre.count({ where: { id: { in: genreIds } } });
      if (found !== new Set(genreIds).size) {
        throw new BadRequestException('One of the chosen genres does not exist');
      }
    }

    if (current.type === 'SERIES' && fields.assetId) {
      throw new BadRequestException(
        'A series has no video of its own. Attach videos to its episodes',
      );
    }
    await this.assertAssets([fields.assetId, fields.trailerAssetId]);
    await this.assertImages([fields.posterId, fields.backdropId, fields.logoId]);
    if (categoryIds) {
      const found = await this.prisma.category.count({ where: { id: { in: categoryIds } } });
      if (found !== new Set(categoryIds).size) {
        throw new BadRequestException('One of the chosen categories does not exist');
      }
    }

    const after = { ...current, ...fields };
    if (after.purchaseOnly && after.rentAmount === null && after.buyAmount === null) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        issues: [
          {
            field: 'purchaseOnly',
            message: 'Set a price for renting or buying, or nobody could watch the title',
          },
        ],
      });
    }
    if (packageIds) {
      const found = await this.prisma.package.count({ where: { id: { in: packageIds } } });
      if (found !== new Set(packageIds).size) {
        throw new BadRequestException('One of the chosen packages does not exist');
      }
    }

    // A published movie must stay playable, so its video can only be swapped for one that is ready.
    if (
      current.status === 'PUBLISHED' &&
      current.type === 'MOVIE' &&
      fields.assetId !== undefined
    ) {
      if (fields.assetId === null) {
        throw new ConflictException('Unpublish the title before removing its video');
      }
      const next = await this.prisma.asset.findUnique({ where: { id: fields.assetId } });
      if (!isPlayable(next)) {
        throw new ConflictException(
          'A published title can only get a video that is processed and ready to play',
        );
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.title.update({ where: { id }, data });
        if (genreIds) {
          await tx.titleGenre.deleteMany({ where: { titleId: id } });
          await tx.titleGenre.createMany({
            data: [...new Set(genreIds)].map((genreId) => ({ titleId: id, genreId })),
          });
        }
        if (collectionIds) {
          // A title keeps its place in the collections it stays in, and goes to the end of new ones.
          const wanted = [...new Set(collectionIds)];
          await tx.collectionTitle.deleteMany({
            where: { titleId: id, collectionId: { notIn: wanted } },
          });
          const kept = await tx.collectionTitle.findMany({
            where: { titleId: id },
            select: { collectionId: true },
          });
          const has = new Set(kept.map((row) => row.collectionId));
          for (const collectionId of wanted.filter((value) => !has.has(value))) {
            const last = await tx.collectionTitle.aggregate({
              where: { collectionId },
              _max: { position: true },
            });
            await tx.collectionTitle.create({
              data: { collectionId, titleId: id, position: (last._max.position ?? -1) + 1 },
            });
          }
        }
        if (categoryIds) {
          await tx.titleCategory.deleteMany({ where: { titleId: id } });
          await tx.titleCategory.createMany({
            data: [...new Set(categoryIds)].map((categoryId) => ({ titleId: id, categoryId })),
          });
        }
        if (packageIds) {
          await tx.titlePackage.deleteMany({ where: { titleId: id } });
          await tx.titlePackage.createMany({
            data: [...new Set(packageIds)].map((packageId) => ({ titleId: id, packageId })),
          });
        }
      });
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('Another title already uses this slug')
        : error;
    }

    return this.get(id);
  }

  /**
   * Publishes, unpublishes or archives a title.
   *
   * @throws ConflictException when a required point of the checklist is still open.
   */
  async setStatus(id: string, input: SetStatusInput): Promise<TitleDetail> {
    const title = await this.findOrThrow(id);
    if (title.status === input.status) {
      return toTitleDetail(title, this.config.mediaBaseUrl);
    }
    if (input.status === 'PUBLISHED') {
      this.assertPublishable(title);
    }

    await this.prisma.title.update({
      where: { id },
      data: {
        status: input.status,
        // The first publication date is kept when a title is published again.
        publishedAt: input.status === 'PUBLISHED' ? (title.publishedAt ?? new Date()) : undefined,
      },
    });
    return this.get(id);
  }

  /** Deletes a title with its seasons and episodes. The videos stay in the library. */
  async remove(id: string): Promise<TitleDetail> {
    const title = await this.findOrThrow(id);
    if (title.status === 'PUBLISHED') {
      throw new ConflictException('Unpublish the title before deleting it');
    }
    await this.prisma.title.delete({ where: { id } });
    return toTitleDetail(title, this.config.mediaBaseUrl);
  }

  // --- Seasons ------------------------------------------------------------------

  async createSeason(titleId: string, input: CreateSeasonInput): Promise<TitleDetail> {
    const title = await this.findOrThrow(titleId);
    if (title.type !== 'SERIES') {
      throw new BadRequestException('Only a series has seasons');
    }
    const highest = Math.max(0, ...title.seasons.map((season) => season.number));

    try {
      await this.prisma.season.create({
        data: {
          titleId,
          number: input.number ?? highest + 1,
          name: input.name ?? null,
          synopsis: input.synopsis ?? null,
        },
      });
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('This series already has a season with that number')
        : error;
    }
    return this.get(titleId);
  }

  async updateSeason(seasonId: string, input: UpdateSeasonInput): Promise<TitleDetail> {
    const season = await this.findSeasonOrThrow(seasonId);
    await this.assertImages([input.posterId]);
    const { airDate, ...fields } = input;
    try {
      await this.prisma.season.update({
        where: { id: seasonId },
        data: {
          ...fields,
          ...(airDate !== undefined
            ? { airDate: airDate ? new Date(`${airDate}T00:00:00Z`) : null }
            : {}),
        },
      });
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('This series already has a season with that number')
        : error;
    }
    return this.get(season.titleId);
  }

  async removeSeason(seasonId: string): Promise<TitleDetail> {
    const season = await this.findSeasonOrThrow(seasonId);
    await this.prisma.season.delete({ where: { id: seasonId } });
    return this.afterEpisodeChange(season.titleId);
  }

  // --- Episodes -----------------------------------------------------------------

  async createEpisode(seasonId: string, input: CreateEpisodeInput): Promise<EpisodeView> {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      include: { episodes: { select: { number: true } } },
    });
    if (!season) {
      throw new NotFoundException('Season not found');
    }
    await this.assertAssets([input.assetId]);
    const highest = Math.max(0, ...season.episodes.map((episode) => episode.number));

    try {
      const episode = await this.prisma.episode.create({
        data: {
          seasonId,
          number: input.number ?? highest + 1,
          name: input.name,
          synopsis: input.synopsis ?? null,
          assetId: input.assetId ?? null,
        },
        include: { asset: true, still: true },
      });
      return toEpisodeView(episode, this.config.mediaBaseUrl);
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('This season already has an episode with that number')
        : error;
    }
  }

  async updateEpisode(episodeId: string, input: UpdateEpisodeInput): Promise<EpisodeView> {
    const current = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: { asset: true, season: true },
    });
    if (!current) {
      throw new NotFoundException('Episode not found');
    }
    await this.assertAssets([input.assetId]);
    await this.assertImages([input.stillId]);

    // What the episode will look like after this change decides whether it may be published.
    const nextStatus = input.status ?? current.status;
    const nextAssetId = input.assetId === undefined ? current.assetId : input.assetId;
    if (nextStatus === 'PUBLISHED') {
      const asset = nextAssetId
        ? await this.prisma.asset.findUnique({ where: { id: nextAssetId } })
        : null;
      if (!asset || !isPlayable(asset)) {
        throw new ConflictException(
          asset
            ? 'The episode cannot be published before its video is processed and ready'
            : 'The episode cannot be published without a video',
        );
      }
    }

    try {
      const episode = await this.prisma.episode.update({
        where: { id: episodeId },
        data: {
          ...input,
          airDate:
            input.airDate === undefined
              ? undefined
              : input.airDate
                ? new Date(`${input.airDate}T00:00:00Z`)
                : null,
          publishedAt:
            input.status === 'PUBLISHED' ? (current.publishedAt ?? new Date()) : undefined,
        },
        include: { asset: true, still: true },
      });
      await this.afterEpisodeChange(current.season.titleId);
      return toEpisodeView(episode, this.config.mediaBaseUrl);
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('This season already has an episode with that number')
        : error;
    }
  }

  async removeEpisode(episodeId: string): Promise<TitleDetail> {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: { season: true },
    });
    if (!episode) {
      throw new NotFoundException('Episode not found');
    }
    await this.prisma.episode.delete({ where: { id: episodeId } });
    return this.afterEpisodeChange(episode.season.titleId);
  }

  // --- Helpers --------------------------------------------------------------------

  /**
   * A published series must keep at least one published episode. When the
   * last one is unpublished or deleted, the series goes back to draft.
   */
  private async afterEpisodeChange(titleId: string): Promise<TitleDetail> {
    const title = await this.findOrThrow(titleId);
    const stillPublishable = buildChecklist(title).every((item) => !item.required || item.done);
    if (title.status === 'PUBLISHED' && !stillPublishable) {
      await this.prisma.title.update({ where: { id: titleId }, data: { status: 'DRAFT' } });
      return this.get(titleId);
    }
    return toTitleDetail(title, this.config.mediaBaseUrl);
  }

  private assertPublishable(title: TitleDetailRecord): void {
    const missing = buildChecklist(title).filter((item) => item.required && !item.done);
    if (missing.length > 0) {
      throw new ConflictException(
        `The title cannot be published yet. Missing: ${missing.map((item) => item.label.toLowerCase()).join('; ')}`,
      );
    }
  }

  private async assertAssets(ids: (string | null | undefined)[]): Promise<void> {
    const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
    if (wanted.length === 0) {
      return;
    }
    const found = await this.prisma.asset.count({
      where: { id: { in: wanted }, status: { not: 'DELETED' } },
    });
    if (found !== wanted.length) {
      throw new BadRequestException('The chosen video does not exist');
    }
  }

  private async assertImages(ids: (string | null | undefined)[]): Promise<void> {
    const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
    if (wanted.length === 0) {
      return;
    }
    const found = await this.prisma.image.count({ where: { id: { in: wanted } } });
    if (found !== wanted.length) {
      throw new BadRequestException('The chosen picture does not exist');
    }
  }

  private async findOrThrow(id: string): Promise<TitleDetailRecord> {
    const title = await this.prisma.title.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    return title;
  }

  private async findSeasonOrThrow(id: string): Promise<{ id: string; titleId: string }> {
    const season = await this.prisma.season.findUnique({ where: { id } });
    if (!season) {
      throw new NotFoundException('Season not found');
    }
    return season;
  }

  private async slugTaken(slug: string): Promise<boolean> {
    return (await this.prisma.title.count({ where: { slug } })) > 0;
  }
}
