// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { ViewersModule } from '../viewers/viewers.module.js';
import { PrepaidController, ViewerCodesController } from './prepaid.controller.js';
import { PrepaidService } from './prepaid.service.js';

/** Prepaid codes: made by an admin, used by a viewer. Loaded only in the api role. */
@Module({
  imports: [ViewersModule],
  controllers: [ViewerCodesController, PrepaidController],
  providers: [PrepaidService],
})
export class PrepaidModule {}
