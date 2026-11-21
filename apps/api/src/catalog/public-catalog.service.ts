// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { type Prisma, PrismaClient } from '@onyx/database';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { AppConfig } from '../config/app-config.js';
import { type PlaybackInfo, PlaybackService } from '../playback/playback.service.js';
import { isPlayable, VISIBLE_EPISODE, VISIBLE_TITLE } from './playable.js';
import type { ListPublicTitlesInput } from './public-catalog.schemas.js';
import {
  type PublicCategory,
  type PublicHome,
  type PublicRow,
  type PublicTitleCard,
  type PublicTitleDetail,
  toPublicCard,
  toPublicImage,
} from './public-catalog.views.js';

/** Who asks for playback: a signed-in viewer, or null for a visitor. */
export type Watcher = { emailVerified: boolean } | null;

/** Titles in one row of the home page. */
export const ROW_SIZE = 20;
/** Category rows on the home page. Further categories are reached through the category list. */
export const MAX_CATEGORY_ROWS = 12;

const CARD_INCLUDE = {
  poster: true,
  backdrop: true,
  logo: true,
  asset: { select: { durationMs: true } },
  categories: { include: { category: true } },
  seasons: {
    where: { episodes: { some: VISIBLE_EPISODE } },
    select: { _count: { select: { episodes: { where: VISIBLE_EPISODE } } } },
  },
} satisfies Prisma.TitleInclude;

