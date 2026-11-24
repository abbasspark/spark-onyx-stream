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
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { assertUnrestricted } from '../audience/audience.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { CurrentViewer, ViewerOnly } from '../viewers/viewer-auth.guard.js';
import type { ViewerIdentity } from '../viewers/viewer-session.service.js';
import {
  type CodeInput,
  codeSchema,
  type CreateBatchInput,
  createBatchSchema,
  type ListBatchesInput,
  listBatchesSchema,
  type ListCodesInput,
  listCodesSchema,
  type UpdateBatchInput,
  updateBatchSchema,
} from './prepaid.schemas.js';
import {
  type BatchView,
  type CodeLookup,
  type CodePreview,
  type CodeView,
  PrepaidService,
  type PrepaidSummary,
  type Redeemed,
} from './prepaid.service.js';

/**
 * A person types a code once or twice. This stops a program that tries
 * codes: twenty a quarter of an hour, against some 10^23 possible ones.
 */
const TRIES = { name: 'prepaid-codes', limit: 20, windowSeconds: 900 };

/** Prepaid codes for the account that is signed in. */
@Controller('viewer/codes')
export class ViewerCodesController {
  constructor(@Inject(PrepaidService) private readonly prepaid: PrepaidService) {}

  /**
   * Says what a code would do for this account, without using it: which
   * plan, how many days, and until when the account could watch. A code that
   * cannot be used answers with `code`: "not_found", "used", "expired",
   * "withdrawn", "subscription_renews", "subscription_open" or "other_plan".
   */
  @ViewerOnly()
  @RateLimit(TRIES)
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  check(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(codeSchema)) body: CodeInput,
  ): Promise<CodePreview> {
    return this.prepaid.preview(identity.viewer.id, body.code);
  }

  /**
   * Uses a code: the plan starts now, or the days are added to the same plan
   * when it is running. A code works once. Refusals are as for checking,
   * and a refused code stays good.
   */
  @ViewerOnly()
  @RateLimit(TRIES)
  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  redeem(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(codeSchema)) body: CodeInput,
  ): Promise<Redeemed> {
    // A profile with an age limit does not change what the account may watch.
    assertUnrestricted();
    return this.prepaid.redeem(identity.viewer.id, body.code);
  }
}

/** Prepaid codes in the panel: batches, their codes, and looking one up. */
@Controller('prepaid')
export class PrepaidController {
  constructor(
    @Inject(PrepaidService) private readonly prepaid: PrepaidService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** All batches together: codes made, used and left, and uses per day of the last thirty. */
  @Get('summary')
  @RequirePermissions('billing:read')
  summary(): Promise<PrepaidSummary> {
    return this.prepaid.summary();
  }

  @Get('batches')
  @RequirePermissions('billing:read')
  list(
    @Query(new ZodValidationPipe(listBatchesSchema)) query: ListBatchesInput,
  ): Promise<Page<BatchView>> {
    return this.prepaid.listBatches(query);
  }

  /** Makes a batch of codes. The codes are had from the export, or one by one. */
  @Post('batches')
  @RequirePermissions('billing:write')
  async create(
    @Body(new ZodValidationPipe(createBatchSchema)) body: CreateBatchInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<BatchView> {
    const batch = await this.prepaid.createBatch(body, principal.adminId ?? null);
    await this.record('prepaid.batch.create', principal, request, batch.id, {
      name: batch.name,
      plan: batch.plan.name,
      days: batch.days,
      codes: batch.total,
    });
    return batch;
  }

  @Get('batches/:id')
  @RequirePermissions('billing:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<BatchView> {
    return this.prepaid.getBatch(id);
  }

  /** Changes the name, the note, or until when the codes can be used. */
  @Patch('batches/:id')
  @RequirePermissions('billing:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBatchSchema)) body: UpdateBatchInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<BatchView> {
    const batch = await this.prepaid.updateBatch(id, body);
    await this.record('prepaid.batch.update', principal, request, id, {
      name: batch.name,
      changed: Object.keys(body),
    });
    return batch;
  }

  /** Withdraws a batch: its unused codes stop working. */
  @Post('batches/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('billing:write')
  async withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<BatchView> {
    const batch = await this.prepaid.voidBatch(id);
    await this.record('prepaid.batch.withdraw', principal, request, id, {
      name: batch.name,
      codes: batch.withdrawn,
    });
    return batch;
  }

  /** Deletes a batch of which no code was used. */
  @Delete('batches/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('billing:write')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const { name } = await this.prepaid.removeBatch(id);
    await this.record('prepaid.batch.delete', principal, request, id, { name });
  }

  /** The codes of a batch, hidden but for their last four characters. */
  @Get('batches/:id/codes')
  @RequirePermissions('billing:read')
  codes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listCodesSchema)) query: ListCodesInput,
  ): Promise<Page<CodeView>> {
    return this.prepaid.listCodes(id, query);
  }

  /**
   * The codes of a batch as a CSV file: the ones that can still be used,
   * or with `all=true` every one with its state. Codes are money, so every
   * export is written to the audit log.
   */
  @Get('batches/:id/export')
  @RequirePermissions('billing:write')
  async export(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('all') all: string | undefined,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.prepaid.exportCsv(id, all === 'true');
    await this.record('prepaid.batch.export', principal, request, id, {
      name: file.name,
      codes: file.codes,
    });
    const filename = `codes-${file.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'batch'}.csv`;
    response
      .status(HttpStatus.OK)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      })
      .send(file.csv);
  }

  /** Shows one code in full, to hand it to somebody. Written to the audit log. */
  @Post('codes/:id/reveal')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('billing:write')
  async reveal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<{ code: string }> {
    const { code, batchId } = await this.prepaid.reveal(id);
    await this.record('prepaid.code.reveal', principal, request, batchId, {
      ending: code.slice(-4),
    });
    return { code };
  }

  /** Withdraws one unused code. */
  @Post('codes/:id/withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('billing:write')
  async withdrawCode(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const { batchId, ending } = await this.prepaid.voidCode(id);
    await this.record('prepaid.code.withdraw', principal, request, batchId, { ending });
  }

  /** Finds a code a viewer reads out, and says where it stands and who used it. */
  @Post('codes/lookup')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('billing:read')
  lookup(@Body(new ZodValidationPipe(codeSchema)) body: CodeInput): Promise<CodeLookup> {
    return this.prepaid.lookup(body.code);
  }

  private record(
    action: string,
    principal: Principal,
    request: Request,
    batchId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'PrepaidBatch',
      entityId: batchId,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
