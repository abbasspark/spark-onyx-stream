// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma, PrismaClient } from '@onyx/database';
import type { TitleDetail } from './catalog.views.js';
import { slugify, uniqueSlug } from './slug.js';
import { copyName, type DuplicateReport, type DuplicateTitleInput } from './title-duplicate.js';
import { TitlesService } from './titles.service.js';

const SOURCE_INCLUDE = {
  genres: true,
  categories: true,
  collections: true,
  packages: true,
  credits: true,
  extras: true,
  translations: true,
  seasons: {
    orderBy: { number: 'asc' },
    include: {
      translations: true,
      episodes: { orderBy: { number: 'asc' }, include: { translations: true } },
    },
  },
} satisfies Prisma.TitleInclude;

export interface DuplicateResult {
  title: TitleDetail;
  copied: DuplicateReport;
}

/** How long the copy of a long series may take before it is given up, in milliseconds. */
const COPY_TIMEOUT_MS = 60_000;

/**
 * Makes a copy of a title: a draft with a name and an address of its own.
 *
 * Videos and pictures are never copied as files: the copy points at the same
 * ones, which costs no storage and no encoding. What belongs to viewers
 * (plays, progress, purchases, lists) and where the title stands on the
 * arranged pages stays with the original.
 */
@Injectable()
export class TitleDuplicateService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(TitlesService) private readonly titles: TitlesService,
  ) {}

  /** @throws NotFoundException */
  async duplicate(
    id: string,
    input: DuplicateTitleInput,
    adminId: string | null,
  ): Promise<DuplicateResult> {
    const source = await this.prisma.title.findUnique({
      where: { id },
      include: SOURCE_INCLUDE,
    });
    if (!source) {
      throw new NotFoundException('Title not found');
    }
    const { parts } = input;
    const name = input.name ?? copyName(source.name);
    const slug = await uniqueSlug(
      slugify(name),
      async (value) => (await this.prisma.title.count({ where: { slug: value } })) > 0,
    );
    const withSeasons = source.type === 'SERIES' && parts.seasons !== 'none';
    const withEpisodeVideos = parts.seasons === 'full';
    const copied: DuplicateReport = {
      genres: 0,
      categories: 0,
      collections: 0,
      credits: 0,
      translations: 0,
      packages: 0,
      extras: 0,
      seasons: 0,
      episodes: 0,
      videos: 0,
    };

    const copyId = await this.prisma.$transaction(
      async (tx) => {
        const title = await tx.title.create({
          data: {
            type: source.type,
            name,
            slug,
            // Always a draft that nothing features: a copy is published on purpose.
            status: 'DRAFT',
            isFeatured: false,
            createdById: adminId,
            originalName: source.originalName,
            tagline: source.tagline,
            synopsis: source.synopsis,
            releaseYear: source.releaseYear,
            ageRating: source.ageRating,
            originalLanguage: source.originalLanguage,
            releaseDate: source.releaseDate,
            runtimeMinutes: source.runtimeMinutes,
            countries: source.countries,
            studios: source.studios,
            imdbId: source.imdbId,
            rating: source.rating,
            ratingCount: source.ratingCount,
            seriesStatus: source.seriesStatus,
            lastAirDate: source.lastAirDate,
            ...(parts.classification ? { keywords: source.keywords } : {}),
            ...(parts.artwork
              ? { posterId: source.posterId, backdropId: source.backdropId, logoId: source.logoId }
              : {}),
            ...(parts.pricing
              ? {
                  access: source.access,
                  rentAmount: source.rentAmount,
                  buyAmount: source.buyAmount,
                  purchaseOnly: source.purchaseOnly,
                }
              : {}),
            ...(parts.availability
              ? { availableFrom: source.availableFrom, availableUntil: source.availableUntil }
              : {}),
            ...(parts.videos
              ? { assetId: source.assetId, trailerAssetId: source.trailerAssetId }
              : {}),
            ...(parts.metadataLink
              ? {
                  metadataSource: source.metadataSource,
                  metadataId: source.metadataId,
                  metadataLanguage: source.metadataLanguage,
                  metadataSyncedAt: source.metadataSyncedAt,
                }
              : {}),
          },
          select: { id: true },
        });
        const titleId = title.id;

        if (parts.videos) {
          copied.videos += (source.assetId ? 1 : 0) + (source.trailerAssetId ? 1 : 0);
          if (source.extras.length > 0) {
            await tx.titleExtra.createMany({
              data: source.extras.map((extra) => ({
                titleId,
                kind: extra.kind,
                name: extra.name,
                assetId: extra.assetId,
                position: extra.position,
              })),
            });
            copied.extras = source.extras.length;
            copied.videos += source.extras.length;
          }
        }

        if (parts.classification) {
          await tx.titleGenre.createMany({
            data: source.genres.map(({ genreId }) => ({ titleId, genreId })),
          });
          await tx.titleCategory.createMany({
            data: source.categories.map(({ categoryId }) => ({ titleId, categoryId })),
          });
          copied.genres = source.genres.length;
          copied.categories = source.categories.length;
        }

        if (parts.pricing && source.packages.length > 0) {
          await tx.titlePackage.createMany({
            data: source.packages.map(({ packageId }) => ({ titleId, packageId })),
          });
          copied.packages = source.packages.length;
        }

        if (parts.credits && source.credits.length > 0) {
          await tx.credit.createMany({
            data: source.credits.map((credit) => ({
              titleId,
              personId: credit.personId,
              kind: credit.kind,
              role: credit.role,
              position: credit.position,
            })),
          });
          copied.credits = source.credits.length;
        }

        if (parts.translations && source.translations.length > 0) {
          await tx.titleTranslation.createMany({
            data: source.translations.map((translation) => ({
              titleId,
              language: translation.language,
              name: translation.name,
              tagline: translation.tagline,
              synopsis: translation.synopsis,
            })),
          });
          copied.translations = source.translations.length;
        }

        if (parts.collections && source.collections.length > 0) {
          // The copy goes to the end of each collection: its order is somebody's work.
          const ends = await tx.collectionTitle.groupBy({
            by: ['collectionId'],
            where: { collectionId: { in: source.collections.map((link) => link.collectionId) } },
            _max: { position: true },
          });
          await tx.collectionTitle.createMany({
            data: source.collections.map(({ collectionId }) => ({
              collectionId,
              titleId,
              position:
                (ends.find((end) => end.collectionId === collectionId)?._max.position ?? -1) + 1,
            })),
          });
          copied.collections = source.collections.length;
        }

        if (withSeasons) {
          for (const season of source.seasons) {
            const created = await tx.season.create({
              data: {
                titleId,
                number: season.number,
                name: season.name,
                synopsis: season.synopsis,
                airDate: season.airDate,
                posterId: parts.artwork ? season.posterId : null,
              },
              select: { id: true },
            });
            copied.seasons += 1;
            if (parts.translations && season.translations.length > 0) {
              await tx.seasonTranslation.createMany({
                data: season.translations.map((translation) => ({
                  seasonId: created.id,
                  language: translation.language,
                  name: translation.name,
                  synopsis: translation.synopsis,
                })),
              });
            }
            if (season.episodes.length === 0) {
              continue;
            }
            const episodes = await tx.episode.createManyAndReturn({
              data: season.episodes.map((episode) => ({
                seasonId: created.id,
                number: episode.number,
                name: episode.name,
                synopsis: episode.synopsis,
                airDate: episode.airDate,
                runtimeMinutes: episode.runtimeMinutes,
                assetId: withEpisodeVideos ? episode.assetId : null,
                stillId: parts.artwork ? episode.stillId : null,
                // Drafts, like the title: each is published when the copy is.
                status: 'DRAFT' as const,
              })),
              select: { id: true, number: true },
            });
            copied.episodes += episodes.length;
            if (withEpisodeVideos) {
              copied.videos += season.episodes.filter((episode) => episode.assetId).length;
            }
            if (parts.translations) {
              const idOf = new Map(episodes.map((episode) => [episode.number, episode.id]));
              const rows = season.episodes.flatMap((episode) =>
                episode.translations.map((translation) => ({
                  episodeId: idOf.get(episode.number) as string,
                  language: translation.language,
                  name: translation.name,
                  synopsis: translation.synopsis,
                })),
              );
              if (rows.length > 0) {
                await tx.episodeTranslation.createMany({ data: rows });
              }
            }
          }
        }
        return titleId;
      },
      { timeout: COPY_TIMEOUT_MS },
    );

    return { title: await this.titles.get(copyId), copied };
  }
}
