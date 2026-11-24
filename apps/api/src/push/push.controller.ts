// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, Public, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { CurrentViewer, ViewerOnly } from '../viewers/viewer-auth.guard.js';
import type { ViewerIdentity } from '../viewers/viewer-session.service.js';
import { type CampaignView, CampaignsService } from './campaigns.service.js';
import { NotificationRunner } from './notification-runner.service.js';
import { type NotificationList, NotificationsService, TOPICS } from './notifications.service.js';
import {
  type AudienceInput,
  audienceSchema,
  type AutomaticInput,
  automaticSchema,
  type CreateCampaignInput,
  createCampaignSchema,
  type FcmKeyInput,
  fcmKeySchema,
  type ListCampaignsInput,
  listCampaignsSchema,
  type ListNotificationsInput,
  listNotificationsSchema,
  type ReadInput,
  readSchema,
  type RegisterDeviceInput,
  registerDeviceSchema,
  type TestSendInput,
  testSendSchema,
  type TopicsInput,
  topicsSchema,
  type UnregisterTokenInput,
  unregisterTokenSchema,
  type UpdateCampaignInput,
  updateCampaignSchema,
} from './push.schemas.js';
import {
  type AutomaticSettings,
  type PushClientConfig,
  type PushSetup,
  PushSettingsService,
} from './push-settings.service.js';
import { PrismaClient } from '@onyx/database';

const CHANGES = { name: 'viewer-push', limit: 60, windowSeconds: 60 };
const READS = { name: 'catalog', limit: 600, windowSeconds: 60 };

/** What the panel shows about the setup: the keys, and who can be reached. */
export interface PushOverview extends PushSetup {
  /** Devices that take notifications, by what they are. */
  devices: { platform: string; provider: 'WEB' | 'FCM'; count: number }[];
  /** Accounts with at least one such device, and all accounts that are not disabled. */
  reachable: number;
  viewers: number;
  /** What was told by itself lately. */
  recent: { topic: string; title: string; body: string; at: Date; viewers: number }[];
}

/** What a client needs to know before it asks a viewer for notifications. */
@Public()
@Controller('push')
export class PushConfigController {
  constructor(@Inject(PushSettingsService) private readonly settings: PushSettingsService) {}

  /**
   * How this installation sends notifications: the key a browser subscribes
   * with, the Firebase project an app registers with, and the kinds of
   * notification a viewer can turn on and off.
   */
  @Get('config')
  @RateLimit(READS)
  @Header('Cache-Control', 'public, max-age=300')
  config(): Promise<PushClientConfig> {
    return this.settings.clientConfig(TOPICS);
  }
}

