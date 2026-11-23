// SPDX-License-Identifier: AGPL-3.0-only
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { AdminRolesService } from '../admin-roles/roles.service.js';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../auth/password-hasher.js';
import type { AdminPrincipal } from '../auth/principal.js';
import { SessionService } from '../auth/session.service.js';
import { type Page, type PaginationInput, toPage, toSkipTake } from '../common/pagination.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import {
  type AdminChange,
  createDenialReason,
  removesActiveOwner,
  requiresSessionRevocation,
  updateDenialReason,
} from './admin.rules.js';
import {
  type AdminView,
  type AdminWithRole,
  subjectOfAdmin,
  subjectOfPrincipal,
  toAdminView,
} from './admin.view.js';
import type { CreateAdminInput, UpdateAdminInput } from './admins.schemas.js';

/** The role of an admin in words, for the audit log: the built-in name, or that of the custom role. */
function roleLabel(admin: AdminWithRole): string {
  return admin.customRole ? admin.customRole.name : admin.role;
}

@Injectable()
export class AdminsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AdminRolesService) private readonly roles: AdminRolesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(pagination: PaginationInput): Promise<Page<AdminView>> {
    const [admins, total] = await Promise.all([
      this.prisma.adminUser.findMany({
        orderBy: { createdAt: 'asc' },
        include: { customRole: true },
        ...toSkipTake(pagination),
      }),
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
    const role = await this.roles.resolve(input.role, input.customRoleId);
    const denial = createDenialReason(subjectOfPrincipal(actor), role);
    if (denial) {
      throw new ForbiddenException(denial);
    }

    let admin: AdminWithRole;
    try {
      admin = await this.prisma.adminUser.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash: await hashPassword(input.password),
          role: role.role,
          customRoleId: role.customRoleId,
        },
        include: { customRole: true },
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
      metadata: { email: admin.email, role: roleLabel(admin) },
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
    const found = await this.findOrThrow(id);
    const target = subjectOfAdmin(found);
    const change: AdminChange = {
      displayName: input.displayName,
      isActive: input.isActive,
      password: input.password,
      role:
        input.role !== undefined
          ? await this.roles.resolve(input.role, input.customRoleId)
          : undefined,
    };

    const denial = updateDenialReason(subjectOfPrincipal(actor), target, change);
    if (denial) {
      throw new ForbiddenException(denial);
    }

    const passwordHash = input.password ? await hashPassword(input.password) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (removesActiveOwner(target, change)) {
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
          role: change.role?.role,
          customRoleId: change.role ? change.role.customRoleId : undefined,
          isActive: input.isActive,
          passwordHash,
        },
        include: { customRole: true },
      });
    });

    if (requiresSessionRevocation(target, change)) {
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
          .filter(([field, value]) => value !== undefined && field !== 'customRoleId')
          .map(([field]) => field),
        ...(input.role !== undefined
          ? { role: { from: roleLabel(found), to: roleLabel(updated) } }
          : {}),
      },
      ipAddress,
    });

    return toAdminView(updated);
  }

  private async findOrThrow(id: string): Promise<AdminWithRole> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id },
      include: { customRole: true },
    });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    return admin;
  }
}
