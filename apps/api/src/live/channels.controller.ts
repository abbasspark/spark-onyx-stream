// SPDX-License-Identifier: AGPL-3.0-only
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import {
  type CreateChannelInput,
  createChannelSchema,
  type ProbeSourceInput,
  probeSourceSchema,
  type UpdateChannelInput,
  updateChannelSchema,
} from './channels.schemas.js';
import {
  type ChannelDetails,
  ChannelsService,
  type ChannelView,
  type ProbeResult,
} from './channels.service.js';
import type { EncoderSettings } from './ingest.js';
import { IngestService } from './ingest.service.js';
import { type LivePlaybackInfo, LivePlaybackService } from './live-playback.service.js';

/** Live channels for admins. */
@Controller('channels')
export class ChannelsController {
  constructor(
    @Inject(ChannelsService) private readonly channels: ChannelsService,
    @Inject(LivePlaybackService) private readonly playback: LivePlaybackService,
    @Inject(IngestService) private readonly ingest: IngestService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('live:read')
  list(): Promise<ChannelView[]> {
    return this.channels.list();
  }

  /**
   * Connects to a source and reports what it carries. Each call holds a
   * connection for up to 15 seconds, so they are limited.
   */
  @Post('probe')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('live:write')
  @RateLimit({ name: 'channel-probe', limit: 20, windowSeconds: 60 })
  probe(
    @Body(new ZodValidationPipe(probeSourceSchema)) body: ProbeSourceInput,
  ): Promise<ProbeResult> {
    return this.channels.probe(body.source);
  }

  @Post()
  @RequirePermissions('live:write')
  async create(
    @Body(new ZodValidationPipe(createChannelSchema)) body: CreateChannelInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ChannelView> {
    const created = await this.channels.create(body);
    await this.record('channel.create', created, principal, request);
    return created;
  }

  @Get(':id')
  @RequirePermissions('live:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ChannelDetails> {
    return this.channels.get(id);
  }

  /** The full address of the source. It may carry a password, so it needs the right to change channels. */
  @Get(':id/source')
  @RequirePermissions('live:write')
  source(@Param('id', ParseUUIDPipe) id: string): Promise<{ source: string }> {
    return this.channels.source(id);
  }

  @Patch(':id')
  @RequirePermissions('live:write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) body: UpdateChannelInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ChannelView> {
    const updated = await this.channels.update(id, body);
    await this.record('channel.update', updated, principal, request, {
      sourceChanged: body.source !== undefined,
    });
    return updated;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('live:write')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    const removed = await this.channels.remove(id);
    await this.record('channel.delete', removed, principal, request);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('live:write')
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ChannelView> {
    const started = await this.channels.start(id);
    await this.record('channel.start', started, principal, request);
    return started;
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('live:write')
  async stop(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ChannelView> {
    const stopped = await this.channels.stop(id);
    await this.record('channel.stop', stopped, principal, request);
    return stopped;
  }

  @Post(':id/restart')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('live:write')
  async restart(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<ChannelView> {
    const restarted = await this.channels.restart(id);
    await this.record('channel.restart', restarted, principal, request);
    return restarted;
  }

  /** What to enter in an encoder for a pushed channel, with its stream key. */
  @Get(':id/encoder')
  @RequirePermissions('live:write')
  encoder(@Param('id', ParseUUIDPipe) id: string): Promise<EncoderSettings> {
    return this.ingest.settings(id);
  }

  /** Replaces the stream key. The old one stops working at once. */
  @Post(':id/stream-key')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('live:write')
  async replaceStreamKey(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<EncoderSettings> {
    const settings = await this.ingest.replaceKey(id);
    await this.record('channel.stream-key', await this.channels.get(id), principal, request);
    return settings;
  }

  /** A signed address for watching the channel in the panel. */
  @Post(':id/playback')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('live:read')
  createPlayback(@Param('id', ParseUUIDPipe) id: string): Promise<LivePlaybackInfo> {
    return this.playback.createPlayback(id);
  }

  private record(
    action: string,
    channel: ChannelView,
    principal: Principal,
    request: Request,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    return this.audit.record({
      action,
      adminId: principal.adminId,
      entityType: 'channel',
      entityId: channel.id,
      // The source is logged without anything secret.
      metadata: {
        name: channel.name,
        source: channel.ingest === 'PUSH' ? 'encoder' : channel.source,
        ...metadata,
      },
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
