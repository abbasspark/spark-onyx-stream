// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AdminUser, PrismaClient } from '@onyx/database';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../auth/password-hasher.js';
import type { AdminPrincipal } from '../auth/principal.js';
import { SessionService } from '../auth/session.service.js';
import { type Page, type PaginationInput, toPage, toSkipTake } from '../common/pagination.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import {
  type AdminSubject,
  createDenialReason,
  removesActiveOwner,
  requiresSessionRevocation,
  updateDenialReason,
} from './admin.rules.js';
import { type AdminView, toAdminView } from './admin.view.js';
import type { CreateAdminInput, UpdateAdminInput } from './admins.schemas.js';

function subjectOf(principal: AdminPrincipal): AdminSubject {
  return { id: principal.adminId, role: principal.role, isActive: true };
}

@Injectable()
export class AdminsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(pagination: PaginationInput): Promise<Page<AdminView>> {
    const [admins, total] = await Promise.all([
      this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' }, ...toSkipTake(pagination) }),
      this.prisma.adminUser.count(),
    ]);
    return toPage(admins.map(toAdminView), total, pagination);
  }

  async get(id: string): Promise<AdminView> {
    return toAdminView(await this.findOrThrow(id));
  }

  async create(
    actor: AdminPrincipal,
    input: CreateAdminInput,
    ipAddress: string | null,
  ): Promise<AdminView> {
    const denial = createDenialReason(subjectOf(actor), input.role);
    if (denial) {
      throw new ForbiddenException(denial);
    }

    let admin: AdminUser;
    try {
      admin = await this.prisma.adminUser.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash: await hashPassword(input.password),
          role: input.role,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An admin with this email address already exists');
      }
      throw error;
    }

    await this.audit.record({
      action: 'admin.create',
      adminId: actor.adminId,
      entityType: 'AdminUser',
      entityId: admin.id,
      metadata: { email: admin.email, role: admin.role },
      ipAddress,
    });

    return toAdminView(admin);
  }

  async update(
    actor: AdminPrincipal,
    id: string,
    input: UpdateAdminInput,
    ipAddress: string | null,
  ): Promise<AdminView> {
    const target = await this.findOrThrow(id);

    const denial = updateDenialReason(subjectOf(actor), target, input);
    if (denial) {
      throw new ForbiddenException(denial);
    }

    const passwordHash = input.password ? await hashPassword(input.password) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (removesActiveOwner(target, input)) {
        // Lock the owner rows so two requests cannot each remove a different last owner.
        const owners = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM admin_users
          WHERE role = 'OWNER' AND "isActive" = true
          FOR UPDATE`;
        if (owners.length <= 1) {
          throw new ConflictException('The last active owner cannot be demoted or deactivated');
        }
      }

      return tx.adminUser.update({
        where: { id },
        data: {
          displayName: input.displayName,
          role: input.role,
          isActive: input.isActive,
          passwordHash,
        },
      });
    });

    if (requiresSessionRevocation(target, input)) {
      await this.sessions.revokeAllForAdmin(id);
    }

    await this.audit.record({
      action: input.isActive === false ? 'admin.deactivate' : 'admin.update',
      adminId: actor.adminId,
      entityType: 'AdminUser',
      entityId: id,
      metadata: {
        // The password itself is never logged, only the fact that it was reset.
        changed: Object.entries(input)
          .filter(([, value]) => value !== undefined)
          .map(([field]) => field),
        ...(input.role !== undefined ? { role: { from: target.role, to: input.role } } : {}),
      },
      ipAddress,
    });

    return toAdminView(updated);
  }

  private async findOrThrow(id: string): Promise<AdminUser> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    return admin;
  }
}
