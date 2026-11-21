// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { StripeClient } from './stripe.client.js';
import { StripeSyncService } from './stripe-sync.service.js';

/** Access to Stripe, and the record of what Stripe says about subscriptions. */
@Module({
  providers: [StripeClient, StripeSyncService],
  exports: [StripeClient, StripeSyncService],
})
export class StripeModule {}
