// SPDX-License-Identifier: AGPL-3.0-only
import { Module } from '@nestjs/common';
import { OpenApiController } from './openapi.controller.js';

/** Serves the description of the API. */
@Module({ controllers: [OpenApiController] })
export class OpenApiModule {}
