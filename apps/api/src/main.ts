// SPDX-License-Identifier: AGPL-3.0-only
import 'reflect-metadata';
import type { Server } from 'node:http';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';
import { validateEnv } from './config/env.schema.js';
import { loadEnvFile } from './config/load-env-file.js';

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
    const app = await NestFactory.create(rootModule);
    app.setGlobalPrefix(API_PREFIX);
    app.enableShutdownHooks();

    if (config.corsOrigins.length > 0) {
      app.enableCors({
        origin: [...config.corsOrigins],
        methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type', ...TUS_REQUEST_HEADERS],
        exposedHeaders: TUS_RESPONSE_HEADERS,
        maxAge: 600,
      });
    }

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
