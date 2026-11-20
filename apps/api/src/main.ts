// SPDX-License-Identifier: AGPL-3.0-only
import 'reflect-metadata';
import type { Server } from 'node:http';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';
import { validateEnv } from './config/env.schema.js';
import { loadEnvFile } from './config/load-env-file.js';
import { ARTWORK_ROUTE } from './catalog/catalog.views.js';
import { PUBLIC_CATALOG_ROUTE } from './catalog/public-catalog.controller.js';
import { MEDIA_ROUTE } from './playback/playback.service.js';

/** Version prefix of every HTTP route. */
const API_PREFIX = 'v1';

/** Headers of the tus upload protocol that browsers must be allowed to send and read. */
const TUS_REQUEST_HEADERS = [
  'Tus-Resumable',
  'Upload-Length',
  'Upload-Offset',
  'Upload-Metadata',
  'X-HTTP-Method-Override',
];
const TUS_RESPONSE_HEADERS = [
  'Location',
  'Tus-Resumable',
  'Tus-Version',
  'Tus-Extension',
  'Tus-Max-Size',
  'Upload-Length',
  'Upload-Offset',
  'Upload-Metadata',
  'Upload-Expires',
];

const UPLOAD_REQUEST_TIMEOUT_MS = 60 * 60 * 1000;

type CorsCallback = (error: Error | null, options: Record<string, unknown>) => void;

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const envFile = loadEnvFile();
  const config = new AppConfig(
    validateEnv(process.env),
    envFile ? path.dirname(envFile) : process.cwd(),
  );
  const rootModule = AppModule.forRoles(config);

  logger.log(`Environment: ${config.nodeEnv}${envFile ? ` (loaded ${envFile})` : ''}`);
  logger.log(`Roles: ${config.roles.join(', ')}`);

  if (config.hasRole('api')) {
    const app = await NestFactory.create<NestExpressApplication>(rootModule);
    app.setGlobalPrefix(API_PREFIX);
    // Behind a proxy, the audit log and the sign-in limit need the real client address.
    app.set('trust proxy', config.trustProxyHops);
    app.enableShutdownHooks();

    app.enableCors((request: { url?: string }, callback: CorsCallback) => {
      // Media files are opened by players on any site. Their signed URL is the authorization.
      const path = request.url ?? '';
      if (
        path.startsWith(`/${API_PREFIX}/${MEDIA_ROUTE}/`) ||
        path.startsWith(`/${API_PREFIX}/${ARTWORK_ROUTE}/`)
      ) {
        callback(null, {
          origin: '*',
          methods: ['GET', 'HEAD', 'OPTIONS'],
          allowedHeaders: ['Range'],
          exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
          maxAge: 600,
        });
        return;
      }

      // The public catalog carries no credentials and shows only what is published,
      // so any site and any app may read it.
      if (path.startsWith(`/${API_PREFIX}/${PUBLIC_CATALOG_ROUTE}/`)) {
        callback(null, {
          origin: '*',
          methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type'],
          maxAge: 600,
        });
        return;
      }

      // Everything else is limited to the configured origins. An empty list allows none.
      callback(null, {
        origin: config.corsOrigins.length > 0 ? [...config.corsOrigins] : false,
        methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type', ...TUS_REQUEST_HEADERS],
        exposedHeaders: TUS_RESPONSE_HEADERS,
        maxAge: 600,
      });
    });

    // Node ends a request that takes longer than five minutes by default.
    // One chunk of a large upload over a slow connection can take longer.
    (app.getHttpServer() as Server).requestTimeout = UPLOAD_REQUEST_TIMEOUT_MS;

    await app.listen(config.apiPort, config.apiHost);
    logger.log(`HTTP API listening on http://${config.apiHost}:${config.apiPort}/${API_PREFIX}`);
    return;
  }

  // Processes without the api role run no HTTP server.
  const app = await NestFactory.createApplicationContext(rootModule);
  app.enableShutdownHooks();
  logger.log('Started without HTTP server');
}

try {
  await bootstrap();
} catch (error) {
  // Configuration and startup errors end the process with a readable message.
  new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
