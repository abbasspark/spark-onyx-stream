// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { TitleHistoryService } from './title-history.service.js';

/**
 * When the API starts, gives titles from before history was kept their first
 * revision. It runs beside the start, not before it: the API answers at once,
 * and after the first time there is nothing left to do.
 */
@Injectable()
export class TitleHistoryBackfill implements OnApplicationBootstrap {
  private readonly logger = new Logger(TitleHistoryBackfill.name);

  constructor(@Inject(TitleHistoryService) private readonly history: TitleHistoryService) {}

  onApplicationBootstrap(): void {
    void this.history
      .backfill()
      .then((written) => {
        if (written > 0) {
          this.logger.log(`Started the history of ${written} titles that had none`);
        }
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Could not start the history of older titles: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
}
