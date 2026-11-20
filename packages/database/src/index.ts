// SPDX-License-Identifier: AGPL-3.0-only
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';

export * from './generated/client.js';

/**
 * Creates a Prisma client connected through the node-postgres driver adapter.
 *
 * @param connectionString PostgreSQL connection URL. Defaults to DATABASE_URL.
 */
export function createPrismaClient(
  connectionString: string | undefined = process.env.DATABASE_URL,
): PrismaClient {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
