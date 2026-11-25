// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type AdReportQuery,
  adReportQuerySchema,
  type CreateAdSourceInput,
  createAdSourceSchema,
  type SaveAdSettingsInput,
  saveAdSettingsSchema,
  type UpdateAdSourceInput,
  updateAdSourceSchema,
} from './ads.schemas.js';
import { AdsService } from './ads.service.js';
import type { AdReport, AdSettingsView, AdSourceView } from './ads.views.js';

/** Ads in front of, in the middle of and after videos: managed here. */
@Controller('ads')
export class AdsController {
  constructor(
    @Inject(AdsService) private readonly ads: AdsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Returns when ads play, and whether there is a source to play them from. */
  @Get('settings')
  @RequirePermissions('settings:read')
  settings(): Promise<AdSettingsView> {
    return this.ads.settings();
  }

  /** Sets when ads play. Ads stay off until they are switched on here. */
  @Put('settings')
  @RequirePermissions('settings:write')
  async saveSettings(
    @Body(new ZodValidationPipe(saveAdSettingsSchema)) body: SaveAdSettingsInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<AdSettingsView> {
    const saved = await this.ads.saveSettings(body);
    await this.audit.record({
      action: 'ads.settings',
      adminId: principal.adminId,
      entityType: 'Setting',
      entityId: 'ads',
      metadata: { ...body },
      ipAddress: requestInfo(request).ipAddress,
    });
    return saved;
  }

  /** Lists the places ads come from. */
  @Get('sources')
  @RequirePermissions('settings:read')
  listSources(): Promise<AdSourceView[]> {
    return this.ads.listSources();
  }

  /** Adds a VAST tag or a video of the library as a source of ads. */
  @Post('sources')
  @RequirePermissions('settings:write')
  async createSource(
    @Body(new ZodValidationPipe(createAdSourceSchema)) body: CreateAdSourceInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<AdSourceView> {
    const created = await this.ads.createSource(body);
    await this.record('ads.source.create', created, principal, request);
    return created;
  }

  /** Changes a source of ads. */
  @Patch('sources/:id')
  @RequirePermissions('settings:write')
  async updateSource(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAdSourceSchema)) body: UpdateAdSourceInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<AdSourceView> {
    const updated = await this.ads.updateSource(id, body);
    await this.record('ads.source.update', updated, principal, request);
    return updated;
  }

  /** Removes a source of ads, with its figures. */
  @Delete('sources/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('settings:write')
  async removeSource(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const removed = await this.ads.removeSource(id);
    await this.record('ads.source.delete', removed, principal, request);
  }

  /** Returns how the ads did: shown, watched to the end, skipped, clicked. */
  @Get('report')
  @RequirePermissions('analytics:read')
  report(
    @Query(new ZodValidationPipe(adReportQuerySchema)) query: AdReportQuery,
  ): Promise<AdReport> {
    return this.ads.report(query.days);
  }

  private record(
    action: string,
    source: AdSourceView,
    principal: Principal,
    request: Request,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'AdSource',
      entityId: source.id,
      metadata: { name: source.name, kind: source.kind },
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
