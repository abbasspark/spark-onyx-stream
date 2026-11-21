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
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type ChangePackageTitlesInput,
  changePackageTitlesSchema,
  type CreatePackageInput,
  createPackageSchema,
  type OrderPackagesInput,
  orderPackagesSchema,
  type UpdatePackageInput,
  updatePackageSchema,
} from './packages.schemas.js';
import { PackagesService, type PackageView } from './packages.service.js';

/** Packages for admins. Reading them is open to those who edit titles, to sort titles into them. */
@Controller('packages')
export class PackagesController {
  constructor(
    @Inject(PackagesService) private readonly packages: PackagesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('catalog:read')
  list(): Promise<PackageView[]> {
    return this.packages.list();
  }

  @Post()
  @RequirePermissions('billing:write')
  async create(
    @Body(new ZodValidationPipe(createPackageSchema)) body: CreatePackageInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PackageView> {
    const created = await this.packages.create(body);
    await this.record('package.create', created.id, principal, request, { name: created.name });
    return created;
  }

  /** Before ":id", so "order" is not read as an id. */
  @Put('order')
  @RequirePermissions('billing:write')
  reorder(
    @Body(new ZodValidationPipe(orderPackagesSchema)) body: OrderPackagesInput,
  ): Promise<PackageView[]> {
    return this.packages.reorder(body.ids);
  }

  @Patch(':id')
  @RequirePermissions('billing:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePackageSchema)) body: UpdatePackageInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PackageView> {
    const updated = await this.packages.update(id, body);
    await this.record('package.update', id, principal, request, { name: updated.name });
    return updated;
  }

  @Delete(':id')
  @RequirePermissions('billing:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const removed = await this.packages.remove(id);
    await this.record('package.delete', id, principal, request, { name: removed.name });
  }

  /** Puts titles into the package and takes titles out. What a plan opens changes with it, at once. */
  @Put(':id/titles')
  @RequirePermissions('billing:write')
  async changeTitles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changePackageTitlesSchema)) body: ChangePackageTitlesInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<PackageView> {
    const updated = await this.packages.changeTitles(id, body);
    await this.record('package.titles', id, principal, request, {
      name: updated.name,
      added: body.add.length,
      removed: body.remove.length,
    });
    return updated;
  }

  private record(
    action: string,
    entityId: string,
    principal: Principal,
    request: Request,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'Package',
      entityId,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
