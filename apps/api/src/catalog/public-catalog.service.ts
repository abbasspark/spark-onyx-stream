// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { type Prisma, PrismaClient, type TitleAccess } from '@onyx/database';
import { SubscriptionsService } from '../billing/subscriptions.service.js';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { AppConfig } from '../config/app-config.js';
import { type PlaybackInfo, PlaybackService } from '../playback/playback.service.js';
import { opensTitle } from '../billing/entitlement.js';
import { PurchasesService } from '../purchases/purchases.service.js';
import {
  availableAt,
  isPlayable,
  PLAYABLE_ASSET,
  VISIBLE_EPISODE,
  visibleTitle,
} from './playable.js';
import { languageChain } from './language.js';
import type { ListPublicTitlesInput } from './public-catalog.schemas.js';
import {
  type PublicCategory,
  type PublicCollection,
  type PublicCredit,
  type PublicGenre,
  type PublicLanguages,
  type PublicPerson,
  type PublicCollectionDetail,
  type PublicHome,
  type PublicTitleCard,
  type PublicTitleDetail,
  toPublicCard,
  toPublicImage,
} from './public-catalog.views.js';
import { TranslationsService } from './translations.service.js';
import { CARD_INCLUDE } from './card-include.js';
import { HomeService, type LayoutPage } from '../home/home.service.js';
import { PlaysService } from '../analytics/plays.service.js';

/** What is known of the device that asks, to count it. Neither is stored. */
export interface PlayClient {
  ipAddress: string | null;
  userAgent: string | null;
}

/** The addresses for playing, and where the player reports how it is watched. */
export type PlayAnswer = PlaybackInfo & {
  /** For `POST /catalog/plays/{playId}/beat`. Null when the installation records nothing. */
  playId: string | null;
};

/** Who asks for playback: a signed-in viewer, or null for a visitor. */
export type Watcher = { viewerId: string; emailVerified: boolean } | null;

const PACKAGE_IDS = { select: { packageId: true } } as const;

/** What the gate reads of a title to decide who may watch. */
const GATE_SELECT = { access: true, purchaseOnly: true, packages: PACKAGE_IDS } as const;

interface GatedTitle {
  id: string;
  access: TitleAccess;
  purchaseOnly: boolean;
  packages: { packageId: string }[];
}

