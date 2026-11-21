// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { ViewerAuthController } from './viewer-auth.controller.js';
import { ViewerAuthGuard } from './viewer-auth.guard.js';
import { ViewerAuthService } from './viewer-auth.service.js';
import { ViewerEmailService } from './viewer-email.service.js';
import { ViewerSessionService } from './viewer-session.service.js';
import { ViewersAdminController } from './viewers-admin.controller.js';
import { ViewersAdminService } from './viewers-admin.service.js';

/**
 * Viewer accounts: what viewers do with their own account, and how admins
 * manage them. The session service is shared, so other modules can ask who
 * is watching.
 */
@Module({
  controllers: [ViewerAuthController, ViewersAdminController],
  providers: [
    ViewerSessionService,
    ViewerEmailService,
    ViewerAuthService,
    ViewerAuthGuard,
    ViewersAdminService,
  ],
  exports: [ViewerSessionService, ViewerAuthGuard],
})
export class ViewersModule {}
