// SPDX-License-Identifier: AGPL-3.0-only
import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/auth.decorators.js';
import {
  STRIPE_WEBHOOK_ROUTE,
  StripeWebhookService,
  type WebhookOutcome,
} from './stripe-webhook.service.js';

/**
 * Where Stripe reports to. Open to the internet, because Stripe carries no
 * credentials of this site: each message is trusted by its signature alone.
 */
@Controller()
export class StripeWebhookController {
  constructor(@Inject(StripeWebhookService) private readonly webhooks: StripeWebhookService) {}

  /** Takes the events Stripe reports. Only Stripe's signature opens it. */
  @Public()
  @Post(STRIPE_WEBHOOK_ROUTE)
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true; outcome: WebhookOutcome }> {
    const outcome = await this.webhooks.receive(request.rawBody, signature);
    return { received: true, outcome };
  }
}
