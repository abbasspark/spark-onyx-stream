// SPDX-License-Identifier: AGPL-3.0-only
import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CLIENT_HEADER, CLIENT_TOO_OLD, parseClient } from './app-version.rules.js';
import { AppVersionsService } from './app-versions.service.js';

const ANSWERS_OLD_APPS_KEY = 'onyx:answersOldApps';

/** Marks the one endpoint that tells an old app it is old, and so has to answer it. */
export const AnswersOldApps = () => SetMetadata(ANSWERS_OLD_APPS_KEY, true);

/** 426 Upgrade Required: the status HTTP has for "come back with something newer". */
const UPGRADE_REQUIRED = 426;

/**
 * Turns away apps that are older than the installation allows.
 *
 * An app names itself in the X-Onyx-Client header. An app that is installed
 * on a television cannot be changed from here, so the day the API has to
 * change under it, this is how it finds out: with a status and a code it has
 * known since its first version, and a sentence to show.
 *
 * Requests without the header pass: browsers, scripts and the panel.
 */
@Injectable()
export class AppVersionsGuard implements CanActivate {
  constructor(
    @Inject(AppVersionsService) private readonly versions: AppVersionsService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      context.getType() !== 'http' ||
      this.reflector.get<boolean>(ANSWERS_OLD_APPS_KEY, context.getHandler())
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const client = parseClient(request.headers[CLIENT_HEADER]);
    if (!client) {
      return true;
    }
    const refusal = await this.versions.refusalFor(client);
    if (refusal) {
      throw new HttpException(
        {
          statusCode: UPGRADE_REQUIRED,
          error: 'Upgrade Required',
          code: CLIENT_TOO_OLD,
          ...refusal,
        },
        UPGRADE_REQUIRED,
      );
    }
    return true;
  }
}
