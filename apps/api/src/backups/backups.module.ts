// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { BackupRunner } from './backup-runner.service.js';
import { BackupsController } from './backups.controller.js';
import { BackupsService } from './backups.service.js';

/** Backups as admins see them. Loaded only in the api role. */
@Module({
  controllers: [BackupsController],
  providers: [BackupsService],
})
export class BackupsModule {}

/** Makes the backups. Loaded only in the scheduler role. */
@Module({ providers: [BackupRunner], exports: [BackupRunner] })
export class BackupsSchedulerModule {}
