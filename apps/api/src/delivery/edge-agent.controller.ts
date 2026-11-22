// SPDX-License-Identifier: AGPL-3.0-only
import { stat } from 'node:fs/promises';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { Public } from '../auth/auth.decorators.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AppConfig } from '../config/app-config.js';
import { sendLiveFile } from '../live/live-media.controller.js';
import { LivePlaybackService } from '../live/live-playback.service.js';
import { sendContentKey, sendStoredFile } from '../playback/media.controller.js';
import { CONTENT_KEY_PATH, PlaybackService } from '../playback/playback.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CurrentEdge, EdgeAgentGuard } from './edge-agent.guard.js';
import { EDGE_PROTOCOL, edgeSigningKey } from './edge-credentials.js';
import { EdgeRegistry, type KnownEdge } from './edge-registry.service.js';
import { HEARTBEAT_SECONDS } from './edge-state.js';
import { edgeReportSchema } from './edges.schemas.js';

/** What an agent is told in answer to a heartbeat. */
export interface HeartbeatAnswer {
  edge: { id: string; name: string; enabled: boolean };
  /** The key the playback tokens of this edge are signed with. */
  signingKey: string;
  heartbeatSeconds: number;
  protocol: number;
}

/**
 * What edge agents talk to. An agent signs in with the token of its edge,
 * reports how it is doing and fetches the files its viewers ask for.
 *
 *   POST /v1/edge-agent/heartbeat
 *   GET  /v1/edge-agent/assets/{assetId}
 *   GET  /v1/edge-agent/media/{assetId}/hls/master.m3u8
 *   GET  /v1/edge-agent/live/{channelId}/index.m3u8
 *
 * The agent connects to the main server and never the other way round, so an
 * edge needs no open port except the one for viewers.
 */
@Public()
@UseGuards(EdgeAgentGuard)
@Controller('edge-agent')
export class EdgeAgentController {
  private readonly logger = new Logger(EdgeAgentController.name);

  constructor(
    @Inject(EdgeRegistry) private readonly registry: EdgeRegistry,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(PlaybackService) private readonly playback: PlaybackService,
    @Inject(LivePlaybackService) private readonly live: LivePlaybackService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  async heartbeat(
    @CurrentEdge() edge: KnownEdge,
    @Body(new ZodValidationPipe(edgeReportSchema)) report: z.infer<typeof edgeReportSchema>,
    @Req() request: Request,
  ): Promise<HeartbeatAnswer> {
    if (report.protocol < EDGE_PROTOCOL) {
      // The edge stays offline, so no viewer is sent to an agent that cannot serve.
      throw new HttpException(
        {
          statusCode: 426,
          error: 'Upgrade Required',
          message: `This edge agent is too old for the main server. Install a newer one (protocol ${EDGE_PROTOCOL}).`,
        },
        426,
      );
    }
    await this.registry.report(edge, report, requestInfo(request).ipAddress);
    return {
      edge: { id: edge.id, name: edge.name, enabled: edge.enabled },
      signingKey: edgeSigningKey(this.config.playbackSigningSecret, edge.id, edge.secretHash),
      heartbeatSeconds: HEARTBEAT_SECONDS,
      protocol: EDGE_PROTOCOL,
    };
  }

  /**
   * Whether a video can be played, and which processing of it is current. The
   * agent asks before it serves copies of a video it has not checked for a while.
   */
  @Get('assets/:assetId')
  async asset(@Param('assetId') assetId: string): Promise<{ version: string }> {
    const version = await this.playback.versionOf(assetId);
    if (!version) {
      throw new NotFoundException('Not found');
    }
    return { version };
  }

  /** A generated file of a video, or its content key. */
  @Get('media/:assetId/*filePath')
  async media(
    @Param('assetId') assetId: string,
    @Param('filePath') filePath: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const relativePath = Array.isArray(filePath) ? filePath.join('/') : filePath;
    if (relativePath === CONTENT_KEY_PATH) {
      const key = await this.playback.keyOf(assetId);
      if (!key) {
        notFound(response);
        return;
      }
      sendContentKey(key, request, response);
      return;
    }

    const location = await this.playback.locateFile(assetId, relativePath);
    const driver = location ? await this.storage.getDriver(location.storagePoolId) : null;
    const info = location && driver ? await driver.stat(location.key) : null;
    if (!location || !driver || !info) {
      notFound(response);
      return;
    }
    await sendStoredFile(driver, location.key, info, request, response, this.logger);
  }

  /** A playlist or segment of a running channel. */
  @Get('live/:channelId/:fileName')
  async liveFile(
    @Param('channelId') channelId: string,
    @Param('fileName') fileName: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const file = this.live.locateFile(channelId, fileName);
    const info = file ? await stat(file).catch(() => null) : null;
    await sendLiveFile(info?.isFile() ? file : null, request, response);
  }
}

function notFound(response: Response): void {
  response.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Not found' });
}
