// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';
import { ALL_EVENTS, isWebhookEvent } from './webhook-events.js';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Give the webhook a name')
  .max(60, 'Keep the name to 60 characters');

const urlSchema = z.string().trim().min(1, 'Enter the address').max(2000);

/** The events a webhook listens to: names from the list, or "*" alone for all of them. */
const eventsSchema = z
  .array(z.string())
  .min(1, 'Choose at least one event')
  .superRefine((events, context) => {
    const unknown = events.filter((event) => event !== ALL_EVENTS && !isWebhookEvent(event));
    if (unknown.length > 0) {
      context.addIssue({ code: 'custom', message: `Unknown events: ${unknown.join(', ')}` });
    }
  })
  .transform((events) => (events.includes(ALL_EVENTS) ? [ALL_EVENTS] : [...new Set(events)]));

export const createWebhookSchema = z.object({
  name: nameSchema,
  url: urlSchema,
  events: eventsSchema,
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z
  .object({
    name: nameSchema.optional(),
    url: urlSchema.optional(),
    events: eventsSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one field to change',
  });
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export const listDeliveriesSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'DELIVERED', 'FAILED']).optional(),
  event: z.string().trim().max(60).optional(),
});
export type ListDeliveriesInput = z.infer<typeof listDeliveriesSchema>;
