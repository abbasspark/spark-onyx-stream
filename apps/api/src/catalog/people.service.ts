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
  CreateGenreInput,
  CreatePersonInput,
  ListPeopleInput,
  ReplaceCreditsInput,
  UpdateGenreInput,
  UpdatePersonInput,
} from './catalog.schemas.js';
import {
  type CreditView,
  type GenreView,
  type PersonDetail,
  type PersonView,
  toCreditViews,
  toImageView,
  toPersonRef,
} from './catalog.views.js';
import { slugify, uniqueSlug } from './slug.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const PERSON_INCLUDE = { portrait: true, _count: { select: { credits: true } } } as const;
type PersonRecord = Prisma.PersonGetPayload<{ include: typeof PERSON_INCLUDE }>;

/**
 * Genres, and the people of the catalog with their parts in titles.
 *
 * Both come with the details of a title when it is imported, and both can be
 * kept by hand: a genre renamed, a person added who is in no database.
 */
@Injectable()
export class PeopleService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  // --- Genres -------------------------------------------------------------------

  async listGenres(): Promise<GenreView[]> {
    const genres = await this.prisma.genre.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { titles: true } } },
    });
    return genres.map(({ _count, id, slug, name, createdAt }) => ({
      id,
      slug,
      name,
      titleCount: _count.titles,
      createdAt,
    }));
  }

  async createGenre(input: CreateGenreInput): Promise<GenreView> {
    const slug =
      input.slug ??
      (await uniqueSlug(slugify(input.name), async (value) =>
        Boolean(
          await this.prisma.genre.findUnique({ where: { slug: value }, select: { id: true } }),
        ),
      ));
    try {
      const genre = await this.prisma.genre.create({ data: { name: input.name, slug } });
      return { id: genre.id, slug, name: genre.name, titleCount: 0, createdAt: genre.createdAt };
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('A genre with this name or slug already exists')
        : error;
    }
  }

  async updateGenre(id: string, input: UpdateGenreInput): Promise<GenreView> {
    try {
      await this.prisma.genre.update({ where: { id }, data: input });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A genre with this name or slug already exists');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Genre not found');
      }
      throw error;
    }
    return (await this.listGenres()).find((genre) => genre.id === id) as GenreView;
  }

  /** Deletes a genre. The titles that had it stay, without it. */
  async removeGenre(id: string): Promise<GenreView> {
    const genre = (await this.listGenres()).find((candidate) => candidate.id === id);
    if (!genre) {
      throw new NotFoundException('Genre not found');
    }
    await this.prisma.genre.delete({ where: { id } });
    return genre;
  }

  // --- People -------------------------------------------------------------------

  private toPersonView(person: PersonRecord): PersonView {
    return {
      ...toPersonRef(person, this.config.mediaBaseUrl),
      knownFor: person.knownFor,
      biography: person.biography,
      metadata:
        person.metadataSource && person.metadataId
          ? { source: person.metadataSource, id: person.metadataId }
          : null,
      creditCount: person._count.credits,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    };
  }

  async listPeople(input: ListPeopleInput): Promise<Page<PersonView>> {
    const where: Prisma.PersonWhereInput = input.q
      ? { name: { contains: input.q, mode: 'insensitive' } }
      : {};
    const orderBy: Prisma.PersonOrderByWithRelationInput =
      input.sort === 'credits'
        ? { credits: { _count: input.order } }
        : { [input.sort]: input.order };
    const [people, total] = await Promise.all([
      this.prisma.person.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        include: PERSON_INCLUDE,
        ...toSkipTake(input),
      }),
      this.prisma.person.count({ where }),
    ]);
    return toPage(
      people.map((person) => this.toPersonView(person)),
      total,
      input,
    );
  }

  async getPerson(id: string): Promise<PersonDetail> {
    const person = await this.prisma.person.findUnique({
      where: { id },
      include: {
        ...PERSON_INCLUDE,
        credits: {
          include: { title: { include: { poster: true } } },
          orderBy: [
            { title: { releaseYear: { sort: 'desc', nulls: 'last' } } },
            { position: 'asc' },
          ],
        },
      },
    });
    if (!person) {
      throw new NotFoundException('Person not found');
    }
    return {
      ...this.toPersonView(person),
      credits: person.credits.map((credit) => ({
        id: credit.id,
        kind: credit.kind,
        role: credit.role,
        title: {
          id: credit.title.id,
          type: credit.title.type,
          name: credit.title.name,
          releaseYear: credit.title.releaseYear,
          status: credit.title.status,
          poster: credit.title.poster
            ? toImageView(credit.title.poster, this.config.mediaBaseUrl)
            : null,
        },
      })),
    };
  }

  private async assertPortrait(portraitId: string | null | undefined): Promise<void> {
    if (!portraitId) {
      return;
    }
    const image = await this.prisma.image.findUnique({ where: { id: portraitId } });
    if (!image) {
      throw new BadRequestException('The chosen picture does not exist');
    }
  }

  async createPerson(input: CreatePersonInput): Promise<PersonView> {
    await this.assertPortrait(input.portraitId);
    const slug = await uniqueSlug(slugify(input.name), async (value) =>
      Boolean(
        await this.prisma.person.findUnique({ where: { slug: value }, select: { id: true } }),
      ),
    );
    const person = await this.prisma.person.create({
      data: {
        name: input.name,
        slug,
        knownFor: input.knownFor ?? null,
        biography: input.biography ?? null,
        portraitId: input.portraitId ?? null,
      },
      include: PERSON_INCLUDE,
    });
    return this.toPersonView(person);
  }

  async updatePerson(id: string, input: UpdatePersonInput): Promise<PersonView> {
    await this.assertPortrait(input.portraitId);
    try {
      const person = await this.prisma.person.update({
        where: { id },
        data: input,
        include: PERSON_INCLUDE,
      });
      return this.toPersonView(person);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Another person already uses this slug');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Person not found');
      }
      throw error;
    }
  }

  /** Deletes a person, and with them their parts in every title. */
  async removePerson(id: string): Promise<PersonView> {
    const person = await this.prisma.person.findUnique({ where: { id }, include: PERSON_INCLUDE });
    if (!person) {
      throw new NotFoundException('Person not found');
    }
    await this.prisma.person.delete({ where: { id } });
    return this.toPersonView(person);
  }

  // --- Credits ------------------------------------------------------------------

  /**
   * Replaces the cast and crew of a title with the list given, in its order.
   * One call for the whole list, because adding, removing and reordering
   * are one piece of work on the page.
   */
  async replaceCredits(titleId: string, input: ReplaceCreditsInput): Promise<CreditView[]> {
    const title = await this.prisma.title.findUnique({
      where: { id: titleId },
      select: { id: true },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    const personIds = [...new Set(input.credits.map((credit) => credit.personId))];
    const found = await this.prisma.person.count({ where: { id: { in: personIds } } });
    if (found !== personIds.length) {
      throw new BadRequestException('One of the chosen people does not exist');
    }
    const seen = new Set<string>();
    for (const credit of input.credits) {
      const key = `${credit.personId}|${credit.kind}|${(credit.role ?? '').toLowerCase()}`;
      if (seen.has(key)) {
        throw new BadRequestException('The same person is listed twice with the same part');
      }
      seen.add(key);
    }

    const positions = { CAST: 0, CREW: 0 };
    await this.prisma.$transaction([
      this.prisma.credit.deleteMany({ where: { titleId } }),
      this.prisma.credit.createMany({
        data: input.credits.map((credit) => ({
          titleId,
          personId: credit.personId,
          kind: credit.kind,
          role: credit.role,
          position: positions[credit.kind]++,
        })),
      }),
      // The title changed, as far as anyone looking at "last changed" is concerned.
      this.prisma.title.update({ where: { id: titleId }, data: { updatedAt: new Date() } }),
    ]);
    const credits = await this.prisma.credit.findMany({
      where: { titleId },
      include: { person: { include: { portrait: true } } },
    });
    return toCreditViews(credits, this.config.mediaBaseUrl);
  }
}