const NEWEST_FIRST = [
  { publishedAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.TitleOrderByWithRelationInput[];

const ORDER_BY: Record<ListPublicTitlesInput['sort'], Prisma.TitleOrderByWithRelationInput[]> = {
  newest: NEWEST_FIRST,
  name: [{ name: 'asc' }, { id: 'desc' }],
  year: [{ releaseYear: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }, { id: 'desc' }],
  rating: [
    { rating: { sort: 'desc', nulls: 'last' } },
    { ratingCount: { sort: 'desc', nulls: 'last' } },
    ...NEWEST_FIRST,
  ],
};

/**
 * The catalog as viewers see it: only published titles that have something to
 * play. Every query here goes through the visibleTitle filter, so a draft
 * can never leak, whatever is asked for.
 */
/** How many of the cast and of the crew a title's page gets. The rest is on the people's own pages. */
const MAX_CAST_SHOWN = 16;
const MAX_CREW_SHOWN = 8;

@Injectable()
export class PublicCatalogService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(PlaybackService) private readonly playback: PlaybackService,
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
    @Inject(PurchasesService) private readonly purchases: PurchasesService,
    @Inject(TranslationsService) private readonly translations: TranslationsService,
    @Inject(HomeService) private readonly homeLayout: HomeService,
    @Inject(PlaysService) private readonly plays: PlaysService,
  ) {}

  async list(input: ListPublicTitlesInput): Promise<Page<PublicTitleCard>> {
    const where: Prisma.TitleWhereInput = {
      AND: [
        visibleTitle(),
        {
          type: input.type,
          isFeatured: input.featured ? true : undefined,
          ...(input.category
            ? { categories: { some: { category: { slug: input.category } } } }
            : {}),
          ...(input.genre ? { genres: { some: { genre: { slug: input.genre } } } } : {}),
          ...(input.person ? { credits: { some: { person: { slug: input.person } } } } : {}),
          ...(input.collection
            ? { collections: { some: { collection: { slug: input.collection, visible: true } } } }
            : {}),
        },
        input.q
          ? {
              OR: [
                { name: { contains: input.q, mode: 'insensitive' } },
                { originalName: { contains: input.q, mode: 'insensitive' } },
                // A viewer searches in the language they read the names in.
                ...(input.language
                  ? [
                      {
                        translations: {
                          some: {
                            language: { in: languageChain(input.language) },
                            name: { contains: input.q, mode: 'insensitive' as const },
                          },
                        },
                      },
                    ]
                  : []),
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
      await this.translations.localizeCards(
        titles.map((title) => toPublicCard(title, this.config.mediaBaseUrl)),
        input.language,
      ),
      total,
      input,
    );
  }

  /** @throws NotFoundException when no visible title has this slug. */
  async get(slug: string, language?: string): Promise<PublicTitleDetail> {
    const title = await this.prisma.title.findFirst({
      where: { slug, ...visibleTitle() },
      include: {
        ...CARD_INCLUDE,
        trailerAsset: { select: { status: true, manifestPath: true } },
        extras: {
          where: { asset: PLAYABLE_ASSET },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true, kind: true, name: true, asset: { select: { durationMs: true } } },
        },
        collections: {
          where: { collection: { visible: true } },
          select: { collection: { select: { slug: true, name: true, position: true } } },
        },
        genres: { select: { genre: { select: { slug: true, name: true } } } },
        credits: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          include: { person: { include: { portrait: true } } },
        },
      },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    const credit = (entry: (typeof title.credits)[number]): PublicCredit => ({
      slug: entry.person.slug,
      name: entry.person.name,
      role: entry.role,
      portrait: toPublicImage(entry.person.portrait, this.config.mediaBaseUrl),
    });

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

    const translated = await this.translations.forTitle(title.id, language);
    const card = toPublicCard(title, this.config.mediaBaseUrl);
    return {
      ...card,
      name: translated.title?.name ?? card.name,
      tagline: translated.title?.tagline ?? card.tagline,
      originalName: title.originalName,
      synopsis: translated.title?.synopsis ?? title.synopsis,
      originalLanguage: title.originalLanguage,
      hasTrailer: isPlayable(title.trailerAsset),
      genres: title.genres.map(({ genre }) => genre).sort((a, b) => a.name.localeCompare(b.name)),
      releaseDate: title.releaseDate ? title.releaseDate.toISOString().slice(0, 10) : null,
      runtimeMinutes: title.runtimeMinutes,
      countries: title.countries,
      studios: title.studios,
      rating: title.rating,
      ratingCount: title.ratingCount,
      seriesStatus: title.seriesStatus,
      cast: title.credits
        .filter((entry) => entry.kind === 'CAST')
        .slice(0, MAX_CAST_SHOWN)
        .map(credit),
      crew: title.credits
        .filter((entry) => entry.kind === 'CREW')
        .slice(0, MAX_CREW_SHOWN)
        .map(credit),
      extras: title.extras.map((extra) => ({
        id: extra.id,
        kind: extra.kind,
        name: extra.name,
        durationMs: extra.asset.durationMs,
      })),
      collections: title.collections
        .map(({ collection }) => collection)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
        .map(({ slug: collectionSlug, name }) => ({ slug: collectionSlug, name })),
      metadataSource: title.metadataSource,
      seasons: seasons.map((season) => ({
        number: season.number,
        name: translated.season(season.id)?.name ?? season.name,
        synopsis: translated.season(season.id)?.synopsis ?? season.synopsis,
        episodes: season.episodes.map((episode) => ({
          id: episode.id,
          number: episode.number,
          name: translated.episode(episode.id)?.name ?? episode.name,
          synopsis: translated.episode(episode.id)?.synopsis ?? episode.synopsis,
          still: toPublicImage(episode.still, this.config.mediaBaseUrl),
          durationMs: episode.asset?.durationMs ?? null,
        })),
      })),
    };
  }

  /** Categories that have at least one visible title, in their order. */
  async categories(): Promise<PublicCategory[]> {
    const categories = await this.prisma.category.findMany({
      where: { titles: { some: { title: visibleTitle() } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { titles: { where: { title: visibleTitle() } } } } },
    });
    return categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      description: category.description,
      titleCount: category._count.titles,
    }));
  }

  /** Genres that have something to watch, by name. */
  async genres(): Promise<PublicGenre[]> {
    const genres = await this.prisma.genre.findMany({
      where: { titles: { some: { title: visibleTitle() } } },
      orderBy: { name: 'asc' },
      select: {
        slug: true,
        name: true,
        _count: { select: { titles: { where: { title: visibleTitle() } } } },
      },
    });
    return genres.map((genre) => ({
      slug: genre.slug,
      name: genre.name,
      titleCount: genre._count.titles,
    }));
  }

  /**
   * A person with the titles of theirs that viewers can see.
   *
   * @throws NotFoundException when nobody has this slug, or nothing of theirs can be seen:
   *   a page about somebody with nothing to watch would lead nowhere.
   */
  async person(slug: string, language?: string): Promise<PublicPerson> {
    const person = await this.prisma.person.findUnique({
      where: { slug },
      include: {
        portrait: true,
        credits: {
          where: { title: visibleTitle() },
          orderBy: [{ kind: 'asc' }, { position: 'asc' }],
          select: { role: true, title: { include: CARD_INCLUDE } },
        },
      },
    });
    if (!person || person.credits.length === 0) {
      throw new NotFoundException('Person not found');
    }
    // Somebody who wrote and directed a film has two parts in it, and one card.
    const parts = new Map<string, (typeof person.credits)[number]>();
    for (const entry of person.credits) {
      if (!parts.has(entry.title.id)) {
        parts.set(entry.title.id, entry);
      }
    }
    const newestFirst = [...parts.values()].sort(
      (a, b) => (b.title.releaseYear ?? 0) - (a.title.releaseYear ?? 0),
    );
    const cards = await this.translations.localizeCards(
      newestFirst.map((entry) => toPublicCard(entry.title, this.config.mediaBaseUrl)),
      language,
    );
    return {
      slug: person.slug,
      name: person.name,
      knownFor: person.knownFor,
      biography: person.biography,
      portrait: toPublicImage(person.portrait, this.config.mediaBaseUrl),
      titles: cards.map((card, index) => ({ ...card, role: newestFirst[index]?.role ?? null })),
    };
  }

  /** The languages titles can be read in: the catalog's own, and those visible titles are translated into. */
  async languages(): Promise<PublicLanguages> {
    const groups = await this.prisma.titleTranslation.groupBy({
      by: ['language'],
      where: { title: visibleTitle() },
      _count: { _all: true },
    });
    return {
      default: this.config.metadataLanguage.split('-')[0] ?? 'en',
      translated: groups
        .map((group) => ({ language: group.language, titles: group._count._all }))
        .sort((a, b) => b.titles - a.titles || a.language.localeCompare(b.language)),
    };
  }

  /** Collections shown to viewers that hold at least one visible title, in their order. */
  async collections(): Promise<PublicCollection[]> {
    const collections = await this.prisma.collection.findMany({
      where: { visible: true, titles: { some: { title: visibleTitle() } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        poster: true,
        backdrop: true,
        _count: { select: { titles: { where: { title: visibleTitle() } } } },
      },
    });
    return collections.map((collection) => ({
      slug: collection.slug,
      name: collection.name,
      synopsis: collection.synopsis,
      poster: toPublicImage(collection.poster, this.config.mediaBaseUrl),
      backdrop: toPublicImage(collection.backdrop, this.config.mediaBaseUrl),
      titleCount: collection._count.titles,
    }));
  }

  /** @throws NotFoundException when no collection shown to viewers has this slug. */
  async collection(slug: string, language?: string): Promise<PublicCollectionDetail> {
    const collection = await this.prisma.collection.findFirst({
      where: { slug, visible: true },
      include: {
        poster: true,
        backdrop: true,
        titles: {
          where: { title: visibleTitle() },
          orderBy: [{ position: 'asc' }, { titleId: 'asc' }],
          select: { title: { include: CARD_INCLUDE } },
        },
      },
    });
    if (!collection) {
      throw new NotFoundException('Collection not found');
    }
    return {
      slug: collection.slug,
      name: collection.name,
      synopsis: collection.synopsis,
      poster: toPublicImage(collection.poster, this.config.mediaBaseUrl),
      backdrop: toPublicImage(collection.backdrop, this.config.mediaBaseUrl),
      titleCount: collection.titles.length,
      titles: await this.translations.localizeCards(
        collection.titles.map(({ title }) => toPublicCard(title, this.config.mediaBaseUrl)),
        language,
      ),
    };
  }

  /**
   * The home page: its opening and its rows, as an admin arranged them, or as
   * the page puts itself together while nobody did.
   */
  home(language?: string): Promise<PublicHome> {
    return this.page('HOME', language);
  }

  /**
   * One of the pages that are arranged in the panel. "Movies" and "Series"
   * answer with nothing while nobody arranged them: clients then show the
   * list of all movies or series, as before.
   */
  async page(page: LayoutPage, language?: string): Promise<PublicHome> {
    const layout = await this.homeLayout.layout(page);
    // One look-up serves the whole page: a title is often in several rows.
    const all = await this.translations.localizeCards(
      [layout.hero ?? [], ...layout.rows.map((row) => row.titles)]
        .flat()
        .map((title) => toPublicCard(title, this.config.mediaBaseUrl)),
      language,
    );
    const byId = new Map(all.map((card) => [card.id, card]));
    const cards = (titles: readonly { id: string }[]) =>
      titles.flatMap((title) => byId.get(title.id) ?? []);
    return {
      custom: layout.custom,
      hero: layout.hero ? { titles: cards(layout.hero) } : null,
      rows: layout.rows.map((row) => ({ ...row, titles: cards(row.titles) })),
    };
  }

  /**
   * Signed addresses for playing a movie.
   *
   * @param signedIn Whether the request comes from a signed-in viewer.
   * @throws ConflictException for a series, which is played per episode.
   */
  async playTitle(slug: string, watcher: Watcher, client?: PlayClient): Promise<PlayAnswer> {
    this.assertOpen();
    const title = await this.prisma.title.findFirst({
      where: { slug, ...visibleTitle() },
      select: { id: true, type: true, assetId: true, ...GATE_SELECT },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    await this.assertMayPlay(watcher, title);
    if (title.type !== 'MOVIE' || !title.assetId) {
      throw new ConflictException('A series is played episode by episode');
    }
    return this.recorded(await this.playback.createPlayback(title.assetId, 'viewer'), {
      kind: 'MAIN',
      titleId: title.id,
      assetId: title.assetId,
      paid: title.access === 'PAID',
      watcher,
      client,
    });
  }

  /** Signed addresses for playing the trailer of a title. */
  async playTrailer(slug: string, watcher: Watcher, client?: PlayClient): Promise<PlayAnswer> {
    // A trailer is an invitation, also to a paid title.
    await this.assertMayPlay(watcher, null);
    const title = await this.prisma.title.findFirst({
      where: { slug, ...visibleTitle() },
      select: {
        id: true,
        access: true,
        trailerAsset: { select: { id: true, status: true, manifestPath: true } },
      },
    });
    if (!title?.trailerAsset || !isPlayable(title.trailerAsset)) {
      throw new NotFoundException('This title has no trailer');
    }
    return this.recorded(await this.playback.createPlayback(title.trailerAsset.id, 'viewer'), {
      kind: 'TRAILER',
      titleId: title.id,
      assetId: title.trailerAsset.id,
      paid: title.access === 'PAID',
      watcher,
      client,
    });
  }

  /** Signed addresses for playing one of the extras of a title. */
  async playExtra(
    slug: string,
    extraId: string,
    watcher: Watcher,
    client?: PlayClient,
  ): Promise<PlayAnswer> {
    // Extras are invitations like the trailer, also to a paid title.
    await this.assertMayPlay(watcher, null);
    const extra = await this.prisma.titleExtra.findFirst({
      where: { id: extraId, asset: PLAYABLE_ASSET, title: { slug, ...visibleTitle() } },
      select: { assetId: true, title: { select: { id: true, access: true } } },
    });
    if (!extra) {
      throw new NotFoundException('This title has no such video');
    }
    return this.recorded(await this.playback.createPlayback(extra.assetId, 'viewer'), {
      kind: 'EXTRA',
      titleId: extra.title.id,
      assetId: extra.assetId,
      paid: extra.title.access === 'PAID',
      watcher,
      client,
    });
  }

  /** Signed addresses for playing an episode of a visible series. */
  async playEpisode(episodeId: string, watcher: Watcher, client?: PlayClient): Promise<PlayAnswer> {
    this.assertOpen();
    const episode = await this.prisma.episode.findFirst({
      where: {
        id: episodeId,
        ...VISIBLE_EPISODE,
        season: { title: { status: 'PUBLISHED', AND: availableAt() } },
      },
      select: {
        assetId: true,
        season: { select: { title: { select: { id: true, ...GATE_SELECT } } } },
      },
    });
    if (!episode?.assetId) {
      throw new NotFoundException('Episode not found');
    }
    // An episode is as open as its series.
    await this.assertMayPlay(watcher, episode.season.title);
    return this.recorded(await this.playback.createPlayback(episode.assetId, 'viewer'), {
      kind: 'MAIN',
      titleId: episode.season.title.id,
      episodeId,
      assetId: episode.assetId,
      paid: episode.season.title.access === 'PAID',
      watcher,
      client,
    });
  }

  /**
   * Notes the play, and tells the player where to report. The addresses are
   * handed out whether or not that worked.
   */
  private async recorded(
    info: PlaybackInfo,
    play: {
      kind: 'MAIN' | 'TRAILER' | 'EXTRA';
      titleId: string;
      episodeId?: string;
      assetId: string;
      paid: boolean;
      watcher: Watcher;
      client: PlayClient | undefined;
    },
  ): Promise<PlayAnswer> {
    const playId = await this.plays.start({
      kind: play.kind,
      titleId: play.titleId,
      episodeId: play.episodeId,
      assetId: play.assetId,
      paid: play.paid,
      viewerId: play.watcher?.viewerId ?? null,
      ipAddress: play.client?.ipAddress ?? null,
      userAgent: play.client?.userAgent ?? null,
    });
    return { ...info, playId };
  }

  /**
   * Applies CATALOG_PLAYBACK.
   *
   * @throws ForbiddenException when playback is off for everyone.
   * @throws UnauthorizedException when it needs a signed-in viewer and there is none.
   * @throws ForbiddenException when the viewer has yet to confirm their email address.
   */
  /** @throws ForbiddenException when nothing is played on this installation. */
  private assertOpen(): void {
    if (this.config.catalogPlayback === 'off') {
      throw new ForbiddenException('Playback is not open on this installation');
    }
  }

  /**
   * Checks that the one who asks may watch. A free title follows the setting
   * of the installation. A paid title always needs a signed-in viewer with a
   * running subscription whose plan opens the title.
   */
  private async assertMayPlay(watcher: Watcher, title: GatedTitle | null): Promise<void> {
    this.assertOpen();
    // Null stands for what is open like a free title: a trailer.
    const paid = title?.access === 'PAID';
    if (!paid && this.config.catalogPlayback !== 'viewers') {
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
    if (!paid || !title) {
      return;
    }
    const access = await this.subscriptions.accessOf(watcher.viewerId);
    const throughPlan =
      !title.purchaseOnly &&
      opensTitle(
        access,
        title.packages.map((link) => link.packageId),
      );
    if (throughPlan) {
      return;
    }
    // Rented or bought: open whatever plan the viewer has. Playing a rental starts its hours.
    const owned = await this.purchases.validFor(watcher.viewerId, title.id);
    if (owned) {
      await this.purchases.markStarted(owned);
      return;
    }
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'Payment Required',
        // Lets a player say what would open the title.
        ...(title.purchaseOnly
          ? { message: 'Rent or buy this title to watch', code: 'purchase_required' }
          : access
            ? { message: 'Your plan does not include this title', code: 'plan_required' }
            : { message: 'Subscribe to watch', code: 'subscription_required' }),
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
