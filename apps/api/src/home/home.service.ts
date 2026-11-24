// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma, PrismaClient } from '@onyx/database';
import { CARD_INCLUDE, type CardTitle } from '../catalog/card-include.js';
import { visibleTitle } from '../catalog/playable.js';
import { TermTranslationsService } from '../catalog/term-translations.service.js';
import { browsePath, defaultSectionName, isShownAt } from './home-names.js';
import {
  type CreateSectionInput,
  MAX_HERO_TITLES,
  MAX_SECTIONS,
  MIN_ROW_TITLES,
  type UpdateSectionInput,
} from './home.schemas.js';

/** Titles in a row of the page that puts itself together. */
const AUTOMATIC_ROW_SIZE = 20;
/** Category rows of that page. */
const AUTOMATIC_CATEGORY_ROWS = 12;
/** Titles shown of a section in the panel, to see what it holds. */
const PREVIEW_SIZE = 12;

export type LayoutPage = 'HOME' | 'MOVIES' | 'SERIES' | 'LIVE' | 'CATEGORY' | 'GENRE';
export const LAYOUT_PAGES: readonly LayoutPage[] = [
  'HOME',
  'MOVIES',
  'SERIES',
  'LIVE',
  'CATEGORY',
  'GENRE',
];
/** The kind of title a page is about. Most are about both. */
const PAGE_TYPE = {
  HOME: null,
  MOVIES: 'MOVIE',
  SERIES: 'SERIES',
  LIVE: null,
  CATEGORY: null,
  GENRE: null,
} as const;

/**
 * The category or genre a page is about. The pages CATEGORY and GENRE are
 * arranged once and serve every category or genre: each shows only its own
 * titles in every section.
 */
export interface PageScope {
  kind: 'category' | 'genre';
  id: string;
  slug: string;
  name: string;
}

/** Which pages are about one category or genre, and which kind. */
const SCOPE_OF: Partial<Record<LayoutPage, PageScope['kind']>> = {
  CATEGORY: 'category',
  GENRE: 'genre',
};

const SECTION_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  genre: { select: { id: true, name: true, slug: true } },
  collection: { select: { id: true, name: true, slug: true } },
  titles: {
    orderBy: { position: 'asc' },
    select: { titleId: true },
  },
} satisfies Prisma.HomeSectionInclude;
type SectionRecord = Prisma.HomeSectionGetPayload<{ include: typeof SECTION_INCLUDE }>;

const NEWEST: Prisma.TitleOrderByWithRelationInput[] = [{ publishedAt: 'desc' }, { id: 'desc' }];
const ORDER: Record<
  Exclude<SectionRecord['sort'], 'CURATED'>,
  Prisma.TitleOrderByWithRelationInput[]
> = {
  NEWEST,
  RELEASED: [{ releaseDate: { sort: 'desc', nulls: 'last' } }, ...NEWEST],
  RATING: [
    { rating: { sort: 'desc', nulls: 'last' } },
    { ratingCount: { sort: 'desc', nulls: 'last' } },
    ...NEWEST,
  ],
  NAME: [{ name: 'asc' }, { id: 'desc' }],
};

/** An order of its own only exists where someone made one: picked titles, and a collection. */
function sortFor(
  source: SectionRecord['source'],
  sort: SectionRecord['sort'],
): SectionRecord['sort'] {
  if (source === 'MANUAL') {
    return 'CURATED';
  }
  return sort === 'CURATED' && source !== 'COLLECTION' ? 'NEWEST' : sort;
}

/** A place a client fills with what belongs to the viewer: it carries no titles itself. */
const isOwnRow = (kind: string): boolean =>
  kind === 'CONTINUE_WATCHING' || kind === 'MY_LIST' || kind === 'BECAUSE_YOU_WATCHED';

