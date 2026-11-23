// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { BrandingController } from './branding.controller.js';
import { BrandingService } from './branding.service.js';

/** The name and look of the site, for every module that speaks in its name. */
@Global()
@Module({
  controllers: [BrandingController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
