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
import { isPlayable, VISIBLE_TITLE } from './playable.js';
import { slugify, uniqueSlug } from './slug.js';

const SUMMARY_INCLUDE = {
  poster: true,
  asset: true,
  categories: { include: { category: true } },
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
  packages: { include: { package: { select: { id: true, name: true, position: true } } } },
  seasons: { include: { episodes: { include: { asset: true, still: true } } } },
} satisfies Prisma.TitleInclude;

/** Sort fields that can be empty. Titles without a value come last in either direction. */
const NULLABLE_SORT_FIELDS: readonly ListTitlesInput['sort'][] = ['releaseYear', 'publishedAt'];

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
      ...(input.categoryId ? { categories: { some: { categoryId: input.categoryId } } } : {}),
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
              where: { id: { in: published.map((title) => title.id) }, ...VISIBLE_TITLE },
              select: { id: true },
            })
          ).map((title) => title.id),
    );

    return toPage(
      titles.map((title) => toTitleSummary(title, this.config.mediaBaseUrl, visible.has(title.id))),
      total,
      input,
    );
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
    const { categoryIds, packageIds, ...fields } = input;

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
        await tx.title.update({ where: { id }, data: fields });
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
    try {
      await this.prisma.season.update({ where: { id: seasonId }, data: input });
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
