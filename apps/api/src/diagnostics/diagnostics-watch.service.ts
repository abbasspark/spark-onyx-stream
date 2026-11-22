// SPDX-License-Identifier: AGPL-3.0-only
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config.js';
import { MailService } from '../mail/mail.service.js';
import { diagnosticsMail } from '../mail/mail.templates.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { type AlertMemory, decideAlerts } from './diagnostics.checks.js';
import { DiagnosticsService } from './diagnostics.service.js';

const LOOK_EVERY_MS = 5 * 60_000;
/** Not at the very start: the other processes need a moment to report in. */
const FIRST_LOOK_AFTER_MS = 60_000;
export const WATCH_LOCK = 'onyx:diagnostics:watch';
const LOCK_MS = LOOK_EVERY_MS - 20_000;
/** What was wrong at the last look, and what the owners were told about. */
export const ALERT_MEMORY_KEY = 'onyx:diagnostics:alerts';

/**
 * Looks at the installation every five minutes, whether or not anyone has
 * the panel open, and writes to the owners when a problem appears.
 *
 * It runs in the processes that answer the panel, because they are the ones
 * that can send email. One of them at a time does the looking.
 */
@Injectable()
export class DiagnosticsWatch implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DiagnosticsWatch.name);
  private timer: NodeJS.Timeout | undefined;
  private first: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DiagnosticsService) private readonly diagnostics: DiagnosticsService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') {
      return;
    }
    this.first = setTimeout(() => void this.look(), FIRST_LOOK_AFTER_MS);
    this.first.unref();
    this.timer = setInterval(() => void this.look(), LOOK_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  /** One look. Never throws. */
  async look(now = new Date()): Promise<void> {
    try {
      const acquired = await this.redis.set(WATCH_LOCK, String(process.pid), 'PX', LOCK_MS, 'NX');
      if (acquired !== 'OK') {
        return;
      }
      const report = await this.diagnostics.run(now);
      const previous = await this.memory();
      const decision = decideAlerts(previous, report.checks, now);
      await this.redis.set(ALERT_MEMORY_KEY, JSON.stringify(decision.memory));

      if (decision.appeared.length === 0 && decision.solved.length === 0) {
        return;
      }
      if (!report.alerts.emailAlerts || !this.mail.enabled) {
        return;
      }
      const siteUrl = this.config.siteUrl;
      const content = diagnosticsMail({
        siteName: this.config.siteName,
        problems: decision.appeared.map(({ title, summary, hint }) => ({ title, summary, hint })),
        solved: decision.solved,
        panelUrl: siteUrl ? `${siteUrl}/admin/diagnostics` : '',
      });
      for (const to of report.alerts.recipients) {
        // One owner's mailbox being full must not keep the others from hearing of it.
        await this.mail.sendNow({ to, ...content }).catch((error: unknown) => {
          this.logger.warn(`Alert to ${to} not sent: ${(error as Error).message}`);
        });
      }
    } catch (error) {
      this.logger.error(`The installation could not be looked at: ${(error as Error).message}`);
    }
  }

  private async memory(): Promise<AlertMemory> {
    try {
      return JSON.parse((await this.redis.get(ALERT_MEMORY_KEY)) ?? '{}') as AlertMemory;
    } catch {
      return {};
    }
  }
}
