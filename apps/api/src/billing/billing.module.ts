// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { ViewersModule } from '../viewers/viewers.module.js';
import { BillingAdminController, PublicBillingController } from './billing.controller.js';
import { PlansService } from './plans.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * Billing: the plans viewers can subscribe to, and who holds one. The
 * catalog asks it whether a viewer may watch a paid title.
 */
@Module({
  imports: [ViewersModule],
  controllers: [PublicBillingController, BillingAdminController],
  providers: [PlansService, SubscriptionsService],
  exports: [SubscriptionsService],
})
export class BillingModule {}
