// SPDX-License-Identifier: AGPL-3.0-only
import { readFile } from 'node:fs/promises';
import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';

/** Beside this file in the source and in the build: see "assets" in nest-cli.json. */
const DOCUMENT = new URL('./openapi.json', import.meta.url);

@Controller()
export class OpenApiController {
  private document: Promise<Record<string, unknown>> | null = null;

  /**
   * The description of this API as an OpenAPI 3.1 document. It is produced
   * from the source code of the server with "pnpm openapi", so it says what
   * this version does. Clients and their types are generated from it.
   */
  @Public()
  @Get('openapi.json')
  @Header('Cache-Control', 'public, max-age=300')
  get(): Promise<Record<string, unknown>> {
    // Read once: it does not change while the server runs.
    this.document ??= readFile(DOCUMENT, 'utf8').then(
      (text) => JSON.parse(text) as Record<string, unknown>,
    );
    return this.document;
  }
}
