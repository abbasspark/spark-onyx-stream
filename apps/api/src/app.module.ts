// SPDX-License-Identifier: AGPL-3.0-only
import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { AdminsModule } from './admins/admins.module.js';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import type { AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RedisModule } from './redis/redis.module.js';
import type { AppRole } from './roles/app-role.js';
import { LiveRoleModule, SchedulerRoleModule, WorkerRoleModule } from './roles/role.modules.js';

/** Modules that are loaded only when the process runs the given role. */
const ROLE_MODULES: Record<AppRole, Type[]> = {
  api: [AuthModule, AuditModule, AdminsModule, ApiKeysModule, HealthModule],
  worker: [WorkerRoleModule],
  live: [LiveRoleModule],
  scheduler: [SchedulerRoleModule],
};

@Module({})
export class AppModule {
  /**
   * Builds the root module for the roles in the configuration.
   * Infrastructure modules are always loaded. Feature modules depend on the role.
   */
  static forRoles(config: AppConfig): DynamicModule {
    const roleModules = config.roles.flatMap((role) => ROLE_MODULES[role]);

    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule,
        RedisModule,
        QueueModule,
        ...roleModules,
      ],
    };
  }
}
