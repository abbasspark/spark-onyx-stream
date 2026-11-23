// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { AdminRolesController } from './roles.controller.js';
import { AdminRolesService } from './roles.service.js';

/** The roles admins hold. Also used by the admins module to look a role up. */
@Module({
  controllers: [AdminRolesController],
  providers: [AdminRolesService],
  exports: [AdminRolesService],
})
export class AdminRolesModule {}
