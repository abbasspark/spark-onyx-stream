// SPDX-License-Identifier: AGPL-3.0-only
import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { CurrentViewer, ViewerOnly } from '../viewers/viewer-auth.guard.js';
import type { ViewerIdentity } from '../viewers/viewer-session.service.js';
import { StreamsService, type StreamsView, type StreamView } from './streams.service.js';

/** A player reports twice a minute. This leaves room for a household behind one address. */
const BEATS = { name: 'viewer-streams', limit: 240, windowSeconds: 60 };

/** A stream as its own account sees it. */
interface OwnStream extends StreamView {
  /** Whether it plays on the device that asks. */
  here: boolean;
}

/** What the account of the viewer is playing. Answers are about one account and never cached. */
@Controller('viewer/streams')
export class ViewerStreamsController {
  constructor(@Inject(StreamsService) private readonly streams: StreamsService) {}

  @ViewerOnly()
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentViewer() identity: ViewerIdentity,
  ): Promise<Omit<StreamsView, 'streams' | 'source'> & { streams: OwnStream[] }> {
    const { limit, streams } = await this.streams.forViewer(identity.viewer.id);
    const mine = await this.streams.sessionOf(identity.viewer.id, identity.session.id);
    return { limit, streams: streams.map((stream) => ({ ...stream, here: mine.has(stream.id) })) };
  }

  /** The player says it is still playing. 410 tells it to stop. */
  @ViewerOnly()
  @RateLimit(BEATS)
  @Post(':id/beat')
  @HttpCode(HttpStatus.NO_CONTENT)
  async beat(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.streams.beat(identity.viewer.id, id);
  }

  /** Ends a stream: the player's own on leaving, or another device's to make room. */
  @ViewerOnly()
  @RateLimit(BEATS)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async end(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.streams.end(identity.viewer.id, id);
  }
}

/** What a viewer is playing, for admins who may see viewers. */
@Controller('viewers')
export class ViewerStreamsAdminController {
  constructor(
    @Inject(StreamsService) private readonly streams: StreamsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get(':id/streams')
  @RequirePermissions('viewers:read')
  forViewer(@Param('id', ParseUUIDPipe) id: string): Promise<StreamsView> {
    return this.streams.forViewer(id);
  }

  /** Stops what one device of the viewer is playing. The player stops at its next report. */
  @Delete(':id/streams/:streamId')
  @RequirePermissions('viewers:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async stop(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('streamId', ParseUUIDPipe) streamId: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const stopped = await this.streams.stop(id, streamId);
    await this.audit.record({
      action: 'viewer.stream_stop',
      adminId: principal.adminId,
      entityType: 'Viewer',
      entityId: id,
      metadata: { subject: stopped.subject, device: stopped.device },
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