/** One part of the page as the website gets it, before its titles are made into cards. */
export interface HomeRow {
  /** Stable, for keys: "featured", "latest", "category:{slug}", or "section:{id}". */
  key: string;
  name: string;
  kind: 'titles' | 'continue' | 'list' | 'recommended';
  layout: 'poster' | 'landscape' | 'numbered';
  category: { slug: string; name: string } | null;
  /** Where "See all" leads on the website. Null: the row shows everything. */
  browse: string | null;
  titles: CardTitle[];
}

export interface HomeLayoutResult {
  /** True when an admin arranged the page. False: it puts itself together. */
  custom: boolean;
  /** The titles of the opening. Null: the page has none. */
  hero: CardTitle[] | null;
  rows: HomeRow[];
}

/** A section as the panel shows it. */
export interface HomeSectionView {
  id: string;
  position: number;
  kind: SectionRecord['kind'];
  /** The heading an admin gave. Null: {@link defaultName} is used. */
  name: string | null;
  defaultName: string;
  source: SectionRecord['source'];
  category: { id: string; name: string } | null;
  genre: { id: string; name: string } | null;
  collection: { id: string; name: string } | null;
  titleType: SectionRecord['titleType'];
  sort: SectionRecord['sort'];
  limit: number;
  layout: SectionRecord['layout'];
  visible: boolean;
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  /** Whether viewers see it right now: switched on, inside its dates, and not empty. */
  shownNow: boolean;
  /** The picked titles of a MANUAL section, in their order, also those viewers cannot see. */
  picked: { id: string; name: string; type: 'MOVIE' | 'SERIES'; visible: boolean }[];
  /** The first titles viewers get, to see what the section holds. */
  preview: CardTitle[];
  /** How many titles viewers get, up to the limit. */
  count: number;
}

export interface HomeView {
  page: LayoutPage;
  /**
   * On the page of categories or genres: the one whose titles the panel
   * shows in the sections, as an example. Null when there is none yet.
   */
  example: { id: string; slug: string; name: string } | null;
  custom: boolean;
  sections: HomeSectionView[];
}

/** A page in the list of pages: whether it is arranged, and how much is on it. */
export interface PageSummary {
  page: LayoutPage;
  custom: boolean;
  sections: number;
}

/**
 * The pages of the website that are arranged in the panel: which sections
 * each has, in which order, and which titles each section shows.
 *
 * While a page has no section it is what it was before pages could be
 * arranged. The home page puts itself together: the featured titles, the
 * newest, and a row per category. "Movies" and "Series" are the list of all
 * of them with its filters. The first section an admin makes takes over the
 * whole page.
 *
 * Every title goes through the visibleTitle filter, so nothing a viewer may
 * not see can be put on the page, whatever a section says.
 */
