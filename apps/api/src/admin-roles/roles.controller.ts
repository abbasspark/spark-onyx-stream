// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminSessionOnly, CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { AdminPrincipal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type CreateRoleInput,
  createRoleSchema,
  type DeleteRoleInput,
  deleteRoleSchema,
  type UpdateRoleInput,
  updateRoleSchema,
} from './roles.schemas.js';
import {
  AdminRolesService,
  type RoleDeleted,
  type RoleDetail,
  type RolesOverview,
  type RoleView,
} from './roles.service.js';

/**
 * The roles of the panel. Seeing them goes with seeing admins, changing them
 * with changing admins, and always by a signed-in person: never an API key.
 */
@Controller('roles')
export class AdminRolesController {
  constructor(@Inject(AdminRolesService) private readonly roles: AdminRolesService) {}

  /** Every role, built in and custom, and the list of permissions with a sentence each. */
  @Get()
  @RequirePermissions('admins:read')
  overview(): Promise<RolesOverview> {
    return this.roles.overview();
  }

  /** One custom role with the admins who hold it. */
  @Get(':id')
  @RequirePermissions('admins:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RoleDetail> {
    return this.roles.get(id);
  }

  @Post()
  @AdminSessionOnly()
  @RequirePermissions('admins:write')
  create(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
    @Req() request: Request,
  ): Promise<RoleView> {
    return this.roles.create(principal, body, requestInfo(request).ipAddress);
  }

  @Patch(':id')
  @AdminSessionOnly()
  @RequirePermissions('admins:write')
  update(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
    @Req() request: Request,
  ): Promise<RoleView> {
    return this.roles.update(principal, id, body, requestInfo(request).ipAddress);
  }

  /**
   * Deletes a role. `?moveTo=` names the role its holders get instead:
   * ADMIN, EDITOR, VIEWER or the id of another custom role.
   */
  @Delete(':id')
  @AdminSessionOnly()
  @RequirePermissions('admins:write')
  remove(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(deleteRoleSchema)) query: DeleteRoleInput,
    @Req() request: Request,
  ): Promise<RoleDeleted> {
    return this.roles.remove(principal, id, query, requestInfo(request).ipAddress);
  }
}
