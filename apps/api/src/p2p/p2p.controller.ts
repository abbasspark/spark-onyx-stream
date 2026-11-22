// SPDX-License-Identifier: AGPL-3.0-only
import { Controller, Get, Inject } from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.decorators.js';
import { type P2pStatus, P2pService } from './p2p.service.js';

/** P2P between viewers, as the admin panel shows it. */
@Controller('p2p')
export class P2pController {
  constructor(@Inject(P2pService) private readonly p2p: P2pService) {}

  /** Whether P2P is on, and how the tracker is doing. */
  @Get()
  @RequirePermissions('delivery:read')
  status(): Promise<P2pStatus> {
    return this.p2p.status();
  }
}
