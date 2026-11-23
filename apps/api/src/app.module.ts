// SPDX-License-Identifier: AGPL-3.0-only
import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { AdminsModule } from './admins/admins.module.js';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { AssetsModule } from './assets/assets.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import type { AppConfig } from './config/app-config.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ConfigModule } from './config/config.module.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { DatabaseModule } from './database/database.module.js';
import { EventStreamModule } from './events/event-stream.module.js';
import { EventsModule } from './events/events.module.js';
import { HealthModule } from './health/health.module.js';
import { ProcessingApiModule, ProcessingCoreModule } from './processing/processing.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { RedisModule } from './redis/redis.module.js';
import { StatsModule } from './stats/stats.module.js';
import { StorageModule, StoragePoolsModule } from './storage/storage.module.js';
import { BackupsModule } from './backups/backups.module.js';
import { DiagnosticsModule } from './diagnostics/diagnostics.module.js';
import { ProcessBeaconModule } from './diagnostics/process-beacon.service.js';
import { BillingModule } from './billing/billing.module.js';
import { MailModule } from './mail/mail.module.js';
import { WatchModule } from './watch/watch.module.js';
import { BulkModule } from './bulk/bulk.module.js';
import { MetadataModule } from './metadata/metadata.module.js';
import { ViewersModule } from './viewers/viewers.module.js';
import { WatchingModule } from './watching/watching.module.js';
import { WatchlistModule } from './watchlist/watchlist.module.js';
import type { AppRole } from './roles/app-role.js';
import { AnalyticsModule, PlaysModule } from './analytics/analytics.module.js';
import { StreamsCoreModule, StreamsModule } from './streams/streams.module.js';
import { GuideModule } from './guide/guide.module.js';
import { LiveModule } from './live/live.module.js';
import { DeliveryCoreModule, DeliveryModule } from './delivery/delivery.module.js';
import { RecordingsModule } from './recordings/recordings.module.js';
import { LiveRoleModule, SchedulerRoleModule, WorkerRoleModule } from './roles/role.modules.js';

/** Modules that are loaded only when the process runs the given role. */
const ROLE_MODULES: Record<AppRole, Type[]> = {
  api: [
    AuthModule,
    AuditModule,
    AdminsModule,
    ApiKeysModule,
    StoragePoolsModule,
    AssetsModule,
    ProcessingApiModule,
    StatsModule,
    AnalyticsModule,
    StreamsModule,
    CatalogModule,
    MailModule,
    BillingModule,
    MetadataModule,
    WatchModule,
    BulkModule,
    ViewersModule,
    WatchingModule,
    WatchlistModule,
    LiveModule,
    GuideModule,
    RecordingsModule,
    DeliveryCoreModule,
    DeliveryModule,
    BackupsModule,
    DiagnosticsModule,
    EventStreamModule,
    HealthModule,
  ],
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
        RateLimitModule,
        EventsModule,
        QueueModule,
        CryptoModule,
        StorageModule,
        ProcessingCoreModule,
        PlaysModule,
        StreamsCoreModule,
        ProcessBeaconModule,
        ...roleModules,
      ],
    };
  }
}
