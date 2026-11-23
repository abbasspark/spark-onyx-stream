// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { type Page, paginationSchema } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { isTermKind, TERM_KINDS, type TermKind } from './term-fields.js';
import {
  type SaveTermsResult,
  type TermRow,
  type TermsOverview,
  TermTranslationsService,
} from './term-translations.service.js';

const listSchema = paginationSchema.extend({
  language: z.string().trim().min(2).max(20),
  q: z.string().trim().min(1).max(200).optional(),
  missing: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
type ListQuery = z.infer<typeof listSchema>;

/** How many terms one save takes: a page of the panel, with room to spare. */
export const MAX_TERMS_PER_SAVE = 200;

const saveSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid(),
        texts: z.record(z.string().max(40), z.string().max(20_000).nullable()),
      }),
    )
    .min(1)
    .max(MAX_TERMS_PER_SAVE),
});
type SaveBody = z.infer<typeof saveSchema>;

function kindOf(value: string): TermKind {
  if (!isTermKind(value)) {
    throw new BadRequestException(`Choose one of ${TERM_KINDS.join(', ')}`);
  }
  return value;
}

/**
 * Translations of what is not a title: categories, genres, collections and
 * people. The panel works on them a language at a time, many at once.
 */
@Controller('translations/terms')
export class TermTranslationsController {
  constructor(
    @Inject(TermTranslationsService) private readonly terms: TermTranslationsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** What there is to translate, and how far each language has come. */
  @Get()
  @RequirePermissions('catalog:read')
  overview(): Promise<TermsOverview> {
    return this.terms.overview();
  }

  @Get(':kind')
  @RequirePermissions('catalog:read')
  list(
    @Param('kind') kind: string,
    @Query(new ZodValidationPipe(listSchema)) query: ListQuery,
  ): Promise<Page<TermRow>> {
    return this.terms.list(kindOf(kind), query);
  }

  /** Writes the translations of up to 200 terms into one language. */
  @Put(':kind/:language')
  @RequirePermissions('catalog:write')
  async save(
    @Param('kind') kind: string,
    @Param('language') language: string,
    @Body(new ZodValidationPipe(saveSchema)) body: SaveBody,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<SaveTermsResult> {
    const result = await this.terms.save(kindOf(kind), language, body);
    await this.audit.record({
      action: 'terms.translation.save',
      adminId: principal.adminId,
      entityType: 'TermTranslation',
      metadata: { kind, language: this.terms.language(language), ...result },
      ipAddress: requestInfo(request).ipAddress,
    });
    return result;
  }

  /** Takes a language away from every term of a kind. */
  @Delete(':kind/:language')
  @RequirePermissions('catalog:write')
  async remove(
    @Param('kind') kind: string,
    @Param('language') language: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<{ removed: number }> {
    const removed = await this.terms.removeLanguage(kindOf(kind), language);
    await this.audit.record({
      action: 'terms.translation.delete',
      adminId: principal.adminId,
      entityType: 'TermTranslation',
      metadata: { kind, language: this.terms.language(language), removed },
      ipAddress: requestInfo(request).ipAddress,
    });
    return { removed };
  }
}
