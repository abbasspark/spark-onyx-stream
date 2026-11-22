// SPDX-License-Identifier: AGPL-3.0-only
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Controller, Get, Head, HttpStatus, Inject, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { parseRange } from '../playback/byte-range.js';
import { LIVE_ROUTE, LivePlaybackService } from './live-playback.service.js';

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
};

/**
 * Serves the playlist and segments of a running channel to players.
 *
 *   GET /v1/live/{channelId}/{token}/index.m3u8
 *
 * As with video on demand, the signed token in the path is the authorization
 * and every refusal is a plain 404. In production the gateway in front of the
 * API checks the same token and serves the files itself.
 */
@Public()
@Controller(LIVE_ROUTE)
export class LiveMediaController {
  constructor(@Inject(LivePlaybackService) private readonly playback: LivePlaybackService) {}

  @Get(':channelId/:token/:fileName')
  get(
    @Param('channelId') channelId: string,
    @Param('token') token: string,
    @Param('fileName') fileName: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.serve(channelId, token, fileName, request, response);
  }

  @Head(':channelId/:token/:fileName')
  head(
    @Param('channelId') channelId: string,
    @Param('token') token: string,
    @Param('fileName') fileName: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.serve(channelId, token, fileName, request, response);
  }

  private async serve(
    channelId: string,
    token: string,
    fileName: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    const file = this.playback.locate(channelId, token, fileName);
    await sendLiveFile(file, request, response);
  }
}

/** Sends a file of a running channel, or 404 when there is none. */
export async function sendLiveFile(
  file: string | null,
  request: Request,
  response: Response,
): Promise<void> {
  const info = file ? await stat(file).catch(() => null) : null;
  if (!file || !info?.isFile()) {
    response.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Not found' });
    return;
  }

  const extension = path.extname(file);
  response.setHeader('Content-Type', CONTENT_TYPES[extension] ?? 'application/octet-stream');
  // The playlist changes with every segment. A segment never changes once it is written.
  response.setHeader(
    'Cache-Control',
    extension === '.m3u8' ? 'no-cache, no-store' : 'private, max-age=60',
  );
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  const range = parseRange(request.headers.range, info.size);
  if (range.kind === 'unsatisfiable') {
    response.setHeader('Content-Range', `bytes */${info.size}`);
    response.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).end();
    return;
  }
  const start = range.kind === 'range' ? range.range.start : 0;
  const end = range.kind === 'range' ? range.range.end : info.size - 1;
  response.setHeader('Content-Length', String(info.size === 0 ? 0 : end - start + 1));
  if (range.kind === 'range') {
    response.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    response.status(HttpStatus.PARTIAL_CONTENT);
  }
  if (request.method === 'HEAD' || info.size === 0) {
    response.end();
    return;
  }

  const stream = createReadStream(file, { start, end });
  response.on('close', () => stream.destroy());
  // A segment can leave the playlist window between the check and the read.
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}
