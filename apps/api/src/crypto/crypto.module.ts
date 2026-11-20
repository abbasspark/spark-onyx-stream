// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { ContentKeysService } from './content-keys.service.js';
import { SecretBox } from './secret-box.js';

/** Provides SecretBox, keyed with the platform master key, and the content key store. */
@Global()
@Module({
  providers: [
    {
      provide: SecretBox,
      inject: [AppConfig],
      useFactory: (config: AppConfig): SecretBox => new SecretBox(config.masterKey),
    },
    ContentKeysService,
  ],
  exports: [SecretBox, ContentKeysService],
})
export class CryptoModule {}
