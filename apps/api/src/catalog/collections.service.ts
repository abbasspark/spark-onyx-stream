// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Asset, Prisma, PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import type {
  CollectionTitlesInput,
  CreateCollectionInput,
  CreateExtraInput,
  OrderCollectionsInput,
  OrderExtrasInput,
  UpdateCollectionInput,
  UpdateExtraInput,
} from './catalog.schemas.js';
import {
  type CollectionDetail,
  type CollectionView,
  type ExtraView,
  toExtraViews,
  toImageView,
} from './catalog.views.js';
import { slugify, uniqueSlug } from './slug.js';

/** How many posters of its titles stand in for a collection without a poster. */
const COVERS = 4;

const LIST_INCLUDE = {
  poster: true,
  backdrop: true,
  _count: { select: { titles: true } },
  titles: {
    where: { title: { posterId: { not: null } } },
    orderBy: { position: 'asc' },
    take: COVERS,
    select: { title: { select: { poster: true } } },
  },
} satisfies Prisma.CollectionInclude;

type CollectionRecord = Prisma.CollectionGetPayload<{ include: typeof LIST_INCLUDE }>;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Collections of titles, and the extra videos of a title. */
@Injectable()
export class CollectionsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  private view(collection: CollectionRecord): CollectionView {
    const image = (value: CollectionRecord['poster']) =>
      value ? toImageView(value, this.config.mediaBaseUrl) : null;
    return {
      id: collection.id,
      slug: collection.slug,
      name: collection.name,
      synopsis: collection.synopsis,
      visible: collection.visible,
      position: collection.position,
      poster: image(collection.poster),
      backdrop: image(collection.backdrop),
      titleCount: collection._count.titles,
      covers: collection.titles.flatMap(({ title }) =>
        title.poster ? [toImageView(title.poster, this.config.mediaBaseUrl)] : [],
      ),
      metadataSource: collection.metadataSource,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
  }

  async list(): Promise<CollectionView[]> {
    const collections = await this.prisma.collection.findMany({
      include: LIST_INCLUDE,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return collections.map((collection) => this.view(collection));
  }

  /** @throws NotFoundException when the collection does not exist. */
  async get(id: string): Promise<CollectionDetail> {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: LIST_INCLUDE,
    });
    if (!collection) {
      throw new NotFoundException('Collection not found');
    }
    const titles = await this.prisma.collectionTitle.findMany({
      where: { collectionId: id },
      orderBy: [{ position: 'asc' }, { titleId: 'asc' }],
      select: {
        title: {
          select: {
            id: true,
            type: true,
            name: true,
            releaseYear: true,
            status: true,
            poster: true,
          },
        },
      },
    });
    return {
      ...this.view(collection),
      titles: titles.map(({ title }) => ({
        ...title,
        poster: title.poster ? toImageView(title.poster, this.config.mediaBaseUrl) : null,
      })),
    };
  }

  private async assertTitles(titleIds: readonly string[]): Promise<void> {
    if (titleIds.length === 0) {
      return;
    }
    const found = await this.prisma.title.count({ where: { id: { in: [...titleIds] } } });
    if (found !== new Set(titleIds).size) {
      throw new BadRequestException('One of the chosen titles does not exist');
    }
  }

  private async assertImages(ids: readonly (string | null | undefined)[]): Promise<void> {
    const wanted = ids.filter((id): id is string => typeof id === 'string');
    if (wanted.length === 0) {
      return;
    }
    const found = await this.prisma.image.count({ where: { id: { in: wanted } } });
    if (found !== new Set(wanted).size) {
      throw new BadRequestException('One of the chosen pictures does not exist');
    }
  }

  async create(input: CreateCollectionInput): Promise<CollectionDetail> {
    const titleIds = [...new Set(input.titleIds ?? [])];
    await this.assertTitles(titleIds);
    const slug =
      input.slug ??
      (await uniqueSlug(slugify(input.name), async (value) =>
        Boolean(
          await this.prisma.collection.findUnique({ where: { slug: value }, select: { id: true } }),
        ),
      ));
    const last = await this.prisma.collection.aggregate({ _max: { position: true } });
    try {
      const collection = await this.prisma.collection.create({
        data: {
          name: input.name,
          slug,
          synopsis: input.synopsis ?? '',
          visible: input.visible ?? true,
          // A new collection goes to the end.
          position: (last._max.position ?? -1) + 1,
          titles: { create: titleIds.map((titleId, position) => ({ titleId, position })) },
        },
        select: { id: true },
      });
      return await this.get(collection.id);
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('Another collection already uses this slug')
        : error;
    }
  }

