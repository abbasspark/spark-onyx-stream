// SPDX-License-Identifier: AGPL-3.0-only
import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ProcessingWorkerModule } from '../processing/processing.module.js';

/**
 * Role modules are loaded only when the process runs the matching role.
 * The live and scheduler modules are placeholders and are filled in as those areas are built:
 *
 * - WorkerRoleModule:    runs processing jobs with FFmpeg
 * - LiveRoleModule:      live channel supervision (phase 4)
 * - SchedulerRoleModule: periodic tasks (phase 1)
 */

@Module({ imports: [ProcessingWorkerModule] })
export class WorkerRoleModule implements OnModuleInit {
  private readonly logger = new Logger(WorkerRoleModule.name);

  onModuleInit(): void {
    this.logger.log('Worker role enabled');
  }
}

@Module({})
export class LiveRoleModule implements OnModuleInit {
  private readonly logger = new Logger(LiveRoleModule.name);

  onModuleInit(): void {
    this.logger.log('Live role enabled');
  }
}

@Module({})
export class SchedulerRoleModule implements OnModuleInit {
  private readonly logger = new Logger(SchedulerRoleModule.name);

  onModuleInit(): void {
    this.logger.log('Scheduler role enabled');
  }
}
