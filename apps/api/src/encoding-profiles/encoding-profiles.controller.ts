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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  type CreateEncodingProfileInput,
  createEncodingProfileSchema,
  type UpdateEncodingProfileInput,
  updateEncodingProfileSchema,
} from './encoding-profiles.schemas.js';
import {
  type EncodingProfileWithRenditions,
  EncodingProfilesService,
} from './encoding-profiles.service.js';

@Controller('encoding-profiles')
export class EncodingProfilesController {
  constructor(
    @Inject(EncodingProfilesService) private readonly profiles: EncodingProfilesService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Lists the encoding profiles. */
  @Get()
  @RequirePermissions('encoding-profiles:read')
  list(): Promise<EncodingProfileWithRenditions[]> {
    return this.profiles.list();
  }

  /** Returns one encoding profile. */
  @Get(':id')
  @RequirePermissions('encoding-profiles:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EncodingProfileWithRenditions> {
    return this.profiles.get(id);
  }

  /** Creates a encoding profile. */
  @Post()
  @RequirePermissions('encoding-profiles:write')
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(createEncodingProfileSchema)) body: CreateEncodingProfileInput,
    @Req() request: Request,
  ): Promise<EncodingProfileWithRenditions> {
    const profile = await this.profiles.create(body);
    await this.record('encoding_profile.create', principal, profile, request, {
      renditions: profile.renditions.map((rendition) => rendition.name),
    });
    return profile;
  }

  /** Changes a encoding profile. */
  @Patch(':id')
  @RequirePermissions('encoding-profiles:write')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateEncodingProfileSchema)) body: UpdateEncodingProfileInput,
    @Req() request: Request,
  ): Promise<EncodingProfileWithRenditions> {
    const profile = await this.profiles.update(id, body);
    await this.record('encoding_profile.update', principal, profile, request, {
      changed: Object.entries(body)
        .filter(([, value]) => value !== undefined)
        .map(([field]) => field),
    });
    return profile;
  }

  /** Deletes a encoding profile. */
  @Delete(':id')
  @RequirePermissions('encoding-profiles:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    const profile = await this.profiles.delete(id);
    await this.record('encoding_profile.delete', principal, profile, request, {});
  }

  private record(
    action: string,
    principal: Principal,
    profile: EncodingProfileWithRenditions,
    request: Request,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'EncodingProfile',
      entityId: profile.id,
      metadata: { name: profile.name, ...metadata },
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
