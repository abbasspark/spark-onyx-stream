// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import { Controller, Get, Head, HttpStatus, Inject, Logger, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { type StorageDriver, StorageObjectNotFoundError } from '../storage/storage-driver.js';
import { StorageService } from '../storage/storage.service.js';
import { parseRange } from './byte-range.js';
import { CONTENT_KEY_PATH, MEDIA_ROUTE, PlaybackService } from './playback.service.js';

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s': 'video/iso.segment',
  '.ts': 'video/mp2t',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.vtt': 'text/vtt',
};

/** Generated files never change, so a player may keep them for the length of a session. */
const CACHE_CONTROL = 'private, max-age=3600';

/**
 * Serves the generated files of an asset to players.
 *
 *   GET /v1/media/{assetId}/{token}/hls/master.m3u8
 *
 * The endpoint is public in the sense that it needs no session: the signed
 * token in the path is the authorization. Every refusal is a plain 404.
 *
 * This is the delivery path for development and small installations. In
 * production, a web server or edge in front of the API verifies the same
 * token and serves the files directly.
 */
@Public()
@Controller(MEDIA_ROUTE)
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(
    @Inject(PlaybackService) private readonly playback: PlaybackService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  @Get(':assetId/:token/*filePath')
  get(
    @Param('assetId') assetId: string,
    @Param('token') token: string,
    @Param('filePath') filePath: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.serve(assetId, token, filePath, request, response);
  }

  @Head(':assetId/:token/*filePath')
  head(
    @Param('assetId') assetId: string,
    @Param('token') token: string,
    @Param('filePath') filePath: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    return this.serve(assetId, token, filePath, request, response);
  }

  private async serve(
    assetId: string,
    token: string,
    filePath: string | string[],
    request: Request,
    response: Response,
  ): Promise<void> {
    // The router gives a wildcard as a list of path segments.
    const relativePath = Array.isArray(filePath) ? filePath.join('/') : filePath;
    if (relativePath === CONTENT_KEY_PATH) {
      await this.serveKey(assetId, token, request, response);
      return;
    }

    const location = await this.playback.locate(assetId, token, relativePath);
    const driver = location ? await this.storage.getDriver(location.storagePoolId) : null;
    const info = location && driver ? await driver.stat(location.key) : null;

    if (!location || !driver || !info) {
      response.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Not found' });
      return;
    }

    await sendStoredFile(driver, location.key, info, request, response, this.logger);
  }

  /**
   * Sends the 16-byte content key of an encrypted asset. The playlists point
   * here with a relative address, so the request carries the same signed token
   * as every other file of the session.
   */
  private async serveKey(
    assetId: string,
    token: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    const key = await this.playback.contentKey(assetId, token);
    if (!key) {
      response.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Not found' });
      return;
    }

    sendContentKey(key, request, response);
  }
}

/** Sends a generated file from storage, whole or the part a player asked for. */
export async function sendStoredFile(
  driver: StorageDriver,
  key: string,
  info: { size: number; modifiedAt: Date },
  request: Request,
  response: Response,
  logger: Logger,
): Promise<void> {
  response.setHeader(
    'Content-Type',
    CONTENT_TYPES[path.extname(key)] ?? 'application/octet-stream',
  );
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Cache-Control', CACHE_CONTROL);
  response.setHeader('Last-Modified', info.modifiedAt.toUTCString());
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

  try {
    const stream = await driver.read(key, range.kind === 'range' ? range.range : undefined);
    // A viewer who seeks or leaves closes the connection. Stop reading the file then.
    response.on('close', () => stream.destroy());
    stream.on('error', (error) => {
      logger.warn(`Reading ${key} failed: ${error.message}`);
      response.destroy();
    });
    stream.pipe(response);
  } catch (error) {
    if (error instanceof StorageObjectNotFoundError) {
      response.removeHeader('Content-Length');
      response.removeHeader('Content-Range');
      response.status(HttpStatus.NOT_FOUND).json({ statusCode: 404, message: 'Not found' });
      return;
    }
    throw error;
  }
}

/** Sends the 16-byte content key of an encrypted asset. */
export function sendContentKey(key: Buffer, request: Request, response: Response): void {
  response.setHeader('Content-Type', 'application/octet-stream');
  response.setHeader('Content-Length', String(key.length));
  // A key must not be kept by caches or proxies between the player and the server.
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(request.method === 'HEAD' ? undefined : key);
}
