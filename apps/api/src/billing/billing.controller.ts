// SPDX-License-Identifier: AGPL-3.0-only
import { assertUnrestricted } from '../audience/audience.js';
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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, Public, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentViewer, ViewerOnly } from '../viewers/viewer-auth.guard.js';
import type { ViewerIdentity } from '../viewers/viewer-session.service.js';
import {
  type ChangeSubscriptionInput,
  changeSubscriptionSchema,
  type ConfirmCheckoutInput,
  confirmCheckoutSchema,
  type StartCheckoutInput,
  startCheckoutSchema,
  type CreatePlanInput,
  createPlanSchema,
  type GrantSubscriptionInput,
  grantSubscriptionSchema,
  type OrderPlansInput,
  orderPlansSchema,
  type UpdatePlanInput,
  updatePlanSchema,
} from './billing.schemas.js';
import type {
  BillingOverview,
  PlanAdminView,
  PublicPlans,
  StripeAccountView,
  StripeEventView,
  SubscriptionAdminView,
  ViewerSubscriptionView,
} from './billing.views.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { CheckoutService } from './checkout.service.js';
import type { ViewerAccess } from './entitlement.js';
import { type OwnedTitle, PurchasesService } from '../purchases/purchases.service.js';
import { PlansService } from './plans.service.js';
import { StripeWebhookService } from './stripe-webhook.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

/** Plans change rarely, and a page of plans is opened by many. */
const PLANS_CACHE = 'public, max-age=30';

/** Paying is done by hand, a few times. This stops a script that opens payment pages in a loop. */
const CHECKOUT_LIMIT = { name: 'viewer-checkout', limit: 20, windowSeconds: 600 } as const;

/** What a viewer learns about their own subscription. */
interface OwnSubscription {
  subscription: ViewerSubscriptionView | null;
  /** Whether titles that need a subscription are open to the viewer. */
  entitled: boolean;
  /** Which paid titles the subscription opens: all, or those of some packages. */
  access: ViewerAccess;
  /** Whether the viewer paid online before, so a free trial is not offered again. */
  trialUsed: boolean;
  /** Titles the viewer rented or bought and can watch now. */
  purchases: OwnedTitle[];
}

/** What viewers and visitors see of billing. */
@Controller()
export class PublicBillingController {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
    @Inject(CheckoutService) private readonly checkout: CheckoutService,
    @Inject(PurchasesService) private readonly purchases: PurchasesService,
  ) {}

  /** The plans on offer. Open to everyone, like the catalog. */
  @Public()
  @Get('catalog/plans')
  @Header('Cache-Control', PLANS_CACHE)
  offered(): Promise<PublicPlans> {
    return this.plans.offered();
  }

  /** The signed-in viewer's own subscription. */
  @ViewerOnly()
  @Get('viewer/subscription')
  @Header('Cache-Control', 'no-store')
  async own(@CurrentViewer() identity: ViewerIdentity): Promise<OwnSubscription> {
    return this.ownOf(identity);
  }

  /** Opens Stripe's payment page for a plan. The viewer is sent to the address returned. */
  @ViewerOnly()
  @RateLimit(CHECKOUT_LIMIT)
  @Post('viewer/checkout')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async start(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(startCheckoutSchema)) body: StartCheckoutInput,
  ): Promise<{ url: string }> {
    // A child's profile does not spend the account's money.
    assertUnrestricted();
    return this.checkout.start(
      identity.viewer,
      body,
      await this.subscriptions.paidBefore(identity.viewer.id),
    );
  }

  /**
   * Called when the viewer returns from paying. Records the subscription at
   * once, without waiting for Stripe's own message about it.
   */
  @ViewerOnly()
  @RateLimit(CHECKOUT_LIMIT)
  @Post('viewer/checkout/confirm')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async confirm(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(confirmCheckoutSchema)) body: ConfirmCheckoutInput,
  ): Promise<OwnSubscription> {
    await this.checkout.confirm(identity.viewer, body.sessionId);
    return this.ownOf(identity);
  }

  /** Opens Stripe's page for changing the card, reading invoices and cancelling. */
  @ViewerOnly()
  @RateLimit(CHECKOUT_LIMIT)
  @Post('viewer/billing-portal')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  portal(@CurrentViewer() identity: ViewerIdentity): Promise<{ url: string }> {
    assertUnrestricted();
    return this.checkout.portal(identity.viewer);
  }

  private async ownOf(identity: ViewerIdentity): Promise<OwnSubscription> {
    const [subscription, access, trialUsed, purchases] = await Promise.all([
      this.subscriptions.ownOf(identity.viewer.id),
      this.subscriptions.accessOf(identity.viewer.id),
      this.subscriptions.paidBefore(identity.viewer.id),
      this.purchases.ownedBy(identity.viewer.id),
    ]);
    return { subscription, entitled: subscription !== null, access, trialUsed, purchases };
  }
}

