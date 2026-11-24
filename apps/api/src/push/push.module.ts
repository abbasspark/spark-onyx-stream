// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { ViewersModule } from '../viewers/viewers.module.js';
import { AnnouncerService } from './announcer.service.js';
import { CampaignsService } from './campaigns.service.js';
import { NotificationRunner } from './notification-runner.service.js';
import { NotificationsService } from './notifications.service.js';
import {
  PushAdminController,
  PushConfigController,
  ViewerNotificationsController,
} from './push.controller.js';
import { PushSender } from './push-sender.service.js';
import { PushSettingsService } from './push-settings.service.js';

/**
 * Making and sending notifications. In every role, so that whichever
 * process is up sends what waits.
 */
@Global()
@Module({
  providers: [
    PushSettingsService,
    PushSender,
    NotificationsService,
    CampaignsService,
    AnnouncerService,
    NotificationRunner,
  ],
  exports: [
    PushSettingsService,
    PushSender,
    NotificationsService,
    CampaignsService,
    AnnouncerService,
    NotificationRunner,
  ],
})
export class PushCoreModule {}

/** The addresses for viewers and for the panel. Loaded only in the api role. */
@Module({
  imports: [ViewersModule],
  controllers: [PushConfigController, ViewerNotificationsController, PushAdminController],
})
export class PushModule {}
