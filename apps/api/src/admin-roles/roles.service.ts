// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type AdminCustomRole, type AdminRole, PrismaClient } from '@onyx/database';
import { grantDenialReason, type RoleAssignment } from '../admins/admin.rules.js';
import { subjectOfPrincipal } from '../admins/admin.view.js';
import { AuditService } from '../audit/audit.service.js';
import { PERMISSION_CATALOG, type PermissionSection } from '../auth/permission-catalog.js';
import {
  BUILT_IN_ROLES,
  type BuiltInRole,
  normalizePermissions,
  type Permission,
  permissionsOfRole,
} from '../auth/permissions.js';
import type { AdminPrincipal } from '../auth/principal.js';
import { SessionService } from '../auth/session.service.js';
import { isForeignKeyViolation, isUniqueViolation } from '../common/prisma-errors.js';
import {
  BUILT_IN_ROLE_INFO,
  closestBuiltIn,
  MAX_CUSTOM_ROLES,
  permissionChanges,
  roleChangeDenialReason,
  roleCreateDenialReason,
} from './role.rules.js';
import type { CreateRoleInput, DeleteRoleInput, UpdateRoleInput } from './roles.schemas.js';

/** A role as the panel lists it: one of the four built in, or one made there. */
export interface RoleView {
  /** The id of a custom role. Null for a built-in one, which is named by `key`. */
  id: string | null;
  /** OWNER, ADMIN, EDITOR or VIEWER for a built-in role, CUSTOM for the others. */
  key: AdminRole;
  builtIn: boolean;
  name: string;
  description: string;
  color: string;
  permissions: Permission[];
  /** How many admins hold it, deactivated ones included. */
  adminCount: number;
  /** The built-in role whose permissions this one covers, as a hint. Null for built-in roles. */
  like: BuiltInRole | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface RoleHolderView {
  id: string;
  displayName: string;
  email: string;
  isActive: boolean;
}

/** A role with the admins who hold it. */
export interface RoleDetail extends RoleView {
  admins: RoleHolderView[];
}

export interface RolesOverview {
  roles: RoleView[];
  /** Every permission with a sentence, grouped the way the panel is. */
  catalog: readonly PermissionSection[];
}

export interface RoleDeleted {
  /** How many admins were moved to the other role. */
  movedAdmins: number;
}

function builtInView(key: BuiltInRole, adminCount: number): RoleView {
  const info = BUILT_IN_ROLE_INFO[key];
  return {
    id: null,
    key,
    builtIn: true,
    name: info.name,
    description: info.description,
    color: info.color,
    permissions: [...permissionsOfRole(key)],
    adminCount,
    like: null,
    createdAt: null,
    updatedAt: null,
  };
}

function customView(role: AdminCustomRole, adminCount: number): RoleView {
  const permissions = normalizePermissions(role.permissions);
  return {
    id: role.id,
    key: 'CUSTOM',
    builtIn: false,
    name: role.name,
    description: role.description,
    color: role.color,
    permissions,
    adminCount,
    like: closestBuiltIn(permissions),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

/**
 * The roles admins hold: the four that ship with the software, which cannot
 * be changed, and the ones made in the panel.
 */
@Injectable()
export class AdminRolesService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async overview(): Promise<RolesOverview> {
    const [custom, builtInCounts] = await Promise.all([
      this.prisma.adminCustomRole.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { admins: true } } },
      }),
      this.prisma.adminUser.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);
    const countOf = (key: BuiltInRole): number =>
      builtInCounts.find((row) => row.role === key)?._count._all ?? 0;

