// SPDX-License-Identifier: AGPL-3.0-only
import { Logger, Module, type OnModuleInit } from '@nestjs/common';

/**
 * Role modules are loaded only when the process runs the matching role.
 * They are placeholders for now and are filled in as each area is built:
 *
 * - WorkerRoleModule:    processing job consumers (phase 1)
 * - LiveRoleModule:      live channel supervision (phase 4)
 * - SchedulerRoleModule: periodic tasks (phase 1)
 */

@Module({})
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
