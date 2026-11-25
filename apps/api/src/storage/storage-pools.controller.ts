// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminSessionOnly, CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { AdminPrincipal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type CreateStoragePoolInput,
  createStoragePoolSchema,
  type UpdateStoragePoolInput,
  updateStoragePoolSchema,
} from './storage-pools.schemas.js';
import {
  type StoragePoolTestResult,
  type StoragePoolView,
  StoragePoolsService,
} from './storage-pools.service.js';

/**
 * Storage pool settings include credentials, so changing them needs a
 * signed-in admin. API keys can read pools when they hold storage:read.
 */
@Controller('storage-pools')
export class StoragePoolsController {
  constructor(@Inject(StoragePoolsService) private readonly pools: StoragePoolsService) {}

  /** Lists the storage pools. */
  @Get()
  @RequirePermissions('storage:read')
  list(): Promise<StoragePoolView[]> {
    return this.pools.list();
  }

  /** Returns one storage pool with how much it holds. */
  @Get(':id')
  @RequirePermissions('storage:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<StoragePoolView> {
    return this.pools.get(id);
  }

  /** Creates a storage pool. */
  @Post()
  @AdminSessionOnly()
  @RequirePermissions('storage:write')
  create(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Body(new ZodValidationPipe(createStoragePoolSchema)) body: CreateStoragePoolInput,
    @Req() request: Request,
  ): Promise<StoragePoolView> {
    return this.pools.create(principal, body, requestInfo(request).ipAddress);
  }

  /** Changes a storage pool. */
  @Patch(':id')
  @AdminSessionOnly()
  @RequirePermissions('storage:write')
  update(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStoragePoolSchema)) body: UpdateStoragePoolInput,
    @Req() request: Request,
  ): Promise<StoragePoolView> {
    return this.pools.update(principal, id, body, requestInfo(request).ipAddress);
  }

  /** Writes, reads and deletes a small file to confirm the pool works. */
  @Post(':id/test')
  @AdminSessionOnly()
  @RequirePermissions('storage:write')
  @HttpCode(HttpStatus.OK)
  test(@Param('id', ParseUUIDPipe) id: string): Promise<StoragePoolTestResult> {
    return this.pools.test(id);
  }
}
