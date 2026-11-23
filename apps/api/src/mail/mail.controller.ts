// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadGatewayException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { CurrentPrincipal, RequirePermissions } from '../auth/auth.decorators.js';
import { emailSchema } from '../auth/auth.schemas.js';
import type { Principal } from '../auth/principal.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BrandingService } from '../branding/branding.service.js';
import { AppConfig } from '../config/app-config.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { type MailDelivery, MailService } from './mail.service.js';
import { testMail } from './mail.templates.js';
import { describeSmtpUrl } from './mail.transport.js';

const testMailSchema = z.object({ to: emailSchema });
type TestMailInput = z.infer<typeof testMailSchema>;

/** How email is set up, without the password of the mail server. */
export interface MailStatus {
  enabled: boolean;
  server: { host: string; port: number; secure: boolean; user: string | null } | null;
  from: string | null;
  /** Where the links in emails lead. */
  siteUrl: string | null;
  siteName: string;
  /** Whether viewers must confirm their address before they can watch. */
  verification: 'optional' | 'required';
  /** The last attempt of the process that answered. Null when it sent nothing yet. */
  lastDelivery: MailDelivery | null;
}

/** Email as admins see it: how it is set up, and trying it out. */
@Controller('mail')
export class MailController {
  constructor(
    @Inject(MailService) private readonly mail: MailService,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(BrandingService) private readonly branding: BrandingService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('settings:read')
  async status(): Promise<MailStatus> {
    const { mail } = this.config;
    return {
      enabled: mail !== null,
      server: mail ? describeSmtpUrl(mail.smtpUrl) : null,
      from: mail?.from ?? null,
      siteUrl: this.config.siteUrl || null,
      siteName: await this.branding.siteName(),
      verification: this.config.viewerVerificationRequired ? 'required' : 'optional',
      lastDelivery: this.mail.last,
    };
  }

  /**
   * Sends a test email and waits for the mail server's answer, so a wrong
   * password or host shows at once.
   */
  @Post('test')
  @RequirePermissions('settings:write')
  @RateLimit({ name: 'mail-test', limit: 10, windowSeconds: 600 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async test(
    @Body(new ZodValidationPipe(testMailSchema)) body: TestMailInput,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ): Promise<void> {
    if (!this.mail.enabled) {
      throw new ConflictException('Email is not set up. Set SMTP_URL, MAIL_FROM and SITE_URL.');
    }
    try {
      await this.mail.sendNow({
        to: body.to,
        ...testMail({
          siteName: await this.branding.siteName(),
          sentBy: principal.type === 'admin' ? principal.displayName : principal.name,
        }),
      });
    } catch (error) {
      throw new BadGatewayException(
        `The mail server did not take the message: ${(error as Error).message}`,
      );
    }
    // The audit log says that a test was sent, not to whom.
    await this.audit.record({
      action: 'mail.test',
      adminId: principal.adminId,
      entityType: 'Mail',
      ipAddress: requestInfo(request).ipAddress,
    });
  }
}
