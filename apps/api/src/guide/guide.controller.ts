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
  type CreateProgrammeInput,
  createProgrammeSchema,
  type CreateSourceInput,
  createSourceSchema,
  type ProgrammeWindow,
  programmeWindowSchema,
  searchKnownSchema,
  type UpdateProgrammeInput,
  updateProgrammeSchema,
  type UpdateSourceInput,
  updateSourceSchema,
} from './guide.schemas.js';
import {
  GuideService,
  type GuideSourceView,
  type KnownGuideChannel,
  type ProgrammeView,
} from './guide.service.js';
import { GuideImportService, type ImportResult } from './guide-import.service.js';

/** The programme guide for admins: where it is imported from, and the programmes themselves. */
@Controller()
export class GuideController {
  constructor(
    @Inject(GuideService) private readonly guide: GuideService,
    @Inject(GuideImportService) private readonly importer: GuideImportService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Lists the XMLTV sources the guide is imported from. */
  @Get('guide/sources')
  @RequirePermissions('live:read')
  listSources(): Promise<GuideSourceView[]> {
    return this.guide.listSources();
  }

  /** Adds an XMLTV source for the guide. */
  @Post('guide/sources')
  @RequirePermissions('live:write')
  async createSource(
    @Body(new ZodValidationPipe(createSourceSchema)) body: CreateSourceInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<GuideSourceView> {
    const created = await this.guide.createSource(body);
    await this.record('guide-source.create', created, principal, request);
    return created;
  }

  /** The full address of a source. It may carry a token, so it needs the right to change the guide. */
  @Get('guide/sources/:id/url')
  @RequirePermissions('live:write')
  sourceUrl(@Param('id', ParseUUIDPipe) id: string): Promise<{ url: string }> {
    return this.guide.sourceUrl(id);
  }

  /** Changes a guide source. */
  @Patch('guide/sources/:id')
  @RequirePermissions('live:write')
  async updateSource(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSourceSchema)) body: UpdateSourceInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<GuideSourceView> {
    const updated = await this.guide.updateSource(id, body);
    await this.record('guide-source.update', updated, principal, request);
    return updated;
  }

  /** Deletes a guide source and the programmes it brought. */
  @Delete('guide/sources/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('live:write')
  async removeSource(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const removed = await this.guide.removeSource(id);
    await this.record('guide-source.delete', removed, principal, request);
  }

  /**
   * Fetches and reads the file of a source now. The answer comes when the
   * import is done, which for a large guide takes a minute or more.
   */
  @Post('guide/sources/:id/import')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('live:write')
  @RateLimit({ name: 'guide-import', limit: 12, windowSeconds: 60 })
  async importSource(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ImportResult> {
    const result = await this.importer.run(id);
    await this.record('guide-source.import', await this.guide.getSource(id), principal, request, {
      ok: result.ok,
      programmes: result.programmes,
    });
    return result;
  }

  /** Channels the sources know, to link a channel here to one of them. */
  @Get('guide/channels')
  @RequirePermissions('live:read')
  searchKnown(
    @Query(new ZodValidationPipe(searchKnownSchema)) query: { q: string },
  ): Promise<KnownGuideChannel[]> {
    return this.guide.searchKnown(query.q);
  }

  /** Lists the programmes of a channel in a time range. */
  @Get('channels/:channelId/programmes')
  @RequirePermissions('live:read')
  listProgrammes(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Query(new ZodValidationPipe(programmeWindowSchema)) window: ProgrammeWindow,
  ): Promise<ProgrammeView[]> {
    return this.guide.listProgrammes(channelId, window);
  }

  /** Adds a programme to a channel by hand. */
  @Post('channels/:channelId/programmes')
  @RequirePermissions('live:write')
  createProgramme(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body(new ZodValidationPipe(createProgrammeSchema)) body: CreateProgrammeInput,
  ): Promise<ProgrammeView> {
    return this.guide.createProgramme(channelId, body);
  }

  /** Changes a programme. */
  @Patch('programmes/:id')
  @RequirePermissions('live:write')
  updateProgramme(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProgrammeSchema)) body: UpdateProgrammeInput,
  ): Promise<ProgrammeView> {
    return this.guide.updateProgramme(id, body);
  }

  /** Deletes a programme. */
  @Delete('programmes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('live:write')
  async removeProgramme(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.guide.removeProgramme(id);
  }

  private record(
    action: string,
    source: GuideSourceView,
    principal: Principal,
    request: Request,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'guide-source',
      entityId: source.id,
      // The address is logged without anything secret.
      metadata: { name: source.name, url: source.url, ...metadata },
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
