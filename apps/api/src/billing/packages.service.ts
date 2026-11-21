// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Package, PrismaClient } from '@onyx/database';
import { isUniqueViolation } from '../common/prisma-errors.js';
import type {
  ChangePackageTitlesInput,
  CreatePackageInput,
  UpdatePackageInput,
} from './packages.schemas.js';

/** A package as admins see it. */
export interface PackageView {
  id: string;
  name: string;
  description: string | null;
  position: number;
  /** Titles in it, and how many of them are published and need a subscription. */
  titles: number;
  sellableTitles: number;
  /** Live channels in the package. */
  channels: number;
  /** The plans that open it by name. Plans that open everything are not listed. */
  plans: { id: string; name: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const VIEW_INCLUDE = {
  _count: { select: { titles: true, channels: true } },
  plans: {
    where: { plan: { includesAll: false } },
    select: { plan: { select: { id: true, name: true, position: true } } },
  },
} as const;

type PackageRecord = Package & {
  _count: { titles: number; channels: number };
  plans: { plan: { id: string; name: string; position: number } }[];
};

/**
 * Packages: groups of paid titles that plans open together. A plan either
 * opens everything or names its packages.
 */
@Injectable()
export class PackagesService {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async list(): Promise<PackageView[]> {
    const [packages, sellable] = await Promise.all([
      this.prisma.package.findMany({
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        include: VIEW_INCLUDE,
      }),
      this.prisma.titlePackage.groupBy({
        by: ['packageId'],
        where: { title: { status: 'PUBLISHED', access: 'PAID' } },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map(sellable.map((row) => [row.packageId, row._count._all]));
    return packages.map((item) => toView(item, counts.get(item.id) ?? 0));
  }

  /** @throws ConflictException when the name is taken. */
  async create(input: CreatePackageInput): Promise<PackageView> {
    const last = await this.prisma.package.aggregate({ _max: { position: true } });
    try {
      const created = await this.prisma.package.create({
        data: { ...input, position: (last._max.position ?? -1) + 1 },
        include: VIEW_INCLUDE,
      });
      return toView(created, 0);
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
  }

  /**
   * @throws NotFoundException
   * @throws ConflictException when the name is taken.
   */
  async update(id: string, input: UpdatePackageInput): Promise<PackageView> {
    await this.find(id);
    try {
      await this.prisma.package.update({ where: { id }, data: input });
    } catch (error) {
      throw isUniqueViolation(error) ? nameTaken() : error;
    }
    return this.one(id);
  }

  /**
   * Deletes a package. Its titles stay, and lose only this membership.
   *
   * @throws NotFoundException
   * @throws ConflictException while a plan names it, or its subscribers would lose titles unnoticed.
   */
  async remove(id: string): Promise<Package> {
    const found = await this.find(id);
    const plans = await this.prisma.planPackage.findMany({
      where: { packageId: id },
      select: { plan: { select: { name: true } } },
    });
    if (plans.length > 0) {
      const names = plans.map((link) => link.plan.name).join(', ');
      throw new ConflictException(
        `This package is part of ${plans.length === 1 ? 'the plan' : 'the plans'} ${names}. Take it out of ${plans.length === 1 ? 'that plan' : 'those plans'} first.`,
      );
    }
    await this.prisma.package.delete({ where: { id } });
    return found;
  }

  /**
   * Sets the order of the packages.
   *
   * @throws BadRequestException when the list is not exactly the packages there are.
   */
  async reorder(ids: readonly string[]): Promise<PackageView[]> {
    const existing = await this.prisma.package.findMany({ select: { id: true } });
    const known = new Set(existing.map((item) => item.id));
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== known.size ||
      !ids.every((id) => known.has(id))
    ) {
      throw new BadRequestException('Send every package once, in the order you want');
    }
    await this.prisma.$transaction(
      ids.map((id, position) => this.prisma.package.update({ where: { id }, data: { position } })),
    );
    return this.list();
  }

  /**
   * Puts titles into a package and takes titles out of it.
   *
   * @throws NotFoundException when the package does not exist.
   * @throws BadRequestException when one of the titles does not exist.
   */
  async changeTitles(id: string, input: ChangePackageTitlesInput): Promise<PackageView> {
    await this.find(id);
    const add = [...new Set(input.add)];
    const remove = [...new Set(input.remove)].filter((titleId) => !add.includes(titleId));
    if (add.length > 0) {
      const found = await this.prisma.title.count({ where: { id: { in: add } } });
      if (found !== add.length) {
        throw new BadRequestException('One of the chosen titles does not exist');
      }
    }
    await this.prisma.$transaction([
      this.prisma.titlePackage.deleteMany({ where: { packageId: id, titleId: { in: remove } } }),
      this.prisma.titlePackage.createMany({
        data: add.map((titleId) => ({ titleId, packageId: id })),
        skipDuplicates: true,
      }),
    ]);
    return this.one(id);
  }

  private async find(id: string): Promise<Package> {
    const found = await this.prisma.package.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Package not found');
    }
    return found;
  }

  private async one(id: string): Promise<PackageView> {
    const [found, sellable] = await Promise.all([
      this.prisma.package.findUniqueOrThrow({ where: { id }, include: VIEW_INCLUDE }),
      this.prisma.titlePackage.count({
        where: { packageId: id, title: { status: 'PUBLISHED', access: 'PAID' } },
      }),
    ]);
    return toView(found, sellable);
  }
}

function nameTaken(): ConflictException {
  return new ConflictException('Another package has this name');
}

function toView(item: PackageRecord, sellableTitles: number): PackageView {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    position: item.position,
    titles: item._count.titles,
    channels: item._count.channels,
    sellableTitles,
    plans: item.plans
      .map((link) => link.plan)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ id, name })),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
