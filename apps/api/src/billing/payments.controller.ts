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
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CurrentViewer, ViewerOnly } from '../viewers/viewer-auth.guard.js';
import type { ViewerIdentity } from '../viewers/viewer-session.service.js';
import {
  type ExportPaymentsInput,
  exportPaymentsSchema,
  type ListPaymentsInput,
  listPaymentsSchema,
  type RecordPaymentInput,
  recordPaymentSchema,
  type RevenueInput,
  revenueSchema,
} from './payments.schemas.js';
import { PaymentsService } from './payments.service.js';
import type { PaymentAdminView, RevenueReport, ViewerPaymentView } from './payments.views.js';

/** A viewer's own payments. */
@Controller()
export class ViewerPaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  /** The viewer's own payments. */
  @ViewerOnly()
  @Get('viewer/payments')
  @Header('Cache-Control', 'no-store')
  async own(@CurrentViewer() identity: ViewerIdentity): Promise<{ items: ViewerPaymentView[] }> {
    return { items: await this.payments.ownOf(identity.viewer.id) };
  }
}

/** The books for admins: payments, revenue, and writing down money received by hand. */
@Controller()
export class PaymentsAdminController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('billing/revenue')
  @RequirePermissions('billing:read')
  revenue(
    @Query(new ZodValidationPipe(revenueSchema)) query: RevenueInput,
  ): Promise<RevenueReport> {
    return this.payments.revenue(query);
  }

  @Get('payments')
  @RequirePermissions('billing:read')
  list(
    @Query(new ZodValidationPipe(listPaymentsSchema)) query: ListPaymentsInput,
  ): Promise<Page<PaymentAdminView>> {
    return this.payments.list(query);
  }

  /** The payments as a file. Before ":id", so "export" is not read as an id. */
  @Get('payments/export')
  @RequirePermissions('billing:read')
  async export(
    @Query(new ZodValidationPipe(exportPaymentsSchema)) query: ExportPaymentsInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const csv = await this.payments.exportCsv(query);
    // The file holds the email addresses of everyone who paid: who took it is noted.
    await this.audit.record({
      action: 'payments.export',
      adminId: principal.adminId,
      entityType: 'Payment',
      metadata: { from: query.from ?? null, to: query.to ?? null },
      ipAddress: requestInfo(request).ipAddress,
    });
    const day = new Date().toISOString().slice(0, 10);
    response
      .status(HttpStatus.OK)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="payments-${day}.csv"`,
        'Cache-Control': 'no-store',
      })
      .send(csv);
  }

  /** Reads the paid invoices from Stripe into the books. */
  @Post('billing/stripe/import-payments')
  @RequirePermissions('billing:write')
  @HttpCode(HttpStatus.OK)
  async importFromStripe(
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<{ checked: number; added: number; complete: boolean }> {
    const result = await this.payments.importFromStripe();
    await this.audit.record({
      action: 'payments.import',
      adminId: principal.adminId,
      entityType: 'Payment',
      metadata: result,
      ipAddress: requestInfo(request).ipAddress,
    });
    return result;
  }

  @Get('viewers/:id/payments')
  @RequirePermissions('billing:read')
  async forViewer(@Param('id', ParseUUIDPipe) id: string): Promise<{ items: PaymentAdminView[] }> {
    return { items: await this.payments.forViewer(id) };
  }

  /** Writes down money received outside the site. */
  @Post('viewers/:id/payments')
  @RequirePermissions('billing:write')
  async record(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordPaymentSchema)) body: RecordPaymentInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PaymentAdminView> {
    const payment = await this.payments.record(id, body, principal.adminId);
    await this.audit.record({
      action: 'payment.record',
      adminId: principal.adminId,
      entityType: 'Viewer',
      entityId: id,
      metadata: {
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        plan: payment.planName,
      },
      ipAddress: requestInfo(request).ipAddress,
    });
    return payment;
  }

  /** Takes a payment that was written down by hand out of the books. */
  @Delete('payments/:id')
  @RequirePermissions('billing:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const payment = await this.payments.remove(id);
    await this.audit.record({
      action: 'payment.delete',
      adminId: principal.adminId,
      entityType: 'Payment',
      entityId: id,
      metadata: {
        viewer: payment.viewerEmail,
        amount: payment.amount,
        currency: payment.currency,
        paidAt: payment.paidAt,
      },
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