const NEWEST_FIRST = [
  { publishedAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.TitleOrderByWithRelationInput[];

const ORDER_BY: Record<ListPublicTitlesInput['sort'], Prisma.TitleOrderByWithRelationInput[]> = {
  newest: NEWEST_FIRST,
  name: [{ name: 'asc' }, { id: 'desc' }],
  year: [{ releaseYear: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }, { id: 'desc' }],
};

/**
 * The catalog as viewers see it: only published titles that have something to
 * play. Every query here goes through the VISIBLE_TITLE filter, so a draft
 * can never leak, whatever is asked for.
 */
@Injectable()
export class PublicCatalogService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(PlaybackService) private readonly playback: PlaybackService,
  ) {}

  async list(input: ListPublicTitlesInput): Promise<Page<PublicTitleCard>> {
    const where: Prisma.TitleWhereInput = {
      AND: [
        VISIBLE_TITLE,
        {
          type: input.type,
          isFeatured: input.featured ? true : undefined,
          ...(input.category
            ? { categories: { some: { category: { slug: input.category } } } }
            : {}),
        },
        input.q
          ? {
              OR: [
                { name: { contains: input.q, mode: 'insensitive' } },
                { originalName: { contains: input.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const [titles, total] = await Promise.all([
      this.prisma.title.findMany({
        where,
        orderBy: ORDER_BY[input.sort],
        include: CARD_INCLUDE,
        ...toSkipTake(input),
      }),
      this.prisma.title.count({ where }),
    ]);
    return toPage(
      titles.map((title) => toPublicCard(title, this.config.mediaBaseUrl)),
      total,
      input,
    );
  }

  /** @throws NotFoundException when no visible title has this slug. */
  async get(slug: string): Promise<PublicTitleDetail> {
    const title = await this.prisma.title.findFirst({
      where: { slug, ...VISIBLE_TITLE },
      include: {
        ...CARD_INCLUDE,
        trailerAsset: { select: { status: true, manifestPath: true } },
      },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }

    const seasons =
      title.type === 'SERIES'
        ? await this.prisma.season.findMany({
            where: { titleId: title.id, episodes: { some: VISIBLE_EPISODE } },
            orderBy: { number: 'asc' },
            include: {
              episodes: {
                where: VISIBLE_EPISODE,
                orderBy: { number: 'asc' },
                include: { still: true, asset: { select: { durationMs: true } } },
              },
            },
          })
        : [];

    return {
      ...toPublicCard(title, this.config.mediaBaseUrl),
      originalName: title.originalName,
      synopsis: title.synopsis,
      originalLanguage: title.originalLanguage,
      hasTrailer: isPlayable(title.trailerAsset),
      seasons: seasons.map((season) => ({
        number: season.number,
        name: season.name,
        synopsis: season.synopsis,
        episodes: season.episodes.map((episode) => ({
          id: episode.id,
          number: episode.number,
          name: episode.name,
          synopsis: episode.synopsis,
          still: toPublicImage(episode.still, this.config.mediaBaseUrl),
          durationMs: episode.asset?.durationMs ?? null,
        })),
      })),
    };
  }

  /** Categories that have at least one visible title, in their order. */
  async categories(): Promise<PublicCategory[]> {
    const categories = await this.prisma.category.findMany({
      where: { titles: { some: { title: VISIBLE_TITLE } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { titles: { where: { title: VISIBLE_TITLE } } } } },
    });
    return categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      description: category.description,
      titleCount: category._count.titles,
    }));
  }

  /** The rows of the home page: featured titles, the newest, then one row per category. */
  async home(): Promise<PublicHome> {
    const row = (where: Prisma.TitleWhereInput) =>
      this.prisma.title.findMany({
        where: { AND: [VISIBLE_TITLE, where] },
        orderBy: NEWEST_FIRST,
        include: CARD_INCLUDE,
        take: ROW_SIZE,
      });

    const categories = (await this.categories()).slice(0, MAX_CATEGORY_ROWS);
    const [featured, latest, ...perCategory] = await Promise.all([
      row({ isFeatured: true }),
      row({}),
      ...categories.map((category) =>
        row({ categories: { some: { category: { slug: category.slug } } } }),
      ),
    ]);

    const cards = (titles: Awaited<ReturnType<typeof row>>) =>
      titles.map((title) => toPublicCard(title, this.config.mediaBaseUrl));
    const rows: PublicRow[] = [
      { key: 'featured', name: 'Featured', category: null, titles: cards(featured ?? []) },
      { key: 'latest', name: 'New', category: null, titles: cards(latest ?? []) },
      ...categories.map((category, index) => ({
        key: `category:${category.slug}`,
        name: category.name,
        category: { slug: category.slug, name: category.name },
        titles: cards(perCategory[index] ?? []),
      })),
    ];
    return { rows: rows.filter((entry) => entry.titles.length > 0) };
  }

  /**
   * Signed addresses for playing a movie.
   *
   * @param signedIn Whether the request comes from a signed-in viewer.
   * @throws ConflictException for a series, which is played per episode.
   */
  async playTitle(slug: string, watcher: Watcher): Promise<PlaybackInfo> {
    this.assertMayPlay(watcher);
    const title = await this.prisma.title.findFirst({
      where: { slug, ...VISIBLE_TITLE },
      select: { type: true, assetId: true },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    if (title.type !== 'MOVIE' || !title.assetId) {
      throw new ConflictException('A series is played episode by episode');
    }
    return this.playback.createPlayback(title.assetId);
  }

  /** Signed addresses for playing the trailer of a title. */
  async playTrailer(slug: string, watcher: Watcher): Promise<PlaybackInfo> {
    this.assertMayPlay(watcher);
    const title = await this.prisma.title.findFirst({
      where: { slug, ...VISIBLE_TITLE },
      select: { trailerAsset: { select: { id: true, status: true, manifestPath: true } } },
    });
    if (!title?.trailerAsset || !isPlayable(title.trailerAsset)) {
      throw new NotFoundException('This title has no trailer');
    }
    return this.playback.createPlayback(title.trailerAsset.id);
  }

  /** Signed addresses for playing an episode of a visible series. */
  async playEpisode(episodeId: string, watcher: Watcher): Promise<PlaybackInfo> {
    this.assertMayPlay(watcher);
    const episode = await this.prisma.episode.findFirst({
      where: { id: episodeId, ...VISIBLE_EPISODE, season: { title: { status: 'PUBLISHED' } } },
      select: { assetId: true },
    });
    if (!episode?.assetId) {
      throw new NotFoundException('Episode not found');
    }
    return this.playback.createPlayback(episode.assetId);
  }

  /**
   * Applies CATALOG_PLAYBACK.
   *
   * @throws ForbiddenException when playback is off for everyone.
   * @throws UnauthorizedException when it needs a signed-in viewer and there is none.
   * @throws ForbiddenException when the viewer has yet to confirm their email address.
   */
  private assertMayPlay(watcher: Watcher): void {
    if (this.config.catalogPlayback === 'off') {
      throw new ForbiddenException('Playback is not open on this installation');
    }
    if (this.config.catalogPlayback !== 'viewers') {
      return;
    }
    if (!watcher) {
      throw new UnauthorizedException('Sign in to watch');
    }
    if (this.config.viewerVerificationRequired && !watcher.emailVerified) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Confirm your email address to watch',
        // Lets a player tell this apart from playback that is off for everyone.
        code: 'email_unverified',
      });
    }
  }
}
