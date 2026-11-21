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
  SubscriptionAdminView,
  ViewerSubscriptionView,
} from './billing.views.js';
import { PlansService } from './plans.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

/** Plans change rarely, and a page of plans is opened by many. */
const PLANS_CACHE = 'public, max-age=30';

/** What viewers and visitors see of billing. */
@Controller()
export class PublicBillingController {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
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
  async own(
    @CurrentViewer() identity: ViewerIdentity,
  ): Promise<{ subscription: ViewerSubscriptionView | null; entitled: boolean }> {
    const subscription = await this.subscriptions.ownOf(identity.viewer.id);
    return { subscription, entitled: subscription !== null };
  }
}

/** Billing for admins: plans, and the access of viewers. */
@Controller()
export class BillingAdminController {
  constructor(
    @Inject(PlansService) private readonly plans: PlansService,
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('billing')
  @RequirePermissions('billing:read')
  overview(): Promise<BillingOverview> {
    return this.subscriptions.overview();
  }

  @Get('plans')
  @RequirePermissions('billing:read')
  list(): Promise<PlanAdminView[]> {
    return this.plans.list();
  }

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
