// SPDX-License-Identifier: AGPL-3.0-only
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';
import { validateEnv } from './config/env.schema.js';
import { loadEnvFile } from './config/load-env-file.js';

/** Version prefix of every HTTP route. */
const API_PREFIX = 'v1';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const envFile = loadEnvFile();
  const config = new AppConfig(validateEnv(process.env));
  const rootModule = AppModule.forRoles(config);

  logger.log(`Environment: ${config.nodeEnv}${envFile ? ` (loaded ${envFile})` : ''}`);
  logger.log(`Roles: ${config.roles.join(', ')}`);

  if (config.hasRole('api')) {
    const app = await NestFactory.create(rootModule);
    app.setGlobalPrefix(API_PREFIX);
    app.enableShutdownHooks();
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
