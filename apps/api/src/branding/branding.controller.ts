// SPDX-License-Identifier: AGPL-3.0-only
import { Body, Controller, Delete, Get, Header, Inject, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, Public, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { type BrandingInput, brandingSchema } from './branding.rules.js';
import { BrandingService, type BrandingView, type PublicSite } from './branding.service.js';

/** How the site presents itself: for the panel to set, and for the website to read. */
@Controller()
export class BrandingController {
  constructor(
    @Inject(BrandingService) private readonly branding: BrandingService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * The name, logo, colour and footer of the site. Public: it is what every
   * visitor sees. Kept for a short time, like the rest of the catalog.
   */
  @Get('catalog/site')
  @Public()
  @RateLimit({ name: 'catalog', limit: 600, windowSeconds: 60 })
  @Header('Cache-Control', 'public, max-age=30')
  site(): Promise<PublicSite> {
    return this.branding.site();
  }

  @Get('branding')
  @RequirePermissions('settings:read')
  get(): Promise<BrandingView> {
    return this.branding.view();
  }

  @Put('branding')
  @RequirePermissions('settings:write')
  async update(
    @Body(new ZodValidationPipe(brandingSchema)) body: BrandingInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<BrandingView> {
    const view = await this.branding.update(body);
    await this.audit.record({
      action: 'branding.update',
      adminId: principal.adminId,
      entityType: 'Setting',
      metadata: {
        name: view.settings.name,
        accent: view.settings.accent,
        logo: view.settings.logoId !== null,
        icon: view.settings.iconId !== null,
        footerLinks: view.settings.footerLinks.length,
      },
      ipAddress: requestInfo(request).ipAddress,
    });
    return view;
  }

  /** Back to how the site ships: its own name, mark and amber. */
  @Delete('branding')
  @RequirePermissions('settings:write')
  async reset(
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<BrandingView> {
    const view = await this.branding.reset();
    await this.audit.record({
      action: 'branding.reset',
      adminId: principal.adminId,
      entityType: 'Setting',
      ipAddress: requestInfo(request).ipAddress,
    });
    return view;
  }
}
