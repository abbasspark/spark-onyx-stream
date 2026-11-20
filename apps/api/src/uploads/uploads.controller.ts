// SPDX-License-Identifier: AGPL-3.0-only
import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RequirePermissions } from '../auth/auth.decorators.js';
import { UploadsService } from './uploads.service.js';

/**
 * tus resumable upload endpoint.
 *
 *   POST   /v1/uploads        start an upload for an asset
 *   HEAD   /v1/uploads/{id}   ask how many bytes have arrived
 *   PATCH  /v1/uploads/{id}   send the next bytes
 *   DELETE /v1/uploads/{id}   cancel
 *
 * The upload id is the asset id. Authentication and the permission check run
 * first, as for every endpoint. Then this controller checks that the request
 * fits the asset and passes it to the tus implementation, which writes the
 * response itself.
 */
@Controller('uploads')
@RequirePermissions('assets:write')
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @All()
  async collection(@Req() request: Request, @Res() response: Response): Promise<void> {
    if (request.method === 'POST') {
      await this.uploads.authorizeCreation(request.headers);
    }
    await this.uploads.handle(request, response);
  }

  @All(':id')
  async upload(@Req() request: Request, @Res() response: Response): Promise<void> {
    await this.uploads.authorizeAccess(String(request.params.id));
    await this.uploads.handle(request, response);
  }
}
