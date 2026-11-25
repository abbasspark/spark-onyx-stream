// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { AdminSessionOnly, CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import {
  type CreateWebhookInput,
  createWebhookSchema,
  type ListDeliveriesInput,
  listDeliveriesSchema,
  type UpdateWebhookInput,
  updateWebhookSchema,
} from './webhooks.schemas.js';
import {
  type DeliveryDetail,
  type DeliveryView,
  type WebhookActivityHour,
  type WebhookReference,
  type WebhookView,
  WebhooksService,
  type WebhookWithSecret,
} from './webhooks.service.js';

/**
 * Outgoing webhooks: addresses of the operator's own that are told when
 * something happens. Making one and replacing its secret show a secret, so
 * they are for a signed-in admin, never an API key.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private record(
    action: string,
    id: string,
    principal: Principal,
    request: Request,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'Webhook',
      entityId: id,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }

  /** Lists the webhooks. */
  @Get()
  @RequirePermissions('settings:read')
  list(): Promise<WebhookView[]> {
    return this.webhooks.list();
  }

  /** The events with an example each, and how requests are signed and tried again. */
  @Get('reference')
  @RequirePermissions('settings:read')
  reference(): WebhookReference {
    return this.webhooks.reference();
  }

  /** Creates a webhook. */
  @Post()
  @AdminSessionOnly()
  @RequirePermissions('settings:write')
  async create(
    @Body(new ZodValidationPipe(createWebhookSchema)) body: CreateWebhookInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<WebhookWithSecret> {
    const webhook = await this.webhooks.create(body, principal.adminId);
    await this.record('webhook.create', webhook.id, principal, request, {
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
    });
    return webhook;
  }

  /** Returns one webhook. */
  @Get(':id')
  @RequirePermissions('settings:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<WebhookView> {
    return this.webhooks.get(id);
  }

  /** Changes a webhook. */
  @Patch(':id')
  @RequirePermissions('settings:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWebhookSchema)) body: UpdateWebhookInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<WebhookView> {
    const webhook = await this.webhooks.update(id, body);
    await this.record('webhook.update', id, principal, request, {
      name: webhook.name,
      changed: Object.entries(body)
        .filter(([, value]) => value !== undefined)
        .map(([field]) => field),
    });
    return webhook;
  }

  /** Deletes a webhook. */
  @Delete(':id')
  @RequirePermissions('settings:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const webhook = await this.webhooks.remove(id);
    await this.record('webhook.delete', id, principal, request, { name: webhook.name });
  }

  /** The deliveries of the last 24 hours, hour by hour. */
  @Get(':id/activity')
  @RequirePermissions('settings:read')
  activity(@Param('id', ParseUUIDPipe) id: string): Promise<WebhookActivityHour[]> {
    return this.webhooks.activity(id);
  }

  /** Replaces the signing secret and shows the new one, once. */
  @Post(':id/secret')
  @AdminSessionOnly()
  @RequirePermissions('settings:write')
  @HttpCode(HttpStatus.OK)
  async rollSecret(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<WebhookWithSecret> {
    const webhook = await this.webhooks.rollSecret(id);
    await this.record('webhook.secret', id, principal, request, { name: webhook.name });
    return webhook;
  }

  /** Sends a test message now and answers with what came back. */
  @Post(':id/test')
  @RequirePermissions('settings:write')
  @RateLimit({ name: 'webhook-test', limit: 30, windowSeconds: 600 })
  @HttpCode(HttpStatus.OK)
  test(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
  ): Promise<DeliveryDetail> {
    return this.webhooks.test(
      id,
      principal.type === 'admin' ? principal.displayName : principal.name,
    );
  }

  /** Lists the messages sent to a webhook, with what became of each. */
  @Get(':id/deliveries')
  @RequirePermissions('settings:read')
  deliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listDeliveriesSchema)) query: ListDeliveriesInput,
  ): Promise<Page<DeliveryView>> {
    return this.webhooks.listDeliveries(id, query);
  }

  /** Returns one delivery with what was sent and what the address answered. */
  @Get(':id/deliveries/:deliveryId')
  @RequirePermissions('settings:read')
  delivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ): Promise<DeliveryDetail> {
    return this.webhooks.getDelivery(id, deliveryId);
  }

  /** Sends a delivery again, as a new one with the same content. */
  @Post(':id/deliveries/:deliveryId/redeliver')
  @RequirePermissions('settings:write')
  @HttpCode(HttpStatus.OK)
  redeliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ): Promise<DeliveryView> {
    return this.webhooks.redeliver(id, deliveryId);
  }
}
