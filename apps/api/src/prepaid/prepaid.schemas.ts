// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';
import { MAX_BATCH, MAX_DAYS } from './code-rules.js';

/** A code as a viewer types it: with or without dashes and spaces, in any case. */
export const codeSchema = z.object({ code: z.string().trim().min(1).max(60) });
export type CodeInput = z.infer<typeof codeSchema>;

export const createBatchSchema = z.object({
  /** What the batch is called in the panel. */
  name: z.string().trim().min(1, 'Give the batch a name').max(120),
  planId: z.uuid(),
  /** How many days of the plan one code gives. */
  days: z.number().int().min(1).max(MAX_DAYS),
  /** How many codes to make. */
  count: z.number().int().min(1).max(MAX_BATCH),
  /** Until when the codes can be used. Null: without an end. */
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

export const updateBatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    note: z.string().trim().max(500).nullable(),
  })
  .partial();
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;

export const listBatchesSchema = paginationSchema;
export type ListBatchesInput = z.infer<typeof listBatchesSchema>;

export const CODE_STATES = ['unused', 'redeemed', 'withdrawn'] as const;

export const listCodesSchema = paginationSchema.extend({
  state: z.enum(CODE_STATES).optional(),
});
export type ListCodesInput = z.infer<typeof listCodesSchema>;
