// SPDX-License-Identifier: AGPL-3.0-only
import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { LiveSupervisorModule } from '../live/live.module.js';
import { MaintenanceModule } from '../maintenance/maintenance.module.js';
import { ProcessingWorkerModule } from '../processing/processing.module.js';

/**
 * Role modules are loaded only when the process runs the matching role.
 *
 * - WorkerRoleModule:    runs processing jobs with FFmpeg
 * - LiveRoleModule:      keeps live channels running
 * - SchedulerRoleModule: periodic repairs
 */

@Module({ imports: [ProcessingWorkerModule] })
export class WorkerRoleModule implements OnModuleInit {
  private readonly logger = new Logger(WorkerRoleModule.name);

  onModuleInit(): void {
    this.logger.log('Worker role enabled');
  }
}

@Module({ imports: [LiveSupervisorModule] })
export class LiveRoleModule implements OnModuleInit {
  private readonly logger = new Logger(LiveRoleModule.name);

  onModuleInit(): void {
    this.logger.log('Live role enabled');
  }
}

@Module({ imports: [MaintenanceModule] })
export class SchedulerRoleModule implements OnModuleInit {
  private readonly logger = new Logger(SchedulerRoleModule.name);

  onModuleInit(): void {
    this.logger.log('Scheduler role enabled');
  }
}
