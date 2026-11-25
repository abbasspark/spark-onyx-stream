// SPDX-License-Identifier: AGPL-3.0-only
import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { AuditLog } from '@onyx/database';
import { z } from 'zod';
import { RequirePermissions } from '../auth/auth.decorators.js';
import { type Page, paginationSchema } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuditService } from './audit.service.js';

const auditLogQuerySchema = paginationSchema.extend({
  action: z.string().min(1).max(100).optional(),
  adminId: z.uuid().optional(),
  entityType: z.string().min(1).max(100).optional(),
  entityId: z.string().min(1).max(100).optional(),
});

type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

@Controller('audit-logs')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  /** Lists what admins did, the newest first. */
  @Get()
  @RequirePermissions('audit:read')
  list(
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<Page<AuditLog>> {
    const { page, pageSize, ...filter } = query;
    return this.audit.list(filter, { page, pageSize });
  }
}
