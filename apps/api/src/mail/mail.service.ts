// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { MAIL_TRANSPORT, type MailMessage, type MailTransport } from './mail.transport.js';

/** Waits between attempts to hand a message to the mail server. */
export const RETRY_DELAYS_MS = [2_000, 15_000];

export interface MailDelivery {
  at: Date;
  /** The mail server's reason, when it did not take the message. */
  error: string | null;
}

/**
 * Sends the emails of the installation. Senders check `enabled` first: with
 * email off there is nothing to send with.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** The last attempt of this process, for the admin panel. */
  private lastDelivery: MailDelivery | null = null;
  /** Replaced in tests so retries do not wait. */
  retryDelaysMs: readonly number[] = RETRY_DELAYS_MS;
  private readonly pending = new Set<Promise<void>>();

  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {}

  get enabled(): boolean {
    return this.config.mail !== null;
  }

  get last(): MailDelivery | null {
    return this.lastDelivery;
  }

  /**
   * Sends in the background and tries again when the mail server is not
   * reachable. The caller does not wait: how long a mail server takes must
   * not show in how long a request takes, and a viewer can ask again.
   */
  send(message: MailMessage): void {
    const task = this.deliver(message).finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  /**
   * Sends now, once.
   *
   * @throws Error with the mail server's reason.
   */
  async sendNow(message: MailMessage): Promise<void> {
    const from = this.config.mail?.from;
    if (!from) {
      throw new Error('Email is not set up');
    }
    try {
      await this.transport.send(from, message);
      this.lastDelivery = { at: new Date(), error: null };
    } catch (error) {
      this.lastDelivery = { at: new Date(), error: reasonOf(error) };
      throw error;
    }
  }

  /** Resolves when everything handed to send() is out or given up. For tests and shutdown. */
  async settled(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled(this.pending);
    }
  }

  private async deliver(message: MailMessage): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.sendNow(message);
        return;
      } catch (error) {
        const delay = this.retryDelaysMs[attempt];
        // The log names no address and no content: both are personal.
        if (delay === undefined) {
          this.logger.error(`An email could not be sent: ${reasonOf(error)}`);
          return;
        }
        this.logger.warn(`An email could not be sent, trying again: ${reasonOf(error)}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

function reasonOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}
