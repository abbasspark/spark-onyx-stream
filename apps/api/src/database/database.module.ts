// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createPrismaClient, PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';

/**
 * Provides the Prisma client. Inject `PrismaClient` directly:
 *
 *   constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}
 *
 * The client connects on first use, so the process can start while the
 * database is still coming up. The health check reports the actual state.
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      inject: [AppConfig],
      useFactory: (config: AppConfig): PrismaClient => createPrismaClient(config.databaseUrl),
    },
  ],
  exports: [PrismaClient],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
