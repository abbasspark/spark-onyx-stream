// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { StripeModule } from '../stripe/stripe.module.js';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AudienceInterceptor } from './audience.interceptor.js';
import { DeviceCodesService } from './device-codes.service.js';
import { ViewerAuthController } from './viewer-auth.controller.js';
import { ViewerAuthGuard } from './viewer-auth.guard.js';
import { ViewerAuthService } from './viewer-auth.service.js';
import { ViewerDevicesController } from './viewer-devices.controller.js';
import { ViewerDevicesService } from './viewer-devices.service.js';
import { ViewerEmailService } from './viewer-email.service.js';
import {
  ViewerPreferencesController,
  ViewerProfilesController,
} from './viewer-profiles.controller.js';
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
  imports: [StripeModule],
  controllers: [
    ViewerAuthController,
    ViewersAdminController,
    ViewerProfilesController,
    ViewerPreferencesController,
    ViewerDevicesController,
  ],
  providers: [
    ViewerSessionService,
    ViewerProfilesService,
    ViewerDevicesService,
    DeviceCodesService,
    ViewerEmailService,
    ViewerAuthService,
    ViewerAuthGuard,
    ViewersAdminService,
    // Every request is answered for somebody: see the interceptor.
    { provide: APP_INTERCEPTOR, useClass: AudienceInterceptor },
  ],
  exports: [ViewerSessionService, ViewerAuthGuard, ViewerProfilesService],
})
export class ViewersModule {}
