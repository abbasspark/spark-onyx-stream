// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { SecretBox } from './secret-box.js';

/** Provides SecretBox, keyed with the platform master key. */
@Global()
@Module({
  providers: [
    {
      provide: SecretBox,
      inject: [AppConfig],
      useFactory: (config: AppConfig): SecretBox => new SecretBox(config.masterKey),
    },
  ],
  exports: [SecretBox],
})
export class CryptoModule {}
