// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { StripeModule } from '../stripe/stripe.module.js';
import { ViewersModule } from '../viewers/viewers.module.js';
import { BillingAdminController, PublicBillingController } from './billing.controller.js';
import { CheckoutService } from './checkout.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { StripeWebhookService } from './stripe-webhook.service.js';
import { PaymentsAdminController, ViewerPaymentsController } from './payments.controller.js';
import { PackagesController } from './packages.controller.js';
import { PackagesService } from './packages.service.js';
import { PaymentsService } from './payments.service.js';
import { PlansService } from './plans.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

/**
 * Billing: the plans viewers can subscribe to, who holds one, and paying
 * for one online through Stripe. The catalog asks it whether a viewer may
 * watch a paid title.
 */
@Module({
  imports: [ViewersModule, StripeModule],
  controllers: [
    PublicBillingController,
    BillingAdminController,
    StripeWebhookController,
    ViewerPaymentsController,
    PaymentsAdminController,
    PackagesController,
  ],
  providers: [
    PlansService,
    SubscriptionsService,
    CheckoutService,
    StripeWebhookService,
    PaymentsService,
    PackagesService,
  ],
  exports: [SubscriptionsService],
})
export class BillingModule {}
