// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { MailController } from './mail.controller.js';
import { MailService } from './mail.service.js';
import {
  MAIL_TRANSPORT,
  type MailTransport,
  NoTransport,
  SmtpTransport,
} from './mail.transport.js';

/** Email: one service that sends, for every module that has something to say. */
@Global()
@Module({
  controllers: [MailController],
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [AppConfig],
      useFactory: (config: AppConfig): MailTransport =>
        config.mail ? new SmtpTransport(config.mail.smtpUrl) : new NoTransport(),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
