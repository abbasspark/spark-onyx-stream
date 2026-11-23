// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { PlaysService } from './plays.service.js';

/** A player reports twice a minute per video. This leaves room for a household behind one address. */
const BEATS = { name: 'catalog-beats', limit: 240, windowSeconds: 60 };

const beatSchema = z.object({
  /** Where the player is, in seconds. */
  position: z.number().min(0).max(1_000_000),
  /** Seconds played since the report before. */
  watched: z.number().min(0).max(100_000),
});
type BeatBody = z.infer<typeof beatSchema>;

/** Where players report how a video is being watched. */
@Controller('catalog/plays')
export class PlaysController {
  constructor(@Inject(PlaysService) private readonly plays: PlaysService) {}

  /**
   * A report of the player: where it is, and how long it played since the
   * report before. Sent about every half minute, and when the video is
   * paused, ends or the page is left. Always answers the same, whether the
   * play is known or not.
   */
  @Post(':id/beat')
  @Public()
  @RateLimit(BEATS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  async beat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(beatSchema)) body: BeatBody,
  ): Promise<void> {
    await this.plays.beat(id, body);
  }
}
