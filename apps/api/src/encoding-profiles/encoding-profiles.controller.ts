// SPDX-License-Identifier: AGPL-3.0-only
import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.decorators.js';
import {
  type EncodingProfileWithRenditions,
  EncodingProfilesService,
} from './encoding-profiles.service.js';

@Controller('encoding-profiles')
export class EncodingProfilesController {
  constructor(
    @Inject(EncodingProfilesService) private readonly profiles: EncodingProfilesService,
  ) {}

  @Get()
  @RequirePermissions('encoding-profiles:read')
  list(): Promise<EncodingProfileWithRenditions[]> {
    return this.profiles.list();
  }

  @Get(':id')
  @RequirePermissions('encoding-profiles:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EncodingProfileWithRenditions> {
    return this.profiles.get(id);
  }
}