  async update(id: string, input: UpdateCollectionInput): Promise<CollectionDetail> {
    await this.get(id);
    await this.assertImages([input.posterId, input.backdropId]);
    try {
      await this.prisma.collection.update({ where: { id }, data: input });
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('Another collection already uses this slug')
        : error;
    }
    return this.get(id);
  }

  /** Sets which titles the collection holds, and in which order. */
  async setTitles(id: string, input: CollectionTitlesInput): Promise<CollectionDetail> {
    await this.get(id);
    await this.assertTitles(input.titleIds);
    await this.prisma.$transaction([
      this.prisma.collectionTitle.deleteMany({ where: { collectionId: id } }),
      this.prisma.collectionTitle.createMany({
        data: input.titleIds.map((titleId, position) => ({ collectionId: id, titleId, position })),
      }),
    ]);
    return this.get(id);
  }

  /** Puts the collections into the given order. The list must name every collection exactly once. */
  async order(input: OrderCollectionsInput): Promise<CollectionView[]> {
    const all = await this.prisma.collection.findMany({ select: { id: true } });
    const known = new Set(all.map((collection) => collection.id));
    if (
      input.ids.length !== known.size ||
      new Set(input.ids).size !== known.size ||
      input.ids.some((value) => !known.has(value))
    ) {
      throw new BadRequestException('The order must name every collection exactly once');
    }
    await this.prisma.$transaction(
      input.ids.map((collectionId, position) =>
        this.prisma.collection.update({ where: { id: collectionId }, data: { position } }),
      ),
    );
    return this.list();
  }

  /** Deletes the collection. Its titles stay in the catalog. */
  async remove(id: string): Promise<{ name: string }> {
    const collection = await this.get(id);
    await this.prisma.collection.delete({ where: { id } });
    return { name: collection.name };
  }

  // --- Extras ---------------------------------------------------------------------

  private async extrasOf(titleId: string): Promise<ExtraView[]> {
    return toExtraViews(
      await this.prisma.titleExtra.findMany({ where: { titleId }, include: { asset: true } }),
    );
  }

  private async assertTitle(titleId: string): Promise<void> {
    const title = await this.prisma.title.findUnique({
      where: { id: titleId },
      select: { id: true },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
  }

  private async usableAsset(assetId: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status === 'DELETED') {
      throw new BadRequestException('The chosen video does not exist');
    }
    return asset;
  }

  /** Adds a video of the library to the extras of a title, at the end. */
  async addExtra(titleId: string, input: CreateExtraInput): Promise<ExtraView[]> {
    await this.assertTitle(titleId);
    await this.usableAsset(input.assetId);
    const last = await this.prisma.titleExtra.aggregate({
      where: { titleId },
      _max: { position: true },
    });
    try {
      await this.prisma.titleExtra.create({
        data: {
          titleId,
          kind: input.kind,
          name: input.name,
          assetId: input.assetId,
          position: (last._max.position ?? -1) + 1,
        },
      });
    } catch (error) {
      throw isUniqueViolation(error)
        ? new ConflictException('This video is among the extras of the title already')
        : error;
    }
    return this.extrasOf(titleId);
  }

  private async extraOrThrow(id: string): Promise<{ titleId: string; name: string }> {
    const extra = await this.prisma.titleExtra.findUnique({
      where: { id },
      select: { titleId: true, name: true },
    });
    if (!extra) {
      throw new NotFoundException('Extra not found');
    }
    return extra;
  }

  async updateExtra(
    id: string,
    input: UpdateExtraInput,
  ): Promise<{ titleId: string; extras: ExtraView[] }> {
    const { titleId } = await this.extraOrThrow(id);
    await this.prisma.titleExtra.update({ where: { id }, data: input });
    return { titleId, extras: await this.extrasOf(titleId) };
  }

  /** Takes a video out of the extras. The video stays in the library. */
  async removeExtra(id: string): Promise<{ titleId: string; name: string }> {
    const extra = await this.extraOrThrow(id);
    await this.prisma.titleExtra.delete({ where: { id } });
    return extra;
  }

  /** Puts the extras of a title into the given order. The list must name each exactly once. */
  async orderExtras(titleId: string, input: OrderExtrasInput): Promise<ExtraView[]> {
    await this.assertTitle(titleId);
    const all = await this.prisma.titleExtra.findMany({ where: { titleId }, select: { id: true } });
    const known = new Set(all.map((extra) => extra.id));
    if (
      input.ids.length !== known.size ||
      new Set(input.ids).size !== known.size ||
      input.ids.some((value) => !known.has(value))
    ) {
      throw new BadRequestException('The order must name every extra of the title exactly once');
    }
    await this.prisma.$transaction(
      input.ids.map((extraId, position) =>
        this.prisma.titleExtra.update({ where: { id: extraId }, data: { position } }),
      ),
    );
    return this.extrasOf(titleId);
  }
}
