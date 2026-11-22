// SPDX-License-Identifier: AGPL-3.0-only
import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { DiagnosticsService } from './diagnostics.service.js';
import type { AlertSettings, DiagnosticsReport, DiagnosticsSummary } from './diagnostics.types.js';

const settingsSchema = z.object({ emailAlerts: z.boolean() });

/** What is wrong with the installation, if anything. */
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(
    @Inject(DiagnosticsService) private readonly diagnostics: DiagnosticsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Looks at everything now. Takes a second or two. */
  @Get()
  @RequirePermissions('settings:read')
  @RateLimit({ name: 'diagnostics', limit: 60, windowSeconds: 600 })
  report(): Promise<DiagnosticsReport> {
    return this.diagnostics.run();
  }

  /**
   * What the last look found, without looking again: cheap enough to ask for
   * on every page. Null when nobody looked in the last quarter of an hour.
   */
  @Get('summary')
  @RequirePermissions('settings:read')
  async summary(): Promise<{ summary: DiagnosticsSummary | null }> {
    return { summary: await this.diagnostics.summary() };
  }

  @Put('settings')
  @RequirePermissions('settings:write')
  async updateSettings(
    @Body(new ZodValidationPipe(settingsSchema)) body: AlertSettings,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<AlertSettings> {
    const settings = await this.diagnostics.updateSettings(body);
    await this.audit.record({
      action: 'diagnostics.settings',
      adminId: principal.adminId,
      entityType: 'Diagnostics',
      metadata: { ...settings },
      ipAddress: requestInfo(request).ipAddress,
    });
    return settings;
  }
}
