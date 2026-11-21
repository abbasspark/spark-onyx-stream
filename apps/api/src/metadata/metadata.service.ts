// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type ImageKind, type Prisma, PrismaClient } from '@onyx/database';
import { CategoriesService } from '../catalog/categories.service.js';
import { ImagesService, MAX_IMAGE_BYTES } from '../catalog/images.service.js';
import { slugify } from '../catalog/slug.js';
import { TitlesService } from '../catalog/titles.service.js';
import { AppConfig } from '../config/app-config.js';
import type {
  ApplyMetadataInput,
  ImportMetadataInput,
  MetadataParts,
  PreviewMetadataInput,
  SearchMetadataInput,
} from './metadata.schemas.js';
import {
  type ImportedText,
  type ImportedTitle,
  type ImportReport,
  type ImportResult,
  METADATA_SOURCE,
  type MetadataPreview,
  type MetadataSearchResult,
  type MetadataStatus,
} from './metadata.types.js';
import { TmdbClient } from './tmdb.client.js';
import {
  episodesOf,
  type ImportedEpisode,
  kindOf,
  parseMetadataId,
  seasonNameOf,
  toImportedTitle,
  toSearchResult,
} from './tmdb.mapper.js';

/** Results offered to pick from. More than a screen of them helps nobody. */
const MAX_RESULTS = 12;
/** Stills downloaded at the same time. Polite to the source, and quick enough. */
const DOWNLOADS_AT_ONCE = 5;

/**
 * Sizes TMDB serves each kind of picture in, the wanted one first. The next
 * one is tried when a picture is missing in a size or larger than the catalog
 * accepts.
 */
const SIZES: Record<ImageKind, readonly string[]> = {
  POSTER: ['original', 'w780'],
  BACKDROP: ['original', 'w1280'],
  LOGO: ['original', 'w500'],
  STILL: ['original', 'w300'],
};

const TEXT_FIELDS = [
  'name',
  'originalName',
  'tagline',
  'synopsis',
  'releaseYear',
  'ageRating',
  'originalLanguage',
] as const satisfies readonly (keyof ImportedText)[];

function emptyReport(): ImportReport {
  return {
    fields: [],
    categoriesCreated: [],
    seasonsCreated: 0,
    episodesCreated: 0,
    episodesUpdated: 0,
    picturesAdded: 0,
    warnings: [],
  };
}

/** Runs tasks a few at a time, in order of the list. */
async function inBatches<Item>(
  items: readonly Item[],
  size: number,
  task: (item: Item) => Promise<void>,
): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(task));
  }
}

/**
 * Fills titles with details and artwork from The Movie Database: search,
 * a preview of what would come, and the import itself, into a new title or
 * an existing one.
 */
