// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@onyx/database';
import type {
  CreateCategoryInput,
  ReorderCategoriesInput,
  UpdateCategoryInput,
} from './catalog.schemas.js';
import { type CategoryView, toCategoryView } from './catalog.views.js';
import { slugify, uniqueSlug } from './slug.js';

const WITH_COUNT = { _count: { select: { titles: true } } } as const;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Categories that viewers browse by, such as genres. */
@Injectable()
export class CategoriesService {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async list(): Promise<CategoryView[]> {
    const categories = await this.prisma.category.findMany({
      include: WITH_COUNT,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return categories.map(toCategoryView);
  }

  async create(input: CreateCategoryInput): Promise<CategoryView> {
    const last = await this.prisma.category.aggregate({ _max: { sortOrder: true } });
    const slug =
      input.slug ?? (await uniqueSlug(slugify(input.name), (value) => this.slugTaken(value)));

    try {
      const category = await this.prisma.category.create({
        data: {
          name: input.name,
          slug,
          description: input.description ?? null,
          // A new category goes to the end of the list.
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        include: WITH_COUNT,
      });
      return toCategoryView(category);
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('A category with this name or slug already exists')
        : error;
    }
  }

  async update(id: string, input: UpdateCategoryInput): Promise<CategoryView> {
    await this.findOrThrow(id);
    try {
      const category = await this.prisma.category.update({
        where: { id },
        data: { name: input.name, slug: input.slug, description: input.description },
        include: WITH_COUNT,
      });
      return toCategoryView(category);
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('A category with this name or slug already exists')
        : error;
    }
  }

  /** Puts the categories into the given order. The list must name every category exactly once. */
  async reorder(input: ReorderCategoriesInput): Promise<CategoryView[]> {
    const existing = await this.prisma.category.findMany({ select: { id: true } });
    const known = new Set(existing.map((category) => category.id));
    const unique = new Set(input.ids);
    if (
      unique.size !== input.ids.length ||
      unique.size !== known.size ||
      !input.ids.every((id) => known.has(id))
    ) {
      throw new BadRequestException('Send every category exactly once');
    }

    await this.prisma.$transaction(
      input.ids.map((id, index) =>
        this.prisma.category.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
    return this.list();
  }

  /** Deletes a category. Titles that carried it keep everything else. */
  async remove(id: string): Promise<CategoryView> {
    const category = await this.findOrThrow(id);
    await this.prisma.category.delete({ where: { id } });
    return category;
  }

  private async findOrThrow(id: string): Promise<CategoryView> {
    const category = await this.prisma.category.findUnique({ where: { id }, include: WITH_COUNT });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return toCategoryView(category);
  }

  private async slugTaken(slug: string): Promise<boolean> {
    return (await this.prisma.category.count({ where: { slug } })) > 0;
  }
}
