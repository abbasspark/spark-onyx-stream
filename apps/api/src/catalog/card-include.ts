// SPDX-License-Identifier: AGPL-3.0-only
import type { Prisma } from '@onyx/database';
import { VISIBLE_EPISODE } from './playable.js';

/** What is read of a title to show it as a card to viewers. */
export const CARD_INCLUDE = {
  poster: true,
  backdrop: true,
  logo: true,
  asset: { select: { durationMs: true } },
  categories: { include: { category: true } },
  packages: { select: { packageId: true } },
  seasons: {
    where: { episodes: { some: VISIBLE_EPISODE } },
    select: { _count: { select: { episodes: { where: VISIBLE_EPISODE } } } },
  },
} satisfies Prisma.TitleInclude;

export type CardTitle = Prisma.TitleGetPayload<{ include: typeof CARD_INCLUDE }>;
