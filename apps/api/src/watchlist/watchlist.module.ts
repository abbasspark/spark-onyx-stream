// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ViewersModule } from '../viewers/viewers.module.js';
import {
  SavedTitlesController,
  ViewerListAdminController,
  WatchlistController,
} from './watchlist.controller.js';
import { WatchlistService } from './watchlist.service.js';

/** "My list": the titles each profile saved to watch later. */
@Module({
  imports: [ViewersModule, CatalogModule],
  controllers: [WatchlistController, ViewerListAdminController, SavedTitlesController],
  providers: [WatchlistService],
})
export class WatchlistModule {}
