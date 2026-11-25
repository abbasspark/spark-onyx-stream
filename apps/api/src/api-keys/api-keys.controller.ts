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
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminSessionOnly, CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import type { AdminPrincipal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type CreateApiKeyInput, createApiKeySchema } from './api-keys.schemas.js';
import { type ApiKeyView, ApiKeysService, type CreatedApiKey } from './api-keys.service.js';

@Controller('api-keys')
export class ApiKeysController {
  constructor(@Inject(ApiKeysService) private readonly apiKeys: ApiKeysService) {}

  /** Lists the API keys. */
  @Get()
  @RequirePermissions('api-keys:read')
  list(): Promise<ApiKeyView[]> {
    return this.apiKeys.list();
  }

  /** The response contains the full key. It is shown this once only. */
  @Post()
  @AdminSessionOnly()
  @RequirePermissions('api-keys:write')
  create(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyInput,
    @Req() request: Request,
  ): Promise<CreatedApiKey> {
    return this.apiKeys.create(principal, body, requestInfo(request).ipAddress);
  }

  /** Revokes an API key. It stops working at once. */
  @Delete(':id')
  @AdminSessionOnly()
  @RequirePermissions('api-keys:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentPrincipal() principal: AdminPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await this.apiKeys.revoke(principal, id, requestInfo(request).ipAddress);
  }
}
