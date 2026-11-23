// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { CryptoModule } from '../crypto/crypto.module.js';
import { WebhookDeliveryService } from './webhook-delivery.service.js';
import { WebhookRunner } from './webhook-runner.service.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

/**
 * Announcing events to webhooks. In every role: each kind of process has
 * something to tell.
 */
@Global()
@Module({
  imports: [CryptoModule],
  providers: [WebhookDeliveryService],
  exports: [WebhookDeliveryService],
})
export class WebhooksCoreModule {}

/** Webhooks as admins manage them. Loaded only in the api role. */
@Module({
  imports: [CryptoModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}

/** Makes the requests. Loaded only in the scheduler role. */
@Module({ providers: [WebhookRunner], exports: [WebhookRunner] })
export class WebhooksSchedulerModule {}