/** Notifications of the account that is signed in. About one person, and never cached. */
@Controller('viewer')
export class ViewerNotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  /**
   * Registers this device for notifications: a browser with its
   * subscription, an app with its Firebase token. Sent again whenever the
   * token changes and at every start of the app. The device takes
   * notifications for as long as this sign-in holds.
   */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Put('push/devices')
  @Header('Cache-Control', 'no-store')
  register(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(registerDeviceSchema)) body: RegisterDeviceInput,
  ): Promise<{ id: string }> {
    return this.notifications.register(identity.viewer.id, identity.session.id, body);
  }

  /** Stops notifications for a device, by the id registering gave. Safe to repeat. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Delete('push/devices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregister(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notifications.unregister(identity.viewer.id, id);
  }

  /** The same by token, for a device that does not know its id. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Post('push/devices/forget')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forget(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(unregisterTokenSchema)) body: UnregisterTokenInput,
  ): Promise<void> {
    await this.notifications.unregisterToken(identity.viewer.id, body.provider, body.token);
  }

  /** Which kinds of notification the account wants, and whether this device is registered. */
  @ViewerOnly()
  @Get('notifications/settings')
  @Header('Cache-Control', 'no-store')
  settings(@CurrentViewer() identity: ViewerIdentity) {
    return this.notifications.settings(identity.viewer.id, identity.session.id);
  }

  /** Turns kinds of notification on or off, for the whole account. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Patch('notifications/settings')
  @Header('Cache-Control', 'no-store')
  async setSettings(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(topicsSchema)) body: TopicsInput,
  ) {
    await this.notifications.setTopics(identity.viewer.id, body.topics);
    return this.notifications.settings(identity.viewer.id, identity.session.id);
  }

  /** What was sent to the account, the newest first, thirty at a time. */
  @ViewerOnly()
  @Get('notifications')
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentViewer() identity: ViewerIdentity,
    @Query(new ZodValidationPipe(listNotificationsSchema)) query: ListNotificationsInput,
  ): Promise<NotificationList> {
    return this.notifications.list(identity.viewer.id, query.before);
  }

  /** Only the number of notifications not seen yet, for a mark on a bell. */
  @ViewerOnly()
  @Get('notifications/unread')
  @Header('Cache-Control', 'no-store')
  async unread(@CurrentViewer() identity: ViewerIdentity): Promise<{ unread: number }> {
    return { unread: await this.notifications.unread(identity.viewer.id) };
  }

  /** Marks notifications as seen: the ones named, or all of them. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Post('notifications/read')
  @HttpCode(HttpStatus.OK)
  async read(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(readSchema)) body: ReadInput,
  ): Promise<{ read: number }> {
    return { read: await this.notifications.markRead(identity.viewer.id, body.ids) };
  }

  /** Says that the viewer opened a notification, from the list or by tapping it on a device. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Post('notifications/:id/opened')
  @HttpCode(HttpStatus.NO_CONTENT)
  async opened(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notifications.markOpened(identity.viewer.id, id);
  }

  /** Takes a notification out of the list. Safe to repeat. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Delete('notifications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notifications.remove(identity.viewer.id, id);
  }
}

/** Notifications in the panel: the setup, what is told by itself, and the messages an admin writes. */
@Controller('notifications')
export class PushAdminController {
  constructor(
    @Inject(PushSettingsService) private readonly settings: PushSettingsService,
    @Inject(CampaignsService) private readonly campaigns: CampaignsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(NotificationRunner) private readonly runner: NotificationRunner,
  ) {}

