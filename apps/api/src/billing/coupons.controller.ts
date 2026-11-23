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
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { CurrentViewer, ViewerOnly } from '../viewers/viewer-auth.guard.js';
import type { ViewerIdentity } from '../viewers/viewer-session.service.js';
import { CheckoutService } from './checkout.service.js';
import {
  type CheckCouponInput,
  checkCouponSchema,
  type CreateCouponInput,
  createCouponSchema,
  type ListRedemptionsInput,
  listRedemptionsSchema,
  type UpdateCouponInput,
  updateCouponSchema,
} from './coupons.schemas.js';
import { CouponsService } from './coupons.service.js';
import type { CouponPlansQuote, CouponQuote, CouponView, RedemptionView } from './coupons.views.js';

/**
 * A person tries a code a few times. This is little enough that codes cannot
 * be found by trying them out.
 */
const CHECK_LIMIT = { name: 'viewer-coupon', limit: 10, windowSeconds: 600 } as const;

/** Coupons, for admins who look after billing. */
@Controller('coupons')
export class CouponsController {
  constructor(
    @Inject(CouponsService) private readonly coupons: CouponsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('billing:read')
  list(): Promise<CouponView[]> {
    return this.coupons.list();
  }

  @Post()
  @RequirePermissions('billing:write')
  async create(
    @Body(new ZodValidationPipe(createCouponSchema)) body: CreateCouponInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<CouponView> {
    const created = await this.coupons.create(body, principal.adminId);
    await this.record('coupon.create', created.id, principal, request, { code: created.code });
    return created;
  }

  @Get(':id')
  @RequirePermissions('billing:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CouponView> {
    return this.coupons.get(id);
  }

  /** Who used the code, the latest first. */
  @Get(':id/redemptions')
  @RequirePermissions('billing:read')
  redemptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listRedemptionsSchema)) query: ListRedemptionsInput,
  ): Promise<Page<RedemptionView>> {
    return this.coupons.redemptions(id, query);
  }

  @Patch(':id')
  @RequirePermissions('billing:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCouponSchema)) body: UpdateCouponInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<CouponView> {
    const updated = await this.coupons.update(id, body);
    await this.record('coupon.update', id, principal, request, {
      code: updated.code,
      changed: Object.keys(body),
    });
    return updated;
  }

  @Delete(':id')
  @RequirePermissions('billing:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const removed = await this.coupons.remove(id);
    await this.record('coupon.delete', id, principal, request, { code: removed.code });
  }

  private record(
    action: string,
    entityId: string,
    principal: Principal,
    request: Request,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'Coupon',
      entityId,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}

/** What a code does, for a viewer who is about to pay. */
@Controller('viewer/coupons')
export class ViewerCouponsController {
  constructor(@Inject(CheckoutService) private readonly checkout: CheckoutService) {}

  /** Says what a code takes off a plan or a title. Asking uses nothing up. */
  @ViewerOnly()
  @RateLimit(CHECK_LIMIT)
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  check(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(checkCouponSchema)) body: CheckCouponInput,
  ): Promise<CouponQuote | CouponPlansQuote> {
    return this.checkout.quote(identity.viewer, body);
  }
}
