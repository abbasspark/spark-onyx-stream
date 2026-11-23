// SPDX-License-Identifier: AGPL-3.0-only
import { Body, Controller, Get, Header, Inject, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, Public, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { BrandingService } from '../branding/branding.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { appVersion } from '../common/app-version.js';
import {
  type AppVersionRule,
  CLIENT_HEADER,
  type ClientIdentity,
  MAX_RULES,
  parseClient,
} from './app-version.rules.js';
import { type SaveAppVersionsInput, saveAppVersionsSchema } from './app-versions.schemas.js';
import { AnswersOldApps } from './app-versions.guard.js';
import { AppVersionsService, type ClientRefusal } from './app-versions.service.js';

/** What an app asks first: where it is, and whether it may stay. */
export interface ApiMeta {
  /** The name of the site, as set under Branding. */
  name: string;
  api: {
    /** The version of the server. */
    version: string;
    /** The part every address starts with. */
    prefix: string;
    /** Where the description of the API is. */
    description: string;
  };
  /** The app that asked, when it named itself in the X-Onyx-Client header. */
  client: (ClientIdentity & { supported: boolean; refusal: ClientRefusal | null }) | null;
}

export interface AppVersionsView {
  rules: AppVersionRule[];
  /** The header apps name themselves in. */
  header: string;
  maxRules: number;
}

@Controller()
export class AppVersionsController {
  constructor(
    @Inject(AppVersionsService) private readonly versions: AppVersionsService,
    @Inject(BrandingService) private readonly branding: BrandingService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * What an app asks when it starts. Unlike every other address, this one
   * answers an app that is too old as well, and says so in the answer: an
   * app can show its "please update" screen before anything else fails.
   */
  @Public()
  @AnswersOldApps()
  @Get('meta')
  @Header('Cache-Control', 'no-store')
  async meta(@Req() request: Request): Promise<ApiMeta> {
    const client = parseClient(request.headers[CLIENT_HEADER]);
    const refusal = client ? await this.versions.refusalFor(client) : null;
    return {
      name: await this.branding.siteName(),
      api: { version: appVersion(), prefix: 'v1', description: '/v1/openapi.json' },
      client: client ? { ...client, supported: refusal === null, refusal } : null,
    };
  }

  /** The oldest version of each app that may still connect. */
  @Get('app-versions')
  @RequirePermissions('settings:read')
  async list(): Promise<AppVersionsView> {
    return { rules: await this.versions.rules(), header: 'X-Onyx-Client', maxRules: MAX_RULES };
  }

  /** Sets all rules at once. An app without a rule is never turned away. */
  @Put('app-versions')
  @RequirePermissions('settings:write')
  async save(
    @Body(new ZodValidationPipe(saveAppVersionsSchema)) body: SaveAppVersionsInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<AppVersionsView> {
    const rules = await this.versions.save(body.rules);
    await this.audit.record({
      action: 'app-versions.update',
      adminId: principal.adminId,
      entityType: 'Setting',
      entityId: 'app-versions',
      metadata: { rules: rules.map((rule) => `${rule.app} ${rule.minimum}`) },
      ipAddress: requestInfo(request).ipAddress,
    });
    return { rules, header: 'X-Onyx-Client', maxRules: MAX_RULES };
  }
}
