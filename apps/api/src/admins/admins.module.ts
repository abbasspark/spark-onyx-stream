// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { AdminRolesModule } from '../admin-roles/roles.module.js';
import { AdminsController } from './admins.controller.js';
import { AdminsService } from './admins.service.js';

@Module({
  imports: [AdminRolesModule],
  controllers: [AdminsController],
  providers: [AdminsService],
})
export class AdminsModule {}
