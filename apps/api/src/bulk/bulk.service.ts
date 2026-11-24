// SPDX-License-Identifier: AGPL-3.0-only
import { BadRequestException, HttpException, Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import type { UpdateTitleInput } from '../catalog/catalog.schemas.js';
import { TitlesService } from '../catalog/titles.service.js';
import { TitleHistoryService } from '../history/title-history.service.js';
import { type BulkAction, type BulkInput, MAX_TITLES } from './bulk.schemas.js';
import { type TranslationJobView, TranslationJobsService } from './translation-jobs.service.js';

/** How many failures an answer names. The rest is only counted. */
const FAILURES_NAMED = 100;
/** Titles read at once. */
const CHUNK = 500;

export interface BulkFailure {
  titleId: string;
  name: string;
  reason: string;
}

export interface BulkResult {
  action: BulkAction['type'];
  /** How many titles the selection meant. */
  matched: number;
  changed: number;
  /** Titles that were as asked already. */
  unchanged: number;
  failed: number;
  /** The first failures, with the reason of each. */
  failures: BulkFailure[];
  /** Set by "translate": the job that does the work, in the background. */
  job: TranslationJobView | null;
}

/** What is known of a title before it is changed. */
interface Row {
  id: string;
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  isFeatured: boolean;
  minAge: number | null;
  availableFrom: Date | null;
  availableUntil: Date | null;
  categories: { categoryId: string }[];
  genres: { genreId: string }[];
  collections: { collectionId: string }[];
}

const STATUS_OF = { publish: 'PUBLISHED', unpublish: 'DRAFT', archive: 'ARCHIVED' } as const;

function reasonOf(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null) {
      const { message, issues } = body as {
        message?: unknown;
        issues?: { message?: string }[];
      };
      // The checklist of a title that cannot be published says more than "Validation failed".
      if (Array.isArray(issues) && issues.length > 0) {
        return issues
          .map((issue) => issue.message)
          .filter(Boolean)
          .join('. ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }
    return error.message;
  }
  return 'Something went wrong. The log of the server has the details';
}

/** The set after adding and removing, or null when it stays the same. */
function merged(
  current: readonly string[],
  add: readonly string[],
  remove: readonly string[],
): string[] | null {
  const gone = new Set(remove);
  const next = new Set(current.filter((id) => !gone.has(id)));
  for (const id of add) {
    // Asked to add and to remove the same: it is added.
    next.add(id);
  }
  const same = next.size === current.length && current.every((id) => next.has(id));
  return same ? null : [...next];
}

function sameMoment(current: Date | null, wanted: string | null): boolean {
  return wanted === null ? current === null : current?.getTime() === new Date(wanted).getTime();
}

/**
 * One action on many titles.
 *
 * Each title goes through the same doors as a change of one title, so the
 * rules are the same: a title with open points is not published, a published
 * title is not deleted. A title that cannot be changed is named with its
 * reason and the others go on.
 */
@Injectable()
export class BulkService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(TitlesService) private readonly titles: TitlesService,
    @Inject(TranslationJobsService) private readonly jobs: TranslationJobsService,
    @Inject(TitleHistoryService) private readonly history: TitleHistoryService,
  ) {}

  async run(input: BulkInput, adminId: string | null): Promise<BulkResult> {
    const ids = await this.selection(input);
    const { action } = input;
    const result: BulkResult = {
      action: action.type,
      matched: ids.length,
      changed: 0,
      unchanged: 0,
      failed: 0,
      failures: [],
      job: null,
    };
    if (ids.length === 0) {
      return result;
    }

    if (action.type === 'translate') {
      result.job = await this.jobs.create(ids, action.language, action.overwrite, adminId);
      return result;
    }
    await this.assertExist(action);
    const touched: string[] = [];

    for (let start = 0; start < ids.length; start += CHUNK) {
      const rows: Row[] = await this.prisma.title.findMany({
        where: { id: { in: ids.slice(start, start + CHUNK) } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          status: true,
          isFeatured: true,
          minAge: true,
          availableFrom: true,
          availableUntil: true,
          categories: { select: { categoryId: true } },
          genres: { select: { genreId: true } },
          collections: { select: { collectionId: true } },
        },
      });
      for (const row of rows) {
        try {
          const changed = await this.apply(row, action);
          result[changed ? 'changed' : 'unchanged'] += 1;
          if (changed) {
            touched.push(row.id);
          }
        } catch (error) {
          result.failed += 1;
          if (result.failures.length < FAILURES_NAMED) {
            result.failures.push({ titleId: row.id, name: row.name, reason: reasonOf(error) });
          }
        }
      }
    }
    // Titles deleted by someone else since the selection was made.
    result.matched = result.changed + result.unchanged + result.failed;
    if (action.type !== 'delete') {
      await this.history.captureMany(touched, adminId, 'bulk');
    }
    return result;
  }

  private async selection(input: BulkInput): Promise<string[]> {
    if (input.ids) {
      return [...new Set(input.ids)];
    }
    const { ids, total } = await this.titles.idsOf(input.filter ?? {}, MAX_TITLES);
    if (total > MAX_TITLES) {
      throw new BadRequestException(
        `The filters match ${total} titles. One action changes ${MAX_TITLES} at most: narrow the filters`,
      );
    }
    return ids;
  }

  /** A shelf that does not exist fails the request once, not every title with the same words. */
  private async assertExist(action: BulkAction): Promise<void> {
    if (action.type !== 'categories' && action.type !== 'genres' && action.type !== 'collections') {
      return;
    }
    if (action.add.length === 0 && action.remove.length === 0) {
      throw new BadRequestException('Choose what to add or to remove');
    }
    const where = { id: { in: action.add } };
    const found =
      action.type === 'categories'
        ? await this.prisma.category.count({ where })
        : action.type === 'genres'
          ? await this.prisma.genre.count({ where })
          : await this.prisma.collection.count({ where });
    if (found !== new Set(action.add).size) {
      throw new BadRequestException(`One of the chosen ${action.type} does not exist`);
    }
  }

  /** @returns false when the title was as asked already. */
  private async apply(row: Row, action: Exclude<BulkAction, { type: 'translate' }>) {
    switch (action.type) {
      case 'publish':
      case 'unpublish':
      case 'archive': {
        const status = STATUS_OF[action.type];
        if (row.status === status) {
          return false;
        }
        await this.titles.setStatus(row.id, { status });
        return true;
      }
      case 'delete':
        await this.titles.remove(row.id);
        return true;
      case 'feature':
        return this.update(
          row.id,
          row.isFeatured === action.value ? null : { isFeatured: action.value },
        );
      case 'age':
        return this.update(row.id, row.minAge === action.minAge ? null : { minAge: action.minAge });
      case 'categories': {
        const categoryIds = merged(
          row.categories.map((entry) => entry.categoryId),
          action.add,
          action.remove,
        );
        return this.update(row.id, categoryIds && { categoryIds });
      }
      case 'genres': {
        const genreIds = merged(
          row.genres.map((entry) => entry.genreId),
          action.add,
          action.remove,
        );
        return this.update(row.id, genreIds && { genreIds });
      }
      case 'collections': {
        const collectionIds = merged(
          row.collections.map((entry) => entry.collectionId),
          action.add,
          action.remove,
        );
        return this.update(row.id, collectionIds && { collectionIds });
      }
      case 'availability': {
        const change: UpdateTitleInput = {};
        if (
          action.availableFrom !== undefined &&
          !sameMoment(row.availableFrom, action.availableFrom)
        ) {
          change.availableFrom = action.availableFrom;
        }
        if (
          action.availableUntil !== undefined &&
          !sameMoment(row.availableUntil, action.availableUntil)
        ) {
          change.availableUntil = action.availableUntil;
        }
        return this.update(row.id, Object.keys(change).length > 0 ? change : null);
      }
    }
  }

  private async update(id: string, change: UpdateTitleInput | null): Promise<boolean> {
    if (!change) {
      return false;
    }
    await this.titles.update(id, change);
    return true;
  }
}
