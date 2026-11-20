// SPDX-License-Identifier: AGPL-3.0-only
import { Prisma } from '@onyx/database';

/** True when a write failed because it would duplicate a unique value. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** True when an update or delete matched no row. */
export function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}
