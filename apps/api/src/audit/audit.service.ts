// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AuditLog, Prisma, PrismaClient } from '@onyx/database';
import { type Page, type PaginationInput, toPage, toSkipTake } from '../common/pagination.js';

export interface AuditEntry {
  /** What happened, as "area.event", for example "auth.login" or "admin.create". */
  action: string;
  /** The admin who did it. Null for events without a known actor, such as a failed login. */
  adminId?: string | null;
  entityType?: string;
  entityId?: string;
  /** Extra context. Never put passwords, tokens or keys here. */
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export interface AuditLogFilter {
  action?: string;
  adminId?: string;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /**
   * Writes an audit entry.
   *
   * A failure to write is logged and does not fail the request: the action
   * has already happened, and reporting it as failed would mislead the caller.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          adminId: entry.adminId ?? null,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          metadata: (entry.metadata as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Could not write audit entry "${entry.action}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async list(filter: AuditLogFilter, pagination: PaginationInput): Promise<Page<AuditLog>> {
    const where: Prisma.AuditLogWhereInput = {
      action: filter.action,
      adminId: filter.adminId,
      entityType: filter.entityType,
      entityId: filter.entityId,
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(pagination),
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return toPage(items, total, pagination);
  }
}
