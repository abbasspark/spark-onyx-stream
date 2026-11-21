// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { IngestService } from './ingest.service.js';
import { LIVE_ROUTE } from './live-playback.service.js';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Answers the ingest server (MediaMTX), which asks before every connection
 * whether it is allowed.
 *
 *   POST /v1/live/ingest/auth
 *
 * No sign-in protects this address, and none is needed: it only says yes to
 * someone who already holds a stream key or the platform's own password.
 */
@Public()
@Controller(`${LIVE_ROUTE}/ingest`)
export class IngestController {
  constructor(@Inject(IngestService) private readonly ingest: IngestService) {}

  @Post('auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  async auth(@Body() body: unknown): Promise<void> {
    const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >;
    const allowed = await this.ingest.authorize({
      action: text(fields.action),
      path: text(fields.path),
      user: text(fields.user),
      password: text(fields.password),
    });
    if (!allowed) {
      // The ingest server takes 401 as "ask for a name and password", which is what RTSP clients need.
      throw new UnauthorizedException();
    }
  }
}