@Injectable()
export class HomeService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(TermTranslationsService) private readonly terms: TermTranslationsService,
  ) {}

  // --- For viewers ----------------------------------------------------------------

  async layout(
    page: LayoutPage = 'HOME',
    now: Date = new Date(),
    scope?: PageScope,
    language?: string,
  ): Promise<HomeLayoutResult> {
    const sections = await this.prisma.homeSection.findMany({
      where: { page },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      include: SECTION_INCLUDE,
    });
    if (sections.length === 0) {
      // Only the home page has a page of its own without sections.
      return page === 'HOME'
        ? this.automatic(now, language)
        : { custom: false, hero: null, rows: [] };
    }
    const shown = await this.inLanguage(
      sections.filter((section) => isShownAt(section, now)),
      language,
    );
    const resolved = await Promise.all(
      shown.map(async (section) => ({
        section,
        titles: isOwnRow(section.kind)
          ? []
          : await this.titlesOf(section, now, section.limit, scope),
      })),
    );
    const hero = resolved.find(({ section }) => section.kind === 'HERO');
    const rows: HomeRow[] = [];
    for (const { section, titles } of resolved) {
      if (section.kind === 'HERO' || (section.kind === 'TITLES' && titles.length === 0)) {
        continue;
      }
      rows.push({
        key: `section:${section.id}`,
        name: section.name ?? defaultSectionName(section, PAGE_TYPE[section.page]),
        kind:
          section.kind === 'CONTINUE_WATCHING'
            ? 'continue'
            : section.kind === 'MY_LIST'
              ? 'list'
              : section.kind === 'BECAUSE_YOU_WATCHED'
                ? 'recommended'
                : 'titles',
        layout: section.layout.toLowerCase() as HomeRow['layout'],
        category:
          section.source === 'CATEGORY' && section.category
            ? { slug: section.category.slug, name: section.category.name }
            : null,
        browse: browsePath(section, scope),
        titles,
      });
    }
    return { custom: true, hero: hero && hero.titles.length > 0 ? hero.titles : null, rows };
  }

  /**
   * Sections with the names of their category, genre or collection in a
   * language, so a row that is called after one reads in that language too.
   * A heading an admin typed stays as typed.
   */
  private async inLanguage(
    sections: SectionRecord[],
    language: string | undefined,
  ): Promise<SectionRecord[]> {
    if (!language || sections.length === 0) {
      return sections;
    }
    const [categories, genres, collections] = await Promise.all([
      this.terms.names('category', language),
      this.terms.names('genre', language),
      this.terms.names('collection', language),
    ]);
    const named = <Ref extends { slug: string; name: string }>(
      ref: Ref | null,
      names: Map<string, string>,
    ): Ref | null => (ref ? { ...ref, name: names.get(ref.slug) ?? ref.name } : null);
    return sections.map((section) => ({
      ...section,
      category: named(section.category, categories),
      genre: named(section.genre, genres),
      collection: named(section.collection, collections),
    }));
  }

  /** The page as it was before it could be arranged, and still is until someone does. */
  private async automatic(now: Date, language?: string): Promise<HomeLayoutResult> {
    const row = (where: Prisma.TitleWhereInput) =>
      this.prisma.title.findMany({
        where: { AND: [visibleTitle(now), where] },
        orderBy: NEWEST,
        include: CARD_INCLUDE,
        take: AUTOMATIC_ROW_SIZE,
      });
    const [found, names] = await Promise.all([
      this.prisma.category.findMany({
        where: { titles: { some: { title: visibleTitle(now) } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: AUTOMATIC_CATEGORY_ROWS,
        select: { slug: true, name: true },
      }),
      this.terms.names('category', language),
    ]);
    const categories = found.map((category) => ({
      slug: category.slug,
      name: names.get(category.slug) ?? category.name,
    }));
    const [featured = [], latest = [], ...perCategory] = await Promise.all([
      row({ isFeatured: true }),
      row({}),
      ...categories.map((category) =>
        row({ categories: { some: { category: { slug: category.slug } } } }),
      ),
    ]);

    const lead = featured.length > 0 ? featured : latest;
    const opening = lead.find((title) => title.backdropId) ?? lead[0];
    const rows: HomeRow[] = [
      {
        key: 'continue',
        name: 'Continue watching',
        kind: 'continue',
        layout: 'poster',
        category: null,
        browse: null,
        titles: [],
      },
      {
        key: 'list',
        name: 'My list',
        kind: 'list',
        layout: 'poster',
        category: null,
        browse: '/my-list',
        titles: [],
      },
      // A featured row with a single title would only repeat the opening.
      ...(featured.length >= 2
        ? [this.automaticRow('featured', 'Featured', '/browse?featured=true', featured)]
        : []),
      this.automaticRow('latest', 'New', '/browse', latest),
      {
        key: 'recommended',
        name: 'Because you watched',
        kind: 'recommended',
        layout: 'poster',
        category: null,
        browse: null,
        titles: [],
      },
      ...categories.map((category, index) => ({
        ...this.automaticRow(
          `category:${category.slug}`,
          category.name,
          `/browse?category=${category.slug}`,
          perCategory[index] ?? [],
        ),
        category,
      })),
    ];
    return {
      custom: false,
      hero: opening ? [opening] : null,
      // A catalog with nothing to watch has no page, also no place for started videos.
      rows:
        latest.length === 0
          ? []
          : rows.filter((entry) => entry.kind !== 'titles' || entry.titles.length > 0),
    };
  }

  private automaticRow(key: string, name: string, browse: string, titles: CardTitle[]): HomeRow {
    return { key, name, kind: 'titles', layout: 'poster', category: null, browse, titles };
  }

  /** The titles a section shows to viewers at a moment, in its order. */
  private async titlesOf(
    section: SectionRecord,
    now: Date,
    take: number,
    scope?: PageScope,
  ): Promise<CardTitle[]> {
    const type: Prisma.TitleWhereInput = section.titleType ? { type: section.titleType } : {};
    // On the page of a category or genre, every section stays inside it.
    const inScope: Prisma.TitleWhereInput = !scope
      ? {}
      : scope.kind === 'category'
        ? { categories: { some: { categoryId: scope.id } } }
        : { genres: { some: { genreId: scope.id } } };
    const visible = {
      AND: [visibleTitle(now), type, inScope],
    } satisfies Prisma.TitleWhereInput;

    if (section.source === 'MANUAL') {
      const picked = await this.prisma.homeSectionTitle.findMany({
        where: { sectionId: section.id, title: visible },
        orderBy: { position: 'asc' },
        take,
        include: { title: { include: CARD_INCLUDE } },
      });
      return picked.map((entry) => entry.title);
    }
    if (section.source === 'COLLECTION' && section.sort === 'CURATED') {
      if (!section.collectionId) {
        return [];
      }
      const members = await this.prisma.collectionTitle.findMany({
        where: { collectionId: section.collectionId, title: visible },
        orderBy: { position: 'asc' },
        take,
        include: { title: { include: CARD_INCLUDE } },
      });
      return members.map((entry) => entry.title);
    }

    const source: Prisma.TitleWhereInput =
      section.source === 'FEATURED'
        ? { isFeatured: true }
        : section.source === 'CATEGORY'
          ? { categories: { some: { categoryId: section.categoryId ?? undefined } } }
          : section.source === 'GENRE'
            ? { genres: { some: { genreId: section.genreId ?? undefined } } }
            : section.source === 'COLLECTION'
              ? { collections: { some: { collectionId: section.collectionId ?? undefined } } }
              : {};
    // A category, genre or collection that was not chosen shows nothing, not everything.
    if (
      (section.source === 'CATEGORY' && !section.categoryId) ||
      (section.source === 'GENRE' && !section.genreId) ||
      (section.source === 'COLLECTION' && !section.collectionId)
    ) {
      return [];
    }
    const find = (extra: Prisma.TitleWhereInput) =>
      this.prisma.title.findMany({
        where: { AND: [visible, source, extra] },
        orderBy: ORDER[section.sort === 'CURATED' ? 'NEWEST' : section.sort],
        take,
        include: CARD_INCLUDE,
      });
    if (section.kind === 'HERO') {
      // The opening is a picture first. Titles without one are the last resort.
      const pictured = await find({ backdropId: { not: null } });
      return pictured.length > 0 ? pictured : find({});
    }
    return find({});
  }

  // --- For admins -----------------------------------------------------------------

  /** Every page, with whether it is arranged. */
  async pages(): Promise<PageSummary[]> {
    const counts = await this.prisma.homeSection.groupBy({ by: ['page'], _count: { _all: true } });
    return LAYOUT_PAGES.map((page) => {
      const sections = counts.find((entry) => entry.page === page)?._count._all ?? 0;
      return { page, custom: sections > 0, sections };
    });
  }

  /**
   * @param exampleId On the page of categories or genres: the one to show
   *   the sections with. Left out, or unknown, the first one that has titles.
   */
  async get(
    page: LayoutPage = 'HOME',
    now: Date = new Date(),
    exampleId?: string,
  ): Promise<HomeView> {
    const sections = await this.prisma.homeSection.findMany({
      where: { page },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      include: SECTION_INCLUDE,
    });
    const scope = await this.exampleOf(page, exampleId);
    return {
      page,
      example: scope ? { id: scope.id, slug: scope.slug, name: scope.name } : null,
      custom: sections.length > 0,
      sections: await Promise.all(sections.map((section) => this.toView(section, now, scope))),
    };
  }

  /**
   * The category or genre with a slug, for its page on the website.
   *
   * @returns Null when there is none, or when it has nothing viewers can watch.
   */
  async scopeOf(
    kind: PageScope['kind'],
    slug: string,
  ): Promise<(PageScope & { description: string | null }) | null> {
    const shown = { titles: { some: { title: visibleTitle() } } };
    if (kind === 'category') {
      const category = await this.prisma.category.findFirst({ where: { slug, ...shown } });
      return category
        ? {
            kind,
            id: category.id,
            slug: category.slug,
            name: category.name,
            description: category.description,
          }
        : null;
    }
    const genre = await this.prisma.genre.findFirst({ where: { slug, ...shown } });
    return genre
      ? { kind, id: genre.id, slug: genre.slug, name: genre.name, description: null }
      : null;
  }

  /** The category or genre the panel shows a page of categories or genres with. */
  private async exampleOf(page: LayoutPage, wantedId?: string): Promise<PageScope | undefined> {
    const kind = SCOPE_OF[page];
    if (!kind) {
      return undefined;
    }
    const shown = { titles: { some: { title: visibleTitle() } } };
    const pick = <Row extends { id: string; slug: string; name: string }>(
      rows: Row[],
    ): PageScope | undefined => {
      const row = rows.find((entry) => entry.id === wantedId) ?? rows[0];
      return row ? { kind, id: row.id, slug: row.slug, name: row.name } : undefined;
    };
    return kind === 'category'
      ? pick(
          await this.prisma.category.findMany({
            where: wantedId ? { OR: [{ id: wantedId }, shown] } : shown,
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          }),
        )
      : pick(
          await this.prisma.genre.findMany({
            where: wantedId ? { OR: [{ id: wantedId }, shown] } : shown,
            orderBy: { name: 'asc' },
          }),
        );
  }

  /**
   * Takes a page over: makes sections for an admin to change. For the home
   * page they show what the automatic page shows now. For "Movies" and
   * "Series" they are a first page of that kind: an opening, the featured,
   * the newest, the best rated, and a row per category.
   *
   * @throws ConflictException when the page is arranged already.
   */
  async start(page: LayoutPage = 'HOME'): Promise<HomeView> {
    if ((await this.prisma.homeSection.count({ where: { page } })) > 0) {
      throw new ConflictException('The page is arranged already');
    }
    const sections = await this.firstSections(page);
    await this.prisma.homeSection.createMany({
      data: sections.map((section, position) => ({ ...section, page, position })),
    });
    return this.get(page);
  }

  /** The sections a page starts with when it is taken over. */
  private async firstSections(
    page: LayoutPage,
  ): Promise<Omit<Prisma.HomeSectionCreateManyInput, 'page'>[]> {
    if (page === 'LIVE') {
      // Under the channels: something to watch when nothing on air appeals.
      return [
        { kind: 'TITLES', source: 'FEATURED', sort: 'NEWEST', layout: 'LANDSCAPE' },
        { kind: 'TITLES', source: 'ALL', sort: 'NEWEST' },
      ];
    }
    if (SCOPE_OF[page]) {
      // Every section shows the titles of the category or genre the page is opened for.
      return [
        { kind: 'HERO', source: 'ALL', sort: 'NEWEST', limit: 5 },
        { kind: 'TITLES', source: 'FEATURED', sort: 'NEWEST', layout: 'LANDSCAPE' },
        { kind: 'TITLES', source: 'ALL', sort: 'NEWEST' },
        { kind: 'TITLES', source: 'ALL', sort: 'RATING' },
        { kind: 'TITLES', source: 'ALL', sort: 'NEWEST', titleType: 'MOVIE' },
        { kind: 'TITLES', source: 'ALL', sort: 'NEWEST', titleType: 'SERIES' },
      ];
    }
    const titleType = PAGE_TYPE[page];
    const ofPage: Prisma.TitleWhereInput = titleType ? { type: titleType } : {};
    const categories = await this.prisma.category.findMany({
      where: { titles: { some: { title: { AND: [visibleTitle(), ofPage] } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      take: AUTOMATIC_CATEGORY_ROWS,
      select: { id: true },
    });
    const row = { kind: 'TITLES', titleType } as const;
    return [
      { kind: 'HERO', source: 'FEATURED', sort: 'NEWEST', limit: 5, titleType },
      // What a viewer started belongs to the first page, not to every page.
      ...(page === 'HOME'
        ? [{ kind: 'CONTINUE_WATCHING' as const }, { kind: 'MY_LIST' as const }]
        : []),
      { ...row, source: 'FEATURED', sort: 'NEWEST' },
      { ...row, source: 'ALL', sort: 'NEWEST' },
      // Rows made from what the profile watched, below what is new for everybody.
      ...(page === 'HOME'
        ? [{ kind: 'BECAUSE_YOU_WATCHED' as const }]
        : [{ ...row, source: 'ALL' as const, sort: 'RATING' as const }]),
      ...categories.map((category) => ({
        ...row,
        source: 'CATEGORY' as const,
        categoryId: category.id,
        sort: 'NEWEST' as const,
      })),
    ];
  }

  /** Gives a page back to what it is without sections. Every section of it is deleted. */
  async reset(page: LayoutPage = 'HOME'): Promise<number> {
    const { count } = await this.prisma.homeSection.deleteMany({ where: { page } });
    return count;
  }

  async create(page: LayoutPage, input: CreateSectionInput): Promise<HomeSectionView> {
    const existing = await this.prisma.homeSection.findMany({
      where: { page },
      select: { kind: true },
    });
    if (existing.length >= MAX_SECTIONS) {
      throw new ConflictException(`A page has ${MAX_SECTIONS} sections at most`);
    }
    if (page === 'LIVE' && input.kind === 'HERO') {
      throw new BadRequestException('The live page opens with its channels, so it has no opening');
    }
    if (input.kind !== 'TITLES' && existing.some((section) => section.kind === input.kind)) {
      throw new ConflictException(
        input.kind === 'HERO'
          ? 'The page has an opening already'
          : input.kind === 'MY_LIST'
            ? 'The page has a place for "My list" already'
            : input.kind === 'BECAUSE_YOU_WATCHED'
              ? 'The page has a place for "Because you watched" already'
              : 'The page has a place for "Continue watching" already',
      );
    }
    const { titleIds, kind, ...fields } = input;
    const source = fields.source ?? (kind === 'HERO' ? 'FEATURED' : 'ALL');
    const data = {
      page,
      kind,
      name: fields.name ?? null,
      source,
      categoryId: fields.categoryId ?? null,
      genreId: fields.genreId ?? null,
      collectionId: fields.collectionId ?? null,
      // A row of the page for movies shows movies, unless it is told otherwise.
      titleType: fields.titleType === undefined ? PAGE_TYPE[page] : fields.titleType,
      sort: sortFor(source, fields.sort ?? (source === 'COLLECTION' ? 'CURATED' : 'NEWEST')),
      limit: fields.limit ?? (kind === 'HERO' ? 5 : 20),
      layout: fields.layout ?? 'POSTER',
      visible: fields.visible ?? true,
      visibleFrom: fields.visibleFrom ? new Date(fields.visibleFrom) : null,
      visibleUntil: fields.visibleUntil ? new Date(fields.visibleUntil) : null,
    } as const;
    await this.check(data, titleIds);

    const section = await this.prisma.$transaction(async (tx) => {
      // The opening stands first. Everything else goes to the end.
      if (kind === 'HERO') {
        await tx.homeSection.updateMany({ where: { page }, data: { position: { increment: 1 } } });
      }
      const created = await tx.homeSection.create({
        data: { ...data, position: kind === 'HERO' ? 0 : existing.length },
      });
      await this.putTitles(tx, created.id, data.source, titleIds);
      return created;
    });
    return this.view(section.id);
  }

  async update(id: string, input: UpdateSectionInput): Promise<HomeSectionView> {
    const current = await this.prisma.homeSection.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Section not found');
    }
    const { titleIds, visibleFrom, visibleUntil, ...fields } = input;
    const next = {
      ...current,
      ...fields,
      visibleFrom:
        visibleFrom === undefined
          ? current.visibleFrom
          : visibleFrom
            ? new Date(visibleFrom)
            : null,
      visibleUntil:
        visibleUntil === undefined
          ? current.visibleUntil
          : visibleUntil
            ? new Date(visibleUntil)
            : null,
    };
    next.sort = sortFor(next.source, next.sort);
    await this.check(next, titleIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.homeSection.update({
        where: { id },
        data: {
          name: next.name,
          source: next.source,
          // What the source does not use is let go, so that it cannot come back by surprise.
          categoryId: next.source === 'CATEGORY' ? next.categoryId : null,
          genreId: next.source === 'GENRE' ? next.genreId : null,
          collectionId: next.source === 'COLLECTION' ? next.collectionId : null,
          titleType: next.titleType,
          sort: next.sort,
          limit: next.limit,
          layout: next.layout,
          visible: next.visible,
          visibleFrom: next.visibleFrom,
          visibleUntil: next.visibleUntil,
        },
      });
      await this.putTitles(tx, id, next.source, titleIds);
    });
    return this.view(id);
  }

  async remove(id: string): Promise<HomeSectionView> {
    const view = await this.view(id);
    await this.prisma.homeSection.delete({ where: { id } });
    return view;
  }

  /**
   * Sets the order of all sections.
   *
   * @throws BadRequestException when the list is not exactly the sections there are.
   */
  async order(page: LayoutPage, ids: readonly string[]): Promise<HomeView> {
    const existing = await this.prisma.homeSection.findMany({
      where: { page },
      select: { id: true },
    });
    const known = new Set(existing.map((section) => section.id));
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== known.size ||
      !ids.every((id) => known.has(id))
    ) {
      throw new BadRequestException('Send every section of the page once, in the new order');
    }
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.homeSection.update({ where: { id }, data: { position } }),
      ),
    );
    return this.get(page);
  }

  // --- Inside --------------------------------------------------------------------

  private async check(
    section: {
      kind: SectionRecord['kind'];
      source: SectionRecord['source'];
      categoryId: string | null;
      genreId: string | null;
      collectionId: string | null;
      limit: number;
      visibleFrom: Date | null;
      visibleUntil: Date | null;
    },
    titleIds: readonly string[] | undefined,
  ): Promise<void> {
    if (
      section.visibleFrom &&
      section.visibleUntil &&
      section.visibleUntil <= section.visibleFrom
    ) {
      throw new BadRequestException('The end of the dates must come after their start');
    }
    if (isOwnRow(section.kind)) {
      return;
    }
    if (section.kind === 'HERO' && section.limit > MAX_HERO_TITLES) {
      throw new BadRequestException(`The opening shows ${MAX_HERO_TITLES} titles at most`);
    }
    if (section.kind === 'TITLES' && section.limit < MIN_ROW_TITLES) {
      throw new BadRequestException(`A row shows ${MIN_ROW_TITLES} titles at least`);
    }
    const missing = async (what: string, id: string | null, count: () => Promise<number>) => {
      if (!id) {
        throw new BadRequestException(`Choose the ${what} the section shows`);
      }
      if ((await count()) === 0) {
        throw new BadRequestException(`The chosen ${what} does not exist`);
      }
    };
    if (section.source === 'CATEGORY') {
      await missing('category', section.categoryId, () =>
        this.prisma.category.count({ where: { id: section.categoryId ?? undefined } }),
      );
    }
    if (section.source === 'GENRE') {
      await missing('genre', section.genreId, () =>
        this.prisma.genre.count({ where: { id: section.genreId ?? undefined } }),
      );
    }
    if (section.source === 'COLLECTION') {
      await missing('collection', section.collectionId, () =>
        this.prisma.collection.count({ where: { id: section.collectionId ?? undefined } }),
      );
    }
    if (titleIds && titleIds.length > 0) {
      const found = await this.prisma.title.count({ where: { id: { in: [...titleIds] } } });
      if (found !== new Set(titleIds).size) {
        throw new BadRequestException('One of the picked titles does not exist');
      }
    }
  }

  /** Replaces the picked titles when a list was sent, and lets them go when the source changed. */
  private async putTitles(
    tx: Prisma.TransactionClient,
    sectionId: string,
    source: SectionRecord['source'],
    titleIds: readonly string[] | undefined,
  ): Promise<void> {
    if (source !== 'MANUAL') {
      await tx.homeSectionTitle.deleteMany({ where: { sectionId } });
      return;
    }
    if (!titleIds) {
      return;
    }
    await tx.homeSectionTitle.deleteMany({ where: { sectionId } });
    await tx.homeSectionTitle.createMany({
      data: [...new Set(titleIds)].map((titleId, position) => ({ sectionId, titleId, position })),
    });
  }

  private async view(id: string): Promise<HomeSectionView> {
    const section = await this.prisma.homeSection.findUnique({
      where: { id },
      include: SECTION_INCLUDE,
    });
    if (!section) {
      throw new NotFoundException('Section not found');
    }
    return this.toView(section, new Date(), await this.exampleOf(section.page));
  }

  private async toView(
    section: SectionRecord,
    now: Date,
    scope?: PageScope,
  ): Promise<HomeSectionView> {
    const titles = isOwnRow(section.kind)
      ? []
      : await this.titlesOf(section, now, section.limit, scope);
    const picked =
      section.source === 'MANUAL' && section.titles.length > 0
        ? await this.prisma.title.findMany({
            where: { id: { in: section.titles.map((entry) => entry.titleId) } },
            select: { id: true, name: true, type: true },
          })
        : [];
    const byId = new Map(picked.map((title) => [title.id, title]));
    // Asked apart from the row: a picked title past the limit is hidden by the limit, not from viewers.
    const seen = new Set(
      picked.length > 0
        ? (
            await this.prisma.title.findMany({
              where: { AND: [visibleTitle(now), { id: { in: picked.map((title) => title.id) } }] },
              select: { id: true },
            })
          ).map((title) => title.id)
        : [],
    );
    const ref = (value: { id: string; name: string } | null) =>
      value ? { id: value.id, name: value.name } : null;

    return {
      id: section.id,
      position: section.position,
      kind: section.kind,
      name: section.name,
      defaultName: defaultSectionName(section, PAGE_TYPE[section.page]),
      source: section.source,
      category: ref(section.category),
      genre: ref(section.genre),
      collection: ref(section.collection),
      titleType: section.titleType,
      sort: section.sort,
      limit: section.limit,
      layout: section.layout,
      visible: section.visible,
      visibleFrom: section.visibleFrom,
      visibleUntil: section.visibleUntil,
      shownNow: isShownAt(section, now) && (isOwnRow(section.kind) || titles.length > 0),
      picked: section.titles.flatMap((entry) => {
        const title = byId.get(entry.titleId);
        return title ? [{ ...title, visible: seen.has(title.id) }] : [];
      }),
      preview: titles.slice(0, PREVIEW_SIZE),
      count: titles.length,
    };
  }
}
