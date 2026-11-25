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
import type { Page } from '../common/pagination.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type CreateLocationInput,
  createLocationSchema,
  type ListFilesInput,
  listFilesSchema,
  type LocationPlace,
  locationPlaceSchema,
  type MatchFileInput,
  matchFileSchema,
  type RetryAllInput,
  retryAllSchema,
  type RetryFileInput,
  retryFileSchema,
  type UpdateLocationInput,
  updateLocationSchema,
} from './watch.schemas.js';
import {
  type LocationView,
  type PlaceTest,
  WatchService,
  type WatchedFileView,
  type WatchSummary,
} from './watch.service.js';

/**
 * Watched folders and buckets, and the files found in them.
 *
 * Where a location is, and the keys to it, are settings of storage. What
 * becomes of a file is the catalog's business.
 */
@Controller('watch')
export class WatchController {
  constructor(
    @Inject(WatchService) private readonly watch: WatchService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private record(
    action: string,
    entityType: string,
    entityId: string,
    principal: Principal,
    request: Request,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType,
      entityId,
      metadata,
      ipAddress: requestInfo(request).ipAddress,
    });
  }

  /** Returns how many files wait, import, conflict or failed. */
  @Get('summary')
  @RequirePermissions('catalog:read')
  summary(): Promise<WatchSummary> {
    return this.watch.summary();
  }

  // --- Locations ----------------------------------------------------------------

  /** Lists the watched folders and buckets. */
  @Get('locations')
  @RequirePermissions('storage:read')
  listLocations(): Promise<LocationView[]> {
    return this.watch.listLocations();
  }

  /** Looks at a place without saving it. Before ":id", so that "test" is not read as an id. */
  @Post('locations/test')
  @RequirePermissions('storage:write')
  @HttpCode(HttpStatus.OK)
  test(@Body(new ZodValidationPipe(locationPlaceSchema)) body: LocationPlace): Promise<PlaceTest> {
    return this.watch.testPlace(body);
  }

  /** Adds a watched folder or bucket. */
  @Post('locations')
  @RequirePermissions('storage:write')
  async createLocation(
    @Body(new ZodValidationPipe(createLocationSchema)) body: CreateLocationInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<LocationView> {
    const location = await this.watch.createLocation(body);
    await this.record('watch_location.create', 'WatchLocation', location.id, principal, request, {
      name: location.name,
      driver: location.driver,
    });
    return location;
  }

  /** Returns one watched location. */
  @Get('locations/:id')
  @RequirePermissions('storage:read')
  getLocation(@Param('id', ParseUUIDPipe) id: string): Promise<LocationView> {
    return this.watch.getLocation(id);
  }

  /** Changes a watched location. */
  @Patch('locations/:id')
  @RequirePermissions('storage:write')
  async updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLocationSchema)) body: UpdateLocationInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<LocationView> {
    const location = await this.watch.updateLocation(id, body);
    await this.record('watch_location.update', 'WatchLocation', id, principal, request, {
      name: location.name,
      // Names of the fields only: the settings of a bucket hold a secret.
      fields: Object.keys(body),
    });
    return location;
  }

  /** Looks through a watched location now. */
  @Post('locations/:id/scan')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.OK)
  scan(@Param('id', ParseUUIDPipe) id: string): Promise<LocationView> {
    return this.watch.requestScan(id);
  }

  /** Stops watching a folder or bucket. */
  @Delete('locations/:id')
  @RequirePermissions('storage:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const { name } = await this.watch.removeLocation(id);
    await this.record('watch_location.delete', 'WatchLocation', id, principal, request, { name });
  }

  // --- Files --------------------------------------------------------------------

  /** Lists the files found in watched locations and what became of each. */
  @Get('files')
  @RequirePermissions('catalog:read')
  listFiles(
    @Query(new ZodValidationPipe(listFilesSchema)) query: ListFilesInput,
  ): Promise<Page<WatchedFileView>> {
    return this.watch.listFiles(query);
  }

  /** Before ":id", so that "retry" is not read as an id. */
  @Post('files/retry')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.OK)
  retryAll(
    @Body(new ZodValidationPipe(retryAllSchema)) body: RetryAllInput,
  ): Promise<{ queued: number }> {
    return this.watch.retryAll(body);
  }

  /** Says which title or episode a found file is. */
  @Post('files/:id/match')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.OK)
  async match(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(matchFileSchema)) body: MatchFileInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<WatchedFileView> {
    const file = await this.watch.matchFile(id, body);
    await this.record('watch_file.match', 'WatchedFile', id, principal, request, {
      path: file.path,
      as: file.metadataId,
    });
    return file;
  }

  /** Tries a failed file again. */
  @Post('files/:id/retry')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.OK)
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(retryFileSchema)) body: RetryFileInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<WatchedFileView> {
    const file = await this.watch.retryFile(id, body);
    if (body.replace) {
      await this.record('watch_file.replace', 'WatchedFile', id, principal, request, {
        path: file.path,
      });
    }
    return file;
  }

  /** Sets a found file aside. */
  @Post('files/:id/ignore')
  @RequirePermissions('catalog:write')
  @HttpCode(HttpStatus.OK)
  ignore(@Param('id', ParseUUIDPipe) id: string): Promise<WatchedFileView> {
    return this.watch.ignoreFile(id);
  }
}
