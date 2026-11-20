// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Query parameters shared by every list endpoint. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export interface Page<Item> {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}

/** Converts page parameters into Prisma's skip and take. */
export function toSkipTake(input: PaginationInput): { skip: number; take: number } {
  return { skip: (input.page - 1) * input.pageSize, take: input.pageSize };
}

export function toPage<Item>(items: Item[], total: number, input: PaginationInput): Page<Item> {
  return { items, total, page: input.page, pageSize: input.pageSize };
}