/** Billing for admins: plans, and the access of viewers. */
@Controller()
export class BillingAdminController {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CheckoutService) private readonly checkout: CheckoutService,
    @Inject(StripeWebhookService) private readonly webhooks: StripeWebhookService,
  ) {}

  /** Returns the billing overview: subscribers, plans and what is owed. */
  @Get('billing')
  @RequirePermissions('billing:read')
  overview(): Promise<BillingOverview> {
    return this.subscriptions.overview();
  }

  /** Asks Stripe which account the key belongs to: the proof that the key works. */
  @Post('billing/stripe/check')
  @RequirePermissions('billing:read')
  @HttpCode(HttpStatus.OK)
  checkStripe(): Promise<StripeAccountView> {
    return this.checkout.account();
  }

  /** The last messages Stripe sent, newest first. */
  @Get('billing/stripe/events')
  @RequirePermissions('billing:read')
  stripeEvents(): Promise<StripeEventView[]> {
    return this.webhooks.recent(25);
  }

  /** Lists the plans. */
  @Get('plans')
  @RequirePermissions('billing:read')
  list(): Promise<PlanAdminView[]> {
    return this.plans.list();
  }

  /** Creates a plan. */
  @Post('plans')
  @RequirePermissions('billing:write')
  async create(
    @Body(new ZodValidationPipe(createPlanSchema)) body: CreatePlanInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PlanAdminView> {
    const plan = await this.plans.create(body);
    await this.record('plan.create', 'Plan', plan.id, principal, request, { name: plan.name });
    return plan;
  }

  /** Sets the order of the page of plans. Before ":id", so "order" is not read as an id. */
  @Put('plans/order')
  @RequirePermissions('billing:write')
  async reorder(
    @Body(new ZodValidationPipe(orderPlansSchema)) body: OrderPlansInput,
  ): Promise<PlanAdminView[]> {
    return this.plans.reorder(body.ids);
  }

  /** Changes a plan. */
  @Patch('plans/:id')
  @RequirePermissions('billing:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePlanSchema)) body: UpdatePlanInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PlanAdminView> {
    const { plan, changed } = await this.plans.update(id, body);
    if (changed.length > 0) {
      await this.record('plan.update', 'Plan', id, principal, request, {
        name: plan.name,
        changed,
      });
    }
    return plan;
  }

  /** Deletes a plan that no viewer ever had. */
  @Delete('plans/:id')
  @RequirePermissions('billing:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const plan = await this.plans.remove(id);
    await this.record('plan.delete', 'Plan', id, principal, request, { name: plan.name });
  }

  /** The running subscription of a viewer and the history of the account. */
  @Get('viewers/:id/subscriptions')
  @RequirePermissions('billing:read')
  forViewer(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ current: SubscriptionAdminView | null; history: SubscriptionAdminView[] }> {
    return this.subscriptions.forViewer(id);
  }

  /** Gives a viewer access by hand: cash, a bank transfer, a gift. */
  @Post('viewers/:id/subscriptions')
  @RequirePermissions('billing:write')
  async grant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(grantSubscriptionSchema)) body: GrantSubscriptionInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<SubscriptionAdminView> {
    const subscription = await this.subscriptions.grant(id, body, principal.adminId);
    await this.record('subscription.grant', 'Viewer', id, principal, request, {
      subscriptionId: subscription.id,
      plan: subscription.plan.name,
      endsAt: subscription.endsAt,
    });
    return subscription;
  }

  /** Changes a subscription: grants, extends or ends it by hand. */
  @Patch('subscriptions/:id')
  @RequirePermissions('billing:write')
  async change(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeSubscriptionSchema)) body: ChangeSubscriptionInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<SubscriptionAdminView> {
    const { subscription, changed } = await this.subscriptions.change(id, body);
    if (changed.length > 0) {
      await this.record('subscription.change', 'Subscription', id, principal, request, {
        plan: subscription.plan.name,
        endsAt: subscription.endsAt,
        changed,
      });
    }
    return subscription;
  }

  /** Ends access now. */
  @Post('subscriptions/:id/end')
  @RequirePermissions('billing:write')
  @HttpCode(HttpStatus.OK)
  async end(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<SubscriptionAdminView> {
    const subscription = await this.subscriptions.end(id);
    await this.record('subscription.end', 'Subscription', id, principal, request, {
      plan: subscription.plan.name,
    });
    return subscription;
  }

  /** Reads a subscription paid online from Stripe again. */
  @Post('subscriptions/:id/refresh')
  @RequirePermissions('billing:write')
  @HttpCode(HttpStatus.OK)
  refresh(@Param('id', ParseUUIDPipe) id: string): Promise<SubscriptionAdminView> {
    return this.subscriptions.refresh(id);
  }

  private record(
    action: string,
    entityType: string,
    entityId: string,
    principal: Principal,
    request: Request,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType,
      entityId,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