@Injectable()
export class MetadataService {
  private readonly logger = new Logger(MetadataService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(TmdbClient) private readonly tmdb: TmdbClient,
    @Inject(TitlesService) private readonly titles: TitlesService,
    @Inject(CategoriesService) private readonly categoriesService: CategoriesService,
    @Inject(ImagesService) private readonly images: ImagesService,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  status(): MetadataStatus {
    return {
      enabled: this.tmdb.enabled,
      source: METADATA_SOURCE,
      language: this.config.metadataLanguage,
      region: this.config.metadataRegion,
    };
  }

  async search(input: SearchMetadataInput): Promise<MetadataSearchResult[]> {
    const kind = kindOf(input.type);
    const page = await this.tmdb.search(kind, input.q, {
      language: input.language ?? this.config.metadataLanguage,
      year: input.year,
    });
    const thumbnails = this.tmdb.imageUrl('w185', '');
    const results = (page.results ?? [])
      .map((item) => toSearchResult(kind, item, thumbnails))
      .filter((result) => result !== null)
      .slice(0, MAX_RESULTS);

    const existing = await this.existingTitles(results.map((result) => result.id));
    return results.map((result) => ({
      ...result,
      existingTitleId: existing.get(result.id) ?? null,
    }));
  }

  async preview(input: PreviewMetadataInput): Promise<MetadataPreview> {
    const language = input.language ?? this.config.metadataLanguage;
    const imported = await this.fetchTitle(input.id, language);
    const categories = await this.categoryIndex();
    const { artwork, genres, seasons, ...rest } = imported;
    return {
      ...rest,
      language,
      genres: genres.map((name) => ({
        name,
        categoryId: categories.get(slugify(name)) ?? null,
      })),
      artwork: {
        poster: artwork.poster ? this.tmdb.imageUrl('w342', artwork.poster) : null,
        backdrop: artwork.backdrop ? this.tmdb.imageUrl('w780', artwork.backdrop) : null,
        logo: artwork.logo ? this.tmdb.imageUrl('w300', artwork.logo) : null,
      },
      seasons: seasons.filter((season) => season.number > 0 || input.specials === true),
      existingTitleId: (await this.existingTitles([imported.id])).get(imported.id) ?? null,
    };
  }

  /**
   * Creates a draft title from an entry at the source.
   *
   * @throws ConflictException when the catalog already has that entry, unless a duplicate is wanted.
   */
  async importNew(input: ImportMetadataInput, adminId: string | null): Promise<ImportResult> {
    const language = input.language ?? this.config.metadataLanguage;
    const imported = await this.fetchTitle(input.id, language);

    if (!input.allowDuplicate) {
      const existing = (await this.existingTitles([imported.id])).get(imported.id);
      if (existing) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: `"${imported.name}" is in the catalog already`,
          existingTitleId: existing,
        });
      }
    }

    const created = await this.titles.create({ type: imported.type, name: imported.name }, adminId);
    try {
      // A new title has nothing that could be lost, so everything is taken over.
      const report = await this.apply(created.id, imported, language, input, true);
      return { title: await this.titles.get(created.id), report };
    } catch (error) {
      // Half a title helps nobody. Pictures stored for it stay unused and can be deleted.
      await this.prisma.title.delete({ where: { id: created.id } }).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Brings details from the source into an existing title.
   *
   * @throws BadRequestException when the entry is a movie and the title a series, or the reverse.
   */
  async applyTo(titleId: string, input: ApplyMetadataInput): Promise<ImportResult> {
    const title = await this.prisma.title.findUnique({
      where: { id: titleId },
      select: { type: true },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    const parsed = parseMetadataId(input.id);
    if (parsed?.type !== title.type) {
      throw new BadRequestException(
        title.type === 'MOVIE'
          ? 'This title is a movie. Choose a movie to take the details from.'
          : 'This title is a series. Choose a series to take the details from.',
      );
    }
    const language = input.language ?? this.config.metadataLanguage;
    const imported = await this.fetchTitle(input.id, language);
    const report = await this.apply(titleId, imported, language, input, input.overwrite);
    return { title: await this.titles.get(titleId), report };
  }

  // --- The import itself --------------------------------------------------------

  private async apply(
    titleId: string,
    imported: ImportedTitle,
    language: string,
    parts: MetadataParts,
    overwrite: boolean,
  ): Promise<ImportReport> {
    const report = emptyReport();
    const title = await this.prisma.title.findUniqueOrThrow({
      where: { id: titleId },
      include: { categories: true },
    });
    const data: Prisma.TitleUncheckedUpdateInput = {
      metadataSource: METADATA_SOURCE,
      metadataId: imported.id,
      metadataLanguage: language,
      metadataSyncedAt: new Date(),
    };
    const replaced: string[] = [];

    if (parts.text) {
      for (const field of TEXT_FIELDS) {
        const value = imported[field];
        const current = title[field];
        const isEmpty = current === null || current === '';
        if (value !== null && value !== current && (overwrite || isEmpty)) {
          Object.assign(data, { [field]: value });
          report.fields.push(field);
        }
      }
    }

    if (parts.artwork) {
      const wanted: [field: 'posterId' | 'backdropId' | 'logoId', ImageKind, string | null][] = [
        ['posterId', 'POSTER', imported.artwork.poster],
        ['backdropId', 'BACKDROP', imported.artwork.backdrop],
        ['logoId', 'LOGO', imported.artwork.logo],
      ];
      await Promise.all(
        wanted.map(async ([field, kind, path]) => {
          if (!path || (title[field] !== null && !overwrite)) {
            return;
          }
          const imageId = await this.fetchPicture(kind, path, report);
          if (imageId) {
            Object.assign(data, { [field]: imageId });
            report.fields.push(field.replace(/Id$/, ''));
            if (title[field]) {
              replaced.push(title[field]);
            }
          }
        }),
      );
    }

    await this.prisma.title.update({ where: { id: titleId }, data });
    await this.removeUnused(replaced);

    if (parts.categories && imported.genres.length > 0) {
      await this.applyGenres(
        titleId,
        imported.genres,
        title.categories.map((link) => link.categoryId),
        { create: parts.createCategories, overwrite },
        report,
      );
    }

    if (parts.episodes && imported.type === 'SERIES') {
      await this.applySeasons(titleId, imported, language, parts, overwrite, report);
    }
    return report;
  }

  /** Links the title to the categories named like the genres. */
  private async applyGenres(
    titleId: string,
    genres: readonly string[],
    current: readonly string[],
    options: { create: boolean; overwrite: boolean },
    report: ImportReport,
  ): Promise<void> {
    const index = await this.categoryIndex();
    const ids: string[] = [];
    for (const genre of genres) {
      let id = index.get(slugify(genre));
      if (!id && options.create) {
        try {
          id = (await this.categoriesService.create({ name: genre })).id;
          report.categoriesCreated.push(genre);
        } catch (error) {
          report.warnings.push(`The category "${genre}" could not be created`);
          this.logger.warn(`Creating a category failed: ${(error as Error).message}`);
        }
      }
      if (id) {
        ids.push(id);
      }
    }

    const next = [...new Set(options.overwrite ? ids : [...current, ...ids])];
    const same = next.length === current.length && next.every((id) => current.includes(id));
    if (same) {
      return;
    }
    await this.prisma.$transaction([
      this.prisma.titleCategory.deleteMany({ where: { titleId } }),
      this.prisma.titleCategory.createMany({
        data: next.map((categoryId) => ({ titleId, categoryId })),
      }),
    ]);
    report.fields.push('categories');
  }

  /**
   * Adds the seasons and episodes the series lacks, and fills what existing
   * ones lack. Nothing is ever deleted, and an episode keeps its video and
   * whether it is published.
   */
  private async applySeasons(
    titleId: string,
    imported: ImportedTitle,
    language: string,
    parts: MetadataParts,
    overwrite: boolean,
    report: ImportReport,
  ): Promise<void> {
    const sourceId = parseMetadataId(imported.id)?.id as number;
    const seasons = imported.seasons.filter((season) => season.number > 0 || parts.specials);
    const stills: { episodeId: string; path: string; replaces: string | null }[] = [];

    for (const summary of seasons) {
      let detail;
      try {
        detail = await this.tmdb.season(sourceId, summary.number, language);
      } catch (error) {
        report.warnings.push(`Season ${summary.number} could not be read from TMDB`);
        this.logger.warn(`Reading season ${summary.number} failed: ${(error as Error).message}`);
        continue;
      }
      const synopsis = episodesOfSeasonSynopsis(detail.overview);
      const name = seasonNameOf(detail.name ?? summary.name, summary.number);

      let season = await this.prisma.season.findUnique({
        where: { titleId_number: { titleId, number: summary.number } },
        include: { episodes: true },
      });
      if (!season) {
        season = await this.prisma.season.create({
          data: { titleId, number: summary.number, name, synopsis },
          include: { episodes: true },
        });
        report.seasonsCreated += 1;
      } else {
        const change: Prisma.SeasonUpdateInput = {};
        if (name && name !== season.name && (overwrite || !season.name)) {
          change.name = name;
        }
        if (synopsis && synopsis !== season.synopsis && (overwrite || !season.synopsis)) {
          change.synopsis = synopsis;
        }
        if (Object.keys(change).length > 0) {
          await this.prisma.season.update({ where: { id: season.id }, data: change });
        }
      }

      const existing = new Map(season.episodes.map((episode) => [episode.number, episode]));
      for (const episode of episodesOf(detail.episodes)) {
        const current = existing.get(episode.number);
        if (!current) {
          const created = await this.prisma.episode.create({
            data: {
              seasonId: season.id,
              number: episode.number,
              name: episode.name,
              synopsis: episode.synopsis,
            },
          });
          report.episodesCreated += 1;
          if (episode.still && parts.stills) {
            stills.push({ episodeId: created.id, path: episode.still, replaces: null });
          }
          continue;
        }

        const change = episodeChange(current, episode, overwrite);
        if (Object.keys(change).length > 0) {
          await this.prisma.episode.update({ where: { id: current.id }, data: change });
          report.episodesUpdated += 1;
        }
        if (episode.still && parts.stills && (overwrite || !current.stillId)) {
          stills.push({ episodeId: current.id, path: episode.still, replaces: current.stillId });
        }
      }
    }

    const replaced: string[] = [];
    await inBatches(stills, DOWNLOADS_AT_ONCE, async ({ episodeId, path, replaces }) => {
      const imageId = await this.fetchPicture('STILL', path, report, false);
      if (imageId) {
        await this.prisma.episode.update({ where: { id: episodeId }, data: { stillId: imageId } });
        if (replaces) {
          replaced.push(replaces);
        }
      }
    });
    await this.removeUnused(replaced);
  }

  // --- Helpers --------------------------------------------------------------------

  private async fetchTitle(metadataId: string, language: string): Promise<ImportedTitle> {
    const parsed = parseMetadataId(metadataId);
    if (!parsed) {
      throw new BadRequestException('Not an id of a title at the source');
    }
    const details = await this.tmdb.details(parsed.kind, parsed.id, language);
    try {
      return toImportedTitle(parsed.kind, details, {
        language,
        region: this.config.metadataRegion,
      });
    } catch {
      throw new BadGatewayException('TMDB sent an answer that could not be read');
    }
  }

  /**
   * Downloads a picture and stores it in the catalog.
   *
   * @param warn Whether a failure is worth telling the admin. A missing still is not.
   * @returns the id of the stored picture, or null when it could not be had.
   */
  private async fetchPicture(
    kind: ImageKind,
    path: string,
    report: ImportReport,
    warn = true,
  ): Promise<string | null> {
    for (const size of SIZES[kind]) {
      const data = await this.tmdb.downloadImage(size, path, MAX_IMAGE_BYTES);
      if (!data) {
        continue;
      }
      try {
        const image = await this.images.upload(kind, data, null);
        report.picturesAdded += 1;
        return image.id;
      } catch (error) {
        // Not a picture the catalog takes, for example too many pixels. A smaller size may be.
        this.logger.warn(`A ${kind} from TMDB was not stored: ${(error as Error).message}`);
      }
    }
    if (warn) {
      report.warnings.push(`The ${kind.toLowerCase()} could not be downloaded`);
    }
    return null;
  }

  /** Deletes pictures that were replaced, unless something else still shows them. */
  private async removeUnused(imageIds: readonly string[]): Promise<void> {
    for (const id of imageIds) {
      await this.images.remove(id).catch(() => undefined);
    }
  }

  /** Categories by the slug of their name, and by their own slug. */
  private async categoryIndex(): Promise<Map<string, string>> {
    const categories = await this.prisma.category.findMany({
      select: { id: true, name: true, slug: true },
    });
    const index = new Map<string, string>();
    for (const category of categories) {
      index.set(category.slug, category.id);
      index.set(slugify(category.name), category.id);
    }
    return index;
  }

  /** Titles of the catalog that were imported from the given entries. */
  private async existingTitles(metadataIds: readonly string[]): Promise<Map<string, string>> {
    if (metadataIds.length === 0) {
      return new Map();
    }
    const titles = await this.prisma.title.findMany({
      where: { metadataSource: METADATA_SOURCE, metadataId: { in: [...metadataIds] } },
      select: { id: true, metadataId: true },
      orderBy: { createdAt: 'asc' },
    });
    const found = new Map<string, string>();
    for (const title of titles) {
      if (title.metadataId && !found.has(title.metadataId)) {
        found.set(title.metadataId, title.id);
      }
    }
    return found;
  }
}

function episodesOfSeasonSynopsis(overview: unknown): string | null {
  if (typeof overview !== 'string') {
    return null;
  }
  const text = overview.trim();
  return text === '' ? null : text.slice(0, 5000);
}

/** What an existing episode takes over: what it lacks, or everything when replacing. */
function episodeChange(
  current: { name: string; number: number; synopsis: string | null },
  episode: ImportedEpisode,
  overwrite: boolean,
): Prisma.EpisodeUpdateInput {
  const change: Prisma.EpisodeUpdateInput = {};
  // A name such as "Episode 3" is a placeholder, typed or imported, and gives way to a real one.
  const placeholder = /^episode \d+$/i.test(current.name);
  const real = !/^episode \d+$/i.test(episode.name);
  if (episode.name !== current.name && real && (overwrite || placeholder)) {
    change.name = episode.name;
  }
  if (
    episode.synopsis &&
    episode.synopsis !== current.synopsis &&
    (overwrite || !current.synopsis)
  ) {
    change.synopsis = episode.synopsis;
  }
  return change;
}
