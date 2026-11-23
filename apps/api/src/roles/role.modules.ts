// SPDX-License-Identifier: AGPL-3.0-only
import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { BackupsSchedulerModule } from '../backups/backups.module.js';
import { DeliverySchedulerModule } from '../delivery/delivery.module.js';
import { GuideSchedulerModule } from '../guide/guide.module.js';
import { LiveSupervisorModule } from '../live/live.module.js';
import { RecordingSupervisorModule } from '../recordings/recordings.module.js';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { ProcessingWorkerModule } from '../processing/processing.module.js';
import { WebhooksSchedulerModule } from '../webhooks/webhooks.module.js';

/**
 * Role modules are loaded only when the process runs the matching role.
 *
 * - WorkerRoleModule:    runs processing jobs with FFmpeg
 * - LiveRoleModule:      keeps live channels running
 * - SchedulerRoleModule: periodic repairs, the programme guide, backups, webhooks
 */

@Module({ imports: [ProcessingWorkerModule] })
export class WorkerRoleModule implements OnModuleInit {
  private readonly logger = new Logger(WorkerRoleModule.name);

  onModuleInit(): void {
    this.logger.log('Worker role enabled');
  }
}

@Module({ imports: [LiveSupervisorModule, RecordingSupervisorModule] })
export class LiveRoleModule implements OnModuleInit {
  private readonly logger = new Logger(LiveRoleModule.name);

  onModuleInit(): void {
    this.logger.log('Live role enabled');
  }
}

@Module({
  imports: [
    MaintenanceModule,
    GuideSchedulerModule,
    DeliverySchedulerModule,
    BackupsSchedulerModule,
    WebhooksSchedulerModule,
  ],
})
export class SchedulerRoleModule implements OnModuleInit {
  private readonly logger = new Logger(SchedulerRoleModule.name);

  onModuleInit(): void {
    this.logger.log('Scheduler role enabled');
  }
}
