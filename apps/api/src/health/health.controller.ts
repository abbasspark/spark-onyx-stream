// SPDX-License-Identifier: AGPL-3.0-only
import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service.js';
import type { HealthReport } from './health.types.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  /**
   * Readiness: reports the state of the database and Redis.
   * Responds with 200 when everything is up and 503 otherwise.
   */
  @Get()
  async readiness(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await this.health.check();

    if (report.status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return report;
  }

  /**
   * Liveness: confirms the process is running and answering requests.
   * It checks no dependencies, so an outage elsewhere does not restart this process.
   */
  @Get('live')
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
