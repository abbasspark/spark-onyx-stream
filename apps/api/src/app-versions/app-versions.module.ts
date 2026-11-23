// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppVersionsController } from './app-versions.controller.js';
import { AppVersionsGuard } from './app-versions.guard.js';
import { AppVersionsService } from './app-versions.service.js';

/** Turns away apps that are too old, on every address of the API. */
@Global()
@Module({
  controllers: [AppVersionsController],
  providers: [AppVersionsService, { provide: APP_GUARD, useClass: AppVersionsGuard }],
  exports: [AppVersionsService],
})
export class AppVersionsModule {}
