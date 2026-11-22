// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { EDGE_PROTOCOL } from './edge-credentials.js';
import { PURGE_SCOPES } from './edge-state.js';

const name = z.string().trim().min(1).max(80);

/** The address viewers reach an edge at: scheme, host and port, nothing more. */
const publicUrl = z
  .string()
  .trim()
  .max(200)
  .transform((value) => value.replace(/\/+$/, '').toLowerCase())
  .refine((value) => /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/.test(value), {
    message: 'Enter an address of the form https://edge.example.com, without a path',
  });

const location = z
  .string()
  .trim()
  .max(80)
  .transform((value) => (value === '' ? null : value))
  .nullable();

const weight = z.number().int().min(1).max(100);

export const createEdgeSchema = z.object({
  name,
  publicUrl,
  location: location.default(null),
  weight: weight.default(10),
  serveVideo: z.boolean().default(true),
  serveLive: z.boolean().default(true),
  enabled: z.boolean().default(true),
});
export type CreateEdgeInput = z.infer<typeof createEdgeSchema>;

export const updateEdgeSchema = z
  .object({
    name,
    publicUrl,
    location,
    weight,
    serveVideo: z.boolean(),
    serveLive: z.boolean(),
    enabled: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change' });
export type UpdateEdgeInput = z.infer<typeof updateEdgeSchema>;

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** A heartbeat of an agent. Unknown fields of a newer agent are dropped. */
export const edgeReportSchema = z.object({
  protocol: z.number().int().min(1).max(1000).default(EDGE_PROTOCOL),
  version: z.string().trim().min(1).max(40),
  hostname: z.string().trim().max(120).default(''),
  startedAt: z.iso.datetime({ offset: true }),
  counters: z.object({
    requests: count,
    bytesSent: count,
    hits: count,
    misses: count,
    refused: count,
    originErrors: count,
    bytesFetched: count.default(0),
  }),
  activeRequests: count,
  cache: z.object({ bytes: count, files: count, limitBytes: count }),
  system: z.object({
    cpus: z.number().int().min(1).max(4096),
    load1: z.number().min(0).max(100_000).nullable().default(null),
    diskFreeBytes: count.nullable().default(null),
    diskTotalBytes: count.nullable().default(null),
  }),
  /** Commands of the main server the agent has carried out. */
  acknowledged: z.array(z.string().min(1).max(40)).max(50).default([]),
});

export const purgeSchema = z.object({ scope: z.enum(PURGE_SCOPES).default('all') });
export type PurgeInput = z.infer<typeof purgeSchema>;

export const TRAFFIC_RANGES = { '24h': 24, '7d': 7 * 24, '30d': 30 * 24 } as const;
export type TrafficRange = keyof typeof TRAFFIC_RANGES;

export const trafficQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d']).default('24h'),
});
export type TrafficQuery = z.infer<typeof trafficQuerySchema>;