  @Get('setup')
  @RequirePermissions('viewers:read')
  async overview(): Promise<PushOverview> {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const [setup, devices, reachable, viewers, recent] = await Promise.all([
      this.settings.setup(),
      this.prisma.pushDevice.groupBy({
        by: ['platform', 'provider'],
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.viewer.count({ where: { status: 'ACTIVE', pushDevices: { some: {} } } }),
      this.prisma.viewer.count({ where: { status: 'ACTIVE' } }),
      this.prisma.$queryRaw<PushOverview['recent']>`
        SELECT topic::text AS topic, title, body, MIN("createdAt") AS at, COUNT(*)::int AS viewers
        FROM notifications
        WHERE "campaignId" IS NULL AND topic <> 'ANNOUNCEMENTS' AND "createdAt" >= ${since}
        GROUP BY topic, title, body, "dedupeKey"
        ORDER BY at DESC
        LIMIT 8`,
    ]);
    return {
      ...setup,
      devices: devices.map((row) => ({
        platform: row.platform,
        provider: row.provider,
        count: row._count._all,
      })),
      reachable,
      viewers,
      recent,
    };
  }

  /** Turns on or off what viewers are told by themselves. */
  @Patch('automatic')
  @RequirePermissions('viewers:write')
  async setAutomatic(
    @Body(new ZodValidationPipe(automaticSchema)) body: AutomaticInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<AutomaticSettings> {
    const automatic = await this.settings.setAutomatic(body);
    await this.record('notifications.automatic.update', principal, request, { ...automatic });
    return automatic;
  }

  /**
   * Stores the key of a Firebase service account, after trying it. With it,
   * apps on Android and iOS can be reached. The key itself is never
   * answered back.
   */
  @Put('firebase')
  @RequirePermissions('settings:write')
  async setFirebase(
    @Body(new ZodValidationPipe(fcmKeySchema)) body: FcmKeyInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PushSetup> {
    const account = await this.settings.setFcm(body.serviceAccount);
    await this.record('notifications.firebase.set', principal, request, {
      projectId: account.projectId,
      clientEmail: account.clientEmail,
    });
    return this.settings.setup();
  }

  /** Forgets the Firebase key, and with it every app that registered. */
  @Delete('firebase')
  @RequirePermissions('settings:write')
  async removeFirebase(
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PushSetup> {
    const devices = await this.settings.removeFcm();
    await this.record('notifications.firebase.remove', principal, request, { devices });
    return this.settings.setup();
  }

  /**
   * Makes a new key pair for browsers. Every browser that allowed
   * notifications is forgotten and subscribes again at its next visit.
   */
  @Post('web-key/renew')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('settings:write')
  async renewWebKey(
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PushSetup> {
    const devices = await this.settings.renewVapid();
    await this.record('notifications.web-key.renew', principal, request, { devices });
    return this.settings.setup();
  }

  @Get('campaigns')
  @RequirePermissions('viewers:read')
  list(
    @Query(new ZodValidationPipe(listCampaignsSchema)) query: ListCampaignsInput,
  ): Promise<Page<CampaignView>> {
    return this.campaigns.list(query);
  }

  /** How many viewers an audience is right now, and how many of them have a device that takes notifications. */
  @Get('campaigns/reach')
  @RequirePermissions('viewers:read')
  reach(
    @Query(new ZodValidationPipe(audienceSchema)) query: AudienceInput,
  ): Promise<{ viewers: number; withDevice: number }> {
    return this.campaigns.reach(query.audience, query.planId ?? null);
  }

  @Get('campaigns/:id')
  @RequirePermissions('viewers:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CampaignView> {
    return this.campaigns.get(id);
  }

  /** Writes a message as a draft. Nothing is sent. */
  @Post('campaigns')
  @RequirePermissions('viewers:write')
  async create(
    @Body(new ZodValidationPipe(createCampaignSchema)) body: CreateCampaignInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<CampaignView> {
    const campaign = await this.campaigns.create(body, principal.adminId ?? null);
    await this.record(
      'notifications.campaign.create',
      principal,
      request,
      {
        title: campaign.title,
      },
      campaign.id,
    );
    return campaign;
  }

  @Patch('campaigns/:id')
  @RequirePermissions('viewers:write')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCampaignSchema)) body: UpdateCampaignInput,
  ): Promise<CampaignView> {
    return this.campaigns.update(id, body);
  }

  /** Sends a message: at once, or at its time when that is still to come. */
  @Post('campaigns/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('viewers:write')
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<CampaignView> {
    const campaign = await this.campaigns.send(id);
    // Not at the next round: an admin who presses "Send" watches for it.
    this.runner.kick();
    await this.record(
      'notifications.campaign.send',
      principal,
      request,
      {
        title: campaign.title,
        audience: campaign.audience,
        scheduledAt: campaign.status === 'SCHEDULED' ? campaign.scheduledAt : null,
      },
      id,
    );
    return campaign;
  }

  /** Holds back a message that waits for its time. */
  @Post('campaigns/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('viewers:write')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<CampaignView> {
    const campaign = await this.campaigns.cancel(id);
    await this.record(
      'notifications.campaign.cancel',
      principal,
      request,
      {
        title: campaign.title,
      },
      id,
    );
    return campaign;
  }

  /** Sends a message to one viewer only, to see how it arrives. */
  @Post('campaigns/:id/test')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('viewers:write')
  async test(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(testSendSchema)) body: TestSendInput,
  ): Promise<{ devices: number }> {
    const result = await this.campaigns.test(id, body.email);
    this.runner.kick();
    return result;
  }

  @Delete('campaigns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('viewers:write')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const { title } = await this.campaigns.remove(id);
    await this.record('notifications.campaign.delete', principal, request, { title }, id);
  }

  private record(
    action: string,
    principal: Principal,
    request: Request,
    metadata: Record<string, unknown>,
    entityId?: string,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: entityId ? 'PushCampaign' : 'Setting',
      entityId,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
