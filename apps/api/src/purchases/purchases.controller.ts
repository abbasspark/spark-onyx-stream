// SPDX-License-Identifier: AGPL-3.0-only
import { assertUnrestricted } from '../audience/audience.js';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { CheckoutService } from '../billing/checkout.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { CurrentViewer, ViewerOnly } from '../viewers/viewer-auth.guard.js';
import type { ViewerIdentity } from '../viewers/viewer-session.service.js';
import {
  type GrantPurchaseInput,
  grantPurchaseSchema,
  type StartPurchaseInput,
  startPurchaseSchema,
} from './purchases.schemas.js';
import {
  type PurchaseAdminView,
  PurchasesService,
  type ViewerPurchaseView,
} from './purchases.service.js';

/** Paying is done by hand, a few times. This stops a script that opens payment pages in a loop. */
const CHECKOUT_LIMIT = { name: 'viewer-purchase', limit: 20, windowSeconds: 600 } as const;

/** Renting and buying, for viewers. */
@Controller()
export class ViewerPurchasesController {
  constructor(
    @Inject(PurchasesService) private readonly purchases: PurchasesService,
    @Inject(CheckoutService) private readonly checkout: CheckoutService,
  ) {}

  /** The viewer's rented and bought titles, newest first. */
  @ViewerOnly()
  @Get('viewer/purchases')
  @Header('Cache-Control', 'no-store')
  async own(@CurrentViewer() identity: ViewerIdentity): Promise<{ items: ViewerPurchaseView[] }> {
    return { items: await this.purchases.listOwn(identity.viewer.id) };
  }

  /** Opens Stripe's payment page for renting or buying a title. */
  @ViewerOnly()
  @RateLimit(CHECKOUT_LIMIT)
  @Post('viewer/purchases/checkout')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  start(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(startPurchaseSchema)) body: StartPurchaseInput,
  ): Promise<{ url: string }> {
    // A child's profile does not spend the account's money.
    assertUnrestricted();
    return this.checkout.startPurchase(identity.viewer, body);
  }
}

/** Rented and bought titles, for admins. */
@Controller()
export class PurchasesAdminController {
  constructor(
    @Inject(PurchasesService) private readonly purchases: PurchasesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('viewers/:id/purchases')
  @RequirePermissions('billing:read')
  async forViewer(@Param('id', ParseUUIDPipe) id: string): Promise<{ items: PurchaseAdminView[] }> {
    return { items: await this.purchases.forViewer(id) };
  }

  /** Gives a viewer a title by hand: paid in cash, or as a gift. */
  @Post('viewers/:id/purchases')
  @RequirePermissions('billing:write')
  async grant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(grantPurchaseSchema)) body: GrantPurchaseInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PurchaseAdminView> {
    const purchase = await this.purchases.grant(id, body, principal.adminId);
    await this.audit.record({
      action: 'purchase.grant',
      adminId: principal.adminId,
      entityType: 'Viewer',
      entityId: id,
      metadata: {
        purchaseId: purchase.id,
        title: purchase.title.name,
        kind: purchase.kind,
        amount: purchase.amount,
      },
      ipAddress: requestInfo(request).ipAddress,
    });
    return purchase;
  }

  /** Takes a title back from a viewer, at once. */
  @Post('purchases/:id/revoke')
  @RequirePermissions('billing:write')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PurchaseAdminView> {
    const purchase = await this.purchases.revoke(id);
    await this.audit.record({
      action: 'purchase.revoke',
      adminId: principal.adminId,
      entityType: 'Purchase',
      entityId: id,
      metadata: { title: purchase.title.name, kind: purchase.kind },
      ipAddress: requestInfo(request).ipAddress,
    });
    return purchase;
  }
}
