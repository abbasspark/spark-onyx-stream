// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { ViewerAuthController } from './viewer-auth.controller.js';
import { ViewerAuthGuard } from './viewer-auth.guard.js';
import { ViewerAuthService } from './viewer-auth.service.js';
import { ViewerEmailService } from './viewer-email.service.js';
import { ViewerProfilesController } from './viewer-profiles.controller.js';
import { ViewerProfilesService } from './viewer-profiles.service.js';
import { ViewerSessionService } from './viewer-session.service.js';
import { ViewersAdminController } from './viewers-admin.controller.js';
import { ViewersAdminService } from './viewers-admin.service.js';

/**
 * Viewer accounts: what viewers do with their own account, and how admins
 * manage them. The session service is shared, so other modules can ask who
 * is watching.
 */
@Module({
  controllers: [ViewerAuthController, ViewersAdminController, ViewerProfilesController],
  providers: [
    ViewerSessionService,
    ViewerProfilesService,
    ViewerEmailService,
    ViewerAuthService,
    ViewerAuthGuard,
    ViewersAdminService,
  ],
  exports: [ViewerSessionService, ViewerAuthGuard, ViewerProfilesService],
})
export class ViewersModule {}
