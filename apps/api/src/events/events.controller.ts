// SPDX-License-Identifier: AGPL-3.0-only
import { Controller, Get, HttpStatus, Inject, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/principal.js';
import { EventStreamService } from './event-stream.service.js';

@Controller('events')
export class EventsController {
  constructor(@Inject(EventStreamService) private readonly stream: EventStreamService) {}

  /**
   * A stream of live events (server-sent events) for the admin panel.
   *
   * Any signed-in caller may connect. Which events arrive depends on the
   * caller's permissions. The stream ends after a while and the client is
   * expected to connect again.
   */
  @Get()
  open(@Req() request: AuthenticatedRequest, @Res() response: Response): void {
    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    // Tells Nginx to pass each event on at once instead of collecting them.
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const stop = this.stream.add(response, request.principal?.permissions ?? []);
    if (!stop) {
      response.end(': too many streams\n\n');
      return;
    }
    request.on('close', stop);
  }
}
