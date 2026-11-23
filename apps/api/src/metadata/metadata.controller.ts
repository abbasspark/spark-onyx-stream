// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import {
  type ApplyMetadataInput,
  applyMetadataSchema,
  type ImportMetadataInput,
  importMetadataSchema,
  type PreviewMetadataInput,
  previewMetadataSchema,
  type SearchMetadataInput,
  searchMetadataSchema,
} from './metadata.schemas.js';
import { TranslationsService } from '../catalog/translations.service.js';
import { MetadataService } from './metadata.service.js';
import type {
  ImportResult,
  SourceTranslation,
  MetadataPreview,
  MetadataSearchResult,
  MetadataStatus,
} from './metadata.types.js';

/** Searching happens while typing. This is far above that, and far below a script gone wrong. */
const LOOKUPS = { name: 'metadata-lookup', limit: 120, windowSeconds: 60 };
/** An import downloads pictures and can take a while. */
const IMPORTS = { name: 'metadata-import', limit: 30, windowSeconds: 60 };

/** Details and artwork of titles from The Movie Database. */
@Controller()
export class MetadataController {
  constructor(
    @Inject(MetadataService) private readonly metadata: MetadataService,
    @Inject(TranslationsService) private readonly translations: TranslationsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Whether the import is set up, so the panel can show or explain it. */
  @Get('metadata')
  @RequirePermissions('catalog:read')
  status(): MetadataStatus {
    return this.metadata.status();
  }

  @Get('metadata/search')
  @RequirePermissions('catalog:write')
  @RateLimit(LOOKUPS)
  search(
    @Query(new ZodValidationPipe(searchMetadataSchema)) query: SearchMetadataInput,
  ): Promise<MetadataSearchResult[]> {
    return this.metadata.search(query);
  }

  /** What an import of one entry would bring. Changes nothing. */
  @Get('metadata/preview')
  @RequirePermissions('catalog:write')
  @RateLimit(LOOKUPS)
  preview(
    @Query(new ZodValidationPipe(previewMetadataSchema)) query: PreviewMetadataInput,
  ): Promise<MetadataPreview> {
    return this.metadata.preview(query);
  }

  /** Creates a draft title from an entry. */
  @Post('metadata/import')
  @RequirePermissions('catalog:write')
  @RateLimit(IMPORTS)
  async importNew(
    @Body(new ZodValidationPipe(importMetadataSchema)) body: ImportMetadataInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ImportResult> {
    const result = await this.metadata.importNew(body, principal.adminId);
    await this.record('title.import', result, principal, request);
    return result;
  }

  /** Brings details of an entry into an existing title. */
  @Post('titles/:id/metadata')
  @RequirePermissions('catalog:write')
  @RateLimit(IMPORTS)
  async apply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(applyMetadataSchema)) body: ApplyMetadataInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ImportResult> {
    const result = await this.metadata.applyTo(id, body);
    await this.record('title.metadata_update', result, principal, request, {
      overwrite: body.overwrite,
    });
    return result;
  }

  /** What the source says about an imported title in another language. Changes nothing. */
  @Get('titles/:id/translations/:language/source')
  @RequirePermissions('catalog:write')
  @RateLimit(LOOKUPS)
  sourceTranslation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('language') language: string,
  ): Promise<SourceTranslation> {
    return this.metadata.sourceTranslation(id, this.translations.language(language));
  }

  private record(
    action: string,
    result: ImportResult,
    principal: Principal,
    request: Request,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const { title, report } = result;
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'Title',
      entityId: title.id,
      metadata: {
        name: title.name,
        source: title.metadata?.source,
        sourceId: title.metadata?.id,
        fields: report.fields,
        seasonsCreated: report.seasonsCreated,
        episodesCreated: report.episodesCreated,
        picturesAdded: report.picturesAdded,
        ...extra,
      },
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
