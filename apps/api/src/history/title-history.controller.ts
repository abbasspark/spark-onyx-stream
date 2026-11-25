// SPDX-License-Identifier: AGPL-3.0-only
import { Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { type Page, paginationSchema } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type RestoreResult,
  type RevisionDetail,
  type RevisionView,
  TitleHistoryService,
} from './title-history.service.js';
import { CHANGE_GROUPS } from './title-snapshot.js';

const listSchema = paginationSchema.extend({
  /** Only revisions that changed something of this part. */
  group: z.enum(CHANGE_GROUPS).optional(),
});
type ListQuery = z.infer<typeof listSchema>;

/** The history of a title: what changed, who changed it, and the way back. */
@Controller('titles/:id/history')
export class TitleHistoryController {
  constructor(
    @Inject(TitleHistoryService) private readonly history: TitleHistoryService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Lists the changes made to a title, the newest first. */
  @Get()
  @RequirePermissions('catalog:read')
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listSchema)) query: ListQuery,
  ): Promise<Page<RevisionView>> {
    return this.history.list(id, query);
  }

  /** One version, with what bringing it back would change now. */
  @Get(':revisionId')
  @RequirePermissions('catalog:read')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ): Promise<RevisionDetail> {
    return this.history.get(id, revisionId);
  }

  /**
   * Brings a version back: texts, facts, prices, artwork, genres and
   * categories, people and translations. Publishing, videos and episodes
   * stay as they are.
   */
  @Post(':revisionId/restore')
  @RequirePermissions('catalog:write')
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<RestoreResult> {
    const result = await this.history.restore(id, revisionId, principal.adminId);
    await this.audit.record({
      action: 'title.restore',
      adminId: principal.adminId,
      entityType: 'Title',
      entityId: id,
      metadata: { revision: revisionId, restored: result.restored, left: result.left.length },
      ipAddress: requestInfo(request).ipAddress,
    });
    return result;
  }
}