    return {
      roles: [
        ...BUILT_IN_ROLES.map((key) => builtInView(key, countOf(key))),
        ...custom.map((role) => customView(role, role._count.admins)),
      ],
      catalog: PERMISSION_CATALOG,
    };
  }

  /** @throws NotFoundException */
  async get(id: string): Promise<RoleDetail> {
    const role = await this.prisma.adminCustomRole.findUnique({
      where: { id },
      include: {
        admins: {
          orderBy: { displayName: 'asc' },
          select: { id: true, displayName: true, email: true, isActive: true },
        },
      },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    const { admins, ...only } = role;
    return { ...customView(only, admins.length), admins };
  }

  /**
   * Turns what a request names (a built-in role, or CUSTOM and an id) into
   * the role with its permissions, for the rules that decide on it.
   *
   * @throws BadRequestException when the custom role does not exist.
   */
  async resolve(role: AdminRole, customRoleId: string | undefined): Promise<RoleAssignment> {
    if (role !== 'CUSTOM') {
      return { role, customRoleId: null, permissions: permissionsOfRole(role) };
    }
    const custom = customRoleId
      ? await this.prisma.adminCustomRole.findUnique({ where: { id: customRoleId } })
      : null;
    if (!custom) {
      throw new BadRequestException('This custom role does not exist');
    }
    return {
      role: 'CUSTOM',
      customRoleId: custom.id,
      permissions: normalizePermissions(custom.permissions),
    };
  }

  /**
   * @throws ForbiddenException when the role would hold more than its maker.
   * @throws ConflictException when the name is taken or there are too many roles.
   */
  async create(
    actor: AdminPrincipal,
    input: CreateRoleInput,
    ipAddress: string | null,
  ): Promise<RoleView> {
    const denial = roleCreateDenialReason(subjectOfPrincipal(actor), input.permissions);
    if (denial) {
      throw new ForbiddenException(denial);
    }
    if ((await this.prisma.adminCustomRole.count()) >= MAX_CUSTOM_ROLES) {
      throw new ConflictException(
        `There are ${MAX_CUSTOM_ROLES} roles already. Delete one you no longer use first.`,
      );
    }
    await this.assertNameFree(input.name, null);

    let role: AdminCustomRole;
    try {
      role = await this.prisma.adminCustomRole.create({
        data: {
          name: input.name,
          description: input.description,
          color: input.color,
          permissions: input.permissions,
          createdById: actor.adminId,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A role with this name already exists');
      }
      throw error;
    }

    await this.audit.record({
      action: 'role.create',
      adminId: actor.adminId,
      entityType: 'AdminCustomRole',
      entityId: role.id,
      metadata: { name: role.name, permissions: role.permissions },
      ipAddress,
    });

    return customView(role, 0);
  }

  /**
   * Changes a role. Its holders may do the new things, and no longer the old
   * ones, from their next request on: nobody has to sign in again.
   *
   * @throws ForbiddenException when the actor holds this role, or less than it.
   * @throws NotFoundException
   * @throws ConflictException when the name is taken.
   */
  async update(
    actor: AdminPrincipal,
    id: string,
    input: UpdateRoleInput,
    ipAddress: string | null,
  ): Promise<RoleView> {
    const role = await this.findOrThrow(id);
    const before = normalizePermissions(role.permissions);

    const denial = roleChangeDenialReason(
      subjectOfPrincipal(actor),
      { id: role.id, permissions: before },
      input.permissions,
    );
    if (denial) {
      throw new ForbiddenException(denial);
    }
    if (input.name !== undefined) {
      await this.assertNameFree(input.name, id);
    }

    let updated: AdminCustomRole & { _count: { admins: number } };
    try {
      updated = await this.prisma.adminCustomRole.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          color: input.color,
          permissions: input.permissions,
        },
        include: { _count: { select: { admins: true } } },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A role with this name already exists');
      }
      throw error;
    }

    const changes = input.permissions ? permissionChanges(before, input.permissions) : null;
    await this.audit.record({
      action: 'role.update',
      adminId: actor.adminId,
      entityType: 'AdminCustomRole',
      entityId: id,
      metadata: {
        name: updated.name,
        changed: Object.entries(input)
          .filter(([, value]) => value !== undefined)
          .map(([field]) => field),
        ...(changes && (changes.added.length > 0 || changes.removed.length > 0) ? changes : {}),
        admins: updated._count.admins,
      },
      ipAddress,
    });

    const { _count, ...only } = updated;
    return customView(only, _count.admins);
  }

  /**
   * Deletes a role. While admins hold it, the request has to say which role
   * they get instead; they are signed out, as after any change of role.
   *
   * @throws ForbiddenException when the actor holds this role, or less than it,
   *   or may not hand out the role the holders move to.
   * @throws ConflictException (`role_in_use`) when admins hold it and no other role is named.
   * @throws NotFoundException
   */
  async remove(
    actor: AdminPrincipal,
    id: string,
    input: DeleteRoleInput,
    ipAddress: string | null,
  ): Promise<RoleDeleted> {
    const role = await this.findOrThrow(id);
    const subject = subjectOfPrincipal(actor);

    const denial = roleChangeDenialReason(subject, {
      id: role.id,
      permissions: normalizePermissions(role.permissions),
    });
    if (denial) {
      throw new ForbiddenException(denial);
    }

    let replacement: RoleAssignment | null = null;
    if (input.moveTo !== undefined) {
      if (input.moveTo === id) {
        throw new BadRequestException('Move the admins to another role than the one you delete');
      }
      replacement =
        input.moveTo === 'ADMIN' || input.moveTo === 'EDITOR' || input.moveTo === 'VIEWER'
          ? await this.resolve(input.moveTo, undefined)
          : await this.resolve('CUSTOM', input.moveTo);
      const grantDenial = grantDenialReason(subject, replacement);
      if (grantDenial) {
        throw new ForbiddenException(grantDenial);
      }
    }

    let moved: string[];
    try {
      moved = await this.prisma.$transaction(async (tx) => {
        const holders = await tx.adminUser.findMany({
          where: { customRoleId: id },
          select: { id: true },
        });
        if (holders.length > 0) {
          if (!replacement) {
            throw new ConflictException({
              statusCode: 409,
              error: 'Conflict',
              code: 'role_in_use',
              message:
                holders.length === 1
                  ? 'One admin holds this role. Say which role they get instead.'
                  : `${holders.length} admins hold this role. Say which role they get instead.`,
              admins: holders.length,
            });
          }
          await tx.adminUser.updateMany({
            where: { customRoleId: id },
            data: { role: replacement.role, customRoleId: replacement.customRoleId },
          });
        }
        await tx.adminCustomRole.delete({ where: { id } });
        return holders.map((holder) => holder.id);
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        // Someone was given the role between the count and the delete.
        throw new ConflictException('An admin was just given this role. Try again.');
      }
      throw error;
    }

    await Promise.all(moved.map((adminId) => this.sessions.revokeAllForAdmin(adminId)));

    await this.audit.record({
      action: 'role.delete',
      adminId: actor.adminId,
      entityType: 'AdminCustomRole',
      entityId: id,
      metadata: {
        name: role.name,
        movedAdmins: moved.length,
        ...(replacement && moved.length > 0 ? { movedTo: input.moveTo } : {}),
      },
      ipAddress,
    });

    return { movedAdmins: moved.length };
  }

  /** Names differ by more than their capitals, so two badges never read the same. */
  private async assertNameFree(name: string, exceptId: string | null): Promise<void> {
    const taken = await this.prisma.adminCustomRole.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException('A role with this name already exists');
    }
  }

  private async findOrThrow(id: string): Promise<AdminCustomRole> {
    const role = await this.prisma.adminCustomRole.findUnique({ where: { id } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }
}
