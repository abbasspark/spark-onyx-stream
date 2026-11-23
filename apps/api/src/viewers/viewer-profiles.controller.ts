// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import {
  type CreateProfileInput,
  createProfileSchema,
  type UpdateProfileInput,
  updateProfileSchema,
} from './viewer.schemas.js';
import { CurrentViewer, ViewerOnly } from './viewer-auth.guard.js';
import {
  MAX_PROFILES,
  PROFILE_COLORS,
  type ProfileView,
  toProfileView,
  ViewerProfilesService,
} from './viewer-profiles.service.js';
import type { ViewerIdentity } from './viewer-session.service.js';

/** Profiles are changed by hand, a few times. This stops a script that makes and deletes them in a loop. */
const CHANGES = { name: 'viewer-profiles', limit: 60, windowSeconds: 600 };

export interface ProfilesView {
  profiles: ProfileView[];
  /** The profile in use on this device. */
  currentId: string;
  /** How many profiles an account can have. */
  limit: number;
  /** The colours a profile can have. */
  colors: readonly string[];
}

/** The profiles of the signed-in viewer's account. */
@Controller('viewer/profiles')
export class ViewerProfilesController {
  constructor(@Inject(ViewerProfilesService) private readonly profiles: ViewerProfilesService) {}

  /** The profiles of the account, and which one is in use. */
  @ViewerOnly()
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@CurrentViewer() identity: ViewerIdentity): Promise<ProfilesView> {
    const [profiles, current] = await Promise.all([
      this.profiles.list(identity.viewer),
      this.profiles.current(identity),
    ]);
    return {
      profiles: profiles.map(toProfileView),
      currentId: current.id,
      limit: MAX_PROFILES,
      colors: PROFILE_COLORS,
    };
  }

  /** Adds a profile to the account. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Post()
  async create(
    @CurrentViewer() identity: ViewerIdentity,
    @Body(new ZodValidationPipe(createProfileSchema)) body: CreateProfileInput,
  ): Promise<ProfileView> {
    return toProfileView(await this.profiles.create(identity.viewer, body));
  }

  /** Changes a profile. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Patch(':id')
  async update(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<ProfileView> {
    return toProfileView(await this.profiles.update(identity.viewer, id, body));
  }

  /** Deletes a profile and what it watched. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.profiles.remove(identity.viewer, id);
  }

  /** Chooses who is watching on this device. Other devices keep their own choice. */
  @ViewerOnly()
  @Post(':id/select')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async select(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProfileView> {
    return toProfileView(await this.profiles.select(identity, id));
  }
}
