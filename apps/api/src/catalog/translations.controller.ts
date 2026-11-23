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
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { TitleHistoryService } from '../history/title-history.service.js';
import { type TranslationInput, translationSchema } from './catalog.schemas.js';
import {
  type LanguageUse,
  TranslationsService,
  type TranslationView,
} from './translations.service.js';

/** The texts of titles in more than one language. */
@Controller()
export class TranslationsController {
  constructor(
    @Inject(TranslationsService) private readonly translations: TranslationsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TitleHistoryService) private readonly history: TitleHistoryService,
  ) {}

  /** The languages in use, to offer them first when a title gets a new one. */
  @Get('translations/languages')
  @RequirePermissions('catalog:read')
  languages(): Promise<LanguageUse[]> {
    return this.translations.languages();
  }

  @Get('titles/:id/translations')
  @RequirePermissions('catalog:read')
  list(@Param('id', ParseUUIDPipe) id: string): Promise<TranslationView[]> {
    return this.translations.list(id);
  }

  @Put('titles/:id/translations/:language')
  @RequirePermissions('catalog:write')
  async put(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('language') language: string,
    @Body(new ZodValidationPipe(translationSchema)) body: TranslationInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<TranslationView[]> {
    const translations = await this.translations.put(id, language, body);
    await this.history.capture(id, principal.adminId, 'translation');
    await this.audit.record({
      action: 'title.translation.save',
      adminId: principal.adminId,
      entityType: 'Title',
      entityId: id,
      metadata: { language: this.translations.language(language) },
      ipAddress: requestInfo(request).ipAddress,
    });
    return translations;
  }

  @Delete('titles/:id/translations/:language')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('language') language: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    await this.translations.remove(id, language);
    await this.history.capture(id, principal.adminId, 'translation');
    await this.audit.record({
      action: 'title.translation.delete',
      adminId: principal.adminId,
      entityType: 'Title',
      entityId: id,
      metadata: { language: this.translations.language(language) },
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
